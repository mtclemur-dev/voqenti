"""
calibrate_zone.py - MOD SIMPLU: un singur buton pentru zona de patrula.

  [C]  Salveaza CENTRUL (stai in mijlocul farm-ului) + raza automata
  [+]  Raza mai mare (+300)
  [-]  Raza mai mica (-300)
  [R]  Inregistrare AUTO: mergi pe conturul zonei, apoi [S]
  [S]  SALVEAZA in config.json
  [Q]  Iesire
"""
import json
import os
import time

CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

try:
    import keyboard
except ImportError:
    print("pip install keyboard")
    input("Enter...")
    raise SystemExit(1)


def load_config():
    if os.path.exists(CONFIG):
        with open(CONFIG, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_config(cfg):
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def get_position():
    try:
        from l2_memory import L2MemoryReader
        r = L2MemoryReader("l2.exe")
        if not r.is_available():
            r = L2MemoryReader("Lineage2.exe")
        if not r.is_available():
            return None, None, "RAM neconectat - porneste L2 ca Admin"
        x, y, _ = r.get_self_position()
        if x is None or y is None:
            return None, None, "Pozitia nu se citeste - ruleaza patch_sig.bat"
        return float(x), float(y), None
    except Exception as e:
        return None, None, str(e)


def bounds_from_center(cx, cy, radius):
    return (cx - radius, cx + radius, cy - radius, cy + radius)


def bounds_from_points(points, min_pad=400):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    # Daca ai mers putin sau RAM da aceeasi pozitie, marim automat
    if x_max - x_min < 80:
        cx = (x_min + x_max) / 2
        x_min, x_max = cx - min_pad, cx + min_pad
    if y_max - y_min < 80:
        cy = (y_min + y_max) / 2
        y_min, y_max = cy - min_pad, cy + min_pad
    return x_min, x_max, y_min, y_max


def make_patrol_waypoints(x_min, x_max, y_min, y_max, cols=3, rows=3):
    """Grid simplu zig-zag in zona."""
    cols = max(2, cols)
    rows = max(2, rows)
    pts = []
    for row in range(rows):
        cols_r = range(cols) if row % 2 == 0 else range(cols - 1, -1, -1)
        for col in cols_r:
            fx = col / (cols - 1)
            fy = row / (rows - 1)
            x = x_min + (x_max - x_min) * fx
            y = y_min + (y_max - y_min) * fy
            pts.append({"x": round(x, 1), "y": round(y, 1)})
    return pts


def save_zone(x_min, x_max, y_min, y_max, mode="center", center=None, radius=None):
    cfg = load_config()
    zone = cfg.setdefault("farm_zone", {})
    zone["enabled"] = True
    zone["mode"] = mode
    zone["x_min"] = round(x_min, 1)
    zone["x_max"] = round(x_max, 1)
    zone["y_min"] = round(y_min, 1)
    zone["y_max"] = round(y_max, 1)
    zone["arrival_distance"] = 200
    zone["target_checks_per_point"] = 3
    zone["grid_cols"] = 3
    zone["grid_rows"] = 3
    if center:
        zone["center_x"] = round(center[0], 1)
        zone["center_y"] = round(center[1], 1)
    if radius:
        zone["radius"] = int(radius)
    zone["waypoints"] = make_patrol_waypoints(x_min, x_max, y_min, y_max, 3, 3)
    save_config(cfg)
    return zone


def main():
    print("=" * 62)
    print("   ZONA FARM - MOD SIMPLU")
    print("=" * 62)
    print()
    print("  VARIANTA 1 (RECOMANDAT):")
    print("    1. Stai in MIJLOCUL locului unde farmezi")
    print("    2. Apasa [C]  -> salveaza centrul")
    print("    3. Apasa [+] sau [-] daca vrei zona mai mare/mica")
    print("    4. Apasa [S]  -> salveaza")
    print()
    print("  VARIANTA 2 (mergi pe contur):")
    print("    1. Apasa [R]  -> incepe inregistrarea")
    print("    2. Mergi pe marginea zonei (1-2 minute)")
    print("    3. Apasa [S]  -> salveaza automat perimetrul")
    print()
    print("  [C] centru   [+]/[-] raza   [R] record   [S] salveaza   [Q] iesire")
    print()

    center = None
    radius = 800
    recorded = []
    recording = False
    last_key = 0.0

    def debounce():
        nonlocal last_key
        now = time.time()
        if now - last_key < 0.45:
            return False
        last_key = now
        return True

    while True:
        x, y, err = get_position()
        pos_s = f"({x:.0f}, {y:.0f})" if x is not None else f"EROARE: {err}"
        rec_s = f" | INREGISTRARE {len(recorded)} puncte" if recording else ""
        print(f"\r  Pozitie: {pos_s}  |  Raza: {radius}{rec_s}   ", end="", flush=True)

        if recording and x is not None:
            if not recorded or (abs(x - recorded[-1][0]) > 15 or abs(y - recorded[-1][1]) > 15):
                recorded.append((x, y))

        if keyboard.is_pressed("q"):
            print("\n\nIesire.")
            break

        if keyboard.is_pressed("c") and debounce():
            x, y, err = get_position()
            if x is None:
                print(f"\n[!] {err}")
            else:
                center = (x, y)
                print(f"\n[OK] Centru salvat: ({x:.0f}, {y:.0f})  Raza: {radius}")
            time.sleep(0.2)

        if keyboard.is_pressed("+") or keyboard.is_pressed("="):
            if debounce():
                radius = min(5000, radius + 300)
                print(f"\n[OK] Raza: {radius}")
                time.sleep(0.2)

        if keyboard.is_pressed("-"):
            if debounce():
                radius = max(300, radius - 300)
                print(f"\n[OK] Raza: {radius}")
                time.sleep(0.2)

        if keyboard.is_pressed("r") and debounce():
            recording = not recording
            if recording:
                recorded = []
                print("\n[REC] Inregistrare PORNITA - mergi pe conturul zonei...")
            else:
                print(f"\n[REC] Oprit. {len(recorded)} puncte inregistrate.")
            time.sleep(0.2)

        if keyboard.is_pressed("s") and debounce():
            # Mod inregistrare perimetru
            if len(recorded) >= 2:
                x_min, x_max, y_min, y_max = bounds_from_points(recorded)
                zone = save_zone(x_min, x_max, y_min, y_max, mode="record")
                print(f"\n{'='*62}")
                print("  SALVAT (perimetru inregistrat)!")
                print(f"  X: {zone['x_min']} .. {zone['x_max']}")
                print(f"  Y: {zone['y_min']} .. {zone['y_max']}")
                print(f"  Puncte patrula: {len(zone['waypoints'])}")
                print(f"{'='*62}")
                recording = False
                recorded = []
                time.sleep(0.5)
                continue

            # Mod centru + raza
            if center is None:
                x, y, err = get_position()
                if x is None:
                    print(f"\n[!] {err}")
                    time.sleep(0.3)
                    continue
                center = (x, y)
                print(f"\n[!] Centru luat automat: ({x:.0f}, {y:.0f})")

            x_min, x_max, y_min, y_max = bounds_from_center(center[0], center[1], radius)
            zone = save_zone(x_min, x_max, y_min, y_max, mode="center",
                              center=center, radius=radius)
            print(f"\n{'='*62}")
            print("  SALVAT (centru + raza)!")
            print(f"  Centru: ({center[0]:.0f}, {center[1]:.0f})  Raza: {radius}")
            print(f"  X: {zone['x_min']} .. {zone['x_max']}")
            print(f"  Y: {zone['y_min']} .. {zone['y_max']}")
            print(f"  Puncte patrula: {len(zone['waypoints'])}")
            print("  Acum porneste botul!")
            print(f"{'='*62}")
            time.sleep(0.5)

        time.sleep(0.1)


if __name__ == "__main__":
    main()
