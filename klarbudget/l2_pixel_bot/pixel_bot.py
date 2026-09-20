"""
pixel_bot.py - L2 Pixel Farm Bot pentru Elmorlab x3 Interlude
Versiunea 2.0 - Masina de stari + detectie fereastra + scanare zona

Stari:
  PAUZAT     -> Bot oprit, nu face nimic
  CAUTARE    -> Cauta o tinta (apasa target_next)
  LUPTA      -> Are tinta, ataca / foloseste skill-uri
  LOOT       -> Monstrul a murit, culege drop-ul
  HP_CRITIC  -> HP propriu este sub limita, foloseste potiune
"""

import time
import os
import sys
import json
import ctypes
import threading
from datetime import datetime, timedelta
from enum import Enum

# ---------------------------------------------------------------------------
# Verificare drepturi de Administrator (necesare pentru biblioteca keyboard)
# ---------------------------------------------------------------------------
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False

if not is_admin():
    print("=" * 62)
    print("  ATENTIE: Botul trebuie rulat ca ADMINISTRATOR!")
    print("  Altfel biblioteca 'keyboard' nu poate citi apasarile de taste.")
    print("  Inchide consola si deschide ruleaza_bot.bat ca Administrator.")
    print("=" * 62)
    print()
    input("Apasati Enter pentru a continua oricum (unele functii pot esua)...")
    print()

# ---------------------------------------------------------------------------
# Importuri
# ---------------------------------------------------------------------------
try:
    import mss
    import numpy as np
    import keyboard
    import win32gui
    from input_sender import create_sender
except ImportError as e:
    print(f"[EROARE] Lipsa biblioteca: {e}")
    print("Rulati: pip install mss numpy keyboard pywin32")
    input("Enter pentru a inchide...")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Constante si stari
# ---------------------------------------------------------------------------
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

class State(Enum):
    PAUZAT    = "PAUZAT"
    CAUTARE   = "Cautare tinta"
    LUPTA     = "In lupta"
    LOOT      = "Culegere drop"
    HP_CRITIC = "HP CRITIC!"

# ---------------------------------------------------------------------------
# Incarcarea configuratiei
# ---------------------------------------------------------------------------
def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f"[EROARE] Fisierul config.json nu exista in: {os.path.dirname(CONFIG_FILE)}")
        input("Enter pentru a inchide...")
        sys.exit(1)
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            print(f"[EROARE] config.json are erori de sintaxa: {e}")
            print("Verificati ca fisierul este un JSON valid (fara comentarii).")
            input("Enter pentru a inchide...")
            sys.exit(1)

# ---------------------------------------------------------------------------
# Detectie fereastra L2
# ---------------------------------------------------------------------------
def find_l2_hwnd(window_title):
    found = []
    def cb(hwnd, _):
        title = win32gui.GetWindowText(hwnd)
        if window_title.lower() in title.lower() and win32gui.IsWindowVisible(hwnd):
            found.append(hwnd)
    win32gui.EnumWindows(cb, None)
    return found[0] if found else None

# ---------------------------------------------------------------------------
# Captura rapida de ecran cu MSS + Numpy
# ---------------------------------------------------------------------------
_sct = None

def get_sct():
    global _sct
    if _sct is None:
        _sct = mss.mss()
    return _sct

def scan_area(x, y, width, height, target_rgb, tolerance):
    """
    Scaneaza o zona dreptunghiulara si returneaza numarul de pixeli
    care se potrivesc cu target_rgb in limita tolerantei.
    """
    try:
        sct = get_sct()
        monitor = {"top": int(y), "left": int(x), "width": int(width), "height": int(height)}
        img = sct.grab(monitor)
        frame = np.frombuffer(img.raw, dtype=np.uint8).reshape((img.height, img.width, 4))
        # mss: format BGRA
        r_ch = frame[:, :, 2].astype(np.int16)
        g_ch = frame[:, :, 1].astype(np.int16)
        b_ch = frame[:, :, 0].astype(np.int16)
        tr, tg, tb = target_rgb
        mask = (
            (np.abs(r_ch - tr) <= tolerance) &
            (np.abs(g_ch - tg) <= tolerance) &
            (np.abs(b_ch - tb) <= tolerance)
        )
        return int(np.sum(mask))
    except Exception as e:
        return 0

def get_pixel(x, y):
    """Returneaza culoarea RGB a unui singur pixel."""
    try:
        sct = get_sct()
        monitor = {"top": int(y), "left": int(x), "width": 1, "height": 1}
        img = sct.grab(monitor)
        frame = np.frombuffer(img.raw, dtype=np.uint8).reshape((1, 1, 4))
        r = int(frame[0, 0, 2])
        g = int(frame[0, 0, 1])
        b = int(frame[0, 0, 0])
        return (r, g, b)
    except Exception:
        return (0, 0, 0)

# ---------------------------------------------------------------------------
# Afisare consola
# ---------------------------------------------------------------------------
LOG_LINES = []
MAX_LOG = 12

def add_log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    LOG_LINES.append(f"  [{ts}] {msg}")
    if len(LOG_LINES) > MAX_LOG:
        LOG_LINES.pop(0)

def render_console(state, stats, hwnd):
    os.system('cls')
    uptime = str(timedelta(seconds=int(time.time() - stats['start_time']))).split('.')[0]
    kph = stats['kills'] / max((time.time() - stats['start_time']) / 3600, 0.001)

    print("=" * 62)
    print("     L2 PIXEL FARM BOT v2.0 - Elmorlab x3 Interlude")
    print("=" * 62)
    print(f"  Status:    [{state.value:^20s}]")
    print(f"  L2 HWND:   {hwnd if hwnd else 'FEREASTRA NEGASITA!'}")
    print(f"  Runtime:   {uptime}   |   Kills: {stats['kills']}   |   ~{kph:.0f} kill/h")
    print("-" * 62)
    print("  [HOME]  Pornire / Pauza      [END] Oprire completa")
    print("-" * 62)
    print("  Jurnal:")
    for line in LOG_LINES:
        print(line)
    # Pad la MAX_LOG linii ca sa nu sclipeasca ecranul
    for _ in range(MAX_LOG - len(LOG_LINES)):
        print()
    print("=" * 62)

# ---------------------------------------------------------------------------
# Logica principala
# ---------------------------------------------------------------------------
def main():
    cfg = load_config()
    window_title = cfg.get("window_title", "Lineage II")
    keys         = cfg.get("keys", {})
    timings      = cfg.get("timings", {})
    ps           = cfg.get("pixel_settings", {})
    combat_cfg   = cfg.get("combat", {})
    safety_cfg   = cfg.get("safety", {})

    # Timing helpers
    def ms(key, default): return timings.get(key, default) / 1000.0

    loop_delay       = ms("loop_delay_ms", 80)
    attack_delay     = ms("attack_delay_ms", 600)
    skill_delay      = ms("skill_delay_ms", 400)
    target_delay     = ms("target_search_delay_ms", 900)
    loot_count       = timings.get("loot_count", 4)
    loot_delay       = ms("loot_delay_ms", 350)
    death_wait       = ms("mob_death_wait_ms", 800)
    hp_pot_cooldown  = ms("hp_potion_cooldown_ms", 5000)

    # Bara target HP
    thp          = ps.get("target_hp_bar", {})
    thp_sx       = thp.get("scan_x", 330)
    thp_sy       = thp.get("scan_y", 32)
    thp_sw       = thp.get("scan_width", 300)
    thp_sh       = thp.get("scan_height", 6)
    thp_rgb      = thp.get("color_rgb", [190, 20, 20])
    thp_tol      = thp.get("tolerance", 50)
    thp_min_px   = thp.get("min_matching_pixels", 5)

    # HP / MP propriu
    self_hp_cfg  = ps.get("self_hp", {})
    self_mp_cfg  = ps.get("self_mp", {})

    # Combat mode
    combat_mode     = combat_cfg.get("mode", "basic")
    skill_rotation  = combat_cfg.get("rotation", [keys.get("attack", "f2")])
    use_spoil       = combat_cfg.get("use_spoil", False)
    use_sweep       = combat_cfg.get("use_sweep", False)

    # Safety keys
    pause_key   = safety_cfg.get("pause_key", "home")
    stop_key    = safety_cfg.get("stop_key", "end")
    emerg_key   = safety_cfg.get("emergency_stop_key", "f12")

    # Detectie fereastra
    hwnd = find_l2_hwnd(window_title)
    sender = create_sender(cfg, hwnd)

    state = State.PAUZAT
    stats = {
        'start_time': time.time(),
        'kills': 0,
    }

    rotation_idx     = 0
    last_hp_pot_time = 0
    hp_pot_cd        = hp_pot_cooldown
    last_render_time = 0
    render_interval  = 0.5  # Redesenare consola la 2 FPS (evita flickering)

    add_log("Bot pornit. Apasa [HOME] ca sa incepi farm-ul.")
    render_console(state, stats, hwnd)

    # -----------------------------------------------------------------------
    # Bucla principala
    # -----------------------------------------------------------------------
    while True:

        # --- Verificare hotkeys ---
        if keyboard.is_pressed(emerg_key) or keyboard.is_pressed(stop_key):
            add_log("STOP - Bot oprit de utilizator.")
            state = State.PAUZAT
            render_console(state, stats, hwnd)
            break

        if keyboard.is_pressed(pause_key):
            if state == State.PAUZAT:
                # Re-detectam fereastra (poate L2 a fost deschis dupa start)
                hwnd = find_l2_hwnd(window_title)
                sender = create_sender(cfg, hwnd)
                if hwnd:
                    state = State.CAUTARE
                    add_log(f"Bot PORNIT! Fereastra L2 gasita (HWND={hwnd}).")
                else:
                    add_log(f"EROARE: Fereastra '{window_title}' nu a fost gasita!")
                    add_log("Deschide jocul si apasa HOME din nou.")
            else:
                state = State.PAUZAT
                add_log("Bot PAUZAT. Apasa HOME ca sa reia.")
            time.sleep(0.5)

        # --- Redesenare consola ---
        now = time.time()
        if now - last_render_time > render_interval:
            render_console(state, stats, hwnd)
            last_render_time = now

        # --- PAUZAT: nu face nimic ---
        if state == State.PAUZAT:
            time.sleep(0.15)
            continue

        # --- Verificare fereastra L2 inca rulaza ---
        if not hwnd or not win32gui.IsWindow(hwnd):
            hwnd = find_l2_hwnd(window_title)
            if not hwnd:
                add_log("Fereastra L2 s-a inchis! Pauzat.")
                state = State.PAUZAT
                continue
            sender = create_sender(cfg, hwnd)

        # --- Verificare HP propriu (Auto-Potion) ---
        if self_hp_cfg.get("enabled", False) and sender:
            hp_x   = self_hp_cfg.get("x", 170)
            hp_y   = self_hp_cfg.get("y", 46)
            hp_rgb = self_hp_cfg.get("color_rgb", [190, 20, 20])
            hp_tol = self_hp_cfg.get("tolerance", 50)
            cur    = get_pixel(hp_x, hp_y)
            # Daca pixelul nu mai e rosu = HP a scazut sub acel punct
            if not all(abs(a - b) <= hp_tol for a, b in zip(cur, hp_rgb)):
                if now - last_hp_pot_time > hp_pot_cd:
                    add_log(f"HP SCAZUT! Folosesc potiune HP.")
                    sender.press_key(keys.get("potion_hp", "f6"))
                    last_hp_pot_time = now
                    state = State.HP_CRITIC
                    time.sleep(0.3)
                    continue

        if state == State.HP_CRITIC:
            # Revenim la cautare dupa ce HP s-a stabilizat
            state = State.CAUTARE

        # --- Detectie bara HP tinta ---
        matching = scan_area(thp_sx, thp_sy, thp_sw, thp_sh, thp_rgb, thp_tol)
        has_target = matching >= thp_min_px

        # =======================================================================
        # MASINA DE STARI
        # =======================================================================

        # --- CAUTARE TINTA ---
        if state == State.CAUTARE:
            if has_target:
                add_log(f"Tinta detectata! ({matching} pixeli rosii). Incep lupta.")
                state = State.LUPTA
            else:
                if sender:
                    sender.press_key(keys.get("target_next", "f1"))
                time.sleep(target_delay)

        # --- IN LUPTA ---
        elif state == State.LUPTA:
            if not has_target:
                # Monstrul a murit
                stats['kills'] += 1
                add_log(f"Kill #{stats['kills']}! Culeg drop-ul...")
                state = State.LOOT
                time.sleep(death_wait)  # Asteptam animatia de moarte

            else:
                if sender:
                    if combat_mode == "rotation" and skill_rotation:
                        key = skill_rotation[rotation_idx % len(skill_rotation)]
                        rotation_idx += 1
                        sender.press_key(key)
                        time.sleep(skill_delay)
                    else:
                        # Mod basic: atac simplu
                        sender.press_key(keys.get("attack", "f2"))
                        time.sleep(attack_delay)

        # --- LOOT ---
        elif state == State.LOOT:
            if sender:
                # Sweep (daca e activat si avem spoil)
                if use_sweep:
                    sender.press_key(keys.get("sweep", "f8"))
                    time.sleep(loot_delay)
                # Pick up drop normal
                for i in range(loot_count):
                    sender.press_key(keys.get("pick_up", "f5"))
                    time.sleep(loot_delay)
            state = State.CAUTARE

        time.sleep(loop_delay)

    # Curatare la inchidere
    if sender:
        sender.close()
    print()
    print("Bot inchis. La revedere!")
    input("Apasati Enter pentru a inchide fereastra...")

if __name__ == "__main__":
    main()
