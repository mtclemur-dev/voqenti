"""
test_click.py - Test rapid miscare L2 (mouse fizic).
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CONFIG = os.path.join(os.path.dirname(__file__), "config.json")


def _ensure_mouse(cfg):
    hunting = cfg.setdefault("hunting", {})
    if hunting.get("movement_method") != "mouse":
        hunting["movement_method"] = "mouse"
        with open(CONFIG, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        print("Am setat automat movement_method = mouse in config.json")
        return True
    return False


def main():
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)

    _ensure_mouse(cfg)

    import win32gui
    titles = cfg.get("window_titles", [cfg.get("window_title", "Lineage II")])
    found = []

    def cb(hwnd, _):
        if win32gui.IsWindowVisible(hwnd):
            t = win32gui.GetWindowText(hwnd)
            for title in titles:
                if title.lower() in t.lower():
                    found.append((hwnd, t))

    win32gui.EnumWindows(cb, None)
    if not found:
        print("EROARE: Fereastra L2 negasita!")
        print("Titluri cautate:", titles)
        input("Enter...")
        return

    hwnd, title = found[0]
    print(f"Gasit: '{title}' HWND={hwnd}")
    print("Metoda: mouse (click fizic pe teren)")
    print("L2 va primi focus. Personajul TREBUIE sa mearga in 10 secunde...")

    from movement import MovementController
    mover = MovementController(hwnd, cfg)

    active = lambda: True
    mover.walk_segment(active, 8.0)

    print("Gata. Personajul s-a miscat?")
    input("Enter...")


if __name__ == "__main__":
    main()
