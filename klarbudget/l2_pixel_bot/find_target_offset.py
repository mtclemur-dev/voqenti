"""
find_target_offset.py - Gaseste offsetul SELF_TARGET_ID prin comparatie inainte/dupa target.

Ruleaza cu jocul deschis, ca Administrator.
"""
import json
import os
import sys

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offsets_cache.json")

SCAN_START = 0x100
SCAN_END   = 0x800


def wait(msg="\nApasa Enter..."):
    try:
        input(msg)
    except EOFError:
        pass


def snapshot(reader, player_ptr):
    data = {}
    for off in range(SCAN_START, SCAN_END, 4):
        v = reader._read_int(player_ptr + off)
        if v is not None:
            data[off] = v
    return data


def find_changes(before, after, cleared=None):
    hits = []
    for off, v_after in after.items():
        v_before = before.get(off, 0)
        if v_before == 0 and v_after and v_after > 1000:
            ok = True
            if cleared is not None:
                v_clear = cleared.get(off, v_after)
                if v_clear != 0:
                    ok = False
            if ok:
                hits.append((off, v_after))
    hits.sort(key=lambda x: x[0])
    return hits


def save_offset(off_hex: str):
    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            pass
    cache["SELF_TARGET_ID"] = off_hex
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)
    print(f"\n[OK] Salvat in offsets_cache.json: SELF_TARGET_ID = {off_hex}")


def main():
    print("=" * 60)
    print("  CALIBRARE TARGET ID (cand TargetID ramane 0)")
    print("=" * 60)
    print()

    try:
        from l2_memory import L2MemoryReader
    except ImportError as e:
        print(f"[EROARE] {e}")
        wait()
        sys.exit(1)

    reader = L2MemoryReader("l2.exe")
    if not reader.is_available():
        print(f"[EROARE] {reader.error_message()}")
        wait()
        sys.exit(1)

    hp, hp_max = reader.get_self_hp()
    if not hp_max or hp_max <= 0:
        print("[EROARE] HP nu se citeste. Ruleaza find_offsets.bat mai intai.")
        wait()
        sys.exit(1)

    ptr = reader._get_player_ptr()
    if not ptr:
        print("[EROARE] Player pointer negasit.")
        wait()
        sys.exit(1)

    print(f"Player Ptr = 0x{ptr:08X}")
    print(f"HP/MP OK: {hp}/{hp_max}")
    print()
    print("PAS 1: In joc, DESELECTEAZA tot (ESC sau click pe gol).")
    wait("Apasa Enter cand NU ai niciun mob selectat...")

    before = snapshot(reader, ptr)
    print(f"  Snapshot 1: {len(before)} valori citite.")

    print("\nPAS 2: In joc, TARGETEAZA un mob (F1 sau click pe monstru).")
    print("        Trebuie sa vezi bara rosie de HP la tinta!")
    wait("Apasa Enter cand AI un mob selectat...")

    after = snapshot(reader, ptr)
    hits = find_changes(before, after)

    if not hits:
        print("\n[EROARE] Niciun offset nou gasit.")
        print("  - Ai sigur un mob selectat (bara HP sus)?")
        print("  - Incearca click direct pe mob, nu doar F1")
        wait()
        sys.exit(1)

    print(f"\n  Gasite {len(hits)} offset(uri) posibile:")
    for off, val in hits[:15]:
        print(f"    0x{off:03X}  ->  TargetID = {val}")

    best_off = None
    preferred = [0x408, 0x3B8, 0x3A0, 0x400, 0x410, 0x3C0, 0x2D0, 0x4A0]
    hit_map = {off: val for off, val in hits}

    for p in preferred:
        if p in hit_map:
            best_off = p
            break
    if best_off is None:
        best_off = hits[0][0]

    print(f"\nPAS 3 (optional): Deselecteaza mobul (ESC), Enter pentru verificare.")
    wait()

    cleared = snapshot(reader, ptr)
    v_clear = cleared.get(best_off, -1)
    if v_clear == 0:
        print(f"[OK] La 0x{best_off:X} revine la 0 fara tinta - confirmat!")
    else:
        print(f"[?] La 0x{best_off:X} valoare fara tinta = {v_clear} (poate fi OK)")

    off_hex = f"0x{best_off:X}"
    print(f"\n[OK] SELF_TARGET_ID = {off_hex}  (val cu tinta: {hit_map.get(best_off)})")
    save_offset(off_hex)

    print("\nRuleaza test_ram.bat - TargetID trebuie sa se schimbe cand targetezi.")
    wait()


if __name__ == "__main__":
    main()
