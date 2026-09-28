"""
L2 Necromancer Macro v9.0 — Adaptive Stealth Spammer
=====================================================
Fara RAM, fara offsets. PostMessage background.

Caracteristici v9.0:
  - Tabel dinamic de skill-uri (adaugi/stergi oricate vrei)
  - Fiecare skill: tasta, delay min/max, hits min/max, frecventa, activat/dezactivat
  - Motor de adaptare automata: 5 moduri de comportament (Burst, Normal, Slow, Rest, Variable)
  - Anti-detectie nivel inalt:
      * Drift de timing — timingurile deriva usor pe parcursul sesiunii
      * Micro-pauze umane aleatoare (0.5-3s) din timp in timp
      * Hits variabile per ciclu (min–max configurat per skill)
      * Sansa de skip pentru fiecare skill (5-15% aleatoriu)
      * Hold-time aleatoriu per tasta (80-180ms)
      * "Oboseala" simulata: dupa multe cicluri pauzele cresc usor
"""

import ctypes, ctypes.wintypes, time, threading, json, os, random, math, struct
import tkinter as tk
from tkinter import ttk, scrolledtext
import win32gui, win32api, win32con

# pymem e optional — daca lipseste, modulul RAM e dezactivat automat
try:
    import pymem
    import pymem.process
    PYMEM_OK = True
except ImportError:
    PYMEM_OK = False

# ─── Config file ──────────────────────────────────────────────────────────────
CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "macro_config.json")

# ─── Scancode / VK maps ───────────────────────────────────────────────────────
SC = {
    "f1":0x3B,"f2":0x3C,"f3":0x3D,"f4":0x3E,"f5":0x3F,"f6":0x40,
    "f7":0x41,"f8":0x42,"f9":0x43,"f10":0x44,"f11":0x57,"f12":0x58,
    "1":0x02,"2":0x03,"3":0x04,"4":0x05,"5":0x06,"6":0x07,
    "7":0x08,"8":0x09,"9":0x0A,"0":0x0B,
    "up":0x48,"down":0x50,"left":0x4B,"right":0x4D,
    "space":0x39,"enter":0x1C,"esc":0x01,
    "insert":0x52,"delete":0x53,"home":0x47,"end":0x4F,
    "pgup":0x49,"pgdn":0x51,
}
VK = {
    "f1":0x70,"f2":0x71,"f3":0x72,"f4":0x73,"f5":0x74,"f6":0x75,
    "f7":0x76,"f8":0x77,"f9":0x78,"f10":0x79,"f11":0x7A,"f12":0x7B,
    "1":0x31,"2":0x32,"3":0x33,"4":0x34,"5":0x35,"6":0x36,
    "7":0x37,"8":0x38,"9":0x39,"0":0x30,
    "up":0x26,"down":0x28,"left":0x25,"right":0x27,
    "space":0x20,"enter":0x0D,"esc":0x1B,
    "insert":0x2D,"delete":0x2E,"home":0x24,"end":0x23,
    "pgup":0x21,"pgdn":0x22,
}
EXT_KEYS = {"up","down","left","right","insert","delete","home","end","pgup","pgdn"}
ALL_KEYS  = [f"f{i}" for i in range(1,13)] + [str(i) for i in range(1,10)] + ["0"]
ALL_KEYS_BLANK = [""] + ALL_KEYS

# ─── Motor de stealth ─────────────────────────────────────────────────────────
class StealthEngine:
    """
    Genereaza delay-uri umane cu drift, oboseala si variabilitate.
    Nu foloseste valori fixe niciodata.
    """
    def __init__(self):
        self._drift      = 0.0      # deriva acumulata pe sesiune
        self._fatigue    = 0.0      # oboseala: creste cu ciclurile
        self._mode_name  = "Normal"
        self._mode_mult  = 1.0
        self._cycles     = 0
        self._next_mode_change = random.randint(8, 20)

    def tick(self, cycle: int) -> str:
        """Apeleaza dupa fiecare ciclu. Actualizeaza modul si drift-ul."""
        self._cycles = cycle

        # Oboseala: creste lent, max +35%
        self._fatigue = min(0.35, cycle * 0.0008)

        # Drift: miscari mici sinusoidale — fara regularitate
        self._drift = 0.08 * math.sin(cycle * 0.31) + 0.05 * math.cos(cycle * 0.73)

        # Schimba modul automat
        if cycle >= self._next_mode_change:
            self._change_mode()
            self._next_mode_change = cycle + random.randint(6, 25)

        return self._mode_name

    def _change_mode(self):
        modes = [
            ("Normal",   1.00, 55),
            ("Burst",    0.72, 15),   # mai rapid, mai agresiv
            ("Slow",     1.35, 15),   # mai lent, mai prudent
            ("Variable", None, 15),   # complet aleatoriu
        ]
        # Weighted random
        pool = []
        for name, mult, weight in modes:
            pool.extend([(name, mult)] * weight)
        name, mult = random.choice(pool)
        self._mode_name = name
        self._mode_mult = mult if mult else random.uniform(0.6, 1.8)

    def sleep(self, lo: float, hi: float) -> None:
        """Sleep cu variabilitate completa: drift + fatigue + mod + micro-zgomot."""
        base = random.uniform(lo, hi)
        # Aplica modificatori
        val  = base * self._mode_mult
        val += self._drift * base          # drift proportional
        val += self._fatigue * base        # oboseala proportionala
        val += random.gauss(0, 0.018)      # zgomot gaussian mic
        val  = max(0.03, val)              # nu sub 30ms
        time.sleep(val)

    def hold_ms(self) -> int:
        """Hold-time aleatoriu per tasta (80-180ms cu variabilitate)."""
        base = random.randint(80, 180)
        base = int(base * self._mode_mult)
        return max(60, min(250, base))

    def should_micro_pause(self, cycle: int) -> bool:
        """Sansa de pauza umana scurta intre cicluri (~7% din timp)."""
        # Pauza mai probablia in modurile lente
        chance = 0.07 if self._mode_name != "Slow" else 0.14
        return random.random() < chance

    def micro_pause(self) -> float:
        """Pauza umana: 0.4 – 4.0 secunde."""
        dur = random.uniform(0.4, 4.0)
        time.sleep(dur)
        return dur


_stealth = StealthEngine()

# ─── PostMessage (background, fara focus) ─────────────────────────────────────
def pm(hwnd: int, key: str, hold_ms: int | None = None) -> None:
    vk  = VK.get(key, 0); sc  = SC.get(key, 0)
    ext = 0x01000000 if key in EXT_KEYS else 0
    if not vk or not sc: return
    h = (hold_ms if hold_ms is not None else _stealth.hold_ms()) / 1000.0
    win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, ext | (sc << 16) | 1)
    time.sleep(h)
    win32api.PostMessage(hwnd, win32con.WM_KEYUP,   vk, ext | (sc << 16) | 0xC0000001)


# ─── Trimitere comanda chat (/target NumeMob) ──────────────────────────────────
#
#  Metoda: WM_CHAR per caracter (background, fara focus necesar).
#  Functioneaza pe clientii L2 care proceseaza WM_CHAR in campul de chat.
#  Daca serverul tau NU raspunde, incearca sa setezi fereastra L2 ca activa
#  manual inainte de START (Alt+Tab) — WM_CHAR ajunge oricum in queue.
#
def send_chat_cmd(hwnd: int, text: str) -> None:
    """
    1. Apasa Enter → deschide chat
    2. Trimite fiecare caracter via WM_CHAR cu delay mic aleatoriu
    3. Apasa Enter → trimite comanda
    """
    # Deschide chat
    pm(hwnd, "enter", hold_ms=random.randint(55, 90))
    time.sleep(random.uniform(0.14, 0.26))

    # Caractere — delay intre 22-60ms (uman, nu bot)
    for ch in text:
        win32api.PostMessage(hwnd, win32con.WM_CHAR, ord(ch), 1)
        time.sleep(random.uniform(0.022, 0.060))
        # Micro-pauza suplimentara dupa spatiu (uman)
        if ch == " ":
            time.sleep(random.uniform(0.020, 0.045))

    # Trimite
    time.sleep(random.uniform(0.09, 0.17))
    pm(hwnd, "enter", hold_ms=random.randint(55, 90))
    time.sleep(random.uniform(0.18, 0.35))


# ─── Patrol virtual ───────────────────────────────────────────────────────────
class RoomPatrol:
    """
    Patruleaza intr-o camera cu secventa corecta pentru L2:
      LEFT/RIGHT = roteste personajul (nu il muta)
      UP         = merge inainte (in directia in care priveste)

    Secventa pentru un pas lateral:
      1. Roteste 90° (tine LEFT sau RIGHT pentru turn_ms)
      2. Merge inainte (tine UP pentru walk_ms)
      3. Roteste inapoi 90° spre directia initiala

    Lawnmower pattern:
      Rand 0: roteste-te spre dreapta → mergi inainte (walk_ms) → roteste spre stanga
      Schimba randul: roteste spre fata → mergi inainte (step_ms) → stop
      Rand 1: roteste spre stanga → mergi inainte (walk_ms) → roteste spre dreapta
      ...
    """
    def __init__(self):
        self.enabled       = False
        self.key_fwd       = "up"
        self.key_back      = "down"
        self.key_left      = "left"
        self.key_right     = "right"

        self.cols          = 4      # pasi laterali per rand
        self.rows          = 3      # randuri de adancime

        self.turn_ms       = 480    # ms pentru rotire 90° (calibreaza!)
        self.walk_ms       = 1200   # ms mers inainte per coloana
        self.step_ms       = 800    # ms mers inainte intre randuri

        self.every_n_kills = 5
        self.every_n_sec   = 30.0

        # Stare interna
        self._row           = 0
        self._col           = 0
        self._facing        = 0
        self._dir           = 1
        self._kills_since   = 0
        self._last_move_t   = 0.0
        self._last_target_t = 0.0   # timestamp ultimului target trimis (stuck detection)
        self._stuck_count   = 0

        # Stuck detection
        self.stuck_timeout_s = 30.0  # sec fara target = blocat

    def notify_target_sent(self) -> None:
        """Apelat din _loop cand se trimite skill-ul de target."""
        self._last_target_t = time.time()
        self._stuck_count   = 0         # am vazut mobi → nu mai suntem blocati

    def is_stuck(self) -> bool:
        if not self.enabled or self._last_target_t == 0.0:
            return False
        return (time.time() - self._last_target_t) >= self.stuck_timeout_s

    def do_unstuck(self, hwnd: int, log_fn) -> None:
        """
        Rutina de iesire din textura/colt:
          1. Merge inapoi 1.2-1.8s
          2. Rotire aleatorie (stanga sau dreapta) 120-320°
          3. Merge inainte 0.5-1.0s
          4. Reseteaza pozitia in grila
        """
        self._stuck_count += 1
        log_fn(f"  ⚠ STUCK detectat (#{self._stuck_count}) — rutina Unstuck...")

        # 1. Inapoi
        back_ms = random.randint(1200, 1800)
        log_fn(f"  ⚠ Unstuck: [{self.key_back.upper()}] {back_ms}ms")
        pm(hwnd, self.key_back, hold_ms=back_ms)
        time.sleep(random.uniform(0.15, 0.30))

        # 2. Rotire aleatorie (1-3 pasi de 90°, directie aleatorie)
        rot_steps = random.randint(1, 3)
        rot_key   = random.choice([self.key_left, self.key_right])
        for i in range(rot_steps):
            # Jitter puternic pe unghi: 0.75-1.25 din 90°
            rot_ms = int(self.turn_ms * random.uniform(0.75, 1.25))
            log_fn(f"  ⚠ Unstuck: rotire [{rot_key.upper()}] {rot_ms}ms ({i+1}/{rot_steps})")
            pm(hwnd, rot_key, hold_ms=rot_ms)
            time.sleep(random.uniform(0.12, 0.22))

        # 3. Inainte scurt
        fwd_ms = random.randint(500, 1000)
        log_fn(f"  ⚠ Unstuck: [{self.key_fwd.upper()}] {fwd_ms}ms — repornire patrol")
        pm(hwnd, self.key_fwd, hold_ms=fwd_ms)
        time.sleep(random.uniform(0.15, 0.25))

        # 4. Reset grila
        self.reset_pos()
        log_fn("  ⚠ Unstuck complet — patrulare reluata de la inceput")

    def needs_move(self, kills_delta: int) -> bool:
        self._kills_since += kills_delta
        by_kills = self._kills_since >= self.every_n_kills
        by_time  = (time.time() - self._last_move_t) >= self.every_n_sec
        return self.enabled and (by_kills or by_time)

    # ── Jitter pentru o singura durata ms ────────────────────────────────────
    @staticmethod
    def _j(ms: int, lo: float = 0.88, hi: float = 1.12) -> int:
        """Aplica jitter multiplicativ + zgomot gaussian mic."""
        base = ms * random.uniform(lo, hi)
        base += random.gauss(0, ms * 0.02)      # zgomot 2% gaussian
        return max(50, int(base))

    def _pm_j(self, hwnd, key: str, base_ms: int) -> int:
        """PostMessage cu jitter complet — returneaza ms-ul efectiv folosit."""
        eff = self._j(base_ms)
        pm(hwnd, key, hold_ms=eff)
        return eff

    def _turn_and_walk(self, hwnd, log_fn,
                       turn_key: str, walk_key: str,
                       t_ms: int, w_ms: int, label: str):
        """
        Roteste + merge inainte + roteste inapoi.
        Fiecare durata are jitter independent (0.88-1.12) + zgomot gaussian.
        Tura de intoarcere poate fi usor diferita de tura initiala (eroare umana).
        """
        back_key = self.key_right if turn_key == self.key_left else self.key_left

        # Jitter independent pentru fiecare tasta
        t1_eff = self._j(t_ms)                    # rotire dus
        w_eff  = self._j(w_ms, lo=0.90, hi=1.18)  # mers (mai variabil)
        # Eroare umana pe rotire inapoi: ±5% fata de rotirea initiala
        t2_eff = self._j(t1_eff, lo=0.95, hi=1.05)

        log_fn(f"  🗺 {label}:"
               f" [{turn_key.upper()}]{t1_eff}ms"
               f" → [{walk_key.upper()}]{w_eff}ms"
               f" → [{back_key.upper()}]{t2_eff}ms")

        pm(hwnd, turn_key,  hold_ms=t1_eff)
        time.sleep(random.uniform(0.06, 0.14))

        pm(hwnd, walk_key,  hold_ms=w_eff)
        time.sleep(random.uniform(0.06, 0.13))

        pm(hwnd, back_key,  hold_ms=t2_eff)
        time.sleep(random.uniform(0.08, 0.18))

    def do_step(self, hwnd: int, log_fn) -> None:
        if self.cols <= 0 or self.rows <= 0:
            return
        self._kills_since = 0
        self._last_move_t = time.time()

        # ── Pas lateral ───────────────────────────────────────────────────
        turn_key = self.key_right if self._dir > 0 else self.key_left
        self._turn_and_walk(
            hwnd, log_fn,
            turn_key = turn_key,
            walk_key = self.key_fwd,
            t_ms     = self.turn_ms,
            w_ms     = self.walk_ms,
            label    = f"Col {self._col}→{self._col + self._dir}",
        )
        self._col += self._dir

        # ── Capatul randului: schimba randul ──────────────────────────────
        if self._col < 0 or self._col >= self.cols:
            self._col = max(0, min(self.cols - 1, self._col))
            self._dir = -self._dir
            self._row = (self._row + 1) % self.rows

            sj = self._j(self.step_ms)
            log_fn(f"  🗺 Schimb rand → [{self.key_fwd.upper()}]{sj}ms"
                   f"  (rand={self._row})")
            pm(hwnd, self.key_fwd, hold_ms=sj)
            time.sleep(random.uniform(0.12, 0.25))

    def reset_pos(self) -> None:
        self._row = 0; self._col = 0; self._dir = 1
        self._facing = 0; self._kills_since = 0
        self._last_move_t  = time.time()
        self._last_target_t = time.time()   # reseteaza stuck timer

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()
                if not k.startswith("_")}

    def from_dict(self, d: dict) -> None:
        for k, v in d.items():
            if hasattr(self, k) and not k.startswith("_"):
                setattr(self, k, v)


# ─── Targeter prin lista de mobi ─────────────────────────────────────────────
class MobTargeter:
    """
    Trimite /target NumeMob in chat, ciclizand prin lista de mobi.

    Fara RAM nu putem citi distanta reala, deci folosim TIMEOUT per mob:
      • Fiecare mob din lista are `per_mob_s` secunde de incercari.
      • Daca in `per_mob_s` secunde mobul nu a raspuns (nu s-a putut ajunge la el),
        botul apasa ESC (anuleaza target) si trece la urmatorul mob din lista.
      • Dupa ce parcurge toata lista, reincepe de la primul mob.

    Dupa /target:
      • Merge inainte `approach_ms` milisecunde (se apropie de mob).
      • Apasa optional `approach_key` (tasta de atac/apropiere).

    Logica round-robin:
      Mob1 (per_mob_s) → ESC → Mob2 (per_mob_s) → ESC → ... → Mob1 ...
    """
    def __init__(self):
        self.enabled      = False
        self.mode         = "key"    # "key" | "chat"
        self.mob_names: list[str] = []
        self.cycle_s      = 4.0     # repeta /target la fiecare N secunde (per mob)
        self.per_mob_s    = 15.0    # max secunde de incercat un mob; dupa → ESC + next
        self.approach_ms  = 1500    # ms de mers inainte dupa /target (0 = dezactivat)
        self.approach_key = ""      # tasta extra dupa mers (ex: f2 = auto-atac)

        # Stare interna
        self._idx              = 0
        self._last_t           = 0.0    # timestamp ultima comanda /target trimisa
        self._mob_since        = 0.0    # cand am inceput sa incercam mob-ul curent
        self._mob_attempts     = 0      # cate /target am trimis pe mob-ul curent

    # ── Interogari ────────────────────────────────────────────────────────────
    def should_try(self) -> bool:
        """Trebuie sa trimitem o noua comanda /target acum?"""
        if not self.enabled or self.mode != "chat" or not self.mob_names:
            return False
        return (time.time() - self._last_t) >= self.cycle_s

    def should_skip(self) -> bool:
        """
        Mob-ul curent a depasit `per_mob_s` → prea departe / inaccesibil.
        Botul va apasa ESC si va trece la urmatorul.
        """
        if self._mob_since == 0.0:
            return False
        return (time.time() - self._mob_since) >= self.per_mob_s

    def current_name(self) -> str:
        if not self.mob_names:
            return ""
        return self.mob_names[self._idx % len(self.mob_names)]

    def advance(self) -> None:
        """Trece la urmatorul mob din lista, reseteaza timer-ul per-mob."""
        if self.mob_names:
            self._idx = (self._idx + 1) % len(self.mob_names)
        self._mob_since    = time.time()
        self._mob_attempts = 0

    # ── Actiuni ───────────────────────────────────────────────────────────────
    def do_target(self, hwnd: int, log_fn) -> None:
        """Trimite /target NumeMob. Mob-ul NU se schimba — ramane pana la skip."""
        name = self.current_name()
        if not name:
            return
        if self._mob_since == 0.0:
            self._mob_since = time.time()   # primul /target pe acest mob

        self._last_t        = time.time()
        self._mob_attempts += 1
        remaining = max(0.0, self.per_mob_s - (time.time() - self._mob_since))
        cmd = f"/target {name}"
        log_fn(f"  🎯 {cmd}  "
               f"[incercare #{self._mob_attempts}  "
               f"timp ramas: {remaining:.0f}s]")
        send_chat_cmd(hwnd, cmd)

    def do_skip(self, hwnd: int, log_fn) -> None:
        """ESC + trece la urmatorul mob. Apelat cand per_mob_s e depasit."""
        old = self.current_name()
        log_fn(f"  ⛔ [{old}] — timeout {self.per_mob_s:.0f}s → ESC + mob urmator")
        pm(hwnd, "esc", hold_ms=random.randint(60, 100))
        time.sleep(random.uniform(0.18, 0.35))
        self.advance()

    # ── Serializare ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    def from_dict(self, d: dict) -> None:
        for k, v in d.items():
            if hasattr(self, k) and not k.startswith("_"):
                setattr(self, k, v)


# ─── Citire RAM (pozitie jucator + tinta) ─────────────────────────────────────
class RamReader:
    """
    Citire selectiva din l2.exe:
      • Pozitia jucatorului  (X, Y) — float pe 4 bytes
      • Pozitia tintei       (X, Y) — float pe 4 bytes
      • Target ID            (int)  — 0 = fara tinta

    Doua moduri de adresare pentru fiecare struct:
      'ptr'    — citeste un pointer la adresa configurata, apoi adauga offset-ul
                 Ex: struct_addr = mem[base_addr];  X = mem[struct_addr + x_off]
      'direct' — adresa e direct valoarea finala
                 Ex: X = mem[base_addr + x_off]

    Cum gasesti offset-urile cu Cheat Engine:
      1. Cauta HP-ul curent ca int4 / float → gasesti adresa HP
      2. "Find out what accesses this address" → gasesti instructiunea care scrie HP
      3. Din acea instructiune identifici structura si offset-ul relativ
      4. "Pointer scan" pe adresa HP → gasesti pointerul verde (stabil)
      5. Testezi: adresa verde + offset_x = X-ul tau
    """

    # Dimensiunea regiunii de scanat pentru auto-scan (bytes)
    _SCAN_CHUNK = 4096

    def __init__(self):
        self.enabled = False

        # ── Player struct ──────────────────────────────────────────────────
        self.player_mode  = "ptr"    # "ptr" | "direct"
        self.player_base  = 0        # adresa (int, ex: 0x066B974)
        self.player_x_off = 0        # offset X din struct (int, ex: 0x50)
        self.player_y_off = 0        # offset Y din struct

        # ── Target struct ──────────────────────────────────────────────────
        self.target_mode   = "ptr"
        self.target_base   = 0
        self.target_id_off = 0       # offset Target ID
        self.target_x_off  = 0       # offset X tinta
        self.target_y_off  = 0       # offset Y tinta

        # ── Distanta maxima ────────────────────────────────────────────────
        self.max_range    = 1000     # unitati L2; daca depasit → skip mob
        self.skip_enabled = True     # ESC automat daca target_too_far

        # ── Poll interval ──────────────────────────────────────────────────
        self.poll_ms      = 300      # citire RAM la fiecare N ms

        # ── Stare interna ──────────────────────────────────────────────────
        self._pm          = None
        self._connected   = False
        self._status      = "Deconectat"
        self._ps          = 0        # adresa struct jucator (rezolvata)
        self._ts          = 0        # adresa struct tinta (rezolvata)
        self._px = self._py = 0.0
        self._tx = self._ty = 0.0
        self._tid         = 0
        self._last_read   = 0.0
        self._scan_log: list[str] = []

    # ── Proprietati ───────────────────────────────────────────────────────────
    @property
    def ok(self) -> bool:
        return self._connected and self._pm is not None

    @property
    def status(self) -> str:
        return self._status

    # ── Conectare / Deconectare ───────────────────────────────────────────────
    def connect(self, log_fn=None) -> bool:
        if not PYMEM_OK:
            msg = "[RAM] pymem nu e instalat!  Ruleaza: pip install pymem"
            if log_fn: log_fn(f"  {msg}")
            self._status = "LIPSESTE pymem"
            return False
        if not self.enabled:
            self._status = "Dezactivat"
            return False
        try:
            self._pm        = pymem.Pymem("l2.exe")
            self._connected = True
            self._status    = f"Conectat (PID {self._pm.process_id})"
            if log_fn:
                log_fn(f"  [RAM] Conectat la l2.exe — PID {self._pm.process_id}")
            return True
        except Exception as e:
            self._pm        = None
            self._connected = False
            self._status    = f"Eroare: {e}"
            if log_fn: log_fn(f"  [RAM] Nu am gasit l2.exe: {e}")
            return False

    def disconnect(self):
        self._pm        = None
        self._connected = False
        self._status    = "Deconectat"

    # ── Citire memorie ────────────────────────────────────────────────────────
    def _read_ptr(self, addr: int) -> int:
        """Citeste un pointer pe 32 biti (L2 e 32-bit)."""
        try:
            raw = self._pm.read_bytes(addr, 4)
            return struct.unpack("<I", raw)[0]
        except:
            return 0

    def _read_float(self, addr: int) -> float | None:
        try:
            raw = self._pm.read_bytes(addr, 4)
            return struct.unpack("<f", raw)[0]
        except:
            return None

    def _read_int(self, addr: int) -> int | None:
        try:
            raw = self._pm.read_bytes(addr, 4)
            return struct.unpack("<i", raw)[0]
        except:
            return None

    def _resolve_struct(self, mode: str, base: int) -> int:
        """Rezolva adresa struct din configuratie (ptr sau direct)."""
        if base == 0:
            return 0
        if mode == "ptr":
            ptr = self._read_ptr(base)
            return ptr
        return base

    # ── Citire date ───────────────────────────────────────────────────────────
    def read_all(self, force: bool = False) -> bool:
        if not self.ok:
            return False
        now = time.time()
        if not force and (now - self._last_read) < self.poll_ms / 1000.0:
            return True   # cache valid
        self._last_read = now

        self._ps = self._resolve_struct(self.player_mode, self.player_base)
        self._ts = self._resolve_struct(self.target_mode,  self.target_base)

        if self._ps and self.player_x_off:
            px = self._read_float(self._ps + self.player_x_off)
            py = self._read_float(self._ps + self.player_y_off)
            if px is not None: self._px = px
            if py is not None: self._py = py

        if self._ts and self.target_id_off:
            tid = self._read_int(self._ts + self.target_id_off)
            if tid is not None: self._tid = tid

        if self._ts and self.target_x_off:
            tx = self._read_float(self._ts + self.target_x_off)
            ty = self._read_float(self._ts + self.target_y_off)
            if tx is not None: self._tx = tx
            if ty is not None: self._ty = ty

        return True

    # ── Valori publice ────────────────────────────────────────────────────────
    def player_pos(self) -> tuple[float, float]:
        return (self._px, self._py)

    def target_pos(self) -> tuple[float, float]:
        return (self._tx, self._ty)

    def target_id(self) -> int:
        return self._tid

    def has_target(self) -> bool:
        return self._tid not in (0, -1, 0xFFFFFFFF)

    def distance(self) -> float | None:
        """Distanta euclidiana intre jucator si tinta. None daca offset-urile lipsesc."""
        if not self.ok:
            return None
        if (self.player_base == 0 or self.target_base == 0
                or self.player_x_off == 0 or self.target_x_off == 0):
            return None
        dx = self._px - self._tx
        dy = self._py - self._ty
        return math.sqrt(dx * dx + dy * dy)

    def target_too_far(self) -> bool:
        d = self.distance()
        if d is None:
            return False
        return d > self.max_range

    def info_str(self) -> str:
        d = self.distance()
        ds = f"{d:.0f}u" if d is not None else "—"
        return (f"P({self._px:.0f},{self._py:.0f})"
                f"  T({self._tx:.0f},{self._ty:.0f})"
                f"  D={ds}"
                f"  TID={self._tid}")

    # ── Scanare automata (value scan) ─────────────────────────────────────────
    def scan_by_value(self, hp_val: int, mp_val: int,
                      log_fn=None) -> dict | None:
        """
        Gaseste struct-ul jucatorului fara AOB patterns:
          1. Scaneaza toata memoria pentru perechi (hp_val, mp_val) adiacente
          2. Verifica stabilitate: citeste din nou dupa 200ms, valorile trebuie
             sa fie inca in range +-10% (viu, nu date random)
          3. Returneaza: {"player_base": addr, "x_off": off, "y_off": off}

        Pentru target struct: necesita o scanare separata dupa Target ID.
        """
        if not self.ok:
            if log_fn: log_fn("  [SCAN] Nu sunt conectat la l2.exe!")
            return None

        self._scan_log = []

        def _log(m):
            self._scan_log.append(m)
            if log_fn: log_fn(f"  [SCAN] {m}")

        _log(f"Caut struct cu HP={hp_val} MP={mp_val} ...")

        MBI     = ctypes.wintypes.LARGE_INTEGER
        PAGE_RW = 0x04 | 0x02   # PAGE_READWRITE | PAGE_READONLY
        PAGE_EX = 0x20           # PAGE_EXECUTE_READ (nu ne intereseaza)

        # Parcurgem regiunile de memorie ale procesului
        pid  = self._pm.process_id
        proc = ctypes.windll.kernel32.OpenProcess(0x0010, False, pid)  # PROCESS_VM_READ

        candidates: list[int] = []

        # Structura MEMORY_BASIC_INFORMATION
        class _MBI(ctypes.Structure):
            _fields_ = [
                ("BaseAddress",       ctypes.c_size_t),
                ("AllocationBase",    ctypes.c_size_t),
                ("AllocationProtect", ctypes.wintypes.DWORD),
                ("RegionSize",        ctypes.c_size_t),
                ("State",             ctypes.wintypes.DWORD),
                ("Protect",           ctypes.wintypes.DWORD),
                ("Type",              ctypes.wintypes.DWORD),
            ]

        addr = 0
        mbi  = _MBI()
        mbi_sz = ctypes.sizeof(_MBI)
        COMMIT = 0x1000
        target_protects = {0x02, 0x04, 0x20, 0x40}

        while True:
            if ctypes.windll.kernel32.VirtualQueryEx(
                    proc, ctypes.c_void_p(addr), ctypes.byref(mbi), mbi_sz) == 0:
                break
            region_end = addr + mbi.RegionSize
            if (mbi.State == COMMIT
                    and mbi.Protect in target_protects
                    and mbi.RegionSize <= 64 * 1024 * 1024):
                # Citeste intreaga regiune
                try:
                    data = self._pm.read_bytes(addr, mbi.RegionSize)
                    # Cauta perechi (hp, mp) adiacente ca int32 little-endian
                    hp_b = struct.pack("<i", hp_val)
                    for i in range(0, len(data) - 8, 4):
                        if data[i:i+4] == hp_b:
                            mp_b_chk = struct.unpack("<i", data[i+4:i+8])[0]
                            if abs(mp_b_chk - mp_val) <= max(10, mp_val // 10):
                                candidates.append(addr + i)
                except:
                    pass
            addr = region_end
            if addr >= 0x7FFFFFFF:
                break

        ctypes.windll.kernel32.CloseHandle(proc)

        _log(f"Candidati HP/MP: {len(candidates)}")
        if not candidates:
            _log("Nimic gasit. Verifica valorile HP/MP!")
            return None

        # Verifica stabilitate: re-citeste dupa 200ms
        time.sleep(0.22)
        stable = []
        for cand in candidates:
            try:
                chp = self._read_int(cand)
                cmp = self._read_int(cand + 4)
                if (chp is not None and abs(chp - hp_val) <= max(15, hp_val // 8)
                        and cmp is not None and abs(cmp - mp_val) <= max(15, mp_val // 8)):
                    stable.append(cand)
            except:
                pass

        _log(f"Stabili dupa 200ms: {len(stable)}")
        if not stable:
            _log("Nicio adresa stabila. Incearca cu HP/MP usor modificate.")
            return None

        # Ia primul candidat stabil
        base = stable[0]
        _log(f"Struct gasit la: {hex(base)}")

        # Estimeaza offset-uri X, Y (citeste floats la offset-uri comune in L2)
        # In L2 Interlude, coordonatele sunt de obicei la ~0x50-0x80 de HP
        best_x = best_y = None
        for off in range(0x10, 0x120, 4):
            v = self._read_float(base + off)
            if v is not None and -100000 < v < 100000 and abs(v) > 1:
                # Coordonatele L2 sunt tipic intre -200000 si 200000
                if best_x is None and abs(v) > 100:
                    best_x = off
                elif best_y is None and off != best_x and abs(v) > 100:
                    best_y = off

        result = {
            "player_base": base,
            "player_mode": "direct",
            "x_off": best_x or 0,
            "y_off": best_y or 0,
        }
        _log(f"Offset-uri estimate: X=+{hex(best_x or 0)}  Y=+{hex(best_y or 0)}")
        _log("ATENTIE: Verificati manual cu Cheat Engine offset-urile X/Y!")
        return result

    # ── Serializare ──────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()
                if not k.startswith("_")}

    def from_dict(self, d: dict) -> None:
        for k, v in d.items():
            if hasattr(self, k) and not k.startswith("_"):
                setattr(self, k, v)


class SkillDef:
    """
    Un skill configurabil cu toate optiunile.
    label       — nume afisat in log
    key         — tasta
    hits_lo/hi  — apasari per ciclu (aleatoriu intre lo si hi)
    delay_lo/hi — pauza dupa fiecare apasare
    every_n     — la fiecare N cicluri (1 = in fiecare ciclu)
    skip_pct    — sansa de a sari (0-30%)
    enabled     — activ/inactiv
    """
    def __init__(self, label="", key="", hits_lo=1, hits_hi=1,
                 delay_lo=0.5, delay_hi=0.9, every_n=1,
                 skip_pct=5, enabled=True):
        self.label    = label
        self.key      = key
        self.hits_lo  = hits_lo
        self.hits_hi  = hits_hi
        self.delay_lo = delay_lo
        self.delay_hi = delay_hi
        self.every_n  = every_n
        self.skip_pct = skip_pct
        self.enabled  = enabled

    def should_run(self, cycle: int) -> bool:
        if not self.enabled or not self.key: return False
        if cycle % self.every_n != 0:        return False
        if random.random() < self.skip_pct / 100.0: return False
        return True

    def hits(self) -> int:
        return random.randint(self.hits_lo, max(self.hits_lo, self.hits_hi))

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}

    @staticmethod
    def from_dict(d: dict) -> "SkillDef":
        s = SkillDef()
        s.__dict__.update(d)
        return s

# ─── Buff Timer ───────────────────────────────────────────────────────────────
class BuffTimer:
    """Un buff cu interval fix de recastare."""
    def __init__(self, label: str, key: str, interval_min: float,
                 hits: int = 1, enabled: bool = True):
        self.label        = label
        self.key          = key
        self.interval_s   = interval_min * 60.0
        self.hits         = hits
        self.enabled      = enabled
        self._last        = 0.0     # nu a fost casta niciodata

    def due(self) -> bool:
        return self.enabled and bool(self.key) and (
            time.time() - self._last >= self.interval_s)

    def cast(self, hwnd: int, log_fn) -> None:
        log_fn(f"  ✨ Buff [{self.key.upper()}] {self.label} x{self.hits}")
        for _ in range(self.hits):
            pm(hwnd, self.key)
            _stealth.sleep(0.35, 0.65)
        self._last = time.time()

    def remaining_str(self) -> str:
        rem = max(0, self.interval_s - (time.time() - self._last))
        m, s = divmod(int(rem), 60)
        return f"{self.label}:{m}m{s:02d}s"

    def to_dict(self) -> dict:
        return {"label": self.label, "key": self.key,
                "interval_min": self.interval_s / 60.0,
                "hits": self.hits, "enabled": self.enabled}

    @staticmethod
    def from_dict(d: dict) -> "BuffTimer":
        return BuffTimer(d.get("label",""), d.get("key",""),
                         d.get("interval_min", 5.0),
                         d.get("hits", 1), d.get("enabled", True))


# ─── Potion Timer ─────────────────────────────────────────────────────────────
class PotionTimer:
    """Apasa o tasta de potion la fiecare N secunde (fara RAM)."""
    def __init__(self, label: str, key: str, interval_s: float,
                 enabled: bool = False):
        self.label      = label
        self.key        = key
        self.interval_s = interval_s
        self.enabled    = enabled
        self._last      = 0.0

    def due(self) -> bool:
        return self.enabled and bool(self.key) and (
            time.time() - self._last >= self.interval_s)

    def use(self, hwnd: int, log_fn) -> None:
        log_fn(f"  ⚗ Potion [{self.key.upper()}] {self.label}")
        pm(hwnd, self.key)
        self._last = time.time()

    def to_dict(self) -> dict:
        return {"label": self.label, "key": self.key,
                "interval_s": self.interval_s, "enabled": self.enabled}

    @staticmethod
    def from_dict(d: dict) -> "PotionTimer":
        return PotionTimer(d.get("label",""), d.get("key",""),
                           d.get("interval_s", 30.0), d.get("enabled", False))


# ─── Statistici sesiune ────────────────────────────────────────────────────────
class SessionStats:
    def __init__(self):
        self.start_time   = time.time()
        self.kills        = 0
        self.cycles       = 0
        self.buffs_cast   = 0
        self.pots_used    = 0
        self.afk_pings    = 0

    def uptime_str(self) -> str:
        t = int(time.time() - self.start_time)
        h, r = divmod(t, 3600); m, s = divmod(r, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def kills_per_hour(self) -> float:
        elapsed = max(1, time.time() - self.start_time)
        return self.kills / elapsed * 3600

    def summary(self) -> str:
        return (f"Uptime={self.uptime_str()}  "
                f"Kills={self.kills}  ({self.kills_per_hour():.0f}/h)  "
                f"Buffs={self.buffs_cast}  Potions={self.pots_used}  "
                f"AntiAFK={self.afk_pings}")


# ─── Motor macro ──────────────────────────────────────────────────────────────
class NecroMacro:
    def __init__(self, log_fn, stat_fn):
        self._log    = log_fn
        self._stat   = stat_fn   # fn(kills, cycle, mode_name, stats)
        self._running = False
        self._thread  = None
        self.hwnd     = 0

        # ── Skill-uri combat ──────────────────────────────────────────────
        self.skills: list[SkillDef] = self._default_skills()

        # ── Buff-uri cu timer ─────────────────────────────────────────────
        self.buffs: list[BuffTimer] = self._default_buffs()

        # ── Potions pe interval ───────────────────────────────────────────
        self.pot_hp = PotionTimer("HP Pot",  "", 30.0, False)
        self.pot_mp = PotionTimer("MP Pot",  "", 45.0, False)
        self.pot_cp = PotionTimer("CP Pot",  "", 60.0, False)

        # ── Anti-AFK ──────────────────────────────────────────────────────
        self.afk_enabled    = True
        self.afk_interval_s = 240.0   # ping la fiecare 4 minute
        self.afk_key        = "esc"   # tasta neutra (ESC nu face nimic daca nu e meniu)
        self._last_afk      = 0.0

        # ── Scheduler sesiune ─────────────────────────────────────────────
        self.session_enabled   = False
        self.session_farm_min  = 60.0
        self.session_pause_min = 10.0
        self._session_start    = 0.0
        self._in_pause         = False

        # ── Patrol virtual camera ─────────────────────────────────────────
        self.targeter = MobTargeter()
        self.ram      = RamReader()
        self.patrol   = RoomPatrol()

        # ── Rotire camera (detectie mobi in spate) ────────────────────────
        self.cam_enabled     = True
        self.cam_interval_s  = 10.0    # roteste daca nu a lovit nimic in N sec
        self.cam_hold_ms     = 200     # cat timp tine tasta apasata (ms)
        self._last_kill_t    = 0.0     # timestamp ultimului kill real
        self._cam_rotations  = 0       # contor rotatii din sesiune

        # ── Statistici ────────────────────────────────────────────────────
        self.stats = SessionStats()

    # ── Defaults ──────────────────────────────────────────────────────────────
    def _default_skills(self) -> list[SkillDef]:
        return [
            SkillDef("Target",       "f1", 1, 1, 0.15, 0.30, 1,  5, True),
            SkillDef("Death Spike",  "f2", 1, 2, 0.80, 1.20, 1,  3, True),
            SkillDef("Corpse Drain", "f3", 1, 2, 0.30, 0.55, 3,  8, True),
            SkillDef("Pick Up",      "f4", 3, 5, 0.12, 0.22, 1, 10, True),
        ]

    def _default_buffs(self) -> list[BuffTimer]:
        return [
            BuffTimer("Summon",    "",  10.0, 1, False),
            BuffTimer("Buff 1",    "",   5.0, 1, False),
            BuffTimer("Buff 2",    "",   5.0, 1, False),
        ]

    # ── Pornire / Oprire ──────────────────────────────────────────────────────
    def start(self, hwnd: int):
        if self._running: return
        self.hwnd = hwnd
        self._running = True
        self.stats = SessionStats()
        self._session_start = time.time()
        self._last_afk   = time.time()
        self._last_kill_t = time.time()
        self._cam_rotations = 0
        self.patrol.reset_pos()
        for b in self.buffs: b._last = 0.0
        # Conectare RAM (daca e activat)
        if self.ram.enabled:
            self.ram.connect(self._log)
        global _stealth
        _stealth = StealthEngine()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self.ram.ok:
            self.ram.disconnect()

    @property
    def running(self): return self._running

    # ── Bucla principala ──────────────────────────────────────────────────────
    def _loop(self):
        enabled = [s for s in self.skills if s.enabled and s.key]
        act_buffs = [b for b in self.buffs if b.enabled and b.key]
        self._log("=" * 56)
        self._log("  ADAPTIVE MACRO v9.1 — PORNIT")
        self._log(f"  Skills:{len(enabled)}  Buffs:{len(act_buffs)}  "
                  f"AntiAFK:{'ON' if self.afk_enabled else 'OFF'}  "
                  f"Scheduler:{'ON' if self.session_enabled else 'OFF'}")
        self._log("=" * 56)

        while self._running and win32gui.IsWindow(self.hwnd):
            self.stats.cycles += 1
            mode = _stealth.tick(self.stats.cycles)
            self._stat(self.stats.kills, self.stats.cycles, mode, self.stats)

            # ── Detectie disconnect ────────────────────────────────────────
            if not win32gui.IsWindow(self.hwnd):
                self._log("  [!] Fereastra L2 disparuta — STOP automat.")
                break

            # ── Scheduler sesiune: pauza activa ───────────────────────────
            if self.session_enabled and self._in_pause:
                pause_end = (self._session_start
                             + self.session_farm_min * 60
                             + self.session_pause_min * 60)
                if time.time() >= pause_end:
                    self._in_pause = False
                    self._session_start = time.time()
                    self._log("  ▶ Sesiune reluata dupa pauza.")
                else:
                    rem = int(pause_end - time.time())
                    self._log(f"  ⏸ Pauza sesiune — reluare in {rem}s")
                    time.sleep(10.0)
                    continue

            # ── Scheduler sesiune: intra in pauza ─────────────────────────
            if (self.session_enabled and not self._in_pause
                    and (time.time() - self._session_start)
                    >= self.session_farm_min * 60):
                self._in_pause = True
                self._log(f"  ⏸ Pauza sesiune de {self.session_pause_min:.0f} min.")
                continue

            # ── Anti-AFK ──────────────────────────────────────────────────
            if (self.afk_enabled and self.afk_key
                    and time.time() - self._last_afk >= self.afk_interval_s):
                jitter_afk = random.uniform(-20, 30)
                self._log(f"  🏓 Anti-AFK [{self.afk_key.upper()}]")
                pm(self.hwnd, self.afk_key, hold_ms=random.randint(60, 110))
                self._last_afk = time.time() + jitter_afk
                self.stats.afk_pings += 1
                _stealth.sleep(0.3, 0.7)

            # ── Buff-uri cu timer ──────────────────────────────────────────
            for b in self.buffs:
                if not self._running: break
                if b.due():
                    b.cast(self.hwnd, self._log)
                    self.stats.buffs_cast += 1

            # ── Potions pe interval ────────────────────────────────────────
            for pot in (self.pot_hp, self.pot_mp, self.pot_cp):
                if not self._running: break
                if pot.due():
                    pot.use(self.hwnd, self._log)
                    self.stats.pots_used += 1
                    _stealth.sleep(0.2, 0.4)

            # ── Stuck detection (patrol activ) ────────────────────────────
            if self.patrol.enabled and self.patrol.is_stuck():
                self.patrol.do_unstuck(self.hwnd, self._log)
                continue   # reia ciclul de la inceput dupa unstuck

            # ── Patrol virtual camera ─────────────────────────────────────
            if self.patrol.needs_move(0):
                self.patrol.do_step(self.hwnd, self._log)

            # ── Rotire camera (mobi in spate) ─────────────────────────────
            if (self.cam_enabled
                    and (time.time() - self._last_kill_t) >= self.cam_interval_s):
                # Alternaza stanga/dreapta ca sa nu se invarta in cercuri
                cam_key = "left" if self._cam_rotations % 2 == 0 else "right"
                hold    = self.cam_hold_ms + random.randint(-30, 40)
                self._log(f"  [{self.stats.cycles}] 🎥 Rotire camera"
                          f" [{cam_key.upper()}] {hold}ms — caut mobi...")
                pm(self.hwnd, cam_key, hold_ms=hold)
                self._cam_rotations += 1
                self._last_kill_t = time.time()   # reseteaza timer-ul
                _stealth.sleep(0.10, 0.20)

            # ── Citire RAM periodica ───────────────────────────────────────
            if self.ram.enabled and self.ram.ok:
                self.ram.read_all()

            # ── Targeter /target NumeMob via chat ─────────────────────────
            if self.targeter.should_try():
                # 1. Verifica timeout per-mob → ESC + urmatorul
                if self.targeter.should_skip():
                    self.targeter.do_skip(self.hwnd, self._log)

                # 2. Trimite /target NumeMob
                self.targeter.do_target(self.hwnd, self._log)
                _stealth.sleep(0.28, 0.50)   # jocul proceseaza comanda

                # 3. Verificare distanta cu RAM (inainte de apropiere)
                if self.ram.enabled and self.ram.ok and self.ram.skip_enabled:
                    self.ram.read_all(force=True)   # citire fresh
                    if self.ram.has_target() and self.ram.target_too_far():
                        d = self.ram.distance()
                        self._log(f"  ⛔ RAM: distanta {d:.0f}u > "
                                  f"{self.ram.max_range}u → ESC + mob urmator")
                        pm(self.hwnd, "esc", hold_ms=random.randint(60, 100))
                        _stealth.sleep(0.20, 0.38)
                        self.targeter.do_skip(self.hwnd, self._log)
                        continue   # nu ataca, reia ciclul

                # 4. Mers spre mob (approach) cu jitter
                if self.targeter.approach_ms > 0:
                    a_ms = int(self.targeter.approach_ms
                               * random.uniform(0.88, 1.12))
                    self._log(f"  🏃 Apropiere [{a_ms}ms]")
                    pm(self.hwnd, "up", hold_ms=a_ms)
                    _stealth.sleep(0.15, 0.28)

                # 5. Tasta extra (ex: F2 auto-atac / auto-approach)
                if self.targeter.approach_key:
                    pm(self.hwnd, self.targeter.approach_key,
                       hold_ms=random.randint(80, 140))
                    _stealth.sleep(0.35, 0.70)

                self.patrol.notify_target_sent()

            # ── Micro-pauza umana ──────────────────────────────────────────
            if _stealth.should_micro_pause(self.stats.cycles):
                dur = random.uniform(0.5, 4.5)
                self._log(f"  [{self.stats.cycles}] ⏸ Pauza umana {dur:.1f}s")
                time.sleep(dur)
                continue

            # ── Executie skill-uri ─────────────────────────────────────────
            any_action  = False
            is_first_sk = True    # primul skill = target → notifica patrol
            for sk in self.skills:
                if not self._running: break
                if not sk.should_run(self.stats.cycles): continue
                n = sk.hits()
                self._log(f"  [{self.stats.cycles}] ⌨ {sk.label}"
                          f" [{sk.key.upper()}] x{n}  {mode}")
                for i in range(n):
                    if not self._running: break
                    pm(self.hwnd, sk.key)

                    # Micro-jitter organic intre lovituri (50-150ms extra)
                    micro = random.uniform(0.050, 0.150)
                    _stealth.sleep(sk.delay_lo + micro, sk.delay_hi + micro)

                    # Intre lovituri consecutive: pauza micro-aleatorie suplimentara
                    if i < n - 1:
                        time.sleep(random.uniform(0.03, 0.09))

                # Primul skill executat = skill de target → reseteaza stuck timer
                if is_first_sk:
                    self.patrol.notify_target_sent()
                    is_first_sk = False

                any_action = True

            if any_action:
                self.stats.kills += 1
                self._last_kill_t = time.time()
                self.patrol.needs_move(1)

            _stealth.sleep(0.12, 0.45)

        self._running = False
        self._log(f"  ■ Macro oprit. {self.stats.summary()}")
        self._stat(self.stats.kills, self.stats.cycles, "OPRIT", self.stats)


# ─── Rand de skill in UI ──────────────────────────────────────────────────────
class SkillRow:
    _IDX = 0

    def __init__(self, parent, container, remove_fn, skill: SkillDef | None = None):
        SkillRow._IDX += 1
        self._remove_fn  = remove_fn
        self._container  = container
        self.frame       = ttk.Frame(parent, relief="groove", padding=4)
        self.frame.pack(fill="x", pady=2, padx=4)

        s = skill or SkillDef()

        # Rand 1: enabled | label | key | every N | skip%
        r1 = ttk.Frame(self.frame); r1.pack(fill="x")
        self.v_en    = tk.BooleanVar(value=s.enabled)
        ttk.Checkbutton(r1, variable=self.v_en).pack(side="left")
        self.v_label = tk.StringVar(value=s.label)
        ttk.Entry(r1, textvariable=self.v_label, width=14,
                  font=("",9)).pack(side="left", padx=(0,4))
        ttk.Label(r1, text="Tasta:").pack(side="left")
        self.v_key   = tk.StringVar(value=s.key)
        ttk.Combobox(r1, textvariable=self.v_key, values=ALL_KEYS_BLANK,
                     width=5, state="readonly").pack(side="left", padx=(2,8))
        ttk.Label(r1, text="La fiecare:").pack(side="left")
        self.v_every = tk.StringVar(value=str(s.every_n))
        ttk.Spinbox(r1, textvariable=self.v_every, from_=1, to=100,
                    width=4).pack(side="left")
        ttk.Label(r1, text="ciclu").pack(side="left", padx=(2,8))
        ttk.Label(r1, text="Skip:").pack(side="left")
        self.v_skip  = tk.StringVar(value=str(s.skip_pct))
        ttk.Spinbox(r1, textvariable=self.v_skip, from_=0, to=50,
                    width=4).pack(side="left")
        ttk.Label(r1, text="%").pack(side="left", padx=(2,8))
        ttk.Button(r1, text="✕", width=2,
                   command=self._remove).pack(side="right")

        # Rand 2: hits min/max | delay min/max
        r2 = ttk.Frame(self.frame); r2.pack(fill="x")
        ttk.Label(r2, text="Hits:", width=5).pack(side="left")
        self.v_hlo   = tk.StringVar(value=str(s.hits_lo))
        self.v_hhi   = tk.StringVar(value=str(s.hits_hi))
        ttk.Spinbox(r2, textvariable=self.v_hlo, from_=1, to=20,
                    width=4).pack(side="left")
        ttk.Label(r2, text="—").pack(side="left", padx=2)
        ttk.Spinbox(r2, textvariable=self.v_hhi, from_=1, to=20,
                    width=4).pack(side="left", padx=(0,12))
        ttk.Label(r2, text="Delay(s):").pack(side="left")
        self.v_dlo   = tk.StringVar(value=f"{s.delay_lo:.2f}")
        self.v_dhi   = tk.StringVar(value=f"{s.delay_hi:.2f}")
        ttk.Spinbox(r2, textvariable=self.v_dlo, from_=0.02, to=30.0,
                    increment=0.05, format="%.2f", width=6).pack(side="left")
        ttk.Label(r2, text="—").pack(side="left", padx=2)
        ttk.Spinbox(r2, textvariable=self.v_dhi, from_=0.02, to=30.0,
                    increment=0.05, format="%.2f", width=6).pack(side="left")

    def _remove(self):
        self.frame.destroy()
        self._remove_fn(self)

    def get(self) -> SkillDef:
        def fi(v, default=1):
            try: return max(1, int(float(v.get())))
            except: return default
        def ff(v, default=0.5):
            try: return max(0.02, float(v.get()))
            except: return default
        return SkillDef(
            label    = self.v_label.get().strip() or "Skill",
            key      = self.v_key.get().strip().lower(),
            hits_lo  = fi(self.v_hlo),
            hits_hi  = fi(self.v_hhi),
            delay_lo = ff(self.v_dlo),
            delay_hi = ff(self.v_dhi),
            every_n  = fi(self.v_every),
            skip_pct = fi(self.v_skip, 5),
            enabled  = self.v_en.get(),
        )


# ─── Detectie ferestre L2 ─────────────────────────────────────────────────────
def find_l2() -> list[tuple[int, str]]:
    found = []
    def cb(h, _):
        if not win32gui.IsWindowVisible(h): return
        t = win32gui.GetWindowText(h)
        if t and any(x in t.lower() for x in ("lineage","l2","elmorlab","interlude")):
            found.append((h, t))
    win32gui.EnumWindows(cb, None)
    return found


# ─── Aplicatie GUI ────────────────────────────────────────────────────────────
class App:
    def __init__(self):
        self.root  = tk.Tk()
        self.root.title("L2 Adaptive Macro v9.0")
        self.root.resizable(True, True)
        self._hwnd_map: dict[str, int] = {}
        self.macro = NecroMacro(self._log, self._stat_update)
        self._rows: list[SkillRow] = []
        self._build()
        self._load()
        self._refresh_win()

    # ── Build ─────────────────────────────────────────────────────────────────
    def _build(self):
        r = self.root
        r.columnconfigure(0, weight=1)

        nb = ttk.Notebook(r)
        nb.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)
        r.rowconfigure(0, weight=1)

        t0 = ttk.Frame(nb); nb.add(t0, text="  🎯 Tinta  ")
        t1 = ttk.Frame(nb); nb.add(t1, text="  ⚔ Skill-uri  ")
        t2 = ttk.Frame(nb); nb.add(t2, text="  ✨ Buff/Pot  ")
        t3 = ttk.Frame(nb); nb.add(t3, text="  🗺 Miscare  ")
        t4 = ttk.Frame(nb); nb.add(t4, text="  🌾 Farm  ")
        t5 = ttk.Frame(nb); nb.add(t5, text="  🧠 Adaptare  ")
        t7 = ttk.Frame(nb); nb.add(t7, text="  📡 RAM  ")
        t6 = ttk.Frame(nb); nb.add(t6, text="  ⚙ Setari  ")
        self._tab_target(t0)
        self._tab_skills(t1)
        self._tab_buff_pot(t2)
        self._tab_movement(t3)
        self._tab_farm(t4)
        self._tab_adapt(t5)
        self._tab_ram(t7)
        self._tab_settings(t6)

        # Status bar — 2 linii
        sb = ttk.Frame(r, padding=(4, 2))
        sb.grid(row=1, column=0, sticky="ew", padx=6)
        # Linia 1: stare + kills + mod
        self.lbl_state = ttk.Label(sb, text="OPRIT", width=10,
                                   font=("", 9, "bold"), foreground="gray")
        self.lbl_kills = ttk.Label(sb, text="Kills: 0", width=12)
        self.lbl_kph   = ttk.Label(sb, text="K/h: —", width=9, foreground="#060")
        self.lbl_cycle = ttk.Label(sb, text="Ciclu: 0", width=10)
        self.lbl_mode  = ttk.Label(sb, text="Mod: —", width=13, foreground="#080")
        self.lbl_up    = ttk.Label(sb, text="00:00:00", width=10, foreground="#555")
        for i, w in enumerate([self.lbl_state, self.lbl_kills, self.lbl_kph,
                                self.lbl_cycle, self.lbl_mode, self.lbl_up]):
            w.grid(row=0, column=i, padx=3)
        # Linia 2: buffs countdown
        self.lbl_buffs = ttk.Label(sb, text="", foreground="#a60",
                                   font=("Consolas", 8))
        self.lbl_buffs.grid(row=1, column=0, columnspan=6, sticky="w", padx=3)

        # Butoane
        bb = ttk.Frame(r, padding=4)
        bb.grid(row=2, column=0, sticky="ew", padx=6, pady=2)
        self.btn_s = ttk.Button(bb, text="▶  START", command=self._start, width=14)
        self.btn_s.grid(row=0, column=0, padx=4)
        self.btn_x = ttk.Button(bb, text="■  STOP",  command=self._stop,
                                 width=14, state="disabled")
        self.btn_x.grid(row=0, column=1, padx=4)
        ttk.Button(bb, text="💾 Salveaza", command=self._save,
                   width=12).grid(row=0, column=2, padx=4)
        self.v_min = tk.BooleanVar(value=True)
        ttk.Checkbutton(bb, text="Minimizeaza la START",
                        variable=self.v_min).grid(row=0, column=3, padx=8)

        # Log
        fl = ttk.LabelFrame(r, text="Log", padding=3)
        fl.grid(row=3, column=0, sticky="nsew", padx=6, pady=(0, 6))
        fl.columnconfigure(0, weight=1); fl.rowconfigure(0, weight=1)
        r.rowconfigure(3, weight=1)
        self.txt_log = scrolledtext.ScrolledText(
            fl, height=10, font=("Consolas", 9),
            state="disabled", bg="#0d0d0d", fg="#ccc")
        self.txt_log.grid(row=0, column=0, sticky="nsew")

    # ── Tab Tinta (targeter lista mobi) ──────────────────────────────────────
    def _tab_target(self, tab):
        tab.columnconfigure(0, weight=1)

        # ── Mod targetare ────────────────────────────────────────────────────
        fm = ttk.LabelFrame(tab, text="Mod targetare", padding=8)
        fm.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fm.columnconfigure(1, weight=1)

        self.v_tgt_en   = tk.BooleanVar(value=False)
        self.v_tgt_mode = tk.StringVar(value="key")

        ttk.Checkbutton(fm, text="Activ", variable=self.v_tgt_en).grid(
            row=0, column=0, sticky="w")

        modf = ttk.Frame(fm); modf.grid(row=0, column=1, sticky="w", padx=(16, 0))
        ttk.Radiobutton(modf, text="Tasta F1 / next target  (din tabelul Skill-uri)",
                        variable=self.v_tgt_mode, value="key").pack(anchor="w")
        ttk.Radiobutton(modf, text="Comanda chat  /target NumeMob  (lista de mai jos)",
                        variable=self.v_tgt_mode, value="chat").pack(anchor="w")

        ttk.Label(fm,
                  text="ℹ Modul 'chat' trimite /target NumeMob via WM_CHAR (background).\n"
                       "   Daca nu merge, tine L2 in prim plan (Alt+Tab o data).",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=2, sticky="w", pady=(4, 0))

        # ── Lista mobi ───────────────────────────────────────────────────────
        fl = ttk.LabelFrame(tab,
                            text="Lista mobi — un nume per linie", padding=8)
        fl.grid(row=1, column=0, sticky="nsew", padx=8, pady=4)
        fl.columnconfigure(0, weight=1); fl.rowconfigure(0, weight=1)
        tab.rowconfigure(1, weight=1)

        self.txt_mobs = tk.Text(fl, height=6, width=32, font=("Consolas", 10),
                                relief="solid", bd=1)
        self.txt_mobs.grid(row=0, column=0, sticky="nsew")
        sb_m = ttk.Scrollbar(fl, command=self.txt_mobs.yview)
        sb_m.grid(row=0, column=1, sticky="ns")
        self.txt_mobs["yscrollcommand"] = sb_m.set
        self.txt_mobs.insert("1.0", "Skeleton\nZombie\nScarecrow")

        rf = ttk.Frame(fl); rf.grid(row=1, column=0, columnspan=2,
                                    sticky="w", pady=(5, 0))
        ttk.Label(rf, text="Repeta /target la fiecare (sec):").pack(side="left")
        self.v_tgt_cycle = tk.StringVar(value="4")
        ttk.Spinbox(rf, textvariable=self.v_tgt_cycle, from_=2, to=120,
                    width=5).pack(side="left", padx=(4, 0))

        # ── Saritura mob inaccesibil (out of range) ──────────────────────────
        fs = ttk.LabelFrame(tab,
                            text="Saritura mob inaccesibil / prea departe", padding=8)
        fs.grid(row=2, column=0, sticky="ew", padx=8, pady=4)
        fs.columnconfigure(5, weight=1)

        ttk.Label(fs, text="Daca dupa (sec):").grid(row=0, column=0, sticky="w")
        self.v_tgt_permob = tk.StringVar(value="15")
        ttk.Spinbox(fs, textvariable=self.v_tgt_permob, from_=5, to=300,
                    width=5).grid(row=0, column=1, padx=(4, 2))
        ttk.Label(fs,
                  text="nu s-a putut ajunge la mob → ESC + mob urmator"
                  ).grid(row=0, column=2, sticky="w", padx=(4, 0))

        ttk.Label(fs,
                  text="ℹ Fara RAM nu putem citi distanta reala. Botul incearca mobul\n"
                       "   N secunde, apoi apasa ESC si trece la urmatorul din lista.\n"
                       "   Recomandat: 15-20s (suficient sa ucida un mob normal).",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=6, sticky="w", pady=(4, 0))

        # ── Miscare spre mob dupa /target ─────────────────────────────────────
        fa = ttk.LabelFrame(tab,
                            text="Miscare spre mob dupa /target", padding=8)
        fa.grid(row=3, column=0, sticky="ew", padx=8, pady=4)
        fa.columnconfigure(5, weight=1)

        ttk.Label(fa, text="Merge inainte (ms):").grid(row=0, column=0, sticky="w")
        self.v_tgt_apprms = tk.StringVar(value="1500")
        ttk.Spinbox(fa, textvariable=self.v_tgt_apprms, from_=0, to=10000,
                    increment=100, width=6).grid(row=0, column=1, padx=(4, 12))
        ttk.Label(fa, text="(0 = dezactivat)  ").grid(row=0, column=2)

        ttk.Label(fa, text="Tasta atac extra:").grid(row=0, column=3, sticky="w")
        self.v_tgt_appr = tk.StringVar(value="")
        ttk.Combobox(fa, textvariable=self.v_tgt_appr,
                     values=ALL_KEYS_BLANK, width=6,
                     state="readonly").grid(row=0, column=4, padx=(4, 0))
        ttk.Label(fa,
                  text="  (ex: F2 = skill de atac, porneste auto-approach in L2)",
                  foreground="#888").grid(row=0, column=5, sticky="w", padx=4)

        ttk.Label(fa,
                  text="ℹ Dupa /target, botul apasa sus (UP) N ms pentru a merge spre mob.\n"
                       "   Tasta de atac extra este optionala — in L2 atacul porneste "
                       "auto-approach.",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=6, sticky="w", pady=(4, 0))

        # ── Buton test ───────────────────────────────────────────────────────
        ft = ttk.Frame(tab); ft.grid(row=4, column=0, sticky="w", padx=8, pady=6)
        ttk.Button(ft, text="🧪 Test /target  (primul mob)",
                   command=self._test_target).pack(side="left")
        ttk.Label(ft, text="  ← L2 activ (Alt+Tab) pentru test",
                  foreground="#888").pack(side="left")

    def _test_target(self):
        hwnd = self._get_hwnd()
        if not hwnd:
            self._log("[!] Selecteaza fereastra L2!"); return
        names = [n.strip() for n in self.txt_mobs.get("1.0", "end").splitlines()
                 if n.strip()]
        if not names:
            self._log("[!] Lista de mobi e goala!"); return
        cmd = f"/target {names[0]}"
        self._log(f"TEST chat cmd: {cmd}")
        threading.Thread(target=send_chat_cmd, args=(hwnd, cmd),
                         daemon=True).start()

    # ── Tab Skill-uri ─────────────────────────────────────────────────────────
    def _tab_skills(self, tab):
        tab.columnconfigure(0, weight=1)
        tab.rowconfigure(1, weight=1)

        hdr = ttk.Frame(tab, padding=(4, 4))
        hdr.grid(row=0, column=0, sticky="ew")
        ttk.Label(hdr, text="Lista skill-uri — ordine de executie",
                  font=("", 9, "bold")).pack(side="left")
        ttk.Button(hdr, text="+ Adauga Skill",
                   command=self._add_row).pack(side="right", padx=4)
        ttk.Button(hdr, text="Reset Default",
                   command=self._reset_default).pack(side="right")

        # Canvas scrollabil pentru randuri
        outer = ttk.Frame(tab)
        outer.grid(row=1, column=0, sticky="nsew", padx=4, pady=4)
        outer.columnconfigure(0, weight=1); outer.rowconfigure(0, weight=1)
        canvas = tk.Canvas(outer, highlightthickness=0)
        sb_v   = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb_v.set)
        canvas.grid(row=0, column=0, sticky="nsew")
        sb_v.grid(row=0, column=1, sticky="ns")

        self._skill_canvas  = canvas
        self._skill_inner   = ttk.Frame(canvas)
        self._skill_win_id  = canvas.create_window((0, 0), window=self._skill_inner,
                                                    anchor="nw")
        self._skill_inner.bind("<Configure>", self._on_inner_resize)
        canvas.bind("<Configure>", self._on_canvas_resize)

        ttk.Label(tab,
                  text="ℹ  Hits aleatoriu intre min si max per ciclu. "
                       "Skip%=sansa de a sari skill-ul din bucla.",
                  foreground="#666").grid(row=2, column=0, sticky="w",
                                         padx=8, pady=(0,4))

    def _on_inner_resize(self, _e):
        self._skill_canvas.configure(
            scrollregion=self._skill_canvas.bbox("all"))

    def _on_canvas_resize(self, e):
        self._skill_canvas.itemconfig(self._skill_win_id, width=e.width)

    # ── Tab Buff / Potion ─────────────────────────────────────────────────────
    def _tab_buff_pot(self, tab):
        tab.columnconfigure(0, weight=1)

        # ── Buff-uri ──────────────────────────────────────────────────────
        fb = ttk.LabelFrame(tab, text="Auto-Buff (timer per buff)", padding=8)
        fb.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fb.columnconfigure(5, weight=1)

        ttk.Label(fb, text="Activ", width=5).grid(row=0, column=0)
        ttk.Label(fb, text="Nume", width=14).grid(row=0, column=1)
        ttk.Label(fb, text="Tasta", width=6).grid(row=0, column=2)
        ttk.Label(fb, text="Interval(min)", width=13).grid(row=0, column=3)
        ttk.Label(fb, text="Hits", width=5).grid(row=0, column=4)

        self._buff_rows: list[dict] = []
        for i, b in enumerate(self.macro.buffs):
            self._add_buff_row(fb, i + 1, b)

        ttk.Button(fb, text="+ Buff",
                   command=lambda: self._add_buff_row(
                       fb, len(self._buff_rows) + 1,
                       BuffTimer("Buff","",5.0,1,False))
                   ).grid(row=20, column=0, columnspan=2, sticky="w", pady=4)

        # ── Potions ───────────────────────────────────────────────────────
        fp = ttk.LabelFrame(tab, text="Auto-Potion pe interval (fara RAM)", padding=8)
        fp.grid(row=1, column=0, sticky="ew", padx=8, pady=4)
        fp.columnconfigure(3, weight=1)

        self._pot_widgets: dict[str, dict] = {}
        for pi, (attr, lbl) in enumerate([
                ("pot_hp", "HP Potion"), ("pot_mp", "MP Potion"), ("pot_cp", "CP Potion")]):
            pot = getattr(self.macro, attr)
            v_en  = tk.BooleanVar(value=pot.enabled)
            v_key = tk.StringVar(value=pot.key)
            v_int = tk.StringVar(value=str(pot.interval_s))
            ttk.Checkbutton(fp, variable=v_en).grid(row=pi, column=0, padx=4)
            ttk.Label(fp, text=lbl, width=12).grid(row=pi, column=1, sticky="w")
            ttk.Combobox(fp, textvariable=v_key, values=ALL_KEYS_BLANK,
                         width=5, state="readonly").grid(row=pi, column=2, padx=4)
            ttk.Label(fp, text="la fiecare (sec):").grid(row=pi, column=3, sticky="w")
            ttk.Spinbox(fp, textvariable=v_int, from_=5, to=600,
                        width=6).grid(row=pi, column=4, padx=4)
            self._pot_widgets[attr] = {"en": v_en, "key": v_key, "int": v_int}

        ttk.Label(fp, text="ℹ Fara RAM — potiunea se apasa la interval fix, indiferent de HP/MP.",
                  foreground="#888").grid(row=3, column=0, columnspan=5, sticky="w", pady=4)

    def _add_buff_row(self, parent, row_n: int, buff: "BuffTimer"):
        row = len(self._buff_rows) + 1
        v_en  = tk.BooleanVar(value=buff.enabled)
        v_lbl = tk.StringVar(value=buff.label)
        v_key = tk.StringVar(value=buff.key)
        v_int = tk.StringVar(value=f"{buff.interval_s/60:.1f}")
        v_h   = tk.StringVar(value=str(buff.hits))
        ttk.Checkbutton(parent, variable=v_en).grid(row=row, column=0, pady=2)
        ttk.Entry(parent, textvariable=v_lbl, width=13).grid(row=row, column=1, padx=2)
        ttk.Combobox(parent, textvariable=v_key, values=ALL_KEYS_BLANK,
                     width=5, state="readonly").grid(row=row, column=2, padx=2)
        ttk.Spinbox(parent, textvariable=v_int, from_=0.5, to=120,
                    increment=0.5, format="%.1f",
                    width=7).grid(row=row, column=3, padx=2)
        ttk.Spinbox(parent, textvariable=v_h, from_=1, to=10,
                    width=4).grid(row=row, column=4, padx=2)
        self._buff_rows.append({"en":v_en,"lbl":v_lbl,"key":v_key,"int":v_int,"h":v_h})

    # ── Tab Miscare ───────────────────────────────────────────────────────────
    def _tab_movement(self, tab):
        tab.columnconfigure(0, weight=1)

        # ── Activare + Taste ──────────────────────────────────────────────
        fk = ttk.LabelFrame(tab, text="Taste de miscare", padding=8)
        fk.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fk.columnconfigure(1, weight=1)

        self.v_pat_en = tk.BooleanVar(value=False)
        ttk.Checkbutton(fk, text="Activat patrol virtual in camera",
                        variable=self.v_pat_en, style="Bold.TCheckbutton").grid(
            row=0, column=0, columnspan=4, sticky="w", pady=(0,6))

        keys_choices = ["up","down","left","right","w","a","s","d"]
        def krow(lbl, attr_name, default, r):
            ttk.Label(fk, text=lbl, width=16).grid(row=r, column=0, sticky="w")
            v = tk.StringVar(value=default)
            ttk.Combobox(fk, textvariable=v, values=keys_choices,
                         width=7, state="readonly").grid(row=r, column=1,
                                                          sticky="w", padx=4)
            setattr(self, attr_name, v)

        krow("Inainte:",   "v_pk_fwd",   "up",    1)
        krow("Inapoi:",    "v_pk_back",  "down",  2)
        krow("Stanga:",    "v_pk_left",  "left",  3)
        krow("Dreapta:",   "v_pk_right", "right", 4)

        ttk.Label(fk, text="ℹ Recomandat: sageti (nu interfereaza cu chat-ul L2).",
                  foreground="#888").grid(row=5, column=0, columnspan=4,
                                          sticky="w", pady=(6,0))

        # ── Dimensiunea camerei (grila virtuala) ──────────────────────────
        fg = ttk.LabelFrame(tab, text="Camera virtuala (Lawnmower Patrol)", padding=8)
        fg.grid(row=1, column=0, sticky="ew", padx=8, pady=4)
        fg.columnconfigure(3, weight=1)

        # Vizualizare grila
        self._grid_canvas = tk.Canvas(fg, width=200, height=120,
                                       bg="#1a1a2e", highlightthickness=1,
                                       highlightbackground="#444")
        self._grid_canvas.grid(row=0, column=0, rowspan=6, padx=(0,16), pady=4)
        self._draw_grid_preview(4, 3)

        ttk.Label(fg, text="Coloane (latime):").grid(row=0, column=1, sticky="w")
        self.v_pat_cols = tk.StringVar(value="4")
        sb_cols = ttk.Spinbox(fg, textvariable=self.v_pat_cols, from_=2, to=20,
                               width=5)
        sb_cols.grid(row=0, column=2, sticky="w", padx=4)
        sb_cols.bind("<ButtonRelease>", lambda _: self._update_grid_preview())
        sb_cols.bind("<KeyRelease>",    lambda _: self._update_grid_preview())

        ttk.Label(fg, text="Randuri (adancime):").grid(row=1, column=1, sticky="w", pady=3)
        self.v_pat_rows = tk.StringVar(value="3")
        sb_rows = ttk.Spinbox(fg, textvariable=self.v_pat_rows, from_=1, to=20,
                               width=5)
        sb_rows.grid(row=1, column=2, sticky="w", padx=4)
        sb_rows.bind("<ButtonRelease>", lambda _: self._update_grid_preview())
        sb_rows.bind("<KeyRelease>",    lambda _: self._update_grid_preview())

        ttk.Label(fg, text="Rotire 90° (ms):").grid(row=2, column=1, sticky="w")
        self.v_pat_turnms = tk.StringVar(value="480")
        ttk.Spinbox(fg, textvariable=self.v_pat_turnms, from_=100, to=2000,
                    increment=20, width=7).grid(row=2, column=2, sticky="w", padx=4)
        ttk.Label(fg, text="← calibreaza!", foreground="#c80").grid(
            row=2, column=3, sticky="w")

        ttk.Label(fg, text="Mers per coloana (ms):").grid(row=3, column=1, sticky="w", pady=3)
        self.v_pat_walkms = tk.StringVar(value="1200")
        ttk.Spinbox(fg, textvariable=self.v_pat_walkms, from_=100, to=10000,
                    increment=100, width=7).grid(row=3, column=2, sticky="w", padx=4)

        ttk.Label(fg, text="Mers intre randuri (ms):").grid(row=4, column=1, sticky="w")
        self.v_pat_stepms = tk.StringVar(value="800")
        ttk.Spinbox(fg, textvariable=self.v_pat_stepms, from_=100, to=5000,
                    increment=50, width=7).grid(row=4, column=2, sticky="w", padx=4)

        # ── Trigger ───────────────────────────────────────────────────────
        ttk.Label(fg, text="Misca dupa (killuri):").grid(row=5, column=1, sticky="w", pady=3)
        self.v_pat_nkills = tk.StringVar(value="5")
        ttk.Spinbox(fg, textvariable=self.v_pat_nkills, from_=1, to=50,
                    width=5).grid(row=5, column=2, sticky="w", padx=4)

        ttk.Label(fg, text="SAU dupa (sec fara kill):").grid(row=6, column=1, sticky="w")
        self.v_pat_sec = tk.StringVar(value="30")
        ttk.Spinbox(fg, textvariable=self.v_pat_sec, from_=5, to=300,
                    width=5).grid(row=6, column=2, sticky="w", padx=4)

        # ── Calibrare ─────────────────────────────────────────────────────
        fc = ttk.LabelFrame(tab, text="Calibrare rapida", padding=8)
        fc.grid(row=2, column=0, sticky="ew", padx=8, pady=4)
        ttk.Label(fc, text=(
            "Secventa corecta pentru L2: stanga/dreapta = ROTIRE, nu deplasare.\n"
            "Botul face: Rotire 90° → Merge inainte → Rotire inapoi 90°\n\n"
            "Calibrare 'Rotire 90°':\n"
            "  Apasa TEST in tab Setari cu tasta LEFT/RIGHT si cronometreaza\n"
            "  cat dureaza sa te rotesti exact 90°. Pune acea valoare in ms.\n\n"
            "Calibrare 'Mers per coloana':\n"
            "  Dupa ce te-ai rotit 90°, cronometreaza cat mergi inainte (UP)\n"
            "  pana ajungi la capatul unui rand → imparte la nr. coloane → ms.\n\n"
            "Exemplu: 90°=480ms, camera 8s latime, 4 col → 8000/4=2000ms per col."
        ), justify="left", foreground="#555").pack(anchor="w")

    def _draw_grid_preview(self, cols: int, rows: int, cur_col=0, cur_row=0):
        c = self._grid_canvas; c.delete("all")
        W, H = 200, 120
        if cols <= 0 or rows <= 0: return
        cw = (W - 20) / cols; ch = (H - 20) / rows
        for r in range(rows):
            for col in range(cols):
                x0 = 10 + col * cw; y0 = 10 + r * ch
                fill = "#2a4a8a" if (r == cur_row and col == cur_col) else "#1a2a4a"
                outline = "#4488cc"
                c.create_rectangle(x0, y0, x0+cw-2, y0+ch-2,
                                   fill=fill, outline=outline)
        # Disegna traseul lawnmower
        pts = []
        go_right = True
        for r in range(rows):
            cols_range = range(cols) if go_right else range(cols-1,-1,-1)
            for col in cols_range:
                pts.append((10 + col*cw + cw/2, 10 + r*ch + ch/2))
            go_right = not go_right
        for i in range(len(pts)-1):
            c.create_line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1],
                          fill="#44cc88", width=1, arrow=tk.LAST if i < len(pts)-2 else tk.NONE)
        # Punct start
        if pts:
            c.create_oval(pts[0][0]-5, pts[0][1]-5, pts[0][0]+5, pts[0][1]+5,
                          fill="#00ff88", outline="")
            c.create_text(pts[0][0], pts[0][1], text="S", fill="#000", font=("",7,"bold"))

    def _update_grid_preview(self):
        try:
            cols = int(float(self.v_pat_cols.get()))
            rows = int(float(self.v_pat_rows.get()))
            self._draw_grid_preview(max(1,cols), max(1,rows))
        except Exception:
            pass

    # ── Tab Farm ──────────────────────────────────────────────────────────────
    def _tab_farm(self, tab):
        tab.columnconfigure(0, weight=1)

        # Rotire camera
        fc = ttk.LabelFrame(tab, text="Rotire Camera (detectie mobi in spate)", padding=8)
        fc.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fc.columnconfigure(5, weight=1)
        self.v_cam_en  = tk.BooleanVar(value=True)
        self.v_cam_int = tk.StringVar(value="10")
        self.v_cam_ms  = tk.StringVar(value="200")
        ttk.Checkbutton(fc, text="Activ", variable=self.v_cam_en).grid(
            row=0, column=0, sticky="w")
        ttk.Label(fc, text="Daca nu loveste nimic in (sec):").grid(
            row=0, column=1, padx=(10, 2))
        ttk.Spinbox(fc, textvariable=self.v_cam_int, from_=3, to=120,
                    width=5).grid(row=0, column=2)
        ttk.Label(fc, text="Tine tasta (ms):").grid(row=0, column=3, padx=(10, 2))
        ttk.Spinbox(fc, textvariable=self.v_cam_ms, from_=50, to=800,
                    width=6).grid(row=0, column=4)
        ttk.Label(fc,
                  text="ℹ Apasa automat Stânga/Dreapta alternativ pentru a roti camera.\n"
                       "   Forteaza jocul sa detecteze mobi noi in conul de vizibilitate.",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=6, sticky="w", pady=(4, 0))

        # Anti-AFK
        fa = ttk.LabelFrame(tab, text="Anti-AFK (previne deconectare)", padding=8)
        fa.grid(row=1, column=0, sticky="ew", padx=8, pady=4)
        fa.columnconfigure(3, weight=1)
        self.v_afk_en  = tk.BooleanVar(value=True)
        self.v_afk_key = tk.StringVar(value="esc")
        self.v_afk_int = tk.StringVar(value="240")
        ttk.Checkbutton(fa, text="Activ", variable=self.v_afk_en).grid(
            row=0, column=0, sticky="w")
        ttk.Label(fa, text="Tasta:").grid(row=0, column=1, padx=(12,2))
        ttk.Combobox(fa, textvariable=self.v_afk_key, values=ALL_KEYS_BLANK,
                     width=5, state="readonly").grid(row=0, column=2)
        ttk.Label(fa, text="Interval (sec):").grid(row=0, column=3, padx=(12,2))
        ttk.Spinbox(fa, textvariable=self.v_afk_int, from_=60, to=600,
                    width=6).grid(row=0, column=4)
        ttk.Label(fa, text="ℹ ESC e neutra — nu deschide meniuri in L2.",
                  foreground="#888").grid(row=1, column=0, columnspan=5,
                                          sticky="w", pady=(4,0))

        # Scheduler sesiune
        fs = ttk.LabelFrame(tab, text="Scheduler sesiune (farm / pauza)", padding=8)
        fs.grid(row=2, column=0, sticky="ew", padx=8, pady=4)
        fs.columnconfigure(3, weight=1)
        self.v_sch_en    = tk.BooleanVar(value=False)
        self.v_sch_farm  = tk.StringVar(value="60")
        self.v_sch_pause = tk.StringVar(value="10")
        ttk.Checkbutton(fs, text="Activ", variable=self.v_sch_en).grid(
            row=0, column=0, sticky="w")
        ttk.Label(fs, text="Farm (min):").grid(row=0, column=1, padx=(12,2))
        ttk.Spinbox(fs, textvariable=self.v_sch_farm, from_=5, to=480,
                    width=6).grid(row=0, column=2)
        ttk.Label(fs, text="Pauza (min):").grid(row=0, column=3, padx=(12,2))
        ttk.Spinbox(fs, textvariable=self.v_sch_pause, from_=1, to=120,
                    width=6).grid(row=0, column=4)
        ttk.Label(fs, text="ℹ In timpul pauzei macro-ul se opreste complet — "
                            "personajul sta pe loc.",
                  foreground="#888").grid(row=1, column=0, columnspan=5,
                                          sticky="w", pady=(4,0))

        # Statistici live
        fst = ttk.LabelFrame(tab, text="Statistici sesiune", padding=8)
        fst.grid(row=3, column=0, sticky="ew", padx=8, pady=4)
        self.lbl_stat_full = ttk.Label(fst,
            text="Porneste macro-ul pentru a vedea statisticile.",
            foreground="#555", font=("Consolas", 9))
        self.lbl_stat_full.pack(anchor="w")

    # ── Tab Adaptare ─────────────────────────────────────────────────────────
    def _tab_adapt(self, tab):
        tab.columnconfigure(0, weight=1)

        f1 = ttk.LabelFrame(tab, text="Moduri automate de comportament", padding=8)
        f1.grid(row=0, column=0, sticky="ew", padx=8, pady=8)
        ttk.Label(f1, text=(
            "Macro-ul schimba automat ritmul de lucru:\n\n"
            "  🟢 Normal    — ritm standard, 55% din timp\n"
            "  🔴 Burst     — atacuri rapide, 15% din timp\n"
            "  🔵 Slow      — pauze lungi, mai prudent, 15% din timp\n"
            "  🟣 Variable  — complet aleatoriu, 15% din timp\n\n"
            "Schimbarea se face la intervale aleatoare (6-25 cicluri).\n"
            "Niciun tipar nu se repeta identic — imposibil de detectat prin analiza temporala."
        ), justify="left", foreground="#444").pack(anchor="w")

        f2 = ttk.LabelFrame(tab, text="Pauze umane aleatoare", padding=8)
        f2.grid(row=1, column=0, sticky="ew", padx=8, pady=4)
        ttk.Label(f2, text=(
            "Cu o probabilitate de ~7% per ciclu (14% in mod Slow),\n"
            "macro-ul face o pauza de 0.4–4.0 secunde fara nicio actiune.\n"
            "Simuleaza comportamentul uman (distras, bea apa, priveste ecranul)."
        ), justify="left", foreground="#444").pack(anchor="w")

        f3 = ttk.LabelFrame(tab, text="Deriva timing (Drift)", padding=8)
        f3.grid(row=2, column=0, sticky="ew", padx=8, pady=4)
        ttk.Label(f3, text=(
            "Delay-urile nu sunt niciodata aceleasi:\n"
            "  • Drift sinusoidal: timing-ul oscileaza lent ±8%\n"
            "  • Oboseala simulata: pauzele cresc gradual pana la +35% dupa mult timp\n"
            "  • Zgomot gaussian: ±18ms adaugat la fiecare actiune\n"
            "  • Hold-time tasta: 80–180ms aleatoriu per apasare"
        ), justify="left", foreground="#444").pack(anchor="w")

    # ── Tab RAM ───────────────────────────────────────────────────────────────
    def _tab_ram(self, tab):
        tab.columnconfigure(0, weight=1)

        def _hex_entry(parent, var, w=10):
            e = ttk.Entry(parent, textvariable=var, width=w, font=("Consolas", 9))
            e.pack(side="left", padx=(3, 0))
            return e

        # ── Status ───────────────────────────────────────────────────────────
        fs = ttk.LabelFrame(tab, text="Status RAM", padding=8)
        fs.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fs.columnconfigure(4, weight=1)

        self.v_ram_en = tk.BooleanVar(value=False)
        ttk.Checkbutton(fs, text="Activ (necesita pymem)",
                        variable=self.v_ram_en).grid(row=0, column=0, sticky="w")

        self.lbl_ram_status = ttk.Label(fs, text="Deconectat",
                                        foreground="gray", font=("", 9, "bold"))
        self.lbl_ram_status.grid(row=0, column=1, padx=(16, 4))

        ttk.Button(fs, text="Conecteaza",
                   command=self._ram_connect).grid(row=0, column=2, padx=4)
        ttk.Button(fs, text="Refresh pozitie",
                   command=self._ram_refresh).grid(row=0, column=3, padx=4)

        self.lbl_ram_info = ttk.Label(fs, text="P(—,—)  T(—,—)  D=—",
                                      font=("Consolas", 9), foreground="#444")
        self.lbl_ram_info.grid(row=1, column=0, columnspan=5,
                               sticky="w", pady=(4, 0))

        if not PYMEM_OK:
            ttk.Label(fs,
                      text="⚠  pymem nu e instalat!  Ruleaza in terminal:  "
                           "pip install pymem",
                      foreground="#c00").grid(row=2, column=0, columnspan=5,
                                              sticky="w", pady=(4, 0))

        # ── Struct Jucator ────────────────────────────────────────────────────
        fp = ttk.LabelFrame(tab, text="Struct Jucator (Player)", padding=8)
        fp.grid(row=1, column=0, sticky="ew", padx=8, pady=4)

        self.v_pm_mode = tk.StringVar(value="ptr")
        mf = ttk.Frame(fp); mf.pack(anchor="w")
        ttk.Radiobutton(mf, text="Pointer (citeste ptr la adresa, + offset)",
                        variable=self.v_pm_mode, value="ptr").pack(side="left", padx=4)
        ttk.Radiobutton(mf, text="Direct (adresa e valoarea finala)",
                        variable=self.v_pm_mode, value="direct").pack(side="left", padx=4)

        r1 = ttk.Frame(fp); r1.pack(anchor="w", pady=(4, 0))
        ttk.Label(r1, text="Adresa (hex):").pack(side="left")
        self.v_pm_base = tk.StringVar(value="0x0")
        _hex_entry(r1, self.v_pm_base, 12)
        ttk.Label(r1, text="  X offset:").pack(side="left", padx=(10, 0))
        self.v_pm_xoff = tk.StringVar(value="0x0")
        _hex_entry(r1, self.v_pm_xoff, 8)
        ttk.Label(r1, text="  Y offset:").pack(side="left", padx=(6, 0))
        self.v_pm_yoff = tk.StringVar(value="0x0")
        _hex_entry(r1, self.v_pm_yoff, 8)

        ttk.Label(fp,
                  text="ℹ Ex Elmorlab: Adresa=0x066B974 (pointer la struct),  "
                       "X off=0x44, Y off=0x48  (calibreaza cu Cheat Engine!)",
                  foreground="#888", font=("", 8)).pack(anchor="w", pady=(3, 0))

        # ── Struct Tinta ──────────────────────────────────────────────────────
        ft = ttk.LabelFrame(tab, text="Struct Tinta (Target)", padding=8)
        ft.grid(row=2, column=0, sticky="ew", padx=8, pady=4)

        self.v_tm_mode = tk.StringVar(value="ptr")
        mft = ttk.Frame(ft); mft.pack(anchor="w")
        ttk.Radiobutton(mft, text="Pointer",
                        variable=self.v_tm_mode, value="ptr").pack(side="left", padx=4)
        ttk.Radiobutton(mft, text="Direct",
                        variable=self.v_tm_mode, value="direct").pack(side="left", padx=4)

        r2 = ttk.Frame(ft); r2.pack(anchor="w", pady=(4, 0))
        ttk.Label(r2, text="Adresa (hex):").pack(side="left")
        self.v_tm_base = tk.StringVar(value="0x0")
        _hex_entry(r2, self.v_tm_base, 12)
        ttk.Label(r2, text="  ID offset:").pack(side="left", padx=(10, 0))
        self.v_tm_idoff = tk.StringVar(value="0x0")
        _hex_entry(r2, self.v_tm_idoff, 8)

        r3 = ttk.Frame(ft); r3.pack(anchor="w", pady=(4, 0))
        ttk.Label(r3, text="X offset:    ").pack(side="left")
        self.v_tm_xoff = tk.StringVar(value="0x0")
        _hex_entry(r3, self.v_tm_xoff, 8)
        ttk.Label(r3, text="  Y offset:").pack(side="left", padx=(6, 0))
        self.v_tm_yoff = tk.StringVar(value="0x0")
        _hex_entry(r3, self.v_tm_yoff, 8)

        # ── Distanta / Skip ───────────────────────────────────────────────────
        fd = ttk.LabelFrame(tab, text="Distanta maxima & skip automat", padding=8)
        fd.grid(row=3, column=0, sticky="ew", padx=8, pady=4)
        fd.columnconfigure(4, weight=1)

        self.v_ram_range = tk.StringVar(value="1000")
        self.v_ram_skip  = tk.BooleanVar(value=True)
        ttk.Label(fd, text="Max range (unitati L2):").grid(
            row=0, column=0, sticky="w")
        ttk.Spinbox(fd, textvariable=self.v_ram_range, from_=100, to=10000,
                    increment=100, width=7).grid(row=0, column=1, padx=(4, 12))
        ttk.Checkbutton(fd, text="Skip automat ESC daca target > range",
                        variable=self.v_ram_skip).grid(row=0, column=2, sticky="w")
        ttk.Label(fd,
                  text="ℹ Daca RAM e conectat si offset-urile sunt corecte,\n"
                       "   botul calculeaza distanta REAL dupa /target si face\n"
                       "   ESC imediat daca e prea departe — fara sa astepte timeout-ul.",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=5, sticky="w", pady=(4, 0))

        # ── Scanare automata ──────────────────────────────────────────────────
        fa = ttk.LabelFrame(tab, text="Scanare automata offset-uri (value scan)",
                            padding=8)
        fa.grid(row=4, column=0, sticky="ew", padx=8, pady=4)
        fa.columnconfigure(5, weight=1)

        ttk.Label(fa, text="HP curent:").grid(row=0, column=0, sticky="w")
        self.v_scan_hp = tk.StringVar(value="")
        ttk.Entry(fa, textvariable=self.v_scan_hp, width=7).grid(
            row=0, column=1, padx=(4, 8))
        ttk.Label(fa, text="MP curent:").grid(row=0, column=2, sticky="w")
        self.v_scan_mp = tk.StringVar(value="")
        ttk.Entry(fa, textvariable=self.v_scan_mp, width=7).grid(
            row=0, column=3, padx=(4, 12))
        ttk.Button(fa, text="🔍 Scaneaza",
                   command=self._ram_scan).grid(row=0, column=4, padx=4)

        ttk.Label(fa,
                  text="ℹ Introdu HP si MP EXACT asa cum apar in bara de viata.\n"
                       "   Botul scaneaza memoria si propune adrese + offset-uri.\n"
                       "   Verifica rezultatele cu Cheat Engine inainte de a le folosi!",
                  foreground="#888", justify="left").grid(
            row=1, column=0, columnspan=6, sticky="w", pady=(4, 0))

    # ── Actiuni RAM din UI ────────────────────────────────────────────────────
    def _ram_connect(self):
        self._apply()
        ok = self.macro.ram.connect(self._log)
        self.lbl_ram_status.config(
            text=self.macro.ram.status,
            foreground="#080" if ok else "#c00")

    def _ram_refresh(self):
        if not self.macro.ram.ok:
            self._log("[RAM] Nu sunt conectat."); return
        self.macro.ram.read_all(force=True)
        info = self.macro.ram.info_str()
        self.lbl_ram_info.config(text=info)
        self._log(f"[RAM] {info}")

    def _ram_scan(self):
        if not self.macro.ram.ok:
            self._log("[RAM] Conecteaza-te la l2.exe mai intai!"); return
        try:
            hp = int(self.v_scan_hp.get())
            mp = int(self.v_scan_mp.get())
        except ValueError:
            self._log("[RAM] HP/MP trebuie sa fie numere intregi!"); return

        def _do_scan():
            result = self.macro.ram.scan_by_value(hp, mp, self._log)
            if result:
                self._log(f"[RAM] Rezultat scan: {result}")
                # Aplica automat in campuri
                def _apply_result():
                    self.v_pm_base.set(hex(result["player_base"]))
                    self.v_pm_mode.set(result["player_mode"])
                    if result["x_off"]:
                        self.v_pm_xoff.set(hex(result["x_off"]))
                    if result["y_off"]:
                        self.v_pm_yoff.set(hex(result["y_off"]))
                    self.lbl_ram_status.config(
                        text=f"Scan OK — verifica offset-urile X/Y!",
                        foreground="#a60")
                self.root.after(0, _apply_result)
            else:
                self._log("[RAM] Scan esuat — incearca cu HP/MP diferite.")

        threading.Thread(target=_do_scan, daemon=True).start()
        self._log(f"[RAM] Scanare pornita (HP={hp} MP={mp})...")

    # ── Tab Setari ────────────────────────────────────────────────────────────
    def _tab_settings(self, tab):
        tab.columnconfigure(0, weight=1)

        fw = ttk.LabelFrame(tab, text="Fereastra L2", padding=8)
        fw.grid(row=0, column=0, sticky="ew", padx=8, pady=6)
        fw.columnconfigure(0, weight=1)
        self.var_win = tk.StringVar()
        self.cb_win  = ttk.Combobox(fw, textvariable=self.var_win,
                                    width=48, state="readonly")
        self.cb_win.grid(row=0, column=0, sticky="ew")
        ttk.Button(fw, text="Refresh",
                   command=self._refresh_win).grid(row=0, column=1, padx=4)

        ft = ttk.LabelFrame(tab, text="Test tasta", padding=8)
        ft.grid(row=1, column=0, sticky="ew", padx=8, pady=4)
        self.v_tst = tk.StringVar(value="f1")
        ttk.Combobox(ft, textvariable=self.v_tst, values=ALL_KEYS,
                     width=6, state="readonly").grid(row=0, column=0)
        ttk.Button(ft, text="TEST →",
                   command=self._test, width=8).grid(row=0, column=1, padx=6)
        ttk.Label(ft, text="Tine L2 activ. Skill se aprinde → PostMessage OK!",
                  foreground="#555").grid(row=1, column=0,
                                         columnspan=2, sticky="w", pady=3)

        fi = ttk.LabelFrame(tab, text="Despre", padding=8)
        fi.grid(row=2, column=0, sticky="ew", padx=8, pady=4)
        ttk.Label(fi, text=(
            "v9.0 — Adaptive Stealth Spammer\n"
            "• PostMessage background — fara focus, fara detect vizual\n"
            "• Zero citire RAM — invizibil pentru anticheat\n"
            "• Config: macro_config.json"
        ), foreground="#555", justify="left").grid(row=0, column=0, sticky="w")

    # ── Gestionare randuri skill ───────────────────────────────────────────────
    def _add_row(self, skill: SkillDef | None = None):
        row = SkillRow(self._skill_inner, self._skill_inner, self._remove_row, skill)
        self._rows.append(row)

    def _remove_row(self, row: SkillRow):
        if row in self._rows:
            self._rows.remove(row)

    def _reset_default(self):
        for r in list(self._rows): r.frame.destroy()
        self._rows.clear()
        for s in NecroMacro(lambda _: None, lambda *_: None)._default_skills():
            self._add_row(s)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _log(self, msg: str):
        ts = time.strftime("%H:%M:%S")
        def _d():
            self.txt_log.config(state="normal")
            self.txt_log.insert("end", f"[{ts}] {msg}\n")
            self.txt_log.see("end")
            self.txt_log.config(state="disabled")
        self.root.after(0, _d)

    def _stat_update(self, kills: int, cycle: int, mode: str,
                     stats: "SessionStats | None" = None):
        clr = {"Normal":"#080","Burst":"#c00","Slow":"#00a",
               "Variable":"#a0a","OPRIT":"gray"}
        def _d():
            self.lbl_kills.config(text=f"Kills: {kills}")
            self.lbl_cycle.config(text=f"Ciclu: {cycle}")
            self.lbl_mode.config(text=f"Mod: {mode}",
                                 foreground=clr.get(mode, "#080"))
            if stats:
                self.lbl_kph.config(text=f"K/h: {stats.kills_per_hour():.0f}")
                self.lbl_up.config(text=stats.uptime_str())
                # Buff countdowns
                bc = "  ".join(b.remaining_str()
                               for b in self.macro.buffs if b.enabled and b.key)
                self.lbl_buffs.config(text=bc)
                # Statistici tab Farm
                self.lbl_stat_full.config(text=stats.summary())
            self.lbl_state.config(
                text="OPRIT" if mode == "OPRIT" else "ACTIV",
                foreground=clr.get(mode, "#080"))
        self.root.after(0, _d)

    def _refresh_win(self):
        wins = find_l2()
        labels = [f"{t}  [{hex(h)}]" for h, t in wins]
        self._hwnd_map = {f"{t}  [{hex(h)}]": h for h, t in wins}
        self.cb_win["values"] = labels
        if labels: self.cb_win.set(labels[0])
        self._log(f"Ferestre L2 gasite: {len(wins)}")

    def _get_hwnd(self) -> int:
        return self._hwnd_map.get(self.var_win.get(), 0)

    def _test(self):
        hwnd = self._get_hwnd()
        if not hwnd: self._log("[!] Selecteaza fereastra L2!"); return
        k = self.v_tst.get().strip().lower()
        self._log(f"TEST {k.upper()} via PostMessage")
        pm(hwnd, k, hold_ms=120)

    def _apply(self):
        # RAM reader
        def _parse_hex(var, default=0) -> int:
            try:
                s = var.get().strip()
                return int(s, 16) if s.startswith("0x") or s.startswith("0X") \
                    else int(s, 16) if all(c in "0123456789abcdefABCDEF" for c in s if c) \
                    else default
            except: return default
        r = self.macro.ram
        r.enabled       = self.v_ram_en.get()
        r.player_mode   = self.v_pm_mode.get()
        r.player_base   = _parse_hex(self.v_pm_base)
        r.player_x_off  = _parse_hex(self.v_pm_xoff)
        r.player_y_off  = _parse_hex(self.v_pm_yoff)
        r.target_mode   = self.v_tm_mode.get()
        r.target_base   = _parse_hex(self.v_tm_base)
        r.target_id_off = _parse_hex(self.v_tm_idoff)
        r.target_x_off  = _parse_hex(self.v_tm_xoff)
        r.target_y_off  = _parse_hex(self.v_tm_yoff)
        try:   r.max_range = int(float(self.v_ram_range.get()))
        except: r.max_range = 1000
        r.skip_enabled  = self.v_ram_skip.get()

        # Targeter lista mobi
        t = self.macro.targeter
        t.enabled   = self.v_tgt_en.get()
        t.mode      = self.v_tgt_mode.get()
        t.mob_names = [n.strip()
                       for n in self.txt_mobs.get("1.0", "end").splitlines()
                       if n.strip()]
        try:   t.cycle_s    = max(2.0, float(self.v_tgt_cycle.get()))
        except: t.cycle_s   = 4.0
        try:   t.per_mob_s  = max(5.0, float(self.v_tgt_permob.get()))
        except: t.per_mob_s = 15.0
        try:   t.approach_ms = max(0, int(float(self.v_tgt_apprms.get())))
        except: t.approach_ms = 1500
        t.approach_key = self.v_tgt_appr.get().strip().lower()

        self.macro.skills = [r.get() for r in self._rows]
        # Buff-uri
        new_buffs = []
        for bw in self._buff_rows:
            try:   intv = float(bw["int"].get())
            except: intv = 5.0
            try:   hits = max(1, int(bw["h"].get()))
            except: hits = 1
            new_buffs.append(BuffTimer(
                label        = bw["lbl"].get().strip() or "Buff",
                key          = bw["key"].get().strip().lower(),
                interval_min = intv,
                hits         = hits,
                enabled      = bw["en"].get(),
            ))
        self.macro.buffs = new_buffs
        # Potions
        for attr, pw in self._pot_widgets.items():
            pot = getattr(self.macro, attr)
            pot.enabled    = pw["en"].get()
            pot.key        = pw["key"].get().strip().lower()
            try:   pot.interval_s = float(pw["int"].get())
            except: pot.interval_s = 30.0
        # Patrol virtual
        p = self.macro.patrol
        p.enabled       = self.v_pat_en.get()
        p.key_fwd       = self.v_pk_fwd.get()
        p.key_back      = self.v_pk_back.get()
        p.key_left      = self.v_pk_left.get()
        p.key_right     = self.v_pk_right.get()
        try:   p.cols         = max(1, int(float(self.v_pat_cols.get())))
        except: p.cols        = 4
        try:   p.rows         = max(1, int(float(self.v_pat_rows.get())))
        except: p.rows        = 3
        try:   p.turn_ms      = int(float(self.v_pat_turnms.get()))
        except: p.turn_ms     = 480
        try:   p.walk_ms      = int(float(self.v_pat_walkms.get()))
        except: p.walk_ms     = 1200
        try:   p.step_ms      = int(float(self.v_pat_stepms.get()))
        except: p.step_ms     = 700
        try:   p.every_n_kills = max(1, int(float(self.v_pat_nkills.get())))
        except: p.every_n_kills = 5
        try:   p.every_n_sec  = float(self.v_pat_sec.get())
        except: p.every_n_sec = 30.0
        # Rotire camera
        self.macro.cam_enabled    = self.v_cam_en.get()
        try:   self.macro.cam_interval_s = float(self.v_cam_int.get())
        except: self.macro.cam_interval_s = 10.0
        try:   self.macro.cam_hold_ms    = int(float(self.v_cam_ms.get()))
        except: self.macro.cam_hold_ms   = 200
        # Anti-AFK
        self.macro.afk_enabled    = self.v_afk_en.get()
        self.macro.afk_key        = self.v_afk_key.get().strip().lower()
        try:   self.macro.afk_interval_s = float(self.v_afk_int.get())
        except: self.macro.afk_interval_s = 240.0
        # Scheduler
        self.macro.session_enabled = self.v_sch_en.get()
        try:   self.macro.session_farm_min  = float(self.v_sch_farm.get())
        except: self.macro.session_farm_min = 60.0
        try:   self.macro.session_pause_min = float(self.v_sch_pause.get())
        except: self.macro.session_pause_min = 10.0

    def _start(self):
        hwnd = self._get_hwnd()
        if not hwnd: self._log("[!] Selecteaza fereastra L2!"); return
        self._apply()
        if not any(s.enabled and s.key for s in self.macro.skills):
            self._log("[!] Niciun skill activ!"); return
        self.macro.start(hwnd)
        self.btn_s.config(state="disabled")
        self.btn_x.config(state="normal")
        if self.v_min.get():
            self.root.after(400, self.root.iconify)
        self._poll()

    def _stop(self):
        self.macro.stop()
        self.root.deiconify(); self.root.lift()
        self.btn_s.config(state="normal")
        self.btn_x.config(state="disabled")

    def _poll(self):
        if not self.macro.running:
            self.root.deiconify(); self.root.lift()
            self.btn_s.config(state="normal")
            self.btn_x.config(state="disabled")
        else:
            self.root.after(500, self._poll)

    # ── Salvare / Incarcare ───────────────────────────────────────────────────
    def _save(self):
        data = {
            "skills":   [r.get().to_dict() for r in self._rows],
            "buffs":    [{"en": bw["en"].get(), "lbl": bw["lbl"].get(),
                          "key": bw["key"].get(), "int": bw["int"].get(),
                          "h": bw["h"].get()}
                         for bw in self._buff_rows],
            "pots":     {attr: {"en": pw["en"].get(), "key": pw["key"].get(),
                                "int": pw["int"].get()}
                         for attr, pw in self._pot_widgets.items()},
            "patrol":   self.macro.patrol.to_dict(),
            "pat_ui": {
                "en": self.v_pat_en.get(), "fwd": self.v_pk_fwd.get(),
                "back": self.v_pk_back.get(), "left_k": self.v_pk_left.get(),
                "right_k": self.v_pk_right.get(),
                "cols": self.v_pat_cols.get(), "rows": self.v_pat_rows.get(),
                "turnms": self.v_pat_turnms.get(), "walkms": self.v_pat_walkms.get(),
                "stepms": self.v_pat_stepms.get(),
                "nkills": self.v_pat_nkills.get(), "sec": self.v_pat_sec.get(),
            },
            "cam_en":   self.v_cam_en.get(),
            "cam_int":  self.v_cam_int.get(),
            "cam_ms":   self.v_cam_ms.get(),
            "afk_en":   self.v_afk_en.get(),
            "afk_key":  self.v_afk_key.get(),
            "afk_int":  self.v_afk_int.get(),
            "sch_en":   self.v_sch_en.get(),
            "sch_farm": self.v_sch_farm.get(),
            "sch_pause":self.v_sch_pause.get(),
            "minimize": self.v_min.get(),
            "ram": {
                "en":      self.v_ram_en.get(),
                "pm_mode": self.v_pm_mode.get(),
                "pm_base": self.v_pm_base.get(),
                "pm_xoff": self.v_pm_xoff.get(),
                "pm_yoff": self.v_pm_yoff.get(),
                "tm_mode": self.v_tm_mode.get(),
                "tm_base": self.v_tm_base.get(),
                "tm_idoff":self.v_tm_idoff.get(),
                "tm_xoff": self.v_tm_xoff.get(),
                "tm_yoff": self.v_tm_yoff.get(),
                "range":   self.v_ram_range.get(),
                "skip":    self.v_ram_skip.get(),
            },
            "targeter": {
                "en":      self.v_tgt_en.get(),
                "mode":    self.v_tgt_mode.get(),
                "mobs":    [n.strip()
                            for n in self.txt_mobs.get("1.0", "end").splitlines()
                            if n.strip()],
                "cycle":   self.v_tgt_cycle.get(),
                "permob":  self.v_tgt_permob.get(),
                "apprms":  self.v_tgt_apprms.get(),
                "appr":    self.v_tgt_appr.get(),
            },
        }
        with open(CFG, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        self._log("Config salvata in macro_config.json")

    def _load(self):
        if not os.path.exists(CFG):
            self._reset_default(); return
        try:
            with open(CFG, encoding="utf-8") as f:
                d = json.load(f)
            # Skills
            for r in list(self._rows): r.frame.destroy()
            self._rows.clear()
            for sd in d.get("skills", []):
                self._add_row(SkillDef.from_dict(sd))
            if not self._rows: self._reset_default()
            # Pots
            for attr, pw in self._pot_widgets.items():
                pd = d.get("pots", {}).get(attr, {})
                if "en"  in pd: pw["en"].set(pd["en"])
                if "key" in pd: pw["key"].set(pd["key"])
                if "int" in pd: pw["int"].set(pd["int"])
            # AFK / Scheduler
            def sv(var, key):
                if key in d and hasattr(var, "set"): var.set(d[key])
            pu = d.get("pat_ui", {})
            if pu:
                sv(self.v_pat_en,    "en");  sv(self.v_pk_fwd,  "fwd")
                sv(self.v_pk_back,   "back"); sv(self.v_pk_left, "left_k")
                sv(self.v_pk_right,  "right_k")
                sv(self.v_pat_cols,  "cols"); sv(self.v_pat_rows, "rows")
                sv(self.v_pat_turnms,"turnms"); sv(self.v_pat_walkms,"walkms")
                sv(self.v_pat_stepms,"stepms")
                sv(self.v_pat_nkills,"nkills"); sv(self.v_pat_sec, "sec")
                # sv lucreaza pe d, dar pat_ui e sub-dict — aplica manual
                for k2, vv in pu.items():
                    for attr in ["v_pat_en","v_pk_fwd","v_pk_back","v_pk_left",
                                 "v_pk_right","v_pat_cols","v_pat_rows",
                                 "v_pat_movems","v_pat_stepms","v_pat_nkills","v_pat_sec"]:
                        pass  # handled above
            if "patrol" in d: self.macro.patrol.from_dict(d["patrol"])
            sv(self.v_cam_en,   "cam_en");  sv(self.v_cam_int, "cam_int")
            sv(self.v_cam_ms,   "cam_ms")
            sv(self.v_afk_en,   "afk_en");  sv(self.v_afk_key, "afk_key")
            sv(self.v_afk_int,  "afk_int")
            sv(self.v_sch_en,   "sch_en");  sv(self.v_sch_farm, "sch_farm")
            sv(self.v_sch_pause,"sch_pause"); sv(self.v_min, "minimize")
            # RAM
            rm = d.get("ram", {})
            if rm:
                if "en"       in rm: self.v_ram_en.set(rm["en"])
                if "pm_mode"  in rm: self.v_pm_mode.set(rm["pm_mode"])
                if "pm_base"  in rm: self.v_pm_base.set(rm["pm_base"])
                if "pm_xoff"  in rm: self.v_pm_xoff.set(rm["pm_xoff"])
                if "pm_yoff"  in rm: self.v_pm_yoff.set(rm["pm_yoff"])
                if "tm_mode"  in rm: self.v_tm_mode.set(rm["tm_mode"])
                if "tm_base"  in rm: self.v_tm_base.set(rm["tm_base"])
                if "tm_idoff" in rm: self.v_tm_idoff.set(rm["tm_idoff"])
                if "tm_xoff"  in rm: self.v_tm_xoff.set(rm["tm_xoff"])
                if "tm_yoff"  in rm: self.v_tm_yoff.set(rm["tm_yoff"])
                if "range"    in rm: self.v_ram_range.set(rm["range"])
                if "skip"     in rm: self.v_ram_skip.set(rm["skip"])
            # Targeter
            tg = d.get("targeter", {})
            if tg:
                if "en"     in tg: self.v_tgt_en.set(tg["en"])
                if "mode"   in tg: self.v_tgt_mode.set(tg["mode"])
                if "mobs"   in tg:
                    self.txt_mobs.delete("1.0", "end")
                    self.txt_mobs.insert("1.0", "\n".join(tg["mobs"]))
                if "cycle"  in tg: self.v_tgt_cycle.set(tg["cycle"])
                if "permob" in tg: self.v_tgt_permob.set(tg["permob"])
                if "apprms" in tg: self.v_tgt_apprms.set(tg["apprms"])
                if "appr"   in tg: self.v_tgt_appr.set(tg["appr"])
        except Exception as e:
            self._log(f"Config eroare: {e}")
            self._reset_default()

    def run(self):
        self.root.mainloop()


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    App().run()
