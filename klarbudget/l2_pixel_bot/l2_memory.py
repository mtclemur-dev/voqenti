"""
l2_memory.py - Citire directa din memoria procesului Lineage II

Fara detectie de pixeli - citim direct din RAM-ul jocului:
  - HP / MP propriu
  - Pozitia personajului (X, Y)
  - Target ID, Target HP, Target X/Y
"""

import ctypes
import json
import os
import struct
import sys
from typing import Optional, Tuple, List, Dict

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offsets_cache.json")


def _parse_hex(val, default=0):
    if val is None:
        return default
    if isinstance(val, int):
        return val
    s = str(val).strip()
    if not s:
        return default
    return int(s, 16) if s.lower().startswith("0x") else int(s)


def _load_offsets_cache():
    """Incarca offseturile calibrate automat din find_offsets.py."""
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# MEMORIE RAM L2 - Offseturi (COMPLETEAZA CU VALORILE TALE DIN CHEAT ENGINE)
# ---------------------------------------------------------------------------
class L2Offsets:
    # Default Interlude - suprascrise automat din offsets_cache.json daca exista
    OBJECT_MANAGER        = 0x019AC7C0
    LOCAL_PLAYER          = 0x019AC7C4
    LOCAL_PLAYER_MODULE   = "l2.exe"
    OBJECT_MANAGER_MODULE = "l2.exe"

    SELF_HP               = 0x30C
    SELF_HP_MAX           = 0x310
    SELF_MP               = 0x314
    SELF_MP_MAX           = 0x318
    SELF_Z                = 0x4C
    SELF_X                = 0x44
    SELF_Y                = 0x48
    SELF_TARGET_ID        = 0x408
    SELECTED_TARGET_PTR   = 0x00000000
    TARGET_HP             = 0x30C
    TARGET_HP_MAX         = 0x310
    TARGET_X              = 0x44
    TARGET_Y              = 0x48
    OBJ_NAME              = 0x58
    OBJ_TYPE              = 0x04

    @classmethod
    def apply_cache(cls):
        c = _load_offsets_cache()
        if not c:
            return False
        mapping = {
            "LOCAL_PLAYER": "LOCAL_PLAYER",
            "OBJECT_MANAGER": "OBJECT_MANAGER",
            "SELF_HP": "SELF_HP", "SELF_HP_MAX": "SELF_HP_MAX",
            "SELF_MP": "SELF_MP", "SELF_MP_MAX": "SELF_MP_MAX",
            "SELF_X": "SELF_X", "SELF_Y": "SELF_Y", "SELF_Z": "SELF_Z",
            "SELF_TARGET_ID": "SELF_TARGET_ID",
            "TARGET_HP": "TARGET_HP", "TARGET_HP_MAX": "TARGET_HP_MAX",
            "TARGET_X": "TARGET_X", "TARGET_Y": "TARGET_Y",
            "OBJ_NAME": "OBJ_NAME", "OBJ_TYPE": "OBJ_TYPE",
        }
        for ck, attr in mapping.items():
            val = c.get(ck)
            # [FIX] nu suprascrie cu null/None din cache
            if val is None or str(val).lower() in ("null", "none", ""):
                continue
            setattr(cls, attr, _parse_hex(val))
        if c.get("module"):
            cls.LOCAL_PLAYER_MODULE = c["module"]
        if c.get("OBJECT_MANAGER_MODULE"):
            cls.OBJECT_MANAGER_MODULE = c["OBJECT_MANAGER_MODULE"]
        return True


L2Offsets.apply_cache()


class L2MemoryReader:
    """Citeste date din memoria procesului Lineage II."""

    def __init__(self, process_name: str = "l2.exe"):
        self.process_name = process_name
        self._pid    = None
        self._handle = None
        self._base   = None
        self._modules = {}
        self._dynamic_player_ptr = None
        self._cache = _load_offsets_cache()
        self._ok     = False
        self._error  = ""
        self._connect()

    def is_available(self) -> bool:
        return self._ok

    def error_message(self) -> str:
        return self._error

    # -----------------------------------------------------------------------
    # Conectare la proces
    # -----------------------------------------------------------------------
    def _connect(self):
        try:
            pid = self._find_pid()
            if not pid:
                self._error = f"Procesul '{self.process_name}' nu a fost gasit."
                return

            PROCESS_VM_READ    = 0x0010
            PROCESS_QUERY_INFO = 0x0400
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_VM_READ | PROCESS_QUERY_INFO, False, pid)

            if not handle:
                self._error = "Nu s-a putut deschide procesul. Ruleaza ca Administrator!"
                return

            self._pid    = pid
            self._handle = handle
            self._load_all_modules()
            self._base   = self._get_module_base(L2Offsets.LOCAL_PLAYER_MODULE)

            if self._base:
                self._ok = True
                self._error = ""
            else:
                self._error = "Nu s-a gasit baza modulului L2."

        except Exception as e:
            self._error = f"Eroare la conectare: {e}"

    def _load_all_modules(self):
        self._modules = {}
        if not self._pid:
            return
        try:
            hSnap = ctypes.windll.kernel32.CreateToolhelp32Snapshot(0x00000008, self._pid)
            if hSnap == ctypes.c_void_p(-1).value:
                return

            class MODULEENTRY32(ctypes.Structure):
                _fields_ = [
                    ("dwSize",        ctypes.c_ulong),
                    ("th32ModuleID",  ctypes.c_ulong),
                    ("th32ProcessID", ctypes.c_ulong),
                    ("GlblcntUsage",  ctypes.c_ulong),
                    ("ProccntUsage",  ctypes.c_ulong),
                    ("modBaseAddr",   ctypes.c_void_p),
                    ("modBaseSize",   ctypes.c_ulong),
                    ("hModule",       ctypes.c_void_p),
                    ("szModule",      ctypes.c_char * 256),
                    ("szExePath",     ctypes.c_char * 260),
                ]

            me = MODULEENTRY32()
            me.dwSize = ctypes.sizeof(MODULEENTRY32)
            if ctypes.windll.kernel32.Module32First(hSnap, ctypes.byref(me)):
                while True:
                    name = me.szModule.decode("ascii", errors="ignore")
                    base = me.modBaseAddr or 0
                    if base:
                        self._modules[name.lower()] = base
                    if not ctypes.windll.kernel32.Module32Next(hSnap, ctypes.byref(me)):
                        break
            ctypes.windll.kernel32.CloseHandle(hSnap)
        except Exception:
            pass

    def _module_base(self, module_name: str) -> Optional[int]:
        key = (module_name or "l2.exe").lower()
        if key in self._modules:
            return self._modules[key]
        for k, v in self._modules.items():
            if key in k or k in key:
                return v
        return self._base

    def _find_pid(self) -> Optional[int]:
        import subprocess
        try:
            out = subprocess.check_output(
                ["tasklist", "/FI", f"IMAGENAME eq {self.process_name}", "/FO", "CSV"],
                stderr=subprocess.DEVNULL
            ).decode('cp1252', errors='ignore')
            for line in out.splitlines()[1:]:
                parts = line.strip('"').split('","')
                if len(parts) >= 2 and self.process_name.lower() in parts[0].lower():
                    return int(parts[1])
        except Exception:
            pass
        return None

    def _get_module_base(self, module_name: str = None) -> Optional[int]:
        if module_name:
            b = self._module_base(module_name)
            if b:
                return b
        if not self._pid:
            return None
        for prefer in ("l2.exe", "lineage2.exe"):
            b = self._module_base(prefer)
            if b:
                return b
        return next(iter(self._modules.values()), None) if self._modules else None

    def reconnect(self):
        if self._handle:
            try:
                ctypes.windll.kernel32.CloseHandle(self._handle)
            except Exception:
                pass
        self._pid = self._handle = self._base = None
        self._ok = False
        self._connect()

    # -----------------------------------------------------------------------
    # Citire memorie
    # -----------------------------------------------------------------------
    def _read_int(self, address: int) -> Optional[int]:
        try:
            buf  = ctypes.c_int32()
            read = ctypes.c_size_t(0)
            ok   = ctypes.windll.kernel32.ReadProcessMemory(
                self._handle, ctypes.c_void_p(address),
                ctypes.byref(buf), 4, ctypes.byref(read))
            return buf.value if ok and read.value == 4 else None
        except Exception:
            return None

    def _read_float(self, address: int) -> Optional[float]:
        try:
            buf  = ctypes.c_float()
            read = ctypes.c_size_t(0)
            ok   = ctypes.windll.kernel32.ReadProcessMemory(
                self._handle, ctypes.c_void_p(address),
                ctypes.byref(buf), 4, ctypes.byref(read))
            return buf.value if ok and read.value == 4 else None
        except Exception:
            return None

    def _read_ptr(self, address: int) -> Optional[int]:
        v = self._read_int(address)
        return v if v and v > 0x10000 else None

    def _validate_player_ptr(self, player_ptr: int) -> bool:
        if not player_ptr:
            return False
        hp, hp_max = self._read_int(player_ptr + L2Offsets.SELF_HP), \
                     self._read_int(player_ptr + L2Offsets.SELF_HP_MAX)
        mp, mp_max = self._read_int(player_ptr + L2Offsets.SELF_MP), \
                     self._read_int(player_ptr + L2Offsets.SELF_MP_MAX)
        if hp is None or hp_max is None or mp is None or mp_max is None:
            return False
        if hp_max <= 0 or mp_max <= 0:
            return False
        return 0 <= hp <= hp_max <= 100000000 and 0 <= mp <= mp_max <= 100000000

    def _resolve_player_dynamic(self) -> Optional[int]:
        """
        [FIX] Elmorlab: gaseste player_ptr in heap dupa HP_MAX + MP_MAX (valorile stabile).
        Nu necesita LOCAL_PLAYER static.
        """
        c = self._cache
        hp_max = c.get("sig_hp_max")
        mp_max = c.get("sig_mp_max")
        if hp_max is None or mp_max is None:
            return None

        hp_max_sig = int(hp_max)
        mp_max_sig = int(mp_max)
        hp_max_bytes = struct.pack("<i", hp_max_sig)

        MEM_COMMIT = 0x1000
        READABLE = (0x02, 0x04, 0x08, 0x20, 0x40, 0x80)

        class MBI(ctypes.Structure):
            _fields_ = [
                ("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                ("AllocationProtect", ctypes.c_ulong), ("RegionSize", ctypes.c_size_t),
                ("State", ctypes.c_ulong), ("Protect", ctypes.c_ulong),
                ("Type", ctypes.c_ulong),
            ]

        addr = 0
        mbi = MBI()
        while addr < 0x7FFFFFFF:
            r = ctypes.windll.kernel32.VirtualQueryEx(
                self._handle, ctypes.c_void_p(addr), ctypes.byref(mbi), ctypes.sizeof(mbi))
            if r == 0:
                break
            base = mbi.BaseAddress or 0
            size = mbi.RegionSize or 0
            if mbi.State == MEM_COMMIT and mbi.Protect in READABLE and size > 0:
                chunk = 128 * 1024
                off = 0
                while off < size:
                    to_read = min(chunk + 8, size - off)
                    data = self._read_bytes(base + off, to_read)
                    if data:
                        pos = 0
                        while True:
                            idx = data.find(hp_max_bytes, pos)
                            if idx == -1:
                                break
                            player_ptr = (base + off + idx) - L2Offsets.SELF_HP_MAX
                            if self._validate_player_ptr(player_ptr):
                                mm = self._read_int(player_ptr + L2Offsets.SELF_MP_MAX)
                                if mm == mp_max_sig:
                                    return player_ptr
                            pos = idx + 4
                    off += chunk
            addr = base + size
        return None

    def _read_bytes(self, address: int, size: int) -> Optional[bytes]:
        try:
            buf = (ctypes.c_char * size)()
            read = ctypes.c_size_t(0)
            ok = ctypes.windll.kernel32.ReadProcessMemory(
                self._handle, ctypes.c_void_p(address), buf, size, ctypes.byref(read))
            if ok and read.value > 0:
                return bytes(buf[:read.value])
        except Exception:
            pass
        return None

    def _get_player_ptr(self) -> Optional[int]:
        if not self._ok:
            return None

        c = self._cache
        local_off = c.get("LOCAL_PLAYER")
        has_static = local_off and str(local_off).lower() not in ("null", "none", "")

        # Metoda 1: pointer static (daca a fost gasit la calibrare)
        if has_static:
            mod_base = self._module_base(L2Offsets.LOCAL_PLAYER_MODULE) or self._base
            if mod_base:
                off = _parse_hex(local_off)
                raw = self._read_int(mod_base + off)
                if raw and raw > 0x10000 and self._validate_player_ptr(raw):
                    return raw
                ptr = self._read_ptr(mod_base + off)
                if ptr and self._validate_player_ptr(ptr):
                    return ptr

        # Metoda 2: pointer din sesiunea de calibrare (joc inca deschis)
        sample = c.get("player_ptr_sample")
        if sample and str(sample).lower() not in ("null", "none", ""):
            ptr = _parse_hex(sample)
            if self._validate_player_ptr(ptr):
                return ptr

        # Metoda 3: cache dinamic din sesiunea curenta
        if self._dynamic_player_ptr and self._validate_player_ptr(self._dynamic_player_ptr):
            return self._dynamic_player_ptr

        # Metoda 4: scanare dupa HP_MAX + MP (semnatura stabila)
        found = self._resolve_player_dynamic()
        if found:
            self._dynamic_player_ptr = found
            return found

        # Metoda 5: fallback offseturi Interlude implicite
        mod_base = self._module_base(L2Offsets.LOCAL_PLAYER_MODULE) or self._base
        if mod_base and L2Offsets.LOCAL_PLAYER:
            raw = self._read_int(mod_base + L2Offsets.LOCAL_PLAYER)
            if raw and raw > 0x10000 and self._validate_player_ptr(raw):
                return raw
            ptr = self._read_ptr(mod_base + L2Offsets.LOCAL_PLAYER)
            if ptr and self._validate_player_ptr(ptr):
                return ptr

        return None

    def _get_object_manager_ptr(self) -> Optional[int]:
        mod_base = self._module_base(L2Offsets.OBJECT_MANAGER_MODULE)
        if not mod_base:
            mod_base = self._base
        if not mod_base:
            return None
        return self._read_ptr(mod_base + L2Offsets.OBJECT_MANAGER)

    def _get_target_ptr(self) -> Optional[int]:
        """Gaseste structura tintei: pointer direct sau cautare in ObjectManager."""
        player_ptr = self._get_player_ptr()
        if not player_ptr:
            return None

        if L2Offsets.SELECTED_TARGET_PTR != 0:
            tgt = self._read_ptr(player_ptr + L2Offsets.SELECTED_TARGET_PTR)
            if tgt:
                return tgt

        tid = self._read_int(player_ptr + L2Offsets.SELF_TARGET_ID)
        if not tid:
            return None
        return self._find_object_by_id(tid)

    def _read_wstring(self, address: int, max_chars: int = 48) -> Optional[str]:
        data = self._read_bytes(address, max_chars * 2)
        if not data:
            return None
        try:
            s = data.decode('utf-16-le', errors='ignore').split('\x00')[0].strip()
            if len(s) >= 2 and any(c.isalpha() for c in s):
                return s
        except Exception:
            pass
        return None

    def _read_object_name(self, obj_ptr: int) -> Optional[str]:
        offsets = [L2Offsets.OBJ_NAME, 0x60, 0x64, 0x6C]
        seen = set()
        for off in offsets:
            if off in seen:
                continue
            seen.add(off)
            name_ptr = self._read_ptr(obj_ptr + off)
            if name_ptr:
                name = self._read_wstring(name_ptr)
                if name:
                    return name
            inline = self._read_wstring(obj_ptr + off, 24)
            if inline:
                return inline
        return None

    def _object_position(self, obj_ptr: int) -> Tuple[Optional[float], Optional[float]]:
        x = self._read_float(obj_ptr + L2Offsets.TARGET_X)
        y = self._read_float(obj_ptr + L2Offsets.TARGET_Y)
        return x, y

    def _object_hp(self, obj_ptr: int) -> Optional[int]:
        return self._read_int(obj_ptr + L2Offsets.TARGET_HP)

    def _object_id_at(self, obj_ptr: int) -> Optional[int]:
        for off in (0x0C, 0x08, 0x10):
            oid = self._read_int(obj_ptr + off)
            if oid and oid > 0:
                return oid
        return None

    @staticmethod
    def _dist2d(x1, y1, x2, y2) -> float:
        if None in (x1, y1, x2, y2):
            return 999999.0
        dx, dy = float(x2) - float(x1), float(y2) - float(y1)
        return (dx * dx + dy * dy) ** 0.5

    def _iterate_world_objects(self, limit: int = 400):
        mgr = self._get_object_manager_ptr()
        if not mgr:
            return

        for start_off in (0x1C, 0x18, 0x20):
            obj = self._read_ptr(mgr + start_off)
            if not obj:
                continue
            visited = 0
            while obj and visited < limit:
                yield obj
                visited += 1
                nxt = self._read_ptr(obj + 0x34)
                if not nxt:
                    nxt = self._read_ptr(obj + 0x3C)
                if nxt == obj:
                    break
                obj = nxt
            if visited > 0:
                return

    def enumerate_nearby_objects(self, max_distance: float = 3000.0) -> List[Dict]:
        px, py, _ = self.get_self_position()
        if px is None or py is None:
            return []

        results = []
        for obj in self._iterate_world_objects():
            oid = self._object_id_at(obj)
            if not oid:
                continue
            ox, oy = self._object_position(obj)
            if ox is None or oy is None:
                continue
            dist = self._dist2d(px, py, ox, oy)
            if dist > max_distance:
                continue
            hp = self._object_hp(obj)
            if hp is not None and hp <= 0:
                continue
            name = self._read_object_name(obj)
            results.append({
                'id': oid, 'name': name or '', 'x': ox, 'y': oy,
                'hp': hp, 'distance': dist, 'ptr': obj,
            })
        return results

    def find_mobs_by_names(self, names: List[str], max_distance: float = 2500.0,
                           zone_bounds=None) -> Optional[Dict]:
        if not names:
            return None
        want = [n.lower().strip() for n in names if n.strip()]
        if not want:
            return None

        best = None
        for obj in self.enumerate_nearby_objects(max_distance):
            nm = (obj.get('name') or '').lower()
            if not nm:
                continue
            if not any(w in nm for w in want):
                continue
            if zone_bounds:
                x_min, x_max, y_min, y_max = zone_bounds
                if not (x_min <= obj['x'] <= x_max and y_min <= obj['y'] <= y_max):
                    continue
            if best is None or obj['distance'] < best['distance']:
                best = obj
        return best

    def find_mob_by_id(self, mob_id: int, max_distance: float = 2500.0) -> Optional[Dict]:
        if not mob_id:
            return None
        for obj in self.enumerate_nearby_objects(max_distance):
            if obj.get('id') == mob_id:
                return obj
        return None

    def get_target_name(self) -> Optional[str]:
        tgt = self._get_target_ptr()
        if not tgt:
            return None
        return self._read_object_name(tgt)

    def get_distance_to_target(self) -> Optional[float]:
        px, py, _ = self.get_self_position()
        tx, ty = self.get_target_position()
        if px is None or tx is None:
            return None
        return self._dist2d(px, py, tx, ty)

    def _find_object_by_id(self, object_id: int) -> Optional[int]:
        """Parcurge lista de obiecte din lume si returneaza ptr-ul cu ID-ul dat."""
        mgr = self._get_object_manager_ptr()
        if not mgr:
            return None

        obj = self._read_ptr(mgr + 0x1C)
        if not obj:
            obj = self._read_ptr(mgr + 0x18)

        visited = 0
        while obj and visited < 512:
            for id_off in (0x0C, 0x08):
                oid = self._read_int(obj + id_off)
                if oid == object_id:
                    return obj
            nxt = self._read_ptr(obj + 0x34)
            if not nxt:
                nxt = self._read_ptr(obj + 0x3C)
            obj = nxt
            visited += 1
        return None

    # -----------------------------------------------------------------------
    # API public pentru bot
    # -----------------------------------------------------------------------
    def get_self_hp(self) -> Tuple[Optional[int], Optional[int]]:
        player_ptr = self._get_player_ptr()
        if not player_ptr:
            return None, None
        hp     = self._read_int(player_ptr + L2Offsets.SELF_HP)
        hp_max = self._read_int(player_ptr + L2Offsets.SELF_HP_MAX)
        return hp, hp_max

    def get_self_mp(self) -> Tuple[Optional[int], Optional[int]]:
        player_ptr = self._get_player_ptr()
        if not player_ptr:
            return None, None
        mp     = self._read_int(player_ptr + L2Offsets.SELF_MP)
        mp_max = self._read_int(player_ptr + L2Offsets.SELF_MP_MAX)
        return mp, mp_max

    def get_self_position(self) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        player_ptr = self._get_player_ptr()
        if not player_ptr:
            return None, None, None
        x = self._read_float(player_ptr + L2Offsets.SELF_X)
        y = self._read_float(player_ptr + L2Offsets.SELF_Y)
        z = self._read_float(player_ptr + L2Offsets.SELF_Z)
        return x, y, z

    def get_target_id(self) -> Optional[int]:
        player_ptr = self._get_player_ptr()
        if not player_ptr:
            return None
        tid = self._read_int(player_ptr + L2Offsets.SELF_TARGET_ID)
        if tid:
            return tid
        hp, hp_max = self.get_self_hp()
        mp, mp_max = self.get_self_mp()
        exclude = {0, hp, hp_max, mp, mp_max}
        for off in (0x3B8, 0x3A0, 0x400, 0x410, 0x3C0, 0x2D0, 0x4A0, 0x3B0, 0x418):
            if off == L2Offsets.SELF_TARGET_ID:
                continue
            v = self._read_int(player_ptr + off)
            if v and v > 1000000 and v not in exclude:
                return v
        return 0

    def has_target(self) -> bool:
        tid = self.get_target_id()
        return tid is not None and tid != 0

    # [MODIFICAT] Citire HP tinta direct din RAM (inlocuieste bara rosie de pe ecran)
    def get_target_hp(self) -> Optional[int]:
        tgt = self._get_target_ptr()
        if not tgt:
            return None
        return self._read_int(tgt + L2Offsets.TARGET_HP)

    def get_target_hp_max(self) -> Optional[int]:
        tgt = self._get_target_ptr()
        if not tgt:
            return None
        return self._read_int(tgt + L2Offsets.TARGET_HP_MAX)

    def get_target_hp_percent(self) -> Optional[float]:
        hp, hp_max = self.get_target_hp(), self.get_target_hp_max()
        if hp is not None and hp_max and hp_max > 0:
            return hp / hp_max
        return None

    # [MODIFICAT] Coordonate tinta pentru calcul distanta euclidiana
    def get_target_position(self) -> Tuple[Optional[float], Optional[float]]:
        tgt = self._get_target_ptr()
        if not tgt:
            return None, None
        x = self._read_float(tgt + L2Offsets.TARGET_X)
        y = self._read_float(tgt + L2Offsets.TARGET_Y)
        return x, y

    def has_valid_player_data(self) -> bool:
        hp, hp_max = self.get_self_hp()
        mp, mp_max = self.get_self_mp()
        hp_ok = hp is not None and hp_max is not None and 0 <= hp <= hp_max <= 100000000
        mp_ok = mp is not None and mp_max is not None and 0 <= mp <= mp_max <= 100000000
        return hp_ok and mp_ok and hp_max > 0 and mp_max > 0

    def is_fully_calibrated(self) -> bool:
        """True doar daca player_ptr + HP/MP sunt citite corect."""
        if not self._ok:
            return False
        if not self.has_valid_player_data():
            return False
        return self._get_player_ptr() is not None

    def diagnose(self) -> str:
        """Mesaj diagnostic pentru depanare rapida."""
        if not self._ok:
            return self._error or "Proces L2 neconectat"
        hp, hp_max = self.get_self_hp()
        mp, mp_max = self.get_self_mp()
        x, y, z = self.get_self_position()
        tid = self.get_target_id()
        ptr = self._get_player_ptr()
        parts = [
            f"PID={self._pid}",
            f"Mod={L2Offsets.LOCAL_PLAYER_MODULE}",
            f"Base=0x{self._base:08X}" if self._base else "Base=?",
            f"Cache={'DA' if os.path.exists(CACHE_FILE) else 'NU'}",
            f"Ptr=0x{ptr:08X}" if ptr else "Ptr=NEGASIT",
            f"HP={hp}/{hp_max}",
            f"MP={mp}/{mp_max}",
            f"Pos=({x},{y})",
            f"TargetID={tid}",
        ]
        if hp_max is None or hp_max <= 0:
            if not self._cache.get("sig_hp_max"):
                parts.append("Lipseste sig_hp_max - ruleaza patch_sig.bat")
            else:
                parts.append("Scanare dinamica esuata - verifica sig_hp_max/sig_mp_max")
        return " | ".join(str(p) for p in parts)

    def self_hp_percent(self) -> Optional[float]:
        hp, hp_max = self.get_self_hp()
        if hp is not None and hp_max and hp_max > 0:
            return hp / hp_max
        return None

    def self_mp_percent(self) -> Optional[float]:
        mp, mp_max = self.get_self_mp()
        if mp is not None and mp_max and mp_max > 0:
            return mp / mp_max
        return None


if __name__ == "__main__":
    print("=== L2 Memory Reader - TEST ===")
    reader = L2MemoryReader("l2.exe")

    if not reader.is_available():
        print(f"EROARE: {reader.error_message()}")
        input("\nApasa Enter...")
        sys.exit(1)

    print(f"Conectat! PID={reader._pid}, Base=0x{reader._base:08X}")
    print("Ctrl+C pentru iesire.\n")

    try:
        import time
        while True:
            hp, hp_max = reader.get_self_hp()
            mp, mp_max = reader.get_self_mp()
            x, y, z    = reader.get_self_position()
            tid        = reader.get_target_id()
            thp        = reader.get_target_hp()
            tx, ty     = reader.get_target_position()

            print(f"\r HP: {hp}/{hp_max}  MP: {mp}/{mp_max}  "
                  f"Pos: ({x},{y})  Target: {tid} HP={thp} @({tx},{ty})   ",
                  end='', flush=True)
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nOprit.")
