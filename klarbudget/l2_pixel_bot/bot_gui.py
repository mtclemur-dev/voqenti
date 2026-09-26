"""
bot_gui.py - Interfata grafica cu tabs pentru L2 Pixel Farm Bot v2.0

Tabs:
  ⚔ FARM      - Status, start/stop, log, statistici, radar live
  🎮 SKILL-URI - Configurare taste + mod combat (fara editare JSON)
  🔍 DETECTIE  - Configurare zone pixeli HP + radar, cu test live
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import os, sys, time, json, ctypes, threading
from datetime import timedelta

# ---------------------------------------------------------------------------
# Paleta de culori
# ---------------------------------------------------------------------------
C = {
    'bg':        '#0b0b12',
    'panel':     '#13131f',
    'panel2':    '#1a1a2d',
    'border':    '#2a2a50',
    'accent':    '#e63946',
    'accent2':   '#ff6b6b',
    'green':     '#06d6a0',
    'yellow':    '#ffd60a',
    'blue':      '#4cc9f0',
    'purple':    '#b5179e',
    'text':      '#e0e0e0',
    'subtext':   '#8080aa',
    'log_bg':    '#0d0d1a',
    'log_text':  '#b0ffb0',
    'btn_start': '#06d6a0',
    'btn_pause': '#ffd60a',
    'btn_stop':  '#e63946',
    'btn_blue':  '#4cc9f0',
}

STATE_COLORS = {
    'PAUZAT':           '#8080aa',
    'Scanare zona':     '#4cc9f0',
    'In lupta':         '#e63946',
    'Culegere Drop':    '#06d6a0',
    'Recuperare MP':    '#b5179e',
    'EROARE':           '#ff0000',
}

VALID_KEYS = ['f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
              '1','2','3','4','5','6','7','8','9','0',
              'q','e','r','t','y','g','z','x','c','v','b',
              'enter','tab','space','insert','delete','none']

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


# ============================================================================
# CLASA PRINCIPALA
# ============================================================================
class L2BotGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("L2 Pixel Farm Bot v2.0 – Elmorlab x3 Interlude")
        self.root.configure(bg=C['bg'])
        self.root.resizable(True, True)
        self.root.minsize(900, 680)
        self.root.geometry("980x720")

        # Variabile de stare globale
        self._state_text   = tk.StringVar(value="PAUZAT")
        self._kills_var    = tk.StringVar(value="0")
        self._kph_var      = tk.StringVar(value="0.0")
        self._runtime_var  = tk.StringVar(value="00:00:00")
        self._loots_var    = tk.StringVar(value="0")
        self._hp_pot_var   = tk.StringVar(value="0")
        self._hunts_var    = tk.StringVar(value="0")
        self._pixel_var    = tk.StringVar(value="RAM: -")
        self._radar_var    = tk.StringVar(value="Radar: -")
        self._hwnd_var     = tk.StringVar(value="L2: negasita")
        self._btn_state    = 'stopped'

        self._build_header()
        self._build_stats_row()
        self._build_notebook()
        self._build_statusbar()

        self._start_engine()
        self._setup_hotkeys()
        self._tick_runtime()

        if not is_admin():
            self._append_log("⚠  Rulati ca Administrator pentru functionalitate completa!", warn=True)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.mainloop()

    # -----------------------------------------------------------------------
    # HEADER
    # -----------------------------------------------------------------------
    def _build_header(self):
        hdr = tk.Frame(self.root, bg=C['accent'], height=52)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)

        tk.Label(hdr, text="⚔  L2 PIXEL FARM BOT  v2.0",
                 font=("Segoe UI", 17, "bold"), bg=C['accent'], fg='white'
                 ).pack(side='left', padx=16, pady=8)
        tk.Label(hdr, text="Elmorlab x3 Interlude",
                 font=("Segoe UI", 10), bg=C['accent'], fg='#ffd0d0'
                 ).pack(side='left', pady=8)

        badge = tk.Frame(hdr, bg=C['accent'])
        badge.pack(side='right', padx=16)
        self._badge_dot = tk.Label(badge, text="●", font=("Segoe UI", 20),
                                   bg=C['accent'], fg=C['subtext'])
        self._badge_dot.pack(side='left', padx=(0, 4))
        self._badge_lbl = tk.Label(badge, textvariable=self._state_text,
                                   font=("Segoe UI", 11, "bold"),
                                   bg=C['accent'], fg=C['subtext'])
        self._badge_lbl.pack(side='left')

    # -----------------------------------------------------------------------
    # BARA STATISTICI
    # -----------------------------------------------------------------------
    def _build_stats_row(self):
        row = tk.Frame(self.root, bg=C['panel'], pady=8)
        row.pack(fill='x')
        items = [
            ("KILLS",    self._kills_var,   C['green']),
            ("KILL/ORĂ", self._kph_var,     C['blue']),
            ("RUNTIME",  self._runtime_var, C['yellow']),
            ("LOOT",     self._loots_var,   C['subtext']),
            ("HP POT",   self._hp_pot_var,  C['accent2']),
            ("VANATORI", self._hunts_var,   C['purple']),
        ]
        for i, (lbl, var, col) in enumerate(items):
            f = tk.Frame(row, bg=C['panel'])
            f.pack(side='left', expand=True, fill='x', padx=6)
            tk.Label(f, text=lbl, font=("Segoe UI", 8),
                     bg=C['panel'], fg=C['subtext']).pack()
            tk.Label(f, textvariable=var, font=("Segoe UI", 15, "bold"),
                     bg=C['panel'], fg=col).pack()
            if i < len(items) - 1:
                tk.Frame(row, bg=C['border'], width=1).pack(side='left', fill='y', pady=4)

    # -----------------------------------------------------------------------
    # NOTEBOOK (TABS)
    # -----------------------------------------------------------------------
    def _build_notebook(self):
        # Stil ttk dark pentru notebook
        style = ttk.Style()
        style.theme_use('default')
        style.configure('TNotebook',         background=C['bg'],    borderwidth=0)
        style.configure('TNotebook.Tab',     background=C['panel2'], foreground=C['subtext'],
                        padding=[16, 8], font=("Segoe UI", 10, "bold"))
        style.map('TNotebook.Tab',
                  background=[('selected', C['accent'])],
                  foreground=[('selected', 'white')])

        nb = ttk.Notebook(self.root)
        nb.pack(fill='both', expand=True, padx=8, pady=(6, 0))
        self._nb = nb

        # Tab 1: FARM
        tab_farm = tk.Frame(nb, bg=C['bg'])
        nb.add(tab_farm, text="  ⚔  FARM  ")
        self._build_farm_tab(tab_farm)

        # Tab 2: SKILL-URI
        tab_skills = tk.Frame(nb, bg=C['bg'])
        nb.add(tab_skills, text="  🎮  SKILL-URI  ")
        self._build_skills_tab(tab_skills)

        # Tab 3: DETECTIE
        tab_det = tk.Frame(nb, bg=C['bg'])
        nb.add(tab_det, text="  🔍  DETECTIE  ")
        self._build_detection_tab(tab_det)

        # Tab 4: VANATOARE
        tab_hunt = tk.Frame(nb, bg=C['bg'])
        nb.add(tab_hunt, text="  🏃  VANATOARE  ")
        self._build_hunting_tab(tab_hunt)

    # -----------------------------------------------------------------------
    # TAB 1: FARM
    # -----------------------------------------------------------------------
    def _build_farm_tab(self, parent):
        # Left: controale + detector
        left = tk.Frame(parent, bg=C['bg'], width=230)
        left.pack(side='left', fill='y', padx=(8, 4), pady=8)
        left.pack_propagate(False)

        # Butoane principale
        ctrl = self._lf(left, "CONTROALE")
        ctrl.pack(fill='x', pady=(0, 8))

        self._btn_start = tk.Button(ctrl, text="▶  START FARM",
            font=("Segoe UI", 11, "bold"), bg=C['btn_start'], fg='#001a12',
            activebackground='#05b886', relief='flat', pady=10, cursor='hand2',
            command=self._on_start_pause)
        self._btn_start.pack(fill='x', padx=10, pady=(10, 4))

        self._btn_stop = tk.Button(ctrl, text="■  STOP",
            font=("Segoe UI", 10, "bold"), bg=C['panel2'], fg=C['subtext'],
            relief='flat', pady=8, cursor='hand2', state='disabled',
            command=self._on_stop)
        self._btn_stop.pack(fill='x', padx=10, pady=(0, 4))

        tk.Button(ctrl, text="⊹  CALIBRARE PIXELI",
            font=("Segoe UI", 10, "bold"), bg=C['panel2'], fg=C['btn_blue'],
            relief='flat', pady=8, cursor='hand2',
            command=self._on_calibrate
        ).pack(fill='x', padx=10, pady=(0, 4))

        tk.Button(ctrl, text="🗺  CALIBRARE ZONA",
            font=("Segoe UI", 10, "bold"), bg=C['panel2'], fg=C['yellow'],
            relief='flat', pady=8, cursor='hand2',
            command=self._on_calibrate_zone
        ).pack(fill='x', padx=10, pady=(0, 10))

        # Fereastra L2
        win_f = self._lf(left, "FEREASTRA L2")
        win_f.pack(fill='x', pady=(0, 8))
        self._hwnd_lbl = tk.Label(win_f, textvariable=self._hwnd_var,
            font=("Courier New", 8), bg=C['panel'], fg=C['subtext'],
            wraplength=200, justify='left')
        self._hwnd_lbl.pack(padx=8, pady=(6, 4))
        tk.Button(win_f, text="↺  Re-detecteaza",
            font=("Segoe UI", 9), bg=C['panel2'], fg=C['blue'],
            relief='flat', padx=6, pady=4, cursor='hand2',
            command=self._on_reload_window
        ).pack(padx=8, pady=(0, 8))

        # Bara HP detector (live)
        det_f = self._lf(left, "DETECTOR LIVE")
        det_f.pack(fill='x', pady=(0, 8))

        tk.Label(det_f, text="Status tinta (RAM):", font=("Segoe UI", 8),
                 bg=C['panel'], fg=C['subtext']).pack(anchor='w', padx=8, pady=(6,0))
        self._hp_canvas = tk.Canvas(det_f, width=200, height=14,
                                    bg=C['panel2'], highlightthickness=0)
        self._hp_canvas.pack(padx=8, pady=2)
        self._hp_det_lbl = tk.Label(det_f, textvariable=self._pixel_var,
            font=("Courier New", 8), bg=C['panel'], fg=C['subtext'])
        self._hp_det_lbl.pack(padx=8)

        tk.Label(det_f, text="Radar monstre:", font=("Segoe UI", 8),
                 bg=C['panel'], fg=C['subtext']).pack(anchor='w', padx=8, pady=(6,0))
        self._radar_canvas = tk.Canvas(det_f, width=200, height=14,
                                       bg=C['panel2'], highlightthickness=0)
        self._radar_canvas.pack(padx=8, pady=2)
        self._radar_det_lbl = tk.Label(det_f, textvariable=self._radar_var,
            font=("Courier New", 8), bg=C['panel'], fg=C['subtext'])
        self._radar_det_lbl.pack(padx=8, pady=(0, 8))

        # Right: Log
        right = tk.Frame(parent, bg=C['bg'])
        right.pack(side='left', fill='both', expand=True, padx=(0, 8), pady=8)

        log_f = self._lf(right, "JURNAL ACTIVITATI")
        log_f.pack(fill='both', expand=True)

        self._log_text = scrolledtext.ScrolledText(
            log_f, font=("Courier New", 9), bg=C['log_bg'], fg=C['log_text'],
            insertbackground=C['green'], relief='flat', wrap='word',
            state='disabled')
        self._log_text.pack(fill='both', expand=True, padx=6, pady=6)
        self._log_text.tag_config('warn',  foreground=C['yellow'])
        self._log_text.tag_config('kill',  foreground=C['green'])
        self._log_text.tag_config('error', foreground=C['accent2'])
        self._log_text.tag_config('info',  foreground='#88aaff')

    # -----------------------------------------------------------------------
    # TAB 2: SKILL-URI
    # -----------------------------------------------------------------------
    def _build_skills_tab(self, parent):
        # Variabile pentru fiecare tasta
        self._key_vars = {}
        KEY_DEFS = [
            ("target_next",  "Target urmatorul monstru  (e.g. /targetnext)"),
            ("attack",       "Atac Normal  (auto-attack sau first skill)"),
            ("skill1",       "Skill 1  (primul skill de atac)"),
            ("skill2",       "Skill 2  (al doilea skill de atac)"),
            ("pick_up",      "Culeget Drop  (pick up items)"),
            ("potion_hp",    "Potiune HP  (cand HP scade)"),
            ("potion_mp",    "Potiune MP  (cand MP scade)"),
            ("spoil_key",    "Spoil  (doar pentru Dwarf)"),
            ("sweep",        "Sweep  (dupa Spoil, sa culegi drop)"),
        ]

        BOOL_DEFS = [
            ("combat.use_spoil",     "Activeaza Spoil + Sweep (Dwarf)"),
            ("combat.use_sweep",     "Activeaza Sweep dupa kill"),
            ("pixel_settings.self_hp.enabled",  "Auto HP Potion activa"),
            ("pixel_settings.self_mp.enabled",  "Auto MP Potion activa"),
        ]
        self._bool_vars = {}

        scroll_frame = self._scrollable(parent)

        # ─── Sectiunea: Configurare Taste ────────────────────────────────────
        sect = self._lf(scroll_frame, "  CONFIGURARE TASTE  (ce apasa botul)")
        sect.pack(fill='x', padx=12, pady=(10, 6))

        tk.Label(
            sect,
            text="L2 Interlude: F1-F12 citesc DOAR bara de jos! "
                 "Mutati skill-urile de atac din bara de sus pe F2,F3,F4 jos.",
            font=("Segoe UI", 9),
            bg=C['panel'], fg=C['yellow'],
            wraplength=620, justify='left',
        ).pack(fill='x', padx=10, pady=(6, 2))

        # Header
        h_row = tk.Frame(sect, bg=C['panel'])
        h_row.pack(fill='x', padx=8, pady=(8, 4))
        tk.Label(h_row, text="FUNCTIE", font=("Segoe UI", 9, "bold"),
                 bg=C['panel'], fg=C['subtext'], width=35, anchor='w').pack(side='left')
        tk.Label(h_row, text="TASTA", font=("Segoe UI", 9, "bold"),
                 bg=C['panel'], fg=C['subtext'], width=10).pack(side='left')

        for key_id, desc in KEY_DEFS:
            row = tk.Frame(sect, bg=C['panel2'])
            row.pack(fill='x', padx=8, pady=2)

            tk.Label(row, text=desc, font=("Segoe UI", 9),
                     bg=C['panel2'], fg=C['text'], width=40, anchor='w'
                     ).pack(side='left', padx=(8, 4), pady=6)

            var = tk.StringVar(value='f1')
            self._key_vars[key_id] = var
            om = ttk.Combobox(row, textvariable=var, values=VALID_KEYS,
                              width=7, font=("Segoe UI", 9), state='readonly')
            om.pack(side='left', padx=4)

        # ─── Sectiunea: Optiuni ───────────────────────────────────────────────
        opt = self._lf(scroll_frame, "  OPTIUNI ACTIVATE")
        opt.pack(fill='x', padx=12, pady=(0, 6))

        for bool_id, desc in BOOL_DEFS:
            var = tk.BooleanVar(value=False)
            self._bool_vars[bool_id] = var
            row = tk.Frame(opt, bg=C['panel2'])
            row.pack(fill='x', padx=8, pady=2)
            tk.Checkbutton(row, text=desc, variable=var,
                           font=("Segoe UI", 9), bg=C['panel2'], fg=C['text'],
                           activebackground=C['panel2'], selectcolor=C['bg'],
                           activeforeground=C['green'],
                           ).pack(side='left', padx=8, pady=6)

        # ─── Sectiunea: Mod Combat ────────────────────────────────────────────
        cm = self._lf(scroll_frame, "  MOD COMBAT")
        cm.pack(fill='x', padx=12, pady=(0, 6))

        self._combat_mode = tk.StringVar(value='basic')
        rb_row = tk.Frame(cm, bg=C['panel'])
        rb_row.pack(fill='x', padx=8, pady=(8, 4))
        for val, lbl in [('basic', '● Atac simplu (apasa doar tasta "Atac Normal")'),
                         ('rotation', '● Rotatie skill-uri (secventa personalizata)')]:
            tk.Radiobutton(rb_row, text=lbl, variable=self._combat_mode, value=val,
                           font=("Segoe UI", 9), bg=C['panel'], fg=C['text'],
                           activebackground=C['panel'], selectcolor=C['bg'],
                           activeforeground=C['green']
                           ).pack(anchor='w', padx=8, pady=2)

        rot_row = tk.Frame(cm, bg=C['panel'])
        rot_row.pack(fill='x', padx=8, pady=(4, 10))
        tk.Label(rot_row, text="Rotatie skill-uri (separate cu virgula):",
                 font=("Segoe UI", 9), bg=C['panel'], fg=C['subtext']
                 ).pack(side='left', padx=(8, 4))
        self._rotation_var = tk.StringVar(value='f2,f3,f2,f4,f2,f3')
        tk.Entry(rot_row, textvariable=self._rotation_var,
                 font=("Courier New", 9), bg=C['panel2'], fg=C['green'],
                 insertbackground=C['green'], relief='flat', width=30
                 ).pack(side='left', padx=4)

        # ─── Sectiunea: Tinte Mob ─────────────────────────────────────────────
        mob = self._lf(scroll_frame, "  LISTA MOBI  (un nume pe rand)")
        mob.pack(fill='x', padx=12, pady=(0, 6))

        self._mob_enabled = tk.BooleanVar(value=True)
        tk.Checkbutton(mob, text="Cauta doar mobii din lista de mai jos",
                       variable=self._mob_enabled,
                       font=("Segoe UI", 9), bg=C['panel'], fg=C['text'],
                       activebackground=C['panel'], selectcolor=C['bg'],
                       activeforeground=C['green']
                       ).pack(anchor='w', padx=8, pady=(8, 2))

        self._mob_stick_kill = tk.BooleanVar(value=True)
        tk.Checkbutton(mob, text="Ucide mobul curent inainte sa caut altul din lista",
                       variable=self._mob_stick_kill,
                       font=("Segoe UI", 9), bg=C['panel'], fg=C['yellow'],
                       activebackground=C['panel'], selectcolor=C['bg'],
                       activeforeground=C['yellow']
                       ).pack(anchor='w', padx=8, pady=(0, 6))

        tk.Label(mob, text="Scrie cate un nume de mob pe fiecare rand:",
                 font=("Segoe UI", 9), bg=C['panel'], fg=C['subtext']
                 ).pack(anchor='w', padx=8)

        mob_txt_wrap = tk.Frame(mob, bg=C['border'], padx=1, pady=1)
        mob_txt_wrap.pack(fill='x', padx=8, pady=(4, 8))
        mob_txt_inner = tk.Frame(mob_txt_wrap, bg=C['panel2'])
        mob_txt_inner.pack(fill='both', expand=True)

        self._mob_names_text = tk.Text(
            mob_txt_inner, height=10, width=44,
            font=("Segoe UI", 10), bg=C['panel2'], fg=C['green'],
            insertbackground=C['green'], relief='flat', wrap='none',
            highlightthickness=0, padx=6, pady=6)
        mob_scroll = tk.Scrollbar(mob_txt_inner, command=self._mob_names_text.yview,
                                  bg=C['panel'], troughcolor=C['bg'])
        self._mob_names_text.configure(yscrollcommand=mob_scroll.set)
        self._mob_names_text.pack(side='left', fill='both', expand=True)
        mob_scroll.pack(side='right', fill='y')

        dist_row = tk.Frame(mob, bg=C['panel'])
        dist_row.pack(fill='x', padx=8, pady=(0, 10))
        self._mob_approach_var = tk.StringVar(value='450')
        self._mob_attack_var = tk.StringVar(value='200')
        self._mob_search_var = tk.StringVar(value='2500')
        for lbl, var in [
            ("Distanta apropiere:", self._mob_approach_var),
            ("Distanta atac:", self._mob_attack_var),
            ("Raza cautare:", self._mob_search_var),
        ]:
            f = tk.Frame(dist_row, bg=C['panel'])
            f.pack(side='left', padx=(0, 12))
            tk.Label(f, text=lbl, font=("Segoe UI", 8), bg=C['panel'], fg=C['subtext']).pack()
            tk.Entry(f, textvariable=var, width=7, font=("Segoe UI", 9),
                     bg=C['panel2'], fg=C['green'], relief='flat').pack()

        # ─── Butoane save/load ────────────────────────────────────────────────
        btn_row = tk.Frame(scroll_frame, bg=C['bg'])
        btn_row.pack(fill='x', padx=12, pady=(4, 12))

        tk.Button(btn_row, text="💾  SALVEAZA SETARILE",
                  font=("Segoe UI", 10, "bold"), bg=C['btn_start'], fg='#001a12',
                  relief='flat', padx=20, pady=8, cursor='hand2',
                  command=self._save_skills_config
                  ).pack(side='left', padx=(0, 8))

        tk.Button(btn_row, text="↺  RESETEAZA DIN CONFIG",
                  font=("Segoe UI", 10), bg=C['panel2'], fg=C['blue'],
                  relief='flat', padx=12, pady=8, cursor='hand2',
                  command=self._load_skills_from_config
                  ).pack(side='left')

        # Populeaza cu valorile din config
        self._load_skills_from_config()

    # -----------------------------------------------------------------------
    # TAB 3: DETECTIE
    # -----------------------------------------------------------------------
    def _build_detection_tab(self, parent):
        scroll = self._scrollable(parent)

        # ─── Bara HP monstru ─────────────────────────────────────────────────
        thp_f = self._lf(scroll, "  BARA HP MONSTRU (tinta)")
        thp_f.pack(fill='x', padx=12, pady=(10, 6))

        self._thp_vars = {}
        thp_fields = [
            ("scan_x", "X start zona scan"),
            ("scan_y", "Y start zona scan"),
            ("scan_width", "Latime zona (px)"),
            ("scan_height", "Inaltime zona (px)"),
            ("tolerance", "Toleranta culoare (0-255)"),
            ("min_matching_pixels", "Min pixeli potriviti"),
        ]
        for fk, flbl in thp_fields:
            self._det_row(thp_f, flbl, fk, self._thp_vars)

        # Culoare
        self._thp_rgb_r = tk.StringVar(value="190")
        self._thp_rgb_g = tk.StringVar(value="20")
        self._thp_rgb_b = tk.StringVar(value="20")
        rgb_row = tk.Frame(thp_f, bg=C['panel'])
        rgb_row.pack(fill='x', padx=8, pady=2)
        tk.Label(rgb_row, text="Culoare RGB:", font=("Segoe UI", 9),
                 bg=C['panel'], fg=C['subtext'], width=22, anchor='w'
                 ).pack(side='left', padx=(8, 4))
        for var, lbl in [(self._thp_rgb_r,'R'),(self._thp_rgb_g,'G'),(self._thp_rgb_b,'B')]:
            tk.Label(rgb_row, text=lbl, font=("Segoe UI", 9),
                     bg=C['panel'], fg=C['subtext']).pack(side='left')
            tk.Entry(rgb_row, textvariable=var, width=5,
                     font=("Courier New", 9), bg=C['panel2'], fg=C['green'],
                     relief='flat', insertbackground=C['green']
                     ).pack(side='left', padx=(2, 8))

        self._thp_test_lbl = tk.Label(thp_f, text="",
            font=("Segoe UI", 9), bg=C['panel'], fg=C['subtext'])
        self._thp_test_lbl.pack(anchor='w', padx=8, pady=(4, 0))

        btn_r = tk.Frame(thp_f, bg=C['panel'])
        btn_r.pack(fill='x', padx=8, pady=(4, 10))
        tk.Button(btn_r, text="▶ Testeaza acum",
                  font=("Segoe UI", 9, "bold"), bg=C['btn_blue'], fg='#001020',
                  relief='flat', padx=10, pady=4, cursor='hand2',
                  command=self._test_hp_bar
                  ).pack(side='left', padx=(0, 8))
        tk.Button(btn_r, text="💾 Salveaza",
                  font=("Segoe UI", 9), bg=C['panel2'], fg=C['green'],
                  relief='flat', padx=10, pady=4, cursor='hand2',
                  command=self._save_detection_config
                  ).pack(side='left')

        # ─── Radar minimap ────────────────────────────────────────────────────
        rad_f = self._lf(scroll, "  RADAR / MINIMAP (detectie monstre pe harta)")
        rad_f.pack(fill='x', padx=12, pady=(0, 6))

        self._rad_enabled = tk.BooleanVar(value=False)
        tk.Checkbutton(rad_f, text="Activeaza detectia pe radar/minimap",
                       variable=self._rad_enabled,
                       font=("Segoe UI", 9), bg=C['panel'], fg=C['text'],
                       activebackground=C['panel'], selectcolor=C['bg'],
                       activeforeground=C['green']
                       ).pack(anchor='w', padx=8, pady=(8, 4))

        tk.Label(rad_f,
                 text="⚠  Cum calibrezi: Deschide utilitarul de calibrare, muta cursorul\n"
                      "    pe un punct rosu (monstru) de pe minimap, apasa C, selecteaza 'radar'.",
                 font=("Segoe UI", 8), bg=C['panel'], fg=C['yellow'],
                 justify='left'
                 ).pack(anchor='w', padx=8, pady=(0, 4))

        self._rad_vars = {}
        rad_fields = [
            ("scan_x",    "X start minimap"),
            ("scan_y",    "Y start minimap"),
            ("scan_width",  "Latime minimap (px)"),
            ("scan_height", "Inaltime minimap (px)"),
            ("tolerance", "Toleranta culoare"),
            ("min_pixels","Min pixeli monstre"),
            ("max_failed_targets", "Targetnext esuate inainte de mers"),
            ("walk_duration_ms",   "Durata mers (ms)"),
        ]
        for fk, flbl in rad_fields:
            self._det_row(rad_f, flbl, fk, self._rad_vars)

        self._rad_rgb_r = tk.StringVar(value="130")
        self._rad_rgb_g = tk.StringVar(value="50")
        self._rad_rgb_b = tk.StringVar(value="20")
        rgb_row2 = tk.Frame(rad_f, bg=C['panel'])
        rgb_row2.pack(fill='x', padx=8, pady=2)
        tk.Label(rgb_row2, text="Culoare monstre RGB:", font=("Segoe UI", 9),
                 bg=C['panel'], fg=C['subtext'], width=22, anchor='w'
                 ).pack(side='left', padx=(8,4))
        for var, lbl in [(self._rad_rgb_r,'R'),(self._rad_rgb_g,'G'),(self._rad_rgb_b,'B')]:
            tk.Label(rgb_row2, text=lbl, font=("Segoe UI", 9),
                     bg=C['panel'], fg=C['subtext']).pack(side='left')
            tk.Entry(rgb_row2, textvariable=var, width=5,
                     font=("Courier New", 9), bg=C['panel2'], fg=C['green'],
                     relief='flat', insertbackground=C['green']
                     ).pack(side='left', padx=(2, 8))

        self._rad_test_lbl = tk.Label(rad_f, text="",
            font=("Segoe UI", 9), bg=C['panel'], fg=C['subtext'])
        self._rad_test_lbl.pack(anchor='w', padx=8, pady=(4, 0))

        btn_r2 = tk.Frame(rad_f, bg=C['panel'])
        btn_r2.pack(fill='x', padx=8, pady=(4, 10))
        tk.Button(btn_r2, text="▶ Testeaza Radar",
                  font=("Segoe UI", 9, "bold"), bg=C['btn_blue'], fg='#001020',
                  relief='flat', padx=10, pady=4, cursor='hand2',
                  command=self._test_radar
                  ).pack(side='left', padx=(0, 8))
        tk.Button(btn_r2, text="💾 Salveaza",
                  font=("Segoe UI", 9), bg=C['panel2'], fg=C['green'],
                  relief='flat', padx=10, pady=4, cursor='hand2',
                  command=self._save_detection_config
                  ).pack(side='left')

        # Populeaza din config
        self._load_detection_from_config()

    # -----------------------------------------------------------------------
    # Helper: randul de intrare in tabul Detectie
    # -----------------------------------------------------------------------
    def _det_row(self, parent, label, key, var_dict):
        row = tk.Frame(parent, bg=C['panel'])
        row.pack(fill='x', padx=8, pady=2)
        tk.Label(row, text=label + ":", font=("Segoe UI", 9),
                 bg=C['panel'], fg=C['subtext'], width=30, anchor='w'
                 ).pack(side='left', padx=(8, 4))
        var = tk.StringVar(value="0")
        var_dict[key] = var
        tk.Entry(row, textvariable=var, width=8,
                 font=("Courier New", 9), bg=C['panel2'], fg=C['green'],
                 relief='flat', insertbackground=C['green']
                 ).pack(side='left', padx=4, pady=4)

    # -----------------------------------------------------------------------
    # STATUS BAR
    # -----------------------------------------------------------------------
    def _build_statusbar(self):
        sb = tk.Frame(self.root, bg=C['panel'], height=24)
        sb.pack(fill='x', side='bottom')
        sb.pack_propagate(False)
        tk.Label(sb, text="  [HOME] Start/Pauza  |  [END] Stop  |  [F12] Stop urgenta",
                 font=("Segoe UI", 8), bg=C['panel'], fg=C['subtext']).pack(side='left')
        tk.Label(sb, text="L2 Pixel Farm Bot v2.0  ",
                 font=("Segoe UI", 8), bg=C['panel'], fg='#400010').pack(side='right')

    # -----------------------------------------------------------------------
    # Pornire motor
    # -----------------------------------------------------------------------
    def _start_engine(self):
        from bot_engine import BotEngine
        self.engine = BotEngine(CONFIG_PATH, on_event=self._on_engine_event)
        self._append_log("Motor initializat. Apasa START FARM pentru a incepe.")
        self._refresh_hwnd_label()

    def _setup_hotkeys(self):
        """Inregistreaza controalele globale afisate in bara de stare."""
        try:
            import keyboard
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                safety = json.load(f).get('safety', {})
            keyboard.add_hotkey(
                safety.get('pause_key', 'home'),
                lambda: self.root.after(0, self._on_start_pause))
            keyboard.add_hotkey(
                safety.get('stop_key', 'end'),
                lambda: self.root.after(0, self._on_stop))
            keyboard.add_hotkey(
                safety.get('emergency_stop_key', 'f12'),
                lambda: self.root.after(0, self._on_stop))
        except Exception as e:
            self._append_log(f"Hotkey-urile globale nu au putut fi activate: {e}", warn=True)

    def _refresh_hwnd_label(self):
        try:
            import win32gui
            hwnd = self.engine.hwnd
            if hwnd and win32gui.IsWindow(hwnd):
                title = win32gui.GetWindowText(hwnd)
                self._hwnd_var.set(f"✓ {title[:28]}\n   HWND={hwnd}")
                self._hwnd_lbl.config(fg=C['green'])
            else:
                self._hwnd_var.set("✗ Fereastra L2 negasita\n   (porniti jocul)")
                self._hwnd_lbl.config(fg=C['accent'])
        except Exception:
            pass

    # -----------------------------------------------------------------------
    # Callback motor -> GUI (thread-safe)
    # -----------------------------------------------------------------------
    def _on_engine_event(self, event_type: str, data: dict):
        self.root.after(0, self._handle_event, event_type, data)

    def _handle_event(self, event_type: str, data: dict):
        if event_type == 'log':
            msg = data.get('message', '')
            tag = None
            if 'Kill' in msg or 'kill' in msg:
                tag = 'kill'
            elif any(w in msg for w in ('⚠','ATENTIE','SCAZUT','CRITIC','EROARE')):
                tag = 'warn' if 'EROARE' not in msg else 'error'
            self._append_log(msg, tag=tag)

        elif event_type == 'state_change':
            s = data.get('state')
            if s:
                sv = s.value
                self._state_text.set(sv)
                col = STATE_COLORS.get(sv, C['subtext'])
                self._badge_dot.config(fg=col)
                self._badge_lbl.config(fg=col)
                if sv == 'EROARE':
                    self._btn_state = 'stopped'
                    self._btn_start.config(
                        text="▶  START FARM", bg=C['btn_start'], fg='#001a12')
                    self._btn_stop.config(
                        state='disabled', bg=C['panel2'], fg=C['subtext'])

        elif event_type == 'stats_update':
            self._kills_var.set(str(data.get('kills', 0)))
            self._kph_var.set(f"{data.get('kph', 0):.1f}")
            self._loots_var.set(str(data.get('loots', 0)))
            self._hp_pot_var.set(str(data.get('potions_hp', 0)))
            self._hunts_var.set(str(data.get('hunts', 0)))
            self._runtime_var.set(str(timedelta(seconds=data.get('elapsed', 0))).split('.')[0])

        elif event_type == 'memory_update':
            tid  = data.get('target_id', 0)
            thp  = data.get('target_hp', -1)
            has  = data.get('has_target', False)
            dist = data.get('distance')
            tname = data.get('target_name', '')
            dist_s = f"{dist}" if dist is not None else "-"
            self._update_bar_canvas(self._hp_canvas, thp if thp > 0 else 0, 100, has)
            sym = "✓" if has else "✗"
            name_s = f" {tname}" if tname else ""
            self._pixel_var.set(f"ID:{tid}{name_s} HP:{thp} Dist:{dist_s} {sym}")
            self._hp_det_lbl.config(fg=C['green'] if has else C['subtext'])

        elif event_type == 'pixel_update':
            # [MODIFICAT] Compatibilitate veche - redirecționat la memory_update
            pass

        elif event_type == 'radar_update':
            count  = data.get('count', 0)
            min_px = data.get('min_px', 2)
            has    = data.get('monsters_nearby', False)
            self._update_bar_canvas(self._radar_canvas, count, min_px, has)
            sym = "✓" if has else "✗"
            self._radar_var.set(f"Radar: {count}/{min_px}  {sym}")
            self._radar_det_lbl.config(fg=C['green'] if has else C['subtext'])

    def _update_bar_canvas(self, canvas, count, min_px, detected):
        ratio = min(count / max(min_px, 1), 1.0)
        w = canvas.winfo_width() or 200
        fill_w = int(w * ratio)
        color  = C['green'] if detected else '#4a1010'
        canvas.delete('all')
        canvas.create_rectangle(0, 0, fill_w, 14, fill=color, outline='')
        canvas.create_rectangle(fill_w, 0, w, 14, fill=C['panel2'], outline='')

    # -----------------------------------------------------------------------
    # Actiuni butoane
    # -----------------------------------------------------------------------
    def _on_start_pause(self):
        if self._btn_state == 'stopped':
            self.engine.start()
            self._btn_state = 'running'
            self._btn_start.config(text="⏸  PAUZA", bg=C['btn_pause'], fg='#1a1400')
            self._btn_stop.config(state='normal', bg=C['btn_stop'], fg='white')
            self._refresh_hwnd_label()
        elif self._btn_state == 'running':
            self.engine.pause()
            self._btn_state = 'paused'
            self._btn_start.config(text="▶  CONTINUA", bg=C['btn_start'], fg='#001a12')
        elif self._btn_state == 'paused':
            self.engine.resume()
            self._btn_state = 'running'
            self._btn_start.config(text="⏸  PAUZA", bg=C['btn_pause'], fg='#1a1400')

    def _on_stop(self):
        if self._btn_state == 'stopped' and not self.engine._running:
            return
        self.engine.stop()
        self._btn_state = 'stopped'
        self._btn_start.config(text="▶  START FARM", bg=C['btn_start'], fg='#001a12')
        self._btn_stop.config(state='disabled', bg=C['panel2'], fg=C['subtext'])
        self._state_text.set("PAUZAT")
        self._badge_dot.config(fg=C['subtext'])
        self._badge_lbl.config(fg=C['subtext'])

    def _on_calibrate(self):
        import subprocess
        py = r"C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"
        calib = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screen_helper.py")
        try:
            subprocess.Popen([py, calib], creationflags=subprocess.CREATE_NEW_CONSOLE)
            self._append_log("Utilitar calibrare pornit in fereastra separata.")
        except Exception as e:
            messagebox.showerror("Eroare", f"Nu s-a putut porni calibrarea:\n{e}")

    def _on_calibrate_zone(self):
        import subprocess
        py = r"C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"
        calib = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calibrate_zone.py")
        try:
            subprocess.Popen([py, calib], creationflags=subprocess.CREATE_NEW_CONSOLE)
            self._append_log("Calibrare ZONA pornita - defineste colturile hartii.")
        except Exception as e:
            messagebox.showerror("Eroare", f"Nu s-a putut porni:\n{e}")

    def _on_reload_window(self):
        hwnd = self.engine._find_l2_window()
        self.engine.hwnd = hwnd
        if hwnd:
            from input_sender import create_sender
            self.engine.sender = create_sender(
                self.engine.config if self.engine.config else {}, hwnd)
        self._refresh_hwnd_label()
        self._append_log("Re-detectare fereastra L2 efectuata.")

    def _on_close(self):
        self.engine.stop()
        try:
            import keyboard
            keyboard.clear_all_hotkeys()
        except Exception:
            pass
        self.root.destroy()

    # -----------------------------------------------------------------------
    # Log
    # -----------------------------------------------------------------------
    def _append_log(self, msg: str, warn: bool = False, tag=None):
        ts = time.strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        self._log_text.config(state='normal')
        effective_tag = 'warn' if warn else tag
        if effective_tag:
            self._log_text.insert('end', line, effective_tag)
        else:
            self._log_text.insert('end', line)
        self._log_text.see('end')
        self._log_text.config(state='disabled')

    # -----------------------------------------------------------------------
    # Runtime ticker
    # -----------------------------------------------------------------------
    def _tick_runtime(self):
        if self.engine.stats.get('start_time') and not self.engine._paused:
            elapsed = int(time.time() - self.engine.stats['start_time'])
            self._runtime_var.set(str(timedelta(seconds=elapsed)).split('.')[0])
        self.root.after(1000, self._tick_runtime)

    # -----------------------------------------------------------------------
    # SKILL-URI tab: save / load
    # -----------------------------------------------------------------------
    def _mob_names_from_text(self) -> list:
        if not hasattr(self, '_mob_names_text'):
            return []
        raw = self._mob_names_text.get('1.0', 'end')
        names = []
        for line in raw.splitlines():
            n = line.strip()
            if n and not n.startswith('#'):
                names.append(n)
        return names

    def _set_mob_names_text(self, names: list):
        if not hasattr(self, '_mob_names_text'):
            return
        self._mob_names_text.delete('1.0', 'end')
        if names:
            self._mob_names_text.insert('1.0', '\n'.join(names))

    def _load_skills_from_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        except Exception:
            return

        keys    = cfg.get('keys', {})
        combat  = cfg.get('combat', {})
        ps      = cfg.get('pixel_settings', {})

        for k, var in self._key_vars.items():
            val = keys.get(k, '')
            var.set(val if val in VALID_KEYS else 'none')

        bool_map = {
            'combat.use_spoil':                 combat.get('use_spoil', False),
            'combat.use_sweep':                 combat.get('use_sweep', False),
            'pixel_settings.self_hp.enabled':   ps.get('self_hp', {}).get('enabled', False),
            'pixel_settings.self_mp.enabled':   ps.get('self_mp', {}).get('enabled', False),
        }
        for k, var in self._bool_vars.items():
            var.set(bool_map.get(k, False))

        self._combat_mode.set(combat.get('mode', 'basic'))
        rot = combat.get('rotation', ['f2', 'f3'])
        self._rotation_var.set(','.join(rot))

        tm = cfg.get('target_mobs', {})
        if hasattr(self, '_mob_enabled'):
            self._mob_enabled.set(tm.get('enabled', True))
            self._mob_stick_kill.set(tm.get('stick_until_kill', True))
            names = tm.get('names', [])
            if not names:
                names = ['Zombie']
            self._set_mob_names_text(names)
            self._mob_approach_var.set(str(tm.get('approach_distance', 450)))
            self._mob_attack_var.set(str(tm.get('attack_distance', 200)))
            self._mob_search_var.set(str(tm.get('max_search_distance', 2500)))

    def _save_skills_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)

            # Keys
            for k, var in self._key_vars.items():
                val = var.get()
                if val != 'none':
                    cfg.setdefault('keys', {})[k] = val

            # Booleans
            cfg.setdefault('combat', {})['use_spoil'] = self._bool_vars.get('combat.use_spoil', tk.BooleanVar()).get()
            cfg['combat']['use_sweep'] = self._bool_vars.get('combat.use_sweep', tk.BooleanVar()).get()
            cfg.setdefault('pixel_settings', {}).setdefault('self_hp', {})['enabled'] = \
                self._bool_vars.get('pixel_settings.self_hp.enabled', tk.BooleanVar()).get()
            cfg.setdefault('pixel_settings', {}).setdefault('self_mp', {})['enabled'] = \
                self._bool_vars.get('pixel_settings.self_mp.enabled', tk.BooleanVar()).get()

            # Combat mode + rotation
            cfg['combat']['mode'] = self._combat_mode.get()
            rot_str = self._rotation_var.get()
            cfg['combat']['rotation'] = [k.strip() for k in rot_str.split(',') if k.strip()]

            if hasattr(self, '_mob_names_text'):
                names = self._mob_names_from_text()
                cfg['target_mobs'] = {
                    'enabled': self._mob_enabled.get(),
                    'stick_until_kill': self._mob_stick_kill.get(),
                    'names': names,
                    'approach_distance': float(self._mob_approach_var.get() or 450),
                    'attack_distance': float(self._mob_attack_var.get() or 200),
                    'max_search_distance': float(self._mob_search_var.get() or 2500),
                    'max_target_cycles': cfg.get('target_mobs', {}).get('max_target_cycles', 25),
                    'loot_presses': cfg.get('target_mobs', {}).get('loot_presses', 4),
                }

            with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)

            # Reincarca config in engine
            if self.engine._running:
                self.engine.reload_config()

            self._append_log("✓ Setari skill-uri salvate cu succes!")
        except Exception as e:
            messagebox.showerror("Eroare", f"Nu s-au putut salva setarile:\n{e}")

    # -----------------------------------------------------------------------
    # DETECTIE tab: save / load / test
    # -----------------------------------------------------------------------
    def _load_detection_from_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        except Exception:
            return

        thp = cfg.get('pixel_settings', {}).get('target_hp_bar', {})
        for k, var in self._thp_vars.items():
            var.set(str(thp.get(k, 0)))
        rgb = thp.get('color_rgb', [190, 20, 20])
        self._thp_rgb_r.set(str(rgb[0]))
        self._thp_rgb_g.set(str(rgb[1]))
        self._thp_rgb_b.set(str(rgb[2]))

        rad = cfg.get('radar', {})
        self._rad_enabled.set(rad.get('enabled', False))
        for k, var in self._rad_vars.items():
            var.set(str(rad.get(k, 0)))
        mrgb = rad.get('monster_color_rgb', [130, 50, 20])
        self._rad_rgb_r.set(str(mrgb[0]))
        self._rad_rgb_g.set(str(mrgb[1]))
        self._rad_rgb_b.set(str(mrgb[2]))

    def _save_detection_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)

            thp = cfg.setdefault('pixel_settings', {}).setdefault('target_hp_bar', {})
            for k, var in self._thp_vars.items():
                try:
                    thp[k] = int(var.get())
                except ValueError:
                    pass
            thp['color_rgb'] = [
                int(self._thp_rgb_r.get()),
                int(self._thp_rgb_g.get()),
                int(self._thp_rgb_b.get()),
            ]

            rad = cfg.setdefault('radar', {})
            rad['enabled'] = self._rad_enabled.get()
            for k, var in self._rad_vars.items():
                try:
                    rad[k] = int(var.get())
                except ValueError:
                    pass
            rad['monster_color_rgb'] = [
                int(self._rad_rgb_r.get()),
                int(self._rad_rgb_g.get()),
                int(self._rad_rgb_b.get()),
            ]

            with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)

            if self.engine._running:
                self.engine.reload_config()

            self._append_log("✓ Setari detectie salvate cu succes!")
        except Exception as e:
            messagebox.showerror("Eroare", f"Nu s-au putut salva setarile:\n{e}")

    def _test_hp_bar(self):
        try:
            if not self.engine.mem or not self.engine._mem_available:
                self._thp_test_lbl.config(
                    text="RAM neconectat. Completeaza offseturile in l2_memory.py",
                    fg=C['accent'])
                return
            tid = self.engine.mem.get_target_id() or 0
            thp = self.engine.mem.get_target_hp()
            has = tid != 0 and thp is not None and thp > 0
            sym = "✓  TINTA DETECTATA (RAM)!" if has else "✗  Fara tinta valida"
            col = C['green'] if has else C['accent']
            self._thp_test_lbl.config(
                text=f"{sym}   ID={tid}  Target_HP={thp}", fg=col)
        except Exception as e:
            self._thp_test_lbl.config(text=f"Eroare: {e}", fg=C['accent2'])

    def _test_radar(self):
        self._rad_test_lbl.config(
            text="Detectia pe radar a fost eliminata. Botul foloseste doar RAM.",
            fg=C['yellow'])

    # -----------------------------------------------------------------------
    # Utilitare UI
    # -----------------------------------------------------------------------
    def _lf(self, parent, title):
        f = tk.LabelFrame(parent, text=f" {title} ",
                          bg=C['panel'], fg=C['subtext'],
                          font=("Segoe UI", 9), bd=1, relief='flat',
                          highlightbackground=C['border'], highlightthickness=1)
        return f

    def _scrollable(self, parent):
        """Frame scrollabil pentru continut lung."""
        canvas = tk.Canvas(parent, bg=C['bg'], highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient='vertical', command=canvas.yview)
        frame = tk.Frame(canvas, bg=C['bg'])

        frame.bind('<Configure>',
                   lambda e: canvas.configure(scrollregion=canvas.bbox('all')))
        canvas.create_window((0, 0), window=frame, anchor='nw')
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')

        # Scroll cu mousewheel
        def _on_wheel(e):
            canvas.yview_scroll(-1 * (e.delta // 120), 'units')
        canvas.bind_all('<MouseWheel>', _on_wheel)
        return frame


    # -----------------------------------------------------------------------
    # TAB 4: VANATOARE
    # -----------------------------------------------------------------------
    def _build_hunting_tab(self, parent):
        """Tab pentru configurarea miscarii automate de cautare monstre."""
        scroll = self._scrollable(parent)

        # ─── Explicatie ───────────────────────────────────────────────────────
        info_f = tk.Frame(scroll, bg=C['panel2'])
        info_f.pack(fill='x', padx=12, pady=(10, 6))
        tk.Label(info_f,
                 text="🏃  Cum functioneaza Vanatoarea Automata\n\n"
                      "Cand botul nu gaseste nicio tinta dupa N incercari cu target_next,\n"
                      "intra in modul VANATOARE si incepe sa miste personajul:\n\n"
                      "  1. Merge inainte (W) pentru durata configurata\n"
                      "  2. In fiecare 300-400ms verifica daca a aparut o tinta\n"
                      "  3. Daca gaseste tinta -> opreste mersul -> atac imediat\n"
                      "  4. Daca nu gaseste -> face o rotatie aleatorie (A sau D)\n"
                      "  5. Dupa N tururi -> face 180 grade ca sa nu se departeze prea mult\n\n"
                      "⚠  IMPORTANT: Fereastra L2 trebuie sa fie activa (in prim-plan)\n"
                      "   cand botul merge! Botul o va aduce automat in fata.",
                 font=("Segoe UI", 9), bg=C['panel2'], fg=C['text'],
                 justify='left'
                 ).pack(padx=14, pady=12)

        # ─── Setari principale ────────────────────────────────────────────────
        main_f = self._lf(scroll, "  SETARI VANATOARE")
        main_f.pack(fill='x', padx=12, pady=(0, 6))

        # Enable/disable
        self._hunt_enabled = tk.BooleanVar(value=True)
        tk.Checkbutton(main_f,
                       text="✓  Activeaza vanatoarea automata (mers cand nu sunt monstre)",
                       variable=self._hunt_enabled,
                       font=("Segoe UI", 10, "bold"), bg=C['panel'], fg=C['green'],
                       activebackground=C['panel'], selectcolor=C['bg'],
                       activeforeground=C['green']
                       ).pack(anchor='w', padx=10, pady=(10, 4))

        tk.Frame(main_f, bg=C['border'], height=1).pack(fill='x', padx=8, pady=4)

        # ── METODA DE MISCARE ──────────────────────────────────────────────
        meth_lbl = tk.Frame(main_f, bg=C['panel'])
        meth_lbl.pack(fill='x', padx=8, pady=(4, 0))
        tk.Label(meth_lbl, text="Metoda de miscare:",
                 font=("Segoe UI", 10, "bold"), bg=C['panel'], fg=C['text']
                 ).pack(anchor='w', padx=8)

        self._move_method = tk.StringVar(value='mouse')

        m1 = tk.Frame(main_f, bg='#0d2e22')
        m1.pack(fill='x', padx=8, pady=2)
        tk.Radiobutton(m1, text="🖱  RIGHT-CLICK PE TEREN  (RECOMANDAT)",
                       variable=self._move_method, value='mouse',
                       font=("Segoe UI", 10, "bold"), bg='#0d2e22', fg=C['green'],
                       activebackground='#0d2e22', selectcolor=C['bg'],
                       activeforeground=C['green']
                       ).pack(anchor='w', padx=10, pady=4)
        tk.Label(m1,
                 text="     ✓ Nu este afectat de chatbox\n"
                      "     ✓ Functioneaza mereu in L2\n"
                      "     ✓ Nu scrie in chat",
                 font=("Segoe UI", 8), bg='#0d2e22', fg=C['green'],
                 justify='left'
                 ).pack(anchor='w', padx=14, pady=(0, 6))

        m2 = tk.Frame(main_f, bg=C['panel2'])
        m2.pack(fill='x', padx=8, pady=2)
        tk.Radiobutton(m2, text="⌨  TASTE WASD  (cu prefix Escape)",
                       variable=self._move_method, value='keyboard',
                       font=("Segoe UI", 10), bg=C['panel2'], fg=C['subtext'],
                       activebackground=C['panel2'], selectcolor=C['bg'],
                       activeforeground=C['yellow']
                       ).pack(anchor='w', padx=10, pady=4)
        tk.Label(m2,
                 text="     ⚠ Apasa Escape inainte ca sa inchida chatbox-ul\n"
                      "     ⚠ Poate scrie in chat daca ESC nu functioneaza",
                 font=("Segoe UI", 8), bg=C['panel2'], fg=C['yellow'],
                 justify='left'
                 ).pack(anchor='w', padx=14, pady=(0, 6))

        tk.Frame(main_f, bg=C['border'], height=1).pack(fill='x', padx=8, pady=4)

        hunt_fields = [
            ("max_failed_before_hunt", "Incercari target_next inainte de mers", "6",
             "Cate apasari de target_next sa faca inainte sa inceapa sa mearga"),
            ("walk_time_ms",           "Durata mers inainte (ms)",              "2200",
             "Cat timp sa mearga inainte la fiecare ciclu (1000ms = 1 secunda)"),
            ("check_target_interval_ms","Interval verificare tinta in mers (ms)","350",
             "Cate ms intre verificarile de bara HP in timp ce merge"),
            ("turn_time_ms",           "Durata rotatie (ms)",                   "550",
             "Cat timp apasa A sau D pentru rotatie (mai mult = rotire mai mare)"),
            ("return_home_after_walks","Intoarcere dupa N tururi",              "8",
             "Dupa cate tururi de mers face 180 grade sa nu plece prea departe"),
        ]

        self._hunt_vars = {}
        for key, label, default, tooltip in hunt_fields:
            row = tk.Frame(main_f, bg=C['panel2'])
            row.pack(fill='x', padx=8, pady=2)

            tk.Label(row, text=label + ":", font=("Segoe UI", 9),
                     bg=C['panel2'], fg=C['text'], width=36, anchor='w'
                     ).pack(side='left', padx=(10, 4), pady=6)

            var = tk.StringVar(value=default)
            self._hunt_vars[key] = var
            tk.Entry(row, textvariable=var, width=8,
                     font=("Courier New", 10), bg=C['bg'], fg=C['green'],
                     relief='flat', insertbackground=C['green']
                     ).pack(side='left', padx=4)

            tk.Label(row, text=f"← {tooltip}",
                     font=("Segoe UI", 8), bg=C['panel2'], fg=C['subtext']
                     ).pack(side='left', padx=(8, 4))

        # ─── Taste de miscare ─────────────────────────────────────────────────
        keys_f = self._lf(scroll, "  TASTE DE MISCARE")
        keys_f.pack(fill='x', padx=12, pady=(0, 6))

        tk.Label(keys_f,
                 text="In mod normal: W=inainte, A=stanga, S=inapoi, D=dreapta\n"
                      "Schimba doar daca ai remapat tastatura in joc.",
                 font=("Segoe UI", 8), bg=C['panel'], fg=C['subtext']
                 ).pack(anchor='w', padx=10, pady=(8, 4))

        MOVE_KEYS = ['w','a','s','d','q','e','r','t','y','g','z','x','c','v',
                     '1','2','3','4','5','6','7','8','9','0']
        move_defs = [
            ("walk_key",      "Mers inainte"),
            ("turn_left_key", "Rotire stanga"),
            ("turn_right_key","Rotire dreapta"),
            ("back_key",      "Mers inapoi"),
        ]
        self._move_key_vars = {}
        defaults = {'walk_key':'w','turn_left_key':'a','turn_right_key':'d','back_key':'s'}

        for key_id, label in move_defs:
            row = tk.Frame(keys_f, bg=C['panel2'])
            row.pack(fill='x', padx=8, pady=2)
            tk.Label(row, text=label + ":", font=("Segoe UI", 9),
                     bg=C['panel2'], fg=C['text'], width=20, anchor='w'
                     ).pack(side='left', padx=(10, 4), pady=6)
            var = tk.StringVar(value=defaults.get(key_id, 'w'))
            self._move_key_vars[key_id] = var
            ttk.Combobox(row, textvariable=var, values=MOVE_KEYS,
                         width=6, font=("Segoe UI", 9), state='readonly'
                         ).pack(side='left', padx=4)

        # ─── Butoane ──────────────────────────────────────────────────────────
        btn_row = tk.Frame(scroll, bg=C['bg'])
        btn_row.pack(fill='x', padx=12, pady=(8, 16))

        tk.Button(btn_row, text="💾  SALVEAZA SETARILE DE VANATOARE",
                  font=("Segoe UI", 10, "bold"), bg=C['btn_start'], fg='#001a12',
                  relief='flat', padx=20, pady=10, cursor='hand2',
                  command=self._save_hunting_config
                  ).pack(side='left', padx=(0, 10))

        tk.Button(btn_row, text="↺  Reseteaza din config",
                  font=("Segoe UI", 9), bg=C['panel2'], fg=C['blue'],
                  relief='flat', padx=12, pady=8, cursor='hand2',
                  command=self._load_hunting_from_config
                  ).pack(side='left')

        # Test mers rapid
        test_f = self._lf(scroll, "  TEST MISCARE RAPIDA")
        test_f.pack(fill='x', padx=12, pady=(0, 10))

        tk.Label(test_f,
                 text="Testeaza miscarea personajului (2 secunde) pentru a verifica\n"
                      "ca fereastra L2 este activa si tastele functioneaza.",
                 font=("Segoe UI", 9), bg=C['panel'], fg=C['subtext']
                 ).pack(padx=10, pady=(8, 6))

        test_btn_row = tk.Frame(test_f, bg=C['panel'])
        test_btn_row.pack(fill='x', padx=8, pady=(0, 10))

        for lbl, key in [("▶ Inainte (W)", "w"), ("◀ Stanga (A)", "a"),
                          ("▶ Dreapta (D)", "d"), ("▼ Inapoi (S)", "s")]:
            tk.Button(test_btn_row, text=lbl,
                      font=("Segoe UI", 9), bg=C['panel2'], fg=C['blue'],
                      relief='flat', padx=8, pady=6, cursor='hand2',
                      command=lambda k=key: self._test_move(k)
                      ).pack(side='left', padx=4)

        # Populeaza din config
        self._load_hunting_from_config()

    def _save_hunting_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)

            h = cfg.setdefault('hunting', {})
            h['enabled']         = self._hunt_enabled.get()
            h['movement_method'] = self._move_method.get()

            for k, var in self._hunt_vars.items():
                try:
                    h[k] = int(var.get())
                except ValueError:
                    pass

            for k, var in self._move_key_vars.items():
                h[k] = var.get()

            with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)

            if self.engine._running:
                self.engine.reload_config()

            method_str = "Mouse right-click" if h['movement_method'] == 'mouse' else "Taste WASD"
            self._append_log(f"✓ Setari vanatoare salvate! Metoda: {method_str}")
        except Exception as e:
            messagebox.showerror("Eroare", f"Nu s-au putut salva setarile:\n{e}")

    def _load_hunting_from_config(self):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
        except Exception:
            return

        h = cfg.get('hunting', {})
        self._hunt_enabled.set(h.get('enabled', True))
        self._move_method.set(h.get('movement_method', 'mouse'))

        for k, var in self._hunt_vars.items():
            var.set(str(h.get(k, var.get())))

        for k, var in self._move_key_vars.items():
            val = h.get(k, '')
            if val:
                var.set(val)

    def _test_move(self, key: str):
        """Testeaza miscarea - mouse click sau tastatura."""
        from movement import MovementController
        method = self._move_method.get() if hasattr(self, '_move_method') else 'mouse'
        def do_move():
            mc = MovementController(self.engine.hwnd,
                                    self.engine.config if self.engine.config else {})
            mc._focus()
            if method == 'mouse':
                # Test mouse: 3 click-uri inainte
                offsets = {'w': 0, 'a': -300, 'd': 300, 's': -50}
                for _ in range(3):
                    mc._click_forward(turn_offset_x=offsets.get(key, 0))
                    import time; time.sleep(0.8)
            else:
                mc.hold_key(key, 1.5)
        threading.Thread(target=do_move, daemon=True).start()
        m = "Mouse click" if method == 'mouse' else f"Tasta '{key.upper()}'"
        self._append_log(f"Test miscare: {m} pentru 2.5 secunde...") 


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    L2BotGUI()
