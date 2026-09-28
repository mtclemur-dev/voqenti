"""
offset_finder.py — AOB Scanner pentru Lineage 2 Interlude / Elmorlab
======================================================================
Gaseste automat offset-urile de memorie fara sa depinzi de adrese fixe.

Metode implementate:
  1. Cautare prin NUMELE PERSONAJULUI (UTF-16-LE) — cel mai fiabil
  2. AOB Pattern scan pentru instructiunile de acces HP
  3. Pointer scan pentru a gasi adresa verde (stabila) din Cheat Engine
  4. Snapshot + diff pentru Target ID
  5. Salvare automata in offsets_cache.json

Rulare: python offset_finder.py
"""

import sys, os, struct, time, json, re, ctypes
from collections import defaultdict

try:
    import pymem, pymem.process, pymem.memory, pymem.pattern
except ImportError:
    print("[!] Lipseste pymem. Instaleaza cu:  pip install pymem")
    input("\nApasa Enter...")
    sys.exit(1)

# ─── Culori consola ───────────────────────────────────────────────────────────
class C:
    R="\033[91m"; G="\033[92m"; Y="\033[93m"; B="\033[94m"; M="\033[95m"
    CY="\033[96m"; W="\033[97m"; DIM="\033[2m"; RST="\033[0m"; BOLD="\033[1m"

def ok(s):  print(f"{C.G}[OK]{C.RST} {s}")
def err(s): print(f"{C.R}[!!]{C.RST} {s}")
def inf(s): print(f"{C.CY}[--]{C.RST} {s}")
def hdr(s): print(f"\n{C.BOLD}{C.B}{'═'*60}{C.RST}\n{C.BOLD}  {s}{C.RST}\n{'─'*60}")

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offsets_cache.json")

# ─── Conectare la L2 ─────────────────────────────────────────────────────────
def connect_l2() -> tuple[pymem.Pymem, int, str]:
    """Conecteaza la procesul L2 si returneaza (pm, base_addr, proc_name)."""
    names = ["l2.bin","L2.bin","l2.exe","L2.exe","lineage2.exe","Lineage2.exe"]
    for name in names:
        try:
            pm   = pymem.Pymem(name)
            mod  = pymem.process.module_from_name(pm.process_handle, name)
            base = mod.lpBaseOfDll
            ok(f"Conectat la '{name}'  |  PID={pm.process_id}  |  Base=0x{base:08X}")
            return pm, base, name
        except Exception:
            pass
    err("Nu am gasit procesul L2! Asigura-te ca jocul ruleaza.")
    sys.exit(1)

# ─── Citire memorie sigura ────────────────────────────────────────────────────
def safe_read(pm: pymem.Pymem, addr: int, size: int) -> bytes | None:
    try:
        return pm.read_bytes(addr, size)
    except Exception:
        return None

def safe_read_int(pm: pymem.Pymem, addr: int) -> int | None:
    b = safe_read(pm, addr, 4)
    return struct.unpack("<I", b)[0] if b else None

def safe_read_float(pm: pymem.Pymem, addr: int) -> float | None:
    b = safe_read(pm, addr, 4)
    return struct.unpack("<f", b)[0] if b else None

# ─── Structura MEMORY_BASIC_INFORMATION (definita manual pt compatibilitate) ──
class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BaseAddress",       ctypes.c_size_t),
        ("AllocationBase",    ctypes.c_size_t),
        ("AllocationProtect", ctypes.c_ulong),
        ("RegionSize",        ctypes.c_size_t),
        ("State",             ctypes.c_ulong),
        ("Protect",           ctypes.c_ulong),
        ("Type",              ctypes.c_ulong),
    ]

# ─── Enumerare regiuni de memorie ─────────────────────────────────────────────
def enum_regions(pm: pymem.Pymem) -> list[tuple[int,int]]:
    """Returneaza lista (start_addr, size) a regiunilor citibile."""
    regions = []
    MEM_COMMIT    = 0x1000
    PAGE_NOACCESS = 0x01
    PAGE_GUARD    = 0x100
    addr = 0
    mbi  = MEMORY_BASIC_INFORMATION()
    size = ctypes.sizeof(mbi)
    while addr < 0x7FFFFFFF:
        ret = ctypes.windll.kernel32.VirtualQueryEx(
            pm.process_handle, ctypes.c_void_p(addr),
            ctypes.byref(mbi), size)
        if not ret:
            break
        if (mbi.State == MEM_COMMIT
                and not (mbi.Protect & (PAGE_NOACCESS | PAGE_GUARD))
                and mbi.RegionSize > 0):
            regions.append((mbi.BaseAddress, mbi.RegionSize))
        addr = mbi.BaseAddress + mbi.RegionSize
    return regions

# ─── Cautare pattern in memorie ───────────────────────────────────────────────
def scan_pattern(pm: pymem.Pymem, pattern: bytes,
                 regions: list, max_results=64) -> list[int]:
    """Cauta un sir de bytes in toate regiunile accesibile."""
    found = []
    plen  = len(pattern)
    for base, size in regions:
        data = safe_read(pm, base, min(size, 0x400000))
        if not data:
            continue
        idx = 0
        while True:
            pos = data.find(pattern, idx)
            if pos == -1:
                break
            found.append(base + pos)
            idx = pos + 1
            if len(found) >= max_results:
                return found
    return found

def scan_int32(pm, value: int, regions) -> list[int]:
    return scan_pattern(pm, struct.pack("<I", value), regions)

def scan_float(pm, value: float, regions, tolerance=1.0) -> list[int]:
    """Cauta un float cu toleranta ±1.0"""
    found = []
    lo = struct.pack("<f", value - tolerance)
    hi = struct.pack("<f", value + tolerance)
    lo_v = struct.unpack("<f", lo)[0]
    hi_v = struct.unpack("<f", hi)[0]
    for base, size in regions:
        data = safe_read(pm, base, min(size, 0x400000))
        if not data or len(data) < 4:
            continue
        for i in range(0, len(data)-3, 4):
            v, = struct.unpack_from("<f", data, i)
            if lo_v <= v <= hi_v:
                found.append(base + i)
    return found

# ─── METODA 1: Cautare prin numele personajului ───────────────────────────────
def find_by_char_name(pm, regions, char_name: str) -> list[int]:
    """
    Cauta numele personajului in memorie ca wide string (UTF-16-LE).
    Aceasta e cea mai stabila metoda — structura jucatorului incepe
    de obicei cu 0-50 bytes inaintea numelui.
    """
    hdr("METODA 1: Cautare prin Numele Personajului")
    pattern = char_name.encode("utf-16-le")
    inf(f"Caut '{char_name}' ca UTF-16-LE ({len(pattern)} bytes)...")
    results = scan_pattern(pm, pattern, regions, max_results=20)
    if results:
        ok(f"Gasit la {len(results)} adrese:")
        for a in results:
            print(f"    0x{a:08X}")
    else:
        err(f"Numele '{char_name}' NU a fost gasit in memorie.")
        err("Verifica ca esti logat in joc cu personajul selectat.")
    return results

# ─── METODA 2: AOB Patterns pentru instructiuni HP ───────────────────────────
def aob_scan_hp_instructions(pm, regions) -> list[int]:
    """
    Cauta instructiuni x86 specifice care acceseaza HP-ul in L2 Interlude.
    Aceste pattern-uri sunt comune in clientii C4/Interlude:

    MOV EAX, [REG + 0x3E8]  → offset 0x3E8 = 1000 (HP in unele versiuni)
    MOV EAX, [REG + 0x408]  → offset 0x408 = 1032 (HP in alte versiuni)
    """
    hdr("METODA 2: AOB Scan Instructiuni HP")

    # Wildcards notate ca None; implementare simplificata fara wildcard
    patterns = {
        # mov eax, [reg+0x3E8]  — HP offset 1000
        "HP@0x3E8 (MOV EAX,[ECX+3E8])": b"\x8B\x81\xE8\x03\x00\x00",
        "HP@0x3E8 (MOV EAX,[ESI+3E8])": b"\x8B\x86\xE8\x03\x00\x00",
        # mov eax, [reg+0x408]  — HP offset 1032
        "HP@0x408 (MOV EAX,[ECX+408])": b"\x8B\x81\x08\x04\x00\x00",
        "HP@0x408 (MOV EAX,[ESI+408])": b"\x8B\x86\x08\x04\x00\x00",
        # mov eax, [reg+0x14C]  — HP offset 332
        "HP@0x14C (MOV EAX,[ECX+14C])": b"\x8B\x81\x4C\x01\x00\x00",
        # Target ID patterns
        "TargetID (MOV EAX,[ECX+4C])": b"\x8B\x41\x4C",
        "TargetID (MOV EAX,[ESI+50])": b"\x8B\x46\x50",
    }

    found_any = False
    results = {}
    for name, pat in patterns.items():
        hits = scan_pattern(pm, pat, regions, max_results=8)
        if hits:
            found_any = True
            results[name] = hits
            ok(f"{name}:")
            for h in hits:
                print(f"    0x{h:08X}  (in .exe +0x{h-0x400000:08X})")

    if not found_any:
        inf("Niciun pattern AOB universal gasit.")
        inf("Clientul Elmorlab poate fi obfuscat. Foloseste Metoda 3.")

    return results

# ─── METODA 3: Scan HP/MP prin valori cunoscute ───────────────────────────────
def find_hp_mp_by_values(pm, regions, hp: int, mp: int) -> dict:
    """
    Cel mai simplu: dai HP si MP curent, scriptul le cauta in memorie.
    Functie asemanatoare cu 'First Scan' din Cheat Engine.
    """
    hdr("METODA 3: Scan HP/MP prin Valori Exacte")
    inf(f"Caut HP={hp} si MP={mp} in memorie...")

    hp_addrs = scan_int32(pm, hp,  regions)
    mp_addrs = scan_int32(pm, mp,  regions)

    ok(f"HP={hp} gasit la {len(hp_addrs)} adrese")
    ok(f"MP={mp} gasit la {len(mp_addrs)} adrese")

    # Cauta perechi HP/MP la distanta mica (in acelasi struct)
    inf("Caut perechi HP+MP in acelasi struct (distanta < 0x200 bytes)...")
    pairs = []
    for ha in hp_addrs:
        for ma in mp_addrs:
            diff = abs(ma - ha)
            if 0 < diff < 0x200:
                pairs.append((ha, ma, diff))

    if pairs:
        ok(f"Gasite {len(pairs)} perechi candidate:")
        for ha, ma, diff in pairs[:10]:
            print(f"    HP=0x{ha:08X}  MP=0x{ma:08X}  diff=+0x{diff:X}")
    else:
        inf("Nicio pereche. Incearca sa modifici HP/MP (bea potion) si rulezi din nou.")

    return {"hp_candidates": hp_addrs[:20], "mp_candidates": mp_addrs[:20], "pairs": pairs[:10]}

# ─── METODA 4: Pointer scan (gaseste adresa verde) ───────────────────────────
def find_pointers_to(pm, regions, target_addr: int, max_offset=0x400) -> list[tuple[int,int]]:
    """
    Cauta pointeri catre target_addr (cu offset mic).
    Aceasta este echivalentul 'Pointer Scan' din Cheat Engine.
    Gaseste adresa verde (stabila) care pointeaza spre structura jucatorului.
    """
    hdr("METODA 4: Pointer Scan (gasire adresa stabila)")
    inf(f"Caut pointeri catre 0x{target_addr:08X} (offset max ±0x{max_offset:X})...")

    found = []
    for base, size in regions:
        data = safe_read(pm, base, min(size, 0x200000))
        if not data or len(data) < 4:
            continue
        for i in range(0, len(data)-3, 4):
            val, = struct.unpack_from("<I", data, i)
            diff = target_addr - val
            if 0 <= diff <= max_offset:
                ptr_addr = base + i
                found.append((ptr_addr, diff))

    if found:
        ok(f"Gasiti {len(found)} pointeri:")
        for pa, off in found[:15]:
            print(f"    Pointer=0x{pa:08X}  →  target+0x{off:X}")
            # Verifica daca pointerul e in .exe (adresa fixa/verde)
            if 0x400000 <= pa <= 0x900000:
                print(f"         {C.G}^^^ ADRESA VERDE (STABILA) — din .exe ^^^{C.RST}")
    else:
        inf("Niciun pointer gasit. Incearca un offset mai mare sau alta adresa.")

    return found[:20]

# ─── METODA 5: Snapshot diff pentru Target ID ────────────────────────────────
def find_target_id(pm, regions) -> list[int]:
    """
    Snapshot inainte de target, snapshot dupa, compara diferentele.
    Gaseste adresa Target ID care trece de la 0 la valoarea mob-ului.
    """
    hdr("METODA 5: Snapshot Diff pentru Target ID")

    print(f"\n{C.Y}Pas 1:{C.RST} Asigura-te ca NU ai nicio tinta selectata in joc.")
    input("  Apasa Enter cand esti gata...")

    inf("Fac snapshot 1 (fara tinta)...")
    snap1 = {}
    for base, size in regions[:200]:  # primele 200 regiuni pt viteza
        data = safe_read(pm, base, min(size, 0x40000))
        if data:
            snap1[base] = data
    ok(f"Snapshot 1 complet ({len(snap1)} regiuni)")

    print(f"\n{C.Y}Pas 2:{C.RST} Selecteaza un MOB in joc (click pe el).")
    input("  Apasa Enter dupa ce ai selectat tinta...")

    inf("Fac snapshot 2 (cu tinta selectata)...")
    snap2 = {}
    for base in snap1:
        size = len(snap1[base])
        data = safe_read(pm, base, size)
        if data:
            snap2[base] = data

    # Compara - cauta valori care au fost 0 si acum sunt != 0
    inf("Compar snapshot-urile — caut valori care s-au schimbat de la 0...")
    candidates = []
    for base in snap1:
        if base not in snap2:
            continue
        d1, d2 = snap1[base], snap2[base]
        for i in range(0, min(len(d1), len(d2))-3, 4):
            v1, = struct.unpack_from("<I", d1, i)
            v2, = struct.unpack_from("<I", d2, i)
            if v1 == 0 and v2 > 0x1000:  # Target ID e de obicei mare
                candidates.append((base + i, v2))

    if candidates:
        ok(f"Gasiti {len(candidates)} candidati pentru Target ID:")
        for addr, val in candidates[:20]:
            print(f"    0x{addr:08X}  →  TargetID={val}  (0x{val:08X})")
    else:
        inf("Niciun candidat. Incearca sa targetezi un mob cu un ID mare (>10000).")

    return [a for a, _ in candidates[:20]]

# ─── Salvare offset-uri ───────────────────────────────────────────────────────
def save_results(results: dict):
    """Salveaza rezultatele in offsets_cache.json si afiseaza codul Python."""
    hdr("REZULTATE FINALE")

    existing = {}
    if os.path.exists(CACHE):
        try:
            with open(CACHE) as f:
                existing = json.load(f)
        except Exception:
            pass

    existing.update(results)
    with open(CACHE, "w") as f:
        json.dump(existing, f, indent=2)
    ok(f"Salvat in {CACHE}")

    print(f"\n{C.BOLD}Copiaza aceste valori in simple_bot.py (sectiunea OFFSET-URI):{C.RST}")
    print(f"{C.Y}")
    for k, v in results.items():
        if isinstance(v, int):
            print(f"  {k.upper()}_OFFSET = 0x{v:06X}")
    print(f"{C.RST}")

# ─── Meniu principal ──────────────────────────────────────────────────────────
def main():
    os.system("cls" if os.name=="nt" else "clear")
    ctypes.windll.kernel32.SetConsoleTitleW("L2 Offset Finder v1.0")
    print(f"{C.BOLD}{C.M}")
    print("  ╔══════════════════════════════════════════╗")
    print("  ║    L2 Offset Finder — Elmorlab / C4     ║")
    print("  ║    AOB Scanner + Pointer Scan Tool       ║")
    print("  ╚══════════════════════════════════════════╝")
    print(f"{C.RST}")
    print(f"  {C.DIM}Necesita: L2 deschis, personaj logat, in joc{C.RST}\n")

    pm, base, proc = connect_l2()

    print(f"\n{C.CY}Enumerez regiunile de memorie...{C.RST}")
    regions = enum_regions(pm)
    ok(f"{len(regions)} regiuni accesibile")

    while True:
        print(f"\n{C.BOLD}{'═'*50}{C.RST}")
        print(f"  {C.BOLD}MENIU PRINCIPAL{C.RST}")
        print(f"{'─'*50}")
        print(f"  {C.G}1{C.RST}  Cauta prin NUMELE personajului (recomandat)")
        print(f"  {C.G}2{C.RST}  AOB Scan — instructiuni HP (pattern matching)")
        print(f"  {C.G}3{C.RST}  Scan HP/MP prin valori exacte")
        print(f"  {C.G}4{C.RST}  Pointer Scan (gaseste adresa verde/stabila)")
        print(f"  {C.G}5{C.RST}  Snapshot Diff — gaseste Target ID")
        print(f"  {C.G}6{C.RST}  Scan complet automat (toate metodele)")
        print(f"  {C.G}0{C.RST}  Iesire")
        print(f"{'─'*50}")
        choice = input("  Alegere: ").strip()

        if choice == "0":
            break

        elif choice == "1":
            name = input(f"\n  {C.Y}Numele personajului (exact din joc): {C.RST}").strip()
            if name:
                addrs = find_by_char_name(pm, regions, name)
                if addrs:
                    inf("Verific offset-uri comune in jurul numelui...")
                    for base_addr in addrs[:3]:
                        print(f"\n  {C.CY}In jurul 0x{base_addr:08X}:{C.RST}")
                        for off in range(-0x100, 0x500, 4):
                            v = safe_read_int(pm, base_addr + off)
                            if v and 0 < v < 100000:
                                print(f"    +0x{off:04X}: {v}  "
                                      f"{'← posibil HP/MP/nivel' if v < 5000 else ''}")

        elif choice == "2":
            aob_scan_hp_instructions(pm, regions)

        elif choice == "3":
            try:
                hp = int(input(f"\n  {C.Y}HP curent (exact, intreg): {C.RST}"))
                mp = int(input(f"  {C.Y}MP curent (exact, intreg): {C.RST}"))
                res = find_hp_mp_by_values(pm, regions, hp, mp)
                if res["pairs"]:
                    print(f"\n  {C.Y}Vrei sa faci pointer scan pe prima pereche? (y/n): {C.RST}", end="")
                    if input().strip().lower() == "y":
                        hp_addr = res["pairs"][0][0]
                        # Estimeaza inceputul structurii
                        struct_start = hp_addr - 0x100
                        find_pointers_to(pm, regions, struct_start)
            except ValueError:
                err("Valoare invalida. Introduce numere intregi.")

        elif choice == "4":
            try:
                addr_str = input(f"\n  {C.Y}Adresa structurii (hex, ex: 0x1A2B3C): {C.RST}").strip()
                addr = int(addr_str, 16)
                ptrs = find_pointers_to(pm, regions, addr)
            except ValueError:
                err("Adresa invalida. Foloseste format hex (0x...).")

        elif choice == "5":
            find_target_id(pm, regions)

        elif choice == "6":
            hdr("SCAN COMPLET AUTOMAT")
            name = input(f"  {C.Y}Numele personajului: {C.RST}").strip()
            hp_str = input(f"  {C.Y}HP curent: {C.RST}").strip()
            mp_str = input(f"  {C.Y}MP curent: {C.RST}").strip()

            results = {}

            # Metoda 1
            if name:
                addrs = find_by_char_name(pm, regions, name)
                if addrs:
                    results["name_addr"] = addrs[0]

            # Metoda 2
            aob_scan_hp_instructions(pm, regions)

            # Metoda 3
            if hp_str and mp_str:
                try:
                    hp, mp = int(hp_str), int(mp_str)
                    res = find_hp_mp_by_values(pm, regions, hp, mp)
                    if res["pairs"]:
                        ha, ma, diff = res["pairs"][0]
                        results["hp_addr"] = ha
                        results["mp_addr"] = ma
                        results["hp_mp_diff"] = diff
                        # Pointer scan
                        find_pointers_to(pm, regions, ha - 0x50)
                except ValueError:
                    pass

            # Metoda 5
            do_tgt = input(f"\n  {C.Y}Faci si scan Target ID? (y/n): {C.RST}").strip().lower()
            if do_tgt == "y":
                tgt_addrs = find_target_id(pm, regions)
                if tgt_addrs:
                    results["target_id_addr"] = tgt_addrs[0]

            if results:
                save_results(results)

        input(f"\n{C.DIM}  Apasa Enter pentru a continua...{C.RST}")

    print(f"\n{C.G}La revedere!{C.RST}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[Intrerupt de utilizator]")
    except Exception as e:
        err(f"Eroare neasteptata: {e}")
        import traceback; traceback.print_exc()
        input("\nApasa Enter...")
