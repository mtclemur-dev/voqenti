"""
find_offsets.py - Gaseste automat offseturile RAM pentru clientul tau Elmorlab.

Cum folosesti:
  1. Intra in joc cu personajul logat
  2. Deschide fereastra de status (HP/MP vizibile pe ecran)
  3. Ruleaza find_offsets.bat ca Administrator
  4. Introdu valorile EXACTE HP / MP din joc
"""
import ctypes
import ctypes.wintypes
import json
import os
import struct
import sys
import subprocess
from typing import List, Optional, Tuple

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offsets_cache.json")

MEM_COMMIT = 0x1000
PAGE_READONLY = 0x02
PAGE_READWRITE = 0x04
PAGE_EXECUTE_READ = 0x20
PAGE_EXECUTE_READWRITE = 0x40
PAGE_WRITECOPY = 0x08
PAGE_EXECUTE_WRITECOPY = 0x80

READABLE = (
    PAGE_READONLY, PAGE_READWRITE, PAGE_EXECUTE_READ,
    PAGE_EXECUTE_READWRITE, PAGE_WRITECOPY, PAGE_EXECUTE_WRITECOPY,
)

# Offseturi relative in structura player (candidati comuni Interlude)
SELF_HP_CANDIDATES = [0x30C, 0x084, 0x2A0, 0x320, 0x3A0]
SELF_MP_OFFSET_FROM_HP = 0x314 - 0x30C  # +8 int32 intre HP si MP (layout standard)
SELF_X_CANDIDATES = [0x44, 0x28, 0x30, 0x38]
SELF_TARGET_ID_CANDIDATES = [0x408, 0x3B8, 0x2D0, 0x4A0]

# Pointeri statici cunoscuti (relativ la modul) - incercam pe toate modulele
LOCAL_PLAYER_CANDIDATES = [
    0x019AC7C4, 0x019AC7C0, 0x00A8B6E4, 0x00B8D4E0,
    0x0113E3C8, 0x010F2F14, 0x00F8E1A0, 0x00E8C9B0,
]
OBJECT_MANAGER_CANDIDATES = [
    0x019AC7C0, 0x019AC7BC, 0x00A8B6E0, 0x0113E3C4,
]


class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BaseAddress",       ctypes.c_void_p),
        ("AllocationBase",    ctypes.c_void_p),
        ("AllocationProtect", ctypes.wintypes.DWORD),
        ("RegionSize",        ctypes.c_size_t),
        ("State",             ctypes.wintypes.DWORD),
        ("Protect",           ctypes.wintypes.DWORD),
        ("Type",              ctypes.wintypes.DWORD),
    ]


class ProcessMemory:
    def __init__(self, process_name: str = "l2.exe"):
        self.process_name = process_name
        self.pid = None
        self.handle = None
        self.modules = {}
        self._connect()

    def _connect(self):
        self.pid = self._find_pid()
        if not self.pid:
            raise RuntimeError(f"Procesul '{self.process_name}' nu ruleaza.")
        h = ctypes.windll.kernel32.OpenProcess(0x0010 | 0x0400, False, self.pid)
        if not h:
            raise RuntimeError("Nu pot deschide procesul. Ruleaza ca Administrator!")
        self.handle = h
        self._load_modules()

    def _find_pid(self) -> Optional[int]:
        for name in [self.process_name, "Lineage2.exe"]:
            try:
                out = subprocess.check_output(
                    ["tasklist", "/FI", f"IMAGENAME eq {name}", "/FO", "CSV"],
                    stderr=subprocess.DEVNULL
                ).decode("cp1252", errors="ignore")
                for line in out.splitlines()[1:]:
                    parts = line.strip('"').split('","')
                    if len(parts) >= 2:
                        return int(parts[1])
            except Exception:
                pass
        return None

    def _load_modules(self):
        hSnap = ctypes.windll.kernel32.CreateToolhelp32Snapshot(0x00000008, self.pid)
        if hSnap == ctypes.c_void_p(-1).value:
            return

        class MODULEENTRY32(ctypes.Structure):
            _fields_ = [
                ("dwSize", ctypes.c_ulong), ("th32ModuleID", ctypes.c_ulong),
                ("th32ProcessID", ctypes.c_ulong), ("GlblcntUsage", ctypes.c_ulong),
                ("ProccntUsage", ctypes.c_ulong), ("modBaseAddr", ctypes.c_void_p),
                ("modBaseSize", ctypes.c_ulong), ("hModule", ctypes.c_void_p),
                ("szModule", ctypes.c_char * 256), ("szExePath", ctypes.c_char * 260),
            ]

        me = MODULEENTRY32()
        me.dwSize = ctypes.sizeof(MODULEENTRY32)
        if ctypes.windll.kernel32.Module32First(hSnap, ctypes.byref(me)):
            while True:
                name = me.szModule.decode("ascii", errors="ignore")
                base = me.modBaseAddr or 0
                size = me.modBaseSize or 0
                if base and size:
                    self.modules[name.lower()] = {"name": name, "base": base, "size": size}
                if not ctypes.windll.kernel32.Module32Next(hSnap, ctypes.byref(me)):
                    break
        ctypes.windll.kernel32.CloseHandle(hSnap)

    def read_bytes(self, address: int, size: int) -> Optional[bytes]:
        buf = (ctypes.c_char * size)()
        read = ctypes.c_size_t(0)
        ok = ctypes.windll.kernel32.ReadProcessMemory(
            self.handle, ctypes.c_void_p(address), buf, size, ctypes.byref(read))
        if ok and read.value > 0:
            return bytes(buf[:read.value])
        return None

    def read_int(self, address: int) -> Optional[int]:
        b = self.read_bytes(address, 4)
        return struct.unpack("<i", b)[0] if b and len(b) == 4 else None

    def read_float(self, address: int) -> Optional[float]:
        b = self.read_bytes(address, 4)
        return struct.unpack("<f", b)[0] if b and len(b) == 4 else None

    def iter_regions(self):
        addr = 0
        mbi = MEMORY_BASIC_INFORMATION()
        while addr < 0x7FFFFFFF:
            r = ctypes.windll.kernel32.VirtualQueryEx(
                self.handle, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi))
            if r == 0:
                break
            base = mbi.BaseAddress or 0
            size = mbi.RegionSize or 0
            if (mbi.State == MEM_COMMIT and mbi.Protect in READABLE and size > 0):
                yield base, size
            addr = base + size


def find_hp_block(pm: ProcessMemory, hp: int, hp_max: int, mp: int, mp_max: int) -> List[int]:
    """Cauta secventa HP, HP_MAX, MP, MP_MAX consecutive in memorie."""
    pattern = struct.pack("<iiii", hp, hp_max, mp, mp_max)
    hits = []
    print("  Scanare memorie (10-30 secunde)...")

    for base, size in pm.iter_regions():
        chunk_size = 256 * 1024
        offset = 0
        while offset < size:
            to_read = min(chunk_size + len(pattern), size - offset)
            data = pm.read_bytes(base + offset, to_read)
            if not data:
                offset += chunk_size
                continue
            pos = 0
            while True:
                idx = data.find(pattern, pos)
                if idx == -1:
                    break
                hits.append(base + offset + idx)
                pos = idx + 4
            offset += chunk_size

    return hits


def validate_player_ptr(pm: ProcessMemory, player_ptr: int, hp_off: int,
                        hp: int, hp_max: int, mp: int, mp_max: int) -> bool:
    if pm.read_int(player_ptr + hp_off) != hp:
        return False
    if pm.read_int(player_ptr + hp_off + 4) != hp_max:
        return False
    if pm.read_int(player_ptr + hp_off + 8) != mp:
        return False
    if pm.read_int(player_ptr + hp_off + 12) != mp_max:
        return False
    for x_off in SELF_X_CANDIDATES:
        x = pm.read_float(player_ptr + x_off)
        y = pm.read_float(player_ptr + x_off + 4)
        if x and y and abs(x) > 10 and abs(x) < 500000 and abs(y) > 10 and abs(y) < 500000:
            return True
    return True  # acceptam si fara pozitie daca HP/MP sunt corecte


def find_static_pointer(pm: ProcessMemory, player_ptr: int,
                        candidates: List[int]) -> List[Tuple[str, int, int]]:
    """Gaseste modul + offset static care pointeaza la player_ptr."""
    results = []
    for mod_name, mod in pm.modules.items():
        base = mod["base"]
        size = mod["size"]
        for off in candidates:
            if off >= size:
                continue
            val = pm.read_int(base + off)
            if val is None:
                continue
            ptr = pm.read_int(val) if val > 0x10000 else None
            if ptr == player_ptr or val == player_ptr:
                results.append((mod["name"], off, base))
    return results


def scan_near_player_for_target_id(pm: ProcessMemory, player_ptr: int,
                                   target_id: int) -> Optional[int]:
    if not target_id:
        return None
    for off in range(0x200, 0x600, 4):
        if pm.read_int(player_ptr + off) == target_id:
            return off
    return None


def wait(msg="\nApasa Enter..."):
    try:
        input(msg)
    except EOFError:
        pass


def main():
    print("=" * 60)
    print("  CALIBRARE OFFSETURI RAM - Lineage 2 / Elmorlab")
    print("=" * 60)
    print()
    print("Uită-te in joc la bara de HP/MP si introdu valorile EXACTE.")
    print("(numerele afisate, nu procentele)\n")

    try:
        pm = ProcessMemory("l2.exe")
    except RuntimeError as e:
        print(f"[EROARE] {e}")
        wait()
        sys.exit(1)

    print(f"PID: {pm.pid}")
    print("Module incarcate:")
    for mod in pm.modules.values():
        print(f"  {mod['name']:20s}  base=0x{mod['base']:08X}  size={mod['size']//1024}KB")
    print()

    try:
        hp     = int(input("HP curent (ex: 1234): ").strip())
        hp_max = int(input("HP maxim  (ex: 1500): ").strip())
        mp     = int(input("MP curent (ex: 800):  ").strip())
        mp_max = int(input("MP maxim  (ex: 900):  ").strip())
    except ValueError:
        print("[EROARE] Introdu doar numere intregi.")
        wait()
        sys.exit(1)

    if not (0 < hp <= hp_max and 0 < mp <= mp_max):
        print("[EROARE] Valori invalide (HP/MP trebuie sa fie > 0 si curent <= max).")
        wait()
        sys.exit(1)

    hits = find_hp_block(pm, hp, hp_max, mp, mp_max)
    print(f"  Gasite {len(hits)} locatii cu HP/MP/MP_MAX corecte.")

    if not hits:
        print("\n[EROARE] Nu am gasit valorile in memorie.")
        print("  - Verifica ca ai introdus numerele corect din joc")
        print("  - Ruleaza ca Administrator")
        wait()
        sys.exit(1)

    best = None
    for hp_addr in hits[:200]:
        for hp_off in SELF_HP_CANDIDATES:
            player_ptr = hp_addr - hp_off
            if player_ptr <= 0:
                continue
            if validate_player_ptr(pm, player_ptr, hp_off, hp, hp_max, mp, mp_max):
                ptr_hits = find_static_pointer(pm, player_ptr, LOCAL_PLAYER_CANDIDATES)
                best = {
                    "player_ptr": player_ptr,
                    "hp_off": hp_off,
                    "ptr_hits": ptr_hits,
                }
                break
        if best:
            break

    if not best:
        print("\n[EROARE] Am gasit HP in memorie dar nu am putut valida structura player.")
        print("  Incearca din nou cu valorile exacte din joc.")
        wait()
        sys.exit(1)

    player_ptr = best["player_ptr"]
    hp_off = best["hp_off"]

    self_hp       = hp_off
    self_hp_max   = hp_off + 4
    self_mp       = hp_off + 8
    self_mp_max   = hp_off + 12

    self_x = self_y = self_z = None
    for x_off in SELF_X_CANDIDATES:
        x = pm.read_float(player_ptr + x_off)
        y = pm.read_float(player_ptr + x_off + 4)
        z = pm.read_float(player_ptr + x_off + 8)
        if x and y and abs(x) > 10 and abs(y) > 10:
            self_x, self_y, self_z = x_off, x_off + 4, x_off + 8
            break
    if self_x is None:
        self_x, self_y, self_z = 0x44, 0x48, 0x4C

    print(f"\n[OK] Player struct la adresa 0x{player_ptr:08X}")
    print(f"     SELF_HP offset = 0x{self_hp:X}")

    local_player_off = None
    local_module = None
    local_base = None

    if best["ptr_hits"]:
        local_module, local_player_off, local_base = best["ptr_hits"][0]
        print(f"[OK] LOCAL_PLAYER = 0x{local_player_off:08X} in {local_module}")
    else:
        print("[!] Nu am gasit pointer static automat.")
        print("    Caut pointer in toate modulele (poate dura)...")
        for mod in pm.modules.values():
            base = mod["base"]
            size = min(mod["size"], 0x03000000)
            for off in range(0, size, 4):
                val = pm.read_int(base + off)
                if val == player_ptr:
                    local_module = mod["name"]
                    local_player_off = off
                    local_base = base
                    print(f"[OK] LOCAL_PLAYER = 0x{off:08X} in {local_module}")
                    break
                if val and val > 0x10000:
                    p2 = pm.read_int(val)
                    if p2 == player_ptr:
                        local_module = mod["name"]
                        local_player_off = off
                        local_base = base
                        print(f"[OK] LOCAL_PLAYER (indirect) = 0x{off:08X} in {local_module}")
                        break
            if local_player_off is not None:
                break

    target_id_off = None
    print("\n--- Target (optional) ---")
    print("Targeteaza un monstru in joc, apoi apasa Enter.")
    try:
        input()
    except EOFError:
        pass

    tid_input = input("Target ID din joc (Enter = skip, botul va detecta automat): ").strip()
    target_id = int(tid_input) if tid_input.isdigit() else None

    if target_id:
        target_id_off = scan_near_player_for_target_id(pm, player_ptr, target_id)
        if target_id_off:
            print(f"[OK] SELF_TARGET_ID offset = 0x{target_id_off:X}")
        else:
            print("[!] Target ID nu a fost gasit - vei seta manual mai tarziu.")
            target_id_off = 0x408
    else:
        for off in SELF_TARGET_ID_CANDIDATES:
            v = pm.read_int(player_ptr + off)
            if v and v > 100000:
                target_id_off = off
                print(f"[?] Posibil SELF_TARGET_ID = 0x{off:X} (val={v})")
                break
        if target_id_off is None:
            target_id_off = 0x408

    obj_mgr_off = None
    obj_mgr_module = local_module
    if local_module and local_player_off is not None:
        for off in OBJECT_MANAGER_CANDIDATES:
            mod = pm.modules.get(local_module.lower())
            if mod and pm.read_int(mod["base"] + off):
                obj_mgr_off = off
                break
    if obj_mgr_off is None:
        obj_mgr_off = 0x019AC7C0

    cache = {
        "module": local_module or "l2.exe",
        "module_base": f"0x{local_base:08X}" if local_base else None,
        "LOCAL_PLAYER": f"0x{local_player_off:08X}" if local_player_off else None,
        "OBJECT_MANAGER": f"0x{obj_mgr_off:08X}",
        "OBJECT_MANAGER_MODULE": obj_mgr_module or "l2.exe",
        "sig_hp_max": hp_max,
        "sig_mp_max": mp_max,
        "use_dynamic_ptr": local_player_off is None,
        "SELF_HP": f"0x{self_hp:X}",
        "SELF_HP_MAX": f"0x{self_hp_max:X}",
        "SELF_MP": f"0x{self_mp:X}",
        "SELF_MP_MAX": f"0x{self_mp_max:X}",
        "SELF_X": f"0x{self_x:X}",
        "SELF_Y": f"0x{self_y:X}",
        "SELF_Z": f"0x{self_z:X}",
        "SELF_TARGET_ID": f"0x{target_id_off:X}",
        "TARGET_HP": f"0x{self_hp:X}",
        "TARGET_HP_MAX": f"0x{self_hp_max:X}",
        "TARGET_X": f"0x{self_x:X}",
        "TARGET_Y": f"0x{self_y:X}",
        "player_ptr_sample": f"0x{player_ptr:08X}",
    }

    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  SALVAT in: {CACHE_FILE}")
    print(f"{'='*60}")
    for k, v in cache.items():
        print(f"  {k}: {v}")
    print()
    if local_player_off is None:
        print("LOCAL_PLAYER nu exista pe Elmorlab - botul va folosi scanare dinamica.")
        print(f"Semnatura salvata: HP_MAX={hp_max}, MP_MAX={mp_max}")
    print("Acum ruleaza test_ram.bat - ar trebui sa vezi [OK].")
    wait()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\n[EROARE CRITICA] {e}")
        traceback.print_exc()
        wait()
        sys.exit(1)
