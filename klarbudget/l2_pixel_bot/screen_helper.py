"""
screen_helper.py - Utilitar de calibrare L2 Pixel Bot
Arata in timp real coordonatele mouse-ului si culoarea RGB de sub cursor.
Apasa C ca sa inregistrezi un punct, se salveaza automat in config.json
"""

import time
import json
import os
import sys

try:
    import mss
    import numpy as np
    from PIL import ImageGrab
    import pyautogui
    import keyboard
    import win32gui
except ImportError as e:
    print(f"Lipsa biblioteca: {e}")
    print("Rulati: pip install mss numpy pillow pyautogui keyboard pywin32")
    input("Apasati Enter pentru a inchide...")
    sys.exit(1)

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
WINDOW_TITLE = "Lineage II"

CALIBRATION_POINTS = {
    "1": ("target_hp_bar", "Centrul barei de HP a MONSTRULUI (cand ai un monstru targetat)"),
    "2": ("self_hp",       "Capatul drept al barei proprii de HP (cand HP-ul este PLIN)"),
    "3": ("self_mp",       "Capatul drept al barei proprii de MP (cand MP-ul este PLIN)"),
}


def find_l2_window():
    hwnd_list = []
    def enum_cb(hwnd, _):
        title = win32gui.GetWindowText(hwnd)
        if WINDOW_TITLE.lower() in title.lower() and win32gui.IsWindowVisible(hwnd):
            hwnd_list.append((hwnd, title))
    win32gui.EnumWindows(enum_cb, None)
    return hwnd_list


def get_pixel_at(x, y):
    try:
        bbox = (x, y, x + 1, y + 1)
        im = ImageGrab.grab(bbox=bbox)
        px = im.getpixel((0, 0))
        return px[:3]  # RGB fara alfa
    except Exception:
        return (0, 0, 0)


def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
        # Stergem comentariile JSON (linii cu _comment) pentru parsare
        lines = [l for l in content.splitlines() if not l.strip().startswith('"_')]
        try:
            return json.loads('\n'.join(lines))
        except json.JSONDecodeError:
            # Incercam parsare directa (unele editoare salveaza fara comentarii)
            try:
                return json.loads(content)
            except Exception:
                return {}
    return {}


def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def scan_area_for_color(x, y, width, height, target_rgb, tolerance=50):
    """Scaneaza o zona si numara pixelii care se potrivesc cu culoarea tinta."""
    try:
        with mss.mss() as sct:
            monitor = {"top": y, "left": x, "width": width, "height": height}
            img = sct.grab(monitor)
            frame = np.array(img)
            # mss returneaza BGRA - convertim la RGB
            r = frame[:, :, 2].astype(int)
            g = frame[:, :, 1].astype(int)
            b = frame[:, :, 0].astype(int)
            tr, tg, tb = target_rgb
            mask = (
                (np.abs(r - tr) <= tolerance) &
                (np.abs(g - tg) <= tolerance) &
                (np.abs(b - tb) <= tolerance)
            )
            return int(np.sum(mask))
    except Exception as e:
        return 0


def main():
    os.system('cls')
    print("=" * 65)
    print("   L2 PIXEL BOT - Utilitar de Calibrare Coordonate")
    print("=" * 65)

    # Detectare fereastra L2
    l2_windows = find_l2_window()
    if l2_windows:
        print(f"\n  [OK] Fereastra L2 gasita: \"{l2_windows[0][1]}\" (HWND={l2_windows[0][0]})")
    else:
        print("\n  [!] Fereastra Lineage II nu a fost detectata!")
        print("      Deschideti jocul in modul Windowed si reveniti.")

    print()
    print("  Cum functioneaza:")
    print("  1. Mutati mouse-ul pe bara de HP a monstrului (cand aveti tinta).")
    print("  2. Apasati [C] ca sa inregistrati punctul.")
    print("  3. Selectati ce tip de bara ati calibrat.")
    print("  4. Repetati pentru HP propriu si MP propriu.")
    print()
    print("  [C]     - Inregistreaza coordonate + culoare sub cursor")
    print("  [T]     - Testeaza daca bara de HP a tintei este detectata acum")
    print("  [Q/ESC] - Iesire")
    print("=" * 65)
    print()

    cfg = load_config()
    last_print_time = 0
    cooldown = 0.4

    while True:
        # Iesire
        if keyboard.is_pressed('q') or keyboard.is_pressed('esc'):
            print("\n[Calibrare] Inchidere. Config salvat in config.json.")
            break

        # Afisare coordonate live
        now = time.time()
        if now - last_print_time > 0.1:
            x, y = pyautogui.position()
            r, g, b = get_pixel_at(x, y)
            # Suprascriem aceeasi linie pentru a evita scroll
            print(f"  Cursor: x={x:4d}, y={y:4d}  |  RGB: ({r:3d},{g:3d},{b:3d})  Hex: #{r:02x}{g:02x}{b:02x}    ",
                  end='\r', flush=True)
            last_print_time = now

        # Inregistrare punct
        if keyboard.is_pressed('c'):
            if now - cooldown > 0:
                x, y = pyautogui.position()
                r, g, b = get_pixel_at(x, y)
                cooldown = now + 0.5

                print()
                print()
                print(f"  === Punct inregistrat: x={x}, y={y}  RGB=({r},{g},{b}) ===")
                print()
                print("  Ce ati calibrat?")
                for k, (key, desc) in CALIBRATION_POINTS.items():
                    print(f"    [{k}] {desc}")
                print("    [0] Nimic (anulati)")
                print()

                choice = input("  Alegeti: ").strip()

                if choice in CALIBRATION_POINTS:
                    section_key, desc = CALIBRATION_POINTS[choice]
                    ps = cfg.setdefault("pixel_settings", {})
                    section = ps.setdefault(section_key, {})

                    if section_key == "target_hp_bar":
                        # Calculam zona de scanat centrata pe cursor
                        scan_w, scan_h = 300, 8
                        section["scan_x"]     = max(0, x - scan_w // 2)
                        section["scan_y"]     = max(0, y - scan_h // 2)
                        section["scan_width"] = scan_w
                        section["scan_height"]= scan_h
                        section["color_rgb"]  = [r, g, b]
                        section["tolerance"]  = 50
                        section["min_matching_pixels"] = 5
                        print(f"  [Salvat] Zona de scanat tinta: x={section['scan_x']}, y={section['scan_y']}, "
                              f"w={scan_w}, h={scan_h}")
                    else:
                        section["x"]          = x
                        section["y"]          = y
                        section["color_rgb"]  = [r, g, b]
                        section["tolerance"]  = 50
                        section.setdefault("enabled", False)
                        print(f"  [Salvat] Coordonate {desc}: x={x}, y={y}, RGB=({r},{g},{b})")

                    save_config(cfg)
                    print(f"  [OK] config.json actualizat!")
                elif choice == "0":
                    print("  [Anulat]")
                else:
                    print("  [!] Optiune invalida, nimic salvat.")

                print()
                time.sleep(0.5)

        # Test detectie tinta
        if keyboard.is_pressed('t'):
            ps = cfg.get("pixel_settings", {})
            thp = ps.get("target_hp_bar", {})
            if not thp:
                print("\n  [!] Bara de HP tinta nu este calibrata! Apasati C mai intai.")
            else:
                sx = thp.get("scan_x", 0)
                sy = thp.get("scan_y", 0)
                sw = thp.get("scan_width", 300)
                sh = thp.get("scan_height", 6)
                trgb = thp.get("color_rgb", [190, 20, 20])
                tol  = thp.get("tolerance", 50)
                min_px = thp.get("min_matching_pixels", 5)
                count = scan_area_for_color(sx, sy, sw, sh, trgb, tol)
                print()
                if count >= min_px:
                    print(f"  [TEST] TINTA DETECTATA! Pixeli rosii gasite: {count} >= {min_px}  ✓")
                else:
                    print(f"  [TEST] Tinta NU detectata. Pixeli: {count} < {min_px}")
                    print("         Mariti 'tolerance' sau 'min_matching_pixels' in config.json.")
                print()
            time.sleep(0.5)

        time.sleep(0.01)

    print()
    input("Apasati Enter pentru a inchide...")


if __name__ == "__main__":
    main()
