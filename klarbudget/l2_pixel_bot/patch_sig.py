"""Adauga semnatura HP_MAX/MP_MAX in offsets_cache.json (fara recalibrare completa)."""
import json
import os
import sys

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offsets_cache.json")


def main():
    print("=== PATCH SEMNATURA RAM ===\n")
    print("Introdu HP MAXIM si MP MAXIM din joc (valorile de la /status).\n")

    if not os.path.exists(CACHE):
        print(f"Lipseste {CACHE} - ruleaza mai intai find_offsets.bat")
        input("Enter...")
        sys.exit(1)

    with open(CACHE, "r", encoding="utf-8") as f:
        cache = json.load(f)

    try:
        hp_max = int(input("HP maxim: ").strip())
        mp_max = int(input("MP maxim: ").strip())
    except ValueError:
        print("Introdu numere valide.")
        input("Enter...")
        sys.exit(1)

    cache["sig_hp_max"] = hp_max
    cache["sig_mp_max"] = mp_max
    cache["use_dynamic_ptr"] = True

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)

    print(f"\nSalvat! sig_hp_max={hp_max}, sig_mp_max={mp_max}")
    print("Ruleaza test_ram.bat")
    input("\nEnter...")


if __name__ == "__main__":
    main()
