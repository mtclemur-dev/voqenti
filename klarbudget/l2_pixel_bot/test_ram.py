"""Test rapid citire RAM L2 - ruleaza ca Administrator cu jocul pornit."""
import sys
import ctypes
import traceback

NAMES = ["l2.exe", "Lineage2.exe", "l2.bin", "Lineage2.bin"]


def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        return False


def wait(msg="\nApasa Enter pentru a inchide..."):
    try:
        input(msg)
    except EOFError:
        pass


def main():
    print("=== TEST RAM L2 ===\n")

    if not is_admin():
        print("[ATENTIE] NU rulezi ca Administrator!")
        print("          Citirea RAM va esua fara drepturi admin.\n")

    try:
        from l2_memory import L2MemoryReader
    except Exception as e:
        print(f"[EROARE] Nu pot importa l2_memory.py: {e}")
        traceback.print_exc()
        wait()
        sys.exit(1)

    reader = None
    for name in NAMES:
        try:
            r = L2MemoryReader(name)
            if r.is_available():
                reader = r
                print(f"[OK] Proces gasit: {name}")
                break
            print(f"  [-] {name}: {r.error_message()}")
        except Exception as e:
            print(f"  [-] {name}: exceptie - {e}")

    if not reader:
        print("\n[EROARE] Niciun proces L2 nu a fost gasit.")
        print("  1. Deschide Lineage 2 (fereastra de joc activa)")
        print("  2. Click dreapta pe test_ram.bat -> Run as administrator")
        print("  3. Verifica in Task Manager numele exact al procesului")
        wait()
        sys.exit(1)

    print(f"\n{reader.diagnose()}\n")

    hp, hp_max = reader.get_self_hp()
    if not hp_max or hp_max <= 0:
        print("[PROBLEMA] Nu citeste HP inca.")
        if not reader._cache.get("sig_hp_max"):
            print("  -> Ruleaza patch_sig.bat si introdu HP MAX + MP MAX din joc")
        else:
            print("  -> Verifica ca valorile sig_hp_max/sig_mp_max sunt corecte")
            print("  -> Ruleaza patch_sig.bat din nou cu valorile actuale")
        print()
    else:
        print("[OK] HP/MP se citesc. Offseturile de baza par corecte.\n")

    print("Targeteaza un monstru in joc.")
    print("Apasa Ctrl+C cand ai terminat.\n")

    import time
    try:
        while True:
            hp, hp_max = reader.get_self_hp()
            mp, mp_max = reader.get_self_mp()
            tid = reader.get_target_id()
            thp = reader.get_target_hp()
            tx, ty = reader.get_target_position()
            x, y, _ = reader.get_self_position()

            ok = hp_max and hp_max > 0
            status = "OK" if ok else "OFFSET GRESIT"
            print(
                f"\r[{status}] HP={hp}/{hp_max}  MP={mp}/{mp_max}  "
                f"TargetID={tid}  TargetHP={thp}  "
                f"Pos=({x},{y})  Target@({tx},{ty})   ",
                end="", flush=True
            )
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n\nTest oprit de utilizator.")
    except Exception as e:
        print(f"\n[EROARE] in bucla de citire: {e}")
        traceback.print_exc()

    wait()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[EROARE CRITICA] {e}")
        traceback.print_exc()
        wait()
        sys.exit(1)
