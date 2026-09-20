"""
bot_engine.py v4.1 - Motor L2 RAM + State Machine

Stari:
  PAUZAT        -> Bot oprit
  SEARCH_TARGET -> target_next (cauta mob)
  VANATOARE     -> exploreaza harta (WASD) + target_next in mers
  FIGHT         -> rotatie skill-uri (FARA click-uri pe ecran)
  LOOT_DROP     -> pick up limitat, apoi inapoi la cautare
  RECOVERY      -> MP scazut
  EROARE        -> Eroare critica
"""

import time
import json
import os
import random
import threading
import logging
from datetime import datetime
from enum import Enum


MP_RECOVERY_PCT = 30


class State(Enum):
    PAUZAT        = "PAUZAT"
    SCAN_ZONE     = "Scanare zona"
    FIGHT         = "In lupta"
    LOOT_DROP     = "Culegere Drop"
    RECOVERY      = "Recuperare MP"
    EROARE        = "EROARE"


class BotEngine:
    def __init__(self, config_path: str, on_event=None):
        self.config_path = config_path
        self.on_event    = on_event
        self.config      = {}
        self.state       = State.PAUZAT
        self.hwnd        = None
        self.sender      = None
        self.mover       = None

        self._running        = False
        self._paused         = True
        self._thread         = None

        self._rotation_idx   = 0
        self._last_hp_pot_t  = 0
        self._last_mp_pot_t  = 0
        self._failed_targets = 0
        self._combat_had_target = False
        self._loot_done         = False
        self._fight_start_t     = 0.0
        self._patrol_idx        = 0
        self._walk_segments     = 0
        self._tracked_mob_id    = None
        self._locked_mob        = None
        self._basic_mode_active = False
        self._fight_opening_pending = False
        self._state_before_recovery = State.SCAN_ZONE

        # Cititor memorie RAM - singura sursa de adevar (fara pixeli)
        self.mem = None
        self._mem_available = False

        self.stats = {
            'kills':      0,
            'loots':      0,
            'potions_hp': 0,
            'potions_mp': 0,
            'hunts':      0,
            'start_time': None,
        }

        os.makedirs(os.path.join(os.path.dirname(config_path), "logs"), exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = os.path.join(os.path.dirname(config_path), "logs", f"session_{ts}.log")
        self._flog = logging.getLogger(f"Bot_{ts}")
        self._flog.setLevel(logging.DEBUG)
        fh = logging.FileHandler(log_file, encoding='utf-8')
        fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        self._flog.addHandler(fh)

    def _try_init_memory(self):
        """[FIX] Conectare RAM: porneste daca procesul e gasit, chiar daca offseturile trebuie calibrate."""
        mem_cfg = self.config.get('memory', {}) if self.config else {}
        proc = mem_cfg.get('process_name', 'l2.exe')
        try:
            from l2_memory import L2MemoryReader
            self.mem = L2MemoryReader(proc)
            if not self.mem.is_available():
                self.mem = L2MemoryReader("Lineage2.exe")
            self._mem_available = self.mem.is_available()
            if self._mem_available and not self.mem.has_valid_player_data():
                self._log(f"RAM conectat, dar date invalide: {self.mem.diagnose()}", "warning")
        except Exception as e:
            self._mem_available = False
            self.mem = None
            self._log(f"Eroare init RAM: {e}", "error")

    # -----------------------------------------------------------------------
    # API public
    # -----------------------------------------------------------------------
    def load_config(self):
        with open(self.config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)

    def reload_config(self):
        try:
            self.load_config()
            if self.mover:
                self.mover.config = self.config
            self._log("Configuratie reincarcata.")
        except Exception as e:
            self._log(f"Eroare reincarcae config: {e}", "error")

    def start(self):
        if self._thread and self._thread.is_alive():
            self._paused = False
            self._set_state(State.SCAN_ZONE)
            return
        self.load_config()
        self._running         = True
        self._paused          = False
        self.stats['start_time'] = time.time()
        self._failed_targets  = 0
        self._thread = threading.Thread(target=self._safe_loop, daemon=True, name="BotEngine")
        self._thread.start()

    def pause(self):
        self._paused = True
        if self.mover:
            self.mover.stop_movement()
        self._set_state(State.PAUZAT)
        self._log("Bot PAUZAT.")

    def resume(self):
        if not self._thread or not self._thread.is_alive():
            self.start()
            return
        self._paused = False
        self._set_state(State.SCAN_ZONE)
        self._log("Bot CONTINUAT.")

    def stop(self):
        self._running = False
        self._paused  = True
        if self.mover:
            self.mover.stop_movement()
        if self.sender:
            self.sender.close()
        self._set_state(State.PAUZAT)
        self._log("Bot OPRIT.")

    # -----------------------------------------------------------------------
    # Evenimente
    # -----------------------------------------------------------------------
    def _emit(self, event_type: str, **data):
        if self.on_event:
            try:
                self.on_event(event_type, data)
            except Exception:
                pass

    def _log(self, msg: str, level: str = "info"):
        self._emit('log', message=msg)
        getattr(self._flog, level, self._flog.info)(msg)

    def _set_state(self, s: State):
        self.state = s
        self._emit('state_change', state=s)

    def _emit_stats(self):
        elapsed = time.time() - (self.stats['start_time'] or time.time())
        kph = self.stats['kills'] / max(elapsed / 3600, 0.0001)
        self._emit('stats_update',
                   kills=self.stats['kills'],
                   loots=self.stats['loots'],
                   potions_hp=self.stats['potions_hp'],
                   potions_mp=self.stats['potions_mp'],
                   hunts=self.stats['hunts'],
                   elapsed=int(elapsed),
                   kph=round(kph, 1))

    # -----------------------------------------------------------------------
    # Timing randomizat anti-ban
    # -----------------------------------------------------------------------
    def _r(self, base_ms: float, var: float = 0.22) -> float:
        s = base_ms / 1000.0
        return max(0.04, s + random.uniform(-s * var, s * var))

    # -----------------------------------------------------------------------
    # Detectii RAM (fara pixeli, fara click-uri pe ecran)
    # -----------------------------------------------------------------------
    def _get_self_pos(self):
        if not self._mem_available or not self.mem:
            return None
        x, y, _ = self.mem.get_self_position()
        if x is None or y is None:
            return None
        return float(x), float(y)

    def _get_zone_cfg(self):
        return self.config.get('farm_zone', {})

    def _get_zone_bounds(self):
        z = self._get_zone_cfg()
        if z.get('x_min') is not None and z.get('x_max') is not None:
            return (z.get('x_min'), z.get('x_max'), z.get('y_min'), z.get('y_max'))
        cx = z.get('center_x', 0)
        cy = z.get('center_y', 0)
        r  = z.get('radius', 800)
        return (cx - r, cx + r, cy - r, cy + r)

    def _zone_enabled(self) -> bool:
        z = self._get_zone_cfg()
        if not z.get('enabled', False):
            return False
        if z.get('waypoints'):
            return True
        if z.get('center_x') is not None and z.get('radius'):
            return True
        return z.get('x_min') is not None and z.get('x_max') is not None

    def _in_zone(self, x, y) -> bool:
        if x is None or y is None:
            return True
        x_min, x_max, y_min, y_max = self._get_zone_bounds()
        return x_min <= x <= x_max and y_min <= y <= y_max

    def _target_in_zone(self) -> bool:
        if not self._mem_available or not self.mem:
            return True
        tx, ty = self.mem.get_target_position()
        if tx is None or ty is None:
            return True
        return self._in_zone(tx, ty)

    def _zone_waypoints(self):
        z = self._get_zone_cfg()
        wps = z.get('waypoints', [])
        if wps:
            return wps
        x_min, x_max, y_min, y_max = self._get_zone_bounds()
        cols = z.get('grid_cols', 3)
        rows = z.get('grid_rows', 3)
        pts = []
        cols = max(2, cols)
        rows = max(2, rows)
        for row in range(rows):
            cols_r = range(cols) if row % 2 == 0 else range(cols - 1, -1, -1)
            for col in cols_r:
                fx = col / (cols - 1)
                fy = row / (rows - 1)
                pts.append({
                    "x": x_min + (x_max - x_min) * fx,
                    "y": y_min + (y_max - y_min) * fy,
                })
        return pts

    def _probe_target_at_point(self, checks: int, acquire_ms: int,
                               trust_target_next: bool = False) -> bool:
        """target_next dupa un segment de mers."""
        for _ in range(max(1, checks)):
            if not self._running or self._paused:
                return False
            self._press('target_next')
            time.sleep(max(0.05, acquire_ms / 1000.0))
            if self._ram_target_ok() and self._target_in_zone():
                return True
        return False

    def _start_fight(self, reason: str):
        self._combat_had_target = False
        self._fight_start_t = time.time()
        self._log(reason)
        if self.mover:
            self.mover.stop_movement()
        use_direct = self.config.get('combat', {}).get('use_direct_input', True)
        if use_direct or self._basic_mode():
            self._fight_opening_pending = True
        self._set_state(State.FIGHT)

    def _log_skillbar_reminder(self):
        """Avertisment la pornire: F1-F12 = bara de jos in L2 Interlude."""
        self._log(
            "IMPORTANT: Pune skill-urile de atac pe F2,F3,F4 in BARA DE JOS (nu bara de sus)!",
            "warning")
        self._log("  F1 jos = Next Target | F2 jos = skill verde principal | F3/F4 = extra | F8 = Pick Up")
        setup_path = os.path.join(os.path.dirname(self.config_path), "SETUP_SKILLBAR.txt")
        if os.path.isfile(setup_path):
            self._log(f"  Detalii: {setup_path}")

    def _do_fight_opening(self, attack_ms, skill_ms, mode, rotation):
        """Dupa F1 (target), apasa imediat F2/skill principal la intrarea in lupta."""
        if not self._fight_opening_pending:
            return
        self._fight_opening_pending = False

        use_direct = self._basic_mode() or self.config.get('combat', {}).get('use_direct_input', True)
        if not use_direct:
            return

        target_key = self.config.get('keys', {}).get('target_next', 'f1')
        if target_key:
            self._press_skill_direct(target_key, log_skill=False)
            time.sleep(0.12)

        rot_keys = self._combat_rotation(rotation)
        if mode == 'rotation' and rot_keys:
            open_key = rot_keys[0]
        else:
            open_key = self.config.get('keys', {}).get('attack', 'f2')
        if not open_key:
            return

        self._log(f"Start lupta: {target_key or 'f1'} -> {open_key}")
        if self._basic_mode():
            self._press_direct_scancode(open_key)
        else:
            self._press_combat(open_key)
        time.sleep(self._r(skill_ms if mode == 'rotation' else attack_ms))
        if mode == 'rotation' and rot_keys:
            self._rotation_idx += 1

    def _ram_target_ok(self) -> bool:
        """True daca RAM confirma tinta (Target_ID / Target_HP)."""
        if not self._mem_available or not self.mem:
            return False
        tid = self.mem.get_target_id()
        if not tid:
            return False
        thp = self.mem.get_target_hp()
        if thp is not None:
            return thp > 0
        return True

    def _ram_usable(self) -> bool:
        if not self._mem_available or not self.mem:
            return False
        return self.mem.is_fully_calibrated()

    def _basic_mode(self) -> bool:
        return not self._ram_usable()

    def _combat_rotation(self, rotation) -> list:
        """Rotatie skill-uri fara F1 (target_next)."""
        target_key = self.config.get('keys', {}).get('target_next', 'f1').lower()
        skip = {target_key, 'f1', 'none', ''}
        keys = []
        for k in (rotation or []):
            kk = str(k).lower().strip()
            if kk and kk not in skip:
                keys.append(kk)
        if not keys:
            atk = self.config.get('keys', {}).get('attack', 'f2')
            keys = [atk.lower()] if atk else ['f2']
        return keys

    def _focus_l2(self) -> bool:
        """SetForegroundWindow pe fereastra L2 (AttachThreadInput daca e nevoie)."""
        if not self.hwnd:
            return False
        if self.mover:
            self.mover._focus()
            return True
        try:
            import win32gui
            import win32con
            import win32process
            import win32api
            if not win32gui.IsWindow(self.hwnd):
                return False
            if win32gui.IsIconic(self.hwnd):
                win32gui.ShowWindow(self.hwnd, win32con.SW_RESTORE)
            fg = win32gui.GetForegroundWindow()
            if fg != self.hwnd:
                try:
                    fg_tid = win32process.GetWindowThreadProcessId(fg)[0]
                    tgt_tid = win32process.GetWindowThreadProcessId(self.hwnd)[0]
                    if fg_tid != tgt_tid:
                        win32api.AttachThreadInput(fg_tid, tgt_tid, True)
                    win32gui.SetForegroundWindow(self.hwnd)
                    if fg_tid != tgt_tid:
                        win32api.AttachThreadInput(fg_tid, tgt_tid, False)
                except Exception:
                    win32gui.SetForegroundWindow(self.hwnd)
            time.sleep(0.12)
            return True
        except Exception:
            return False

    def _press_direct_scancode(self, key: str) -> bool:
        """Focus L2 + SendInput scancode (movement.SCAN); fallback keybd_event."""
        if not key:
            return False
        key = key.lower().strip()
        from movement import SCAN
        from movement import _send_scancode
        from input_sender import VK_CODES

        scan = SCAN.get(key)
        if not scan:
            return False

        hold_ms = self.config.get('timings', {}).get('key_press_duration_ms', 120)
        hold_s = max(0.08, hold_ms / 1000.0)

        self._focus_l2()
        time.sleep(0.04)

        try:
            _send_scancode(scan, key_up=False)
            time.sleep(hold_s)
            _send_scancode(scan, key_up=True)
            return True
        except Exception:
            pass

        try:
            import win32api
            vk = VK_CODES.get(key)
            if vk is None:
                return False
            win32api.keybd_event(vk, scan, 0, 0)
            time.sleep(hold_s)
            win32api.keybd_event(vk, scan, 0x0002, 0)
            return True
        except Exception:
            return False

    def _press_skill_direct(self, key: str, log_skill: bool = True):
        """Focus L2 + SendInput scancode - metoda sigura pentru skill-uri."""
        if not key:
            return
        key = key.lower().strip()
        sent = self._press_direct_scancode(key)
        if not sent and self.sender:
            self.sender.press_key(key)
        target_key = self.config.get('keys', {}).get('target_next', 'f1').lower()
        if log_skill and key not in (target_key, 'f1'):
            self._log(f"Apas {key}")

    def _press_combat(self, key: str):
        """Skill de lupta - direct input in mod basic sau cand RAM lipseste."""
        use_direct = self._basic_mode() or self.config.get('combat', {}).get('use_direct_input', True)
        if use_direct:
            self._press_skill_direct(key)
        elif self.sender:
            self.sender.press_key(key)
            target_key = self.config.get('keys', {}).get('target_next', 'f1').lower()
            if key.lower().strip() not in (target_key, 'f1'):
                self._log(f"Skill: {key.lower().strip()}")

    def _press(self, config_key: str):
        key = self.config.get('keys', {}).get(config_key, '')
        if not key:
            return
        if config_key == 'target_next':
            self._press_skill_direct(key, log_skill=False)
        elif self.sender:
            self.sender.press_key(key)

    def _press_raw(self, key: str):
        if key:
            self._press_combat(key)

    def _get_mob_cfg(self):
        return self.config.get('target_mobs', {})

    def _mob_filter_enabled(self) -> bool:
        m = self._get_mob_cfg()
        if not m.get('enabled', False):
            return False
        names = m.get('names', [])
        return bool(names and any(str(n).strip() for n in names))

    def _mob_names(self) -> list:
        return [str(n).strip() for n in self._get_mob_cfg().get('names', []) if str(n).strip()]

    def _name_matches_mob(self, name: str) -> bool:
        if not name:
            return False
        low = name.lower()
        return any(w.lower() in low for w in self._mob_names())

    def _stick_until_kill(self) -> bool:
        return bool(self._get_mob_cfg().get('stick_until_kill', True))

    def _lock_mob(self, mob: dict):
        nm = mob.get('name') or ''
        pattern = nm
        for p in self._mob_names():
            if p.lower() in nm.lower():
                pattern = p
                break
        self._locked_mob = {'id': mob.get('id'), 'name': nm, 'pattern': pattern}
        self._tracked_mob_id = mob.get('id')
        label = nm or pattern or '?'
        self._log(f"Tintit: {label} (ID {mob.get('id')}) - il urmaresc pana moare")

    def _unlock_mob(self):
        if self._locked_mob:
            self._log(f"Gata cu {self._locked_mob.get('name') or 'mob'} - caut urmatorul")
        self._locked_mob = None
        self._tracked_mob_id = None

    def _name_matches_locked(self, name: str) -> bool:
        if not name:
            return False
        if not self._locked_mob:
            return self._name_matches_mob(name)
        lock_name = (self._locked_mob.get('name') or '').lower()
        if lock_name and name.lower() == lock_name:
            return True
        pattern = (self._locked_mob.get('pattern') or '').lower()
        return pattern in name.lower() if pattern else False

    def _find_target_mob(self):
        if not self._mem_available or not self.mem:
            return None
        m = self._get_mob_cfg()
        max_dist = float(m.get('max_search_distance', 2500))
        zone = self._get_zone_bounds()

        if self._locked_mob and self._stick_until_kill():
            found = self.mem.find_mob_by_id(self._locked_mob['id'], max_dist)
            if found:
                if zone:
                    x_min, x_max, y_min, y_max = zone
                    if not (x_min <= found['x'] <= x_max and y_min <= found['y'] <= y_max):
                        return None
                return found
            return None

        return self.mem.find_mobs_by_names(self._mob_names(), max_dist, zone)

    def _target_is_wanted_mob(self) -> bool:
        if not self._ram_target_ok():
            return False
        if not self._mob_filter_enabled():
            return self._target_in_zone()

        tid = self.mem.get_target_id()
        tname = self.mem.get_target_name() if self.mem else None

        if self._locked_mob and self._stick_until_kill():
            if tid and tid == self._locked_mob.get('id'):
                return self._target_in_zone()
            if tname and self._name_matches_locked(tname):
                return self._target_in_zone()
            return False

        if tname and self._name_matches_mob(tname):
            return self._target_in_zone()
        if self._tracked_mob_id and tid == self._tracked_mob_id:
            return self._target_in_zone()
        return False

    def _acquire_named_mob(self, mob: dict, acquire_ms: int) -> bool:
        max_cycles = int(self._get_mob_cfg().get('max_target_cycles', 25))
        want_id = mob.get('id')
        if not self._locked_mob and self._stick_until_kill():
            self._lock_mob(mob)
        elif not self._locked_mob:
            self._tracked_mob_id = want_id
        want_id = self._locked_mob['id'] if self._locked_mob else want_id

        for _ in range(max(1, max_cycles)):
            if not self._running or self._paused:
                return False
            if self._ram_target_ok():
                tid = self.mem.get_target_id()
                tname = self.mem.get_target_name()
                if tid == want_id:
                    return True
                if self._locked_mob and tname and self._name_matches_locked(tname):
                    return True
                if not self._locked_mob and tname and self._name_matches_mob(tname):
                    return True
            self._press('target_next')
            time.sleep(max(0.08, acquire_ms / 1000.0))
        return self._target_is_wanted_mob()

    def _has_valid_target(self) -> bool:
        return self._ram_target_ok() and self._target_in_zone()

    def _is_target_dead(self) -> bool:
        """[FIX] Mort = Target_HP==0 SAU am avut tinta si Target_ID a devenit 0."""
        if not self._mem_available or not self.mem:
            return False
        thp = self.mem.get_target_hp()
        if thp is not None:
            return thp <= 0
        tid = self.mem.get_target_id()
        return self._combat_had_target and not tid

    def _emit_memory_status(self):
        """[MODIFICAT] Trimite status RAM catre GUI (inlocuieste pixel_update)."""
        if not self._mem_available or not self.mem:
            return
        tid = self.mem.get_target_id() or 0
        thp = self.mem.get_target_hp()
        has = self._ram_target_ok()
        dist = self.mem.get_distance_to_target() if self.mem else None
        tname = self.mem.get_target_name() if self.mem else None
        self._emit('memory_update',
                   target_id=tid,
                   target_hp=thp if thp is not None else -1,
                   has_target=has,
                   distance=round(dist, 0) if dist is not None else None,
                   target_name=tname or '')

    def _hunt_probe_ram(self, acquire_delay_ms: int, trust_target_next: bool = False) -> bool:
        """In mers: target_next + verificare RAM (sau trust_target_next)."""
        self._press('target_next')
        deadline = time.time() + max(0.05, acquire_delay_ms / 1000.0)
        while time.time() < deadline:
            if not self._running or self._paused:
                return False
            time.sleep(0.05)
            if self._ram_target_ok():
                return True
        if trust_target_next:
            return True
        return self._ram_target_ok()

    def _check_self_hp(self) -> bool:
        """True = HP ok. Citire exclusiv din RAM (doar daca datele sunt valide)."""
        if not self._mem_available or not self.mem:
            return True
        if not self.mem.has_valid_player_data():
            return True
        try:
            pct = self.mem.self_hp_percent()
            if pct is not None:
                threshold = self.config.get('safety', {}).get('hp_threshold_pct', 40)
                return pct * 100 >= threshold
        except Exception:
            pass
        return True

    def _check_self_mp(self) -> bool:
        """True = MP ok. Citire exclusiv din RAM (doar daca datele sunt valide)."""
        if not self._mem_available or not self.mem:
            return True
        if not self.mem.has_valid_player_data():
            return True
        try:
            pct = self.mem.self_mp_percent()
            if pct is not None:
                threshold = self.config.get('safety', {}).get('mp_threshold_pct', MP_RECOVERY_PCT)
                return pct * 100 >= threshold
        except Exception:
            pass
        return True

    def _needs_recovery(self) -> bool:
        """MP sub prag -> RECOVERY (doar cu date RAM valide)."""
        if not self._mem_available or not self.mem:
            return False
        if not self.mem.has_valid_player_data():
            return False
        pct = self.mem.self_mp_percent()
        if pct is None:
            return False
        threshold = self.config.get('safety', {}).get('mp_recovery_pct', MP_RECOVERY_PCT)
        return pct * 100 < threshold

    # -----------------------------------------------------------------------
    # Actiuni pe stari
    # -----------------------------------------------------------------------
    def _do_scan_zone(self, acquire_ms, trust_target_next):
        """Patrula zona: cauta mob dupa nume (RAM) sau mod basic (F1 + skill-uri)."""
        if not self._zone_enabled():
            self._log("Zona neconfigurata! Ruleaza calibrate_zone.bat", "error")
            self._set_state(State.EROARE)
            return

        if not self.mover:
            return

        if self._basic_mode():
            self._do_scan_zone_basic(acquire_ms)
            return

        active = lambda: self._running and not self._paused
        mob_cfg = self._get_mob_cfg()

        if self._mob_filter_enabled() and self._mem_available and self.mem:
            mob = self._find_target_mob()
            if mob:
                if not self._locked_mob and self._stick_until_kill():
                    self._lock_mob(mob)
                dist = mob['distance']
                approach = float(mob_cfg.get('approach_distance', 400))
                attack = float(mob_cfg.get('attack_distance', 200))
                label = mob.get('name') or (self._locked_mob or {}).get('pattern') or self._mob_names()[0]
                self._log(f"{label} la {dist:.0f} (apropiere<{approach:.0f}, atac<{attack:.0f})")

                if dist > approach:
                    self.mover.walk_segment(active, min(2.5, dist / 500.0))
                    return
                if dist > attack:
                    self.mover.walk_segment(active, 1.0)
                    return
                if self._acquire_named_mob(mob, acquire_ms):
                    self._start_fight(f"Atac {label} ({dist:.0f})")
                    return
                self._log(f"Nu am putut selecta {label} - continui...")
            elif self._locked_mob and self._stick_until_kill():
                self._log(f"Re-caut {self._locked_mob.get('name') or 'mobul tintit'}...")
            else:
                names = ', '.join(self._mob_names())
                self._log(f"Caut in lista: {names}")

        def _check_fn():
            self._press('target_next')
            time.sleep(max(0.04, acquire_ms / 1000.0))
            if self._mob_filter_enabled():
                return self._target_is_wanted_mob()
            if not self._ram_target_ok():
                return False
            if not self._mem_available:
                return True
            return self._target_in_zone()

        self.stats['hunts'] += 1
        found = self.mover.hunt(_check_fn, active)

        if found and (self._mob_filter_enabled() and self._stick_until_kill()
                and not self._locked_mob and self.mem):
            tid = self.mem.get_target_id()
            tname = self.mem.get_target_name() or ''
            if tid:
                self._lock_mob({'id': tid, 'name': tname})

        if found:
            self._start_fight("Mob gasit! Atac...")
        else:
            self._start_fight("Dupa patrula: rotatie skill-uri...")
        return

    def _do_scan_zone_basic(self, acquire_ms):
        """Fara RAM: merge, F1 de mai multe ori, apoi skill-uri."""
        active = lambda: self._running and not self._paused
        if self._mob_filter_enabled() and not getattr(self, '_basic_list_logged', False):
            self._log(
                f"MOD BASIC - lista: {', '.join(self._mob_names())}. "
                "F1 selecteaza mobi. Ruleaza find_offsets.bat pentru auto.")
            self._basic_list_logged = True

        self.stats['hunts'] += 1
        self.mover.hunt(lambda: False, active)

        if self.mover:
            self.mover._focus()
        for _ in range(5):
            if not self._running or self._paused:
                return
            self._press('target_next')
            time.sleep(max(0.1, acquire_ms / 1000.0))

        self._start_fight("MOD BASIC: rotatie skill-uri...")

    def _blind_attack_due(self) -> bool:
        """In trust mode: atac dupa fiecare segment de mers."""
        self._walk_segments += 1
        return True

    def _do_fight(self, attack_ms, skill_ms, mode, rotation, use_spoil,
                  max_fight_s, trust_target_next):
        """Skill-uri - RAM sau mod basic (fara verificare tinta)."""
        self._do_fight_opening(attack_ms, skill_ms, mode, rotation)
        if self._basic_mode():
            self._do_fight_basic(attack_ms, skill_ms, mode, rotation, use_spoil, max_fight_s)
            return

        ram_ok = self._target_is_wanted_mob() if self._mob_filter_enabled() else (
            self._ram_target_ok() and self._target_in_zone())

        if ram_ok:
            self._combat_had_target = True
            dist = self.mem.get_distance_to_target() if self.mem else None
            if dist is not None and dist > float(self._get_mob_cfg().get('attack_distance', 200)):
                self._log(f"Prea departe ({dist:.0f}) - ma apropii...")
                if self.mover:
                    self.mover.walk_segment(lambda: self._running and not self._paused, 1.0)
                return

        if not ram_ok:
            if time.time() - self._fight_start_t > max_fight_s:
                self.stats['kills'] += 1
                self._loot_done = False
                self._log(f"Kill #{self.stats['kills']}. Culeg drop...")
                self._set_state(State.LOOT_DROP)
                return
            # TargetID=0 (Elmorlab) - atacam oricum, nu oprim lupta

        if ram_ok and not (self._target_is_wanted_mob() if self._mob_filter_enabled()
                           else (self._ram_target_ok() and self._target_in_zone())):
            if self._is_target_dead():
                self.stats['kills'] += 1
                self._combat_had_target = False
                self._loot_done = False
                self._log(f"Kill #{self.stats['kills']}! Culeg drop...")
                self._set_state(State.LOOT_DROP)
            else:
                self._combat_had_target = False
                self._set_state(State.SCAN_ZONE)
            return

        if use_spoil:
            self._press_combat(self.config.get('keys', {}).get('spoil_key', 'f9'))
            time.sleep(self._r(skill_ms))

        rot_keys = self._combat_rotation(rotation)
        if mode == 'rotation' and rot_keys:
            key = rot_keys[self._rotation_idx % len(rot_keys)]
            self._rotation_idx += 1
            self._press_combat(key)
            time.sleep(self._r(skill_ms))
        else:
            self._press_combat(self.config.get('keys', {}).get('attack', 'f2'))
            time.sleep(self._r(attack_ms))

    def _do_fight_basic(self, attack_ms, skill_ms, mode, rotation, use_spoil, max_fight_s):
        """Fara RAM: focus L2 + rotatie skill-uri directe, apoi loot."""
        if time.time() - self._fight_start_t > max_fight_s:
            self.stats['kills'] += 1
            self._loot_done = False
            self._log(f"MOD BASIC kill #{self.stats['kills']}. Culeg drop...")
            self._set_state(State.LOOT_DROP)
            return

        if use_spoil:
            spoil_key = self.config.get('keys', {}).get('spoil_key', 'f9')
            self._log(f"Apas {spoil_key}")
            self._press_direct_scancode(spoil_key)
            time.sleep(self._r(skill_ms))

        rot_keys = self._combat_rotation(rotation)
        if mode == 'rotation' and rot_keys:
            key = rot_keys[self._rotation_idx % len(rot_keys)]
            self._rotation_idx += 1
            self._log(f"Apas {key}")
            self._press_direct_scancode(key)
            time.sleep(self._r(skill_ms))
        else:
            atk = self.config.get('keys', {}).get('attack', 'f2')
            self._log(f"Apas {atk}")
            self._press_direct_scancode(atk)
            time.sleep(self._r(attack_ms))

    def _do_loot_drop(self, loot_n, loot_ms, use_sweep, death_ms):
        """Loot limitat dupa kill, apoi inapoi la scanare."""
        if self._loot_done:
            self._unlock_mob()
            self._set_state(State.SCAN_ZONE)
            return

        if self.mover:
            self.mover.stop_movement()

        time.sleep(self._r(death_ms))

        if use_sweep:
            sweep_key = self.config.get('keys', {}).get('sweep', 'f8')
            self._log(f"Apas {sweep_key}")
            self._press_direct_scancode(sweep_key)
            time.sleep(self._r(loot_ms))

        loot_extra = int(self.config.get('target_mobs', {}).get('loot_presses', loot_n))
        pick_key = self.config.get('keys', {}).get('pick_up', 'f5')
        for _ in range(max(loot_n, loot_extra)):
            self._log(f"Apas {pick_key}")
            self._press_direct_scancode(pick_key)
            time.sleep(self._r(loot_ms))

        self.stats['loots'] += 1
        self._loot_done = True
        self._unlock_mob()
        self._log("Loot gata. Rescan zona...")
        self._set_state(State.SCAN_ZONE)

    def _do_recovery(self, mp_cd):
        """[MODIFICAT] RECOVERY: aseaza / potiune MP / skill recharge cand MP < 30%."""
        recovery = self.config.get('recovery', {})
        sit_key  = recovery.get('sit_key', '')
        recharge = recovery.get('recharge_key', '')

        if sit_key:
            self._log("MP scazut! Ma asez pentru recuperare...")
            self._press_raw(sit_key)
            time.sleep(self._r(recovery.get('sit_duration_ms', 4000)))
            self._press_raw(sit_key)
        elif recharge:
            self._log("MP scazut! Skill recharge...")
            self._press_raw(recharge)
            time.sleep(self._r(recovery.get('recharge_delay_ms', 600)))
        else:
            now = time.time()
            if now - self._last_mp_pot_t > mp_cd:
                self._press('potion_mp')
                self._last_mp_pot_t = now
                self.stats['potions_mp'] += 1
                self._log("MP scazut! Potiune MP folosita.")

        if self._check_self_mp():
            self._log("MP recuperat. Reiau activitatea.")
            self._set_state(self._state_before_recovery)

    # -----------------------------------------------------------------------
    # Bucla principala (protejata)
    # -----------------------------------------------------------------------
    def _safe_loop(self):
        try:
            self._loop()
        except Exception as e:
            self._running = False
            self._paused = True
            if self.mover:
                self.mover.stop_movement()
            self._log(f"EROARE CRITICA in bot: {e}", "error")
            self._set_state(State.EROARE)

    def _loop(self):
        import win32gui
        from input_sender import create_sender
        from movement import MovementController

        self.hwnd = self._find_l2_window()
        if not self.hwnd:
            self._log("Fereastra Lineage II nu a fost gasita.", "error")
            self._running = False
            self._paused = True
            self._set_state(State.EROARE)
            return

        self.sender = create_sender(self.config, self.hwnd)
        self.mover  = MovementController(self.hwnd, self.config)
        self.config.setdefault('hunting', {})['movement_method'] = 'mouse'
        self.mover.config = self.config

        mem_cfg = self.config.get('memory', {})
        require_ram = mem_cfg.get('required', False)
        self._try_init_memory()
        if not self._mem_available:
            if require_ram:
                err = self.mem.error_message() if self.mem else "L2MemoryReader indisponibil"
                self._log(
                    f"Citire RAM esuata: {err}. "
                    "Porneste L2, ruleaza botul ca Administrator.", "error")
                self._running = False
                self._paused = True
                self._set_state(State.EROARE)
                return
            self._log("RAM indisponibil - pornesc MOD BASIC.", "warning")
        else:
            self._log(self.mem.diagnose())
            if not self.mem.has_valid_player_data():
                self._log(
                    "RAM necalibrat (Ptr=NEGASIT). MOD BASIC: merge + F1 + skill-uri. "
                    "Ruleaza find_offsets.bat ca Administrator.", "warning")

        self._basic_mode_active = not self._ram_usable()
        if self._basic_mode_active:
            self.config['input_method'] = 'foreground'
            self.config['input_keep_focus'] = True
            self.config.setdefault('combat', {})['use_direct_input'] = True
            self.sender = create_sender(self.config, self.hwnd)
            self._log("MOD BASIC: F1 + skill-uri directe (SendInput scancode)")
        elif self.mem:
            x, y, z = self.mem.get_self_position()
            if x is not None and y is not None:
                self._log(f"RAM OK! Pozitie: ({x:.0f}, {y:.0f}, {z:.0f})")

        self._log(f"Fereastra L2 gasita (HWND={self.hwnd}). START FARM!")
        self._log_skillbar_reminder()
        self._log(f"Miscare: mouse")
        if self._mob_filter_enabled():
            self._log(f"Lista mobi: {', '.join(self._mob_names())}")

        tmg    = self.config.get('timings', {})
        combat = self.config.get('combat',  {})
        hunt   = self.config.get('hunting', {})

        attack_ms    = tmg.get('attack_delay_ms', 600)
        skill_ms     = tmg.get('skill_delay_ms', 400)
        target_ms    = tmg.get('target_search_delay_ms', 900)
        loot_n       = tmg.get('loot_count', 3)
        loot_ms      = tmg.get('loot_delay_ms', 350)
        death_ms     = tmg.get('mob_death_wait_ms', 800)
        loop_ms      = tmg.get('loop_delay_ms', 80)
        hp_cd        = tmg.get('hp_potion_cooldown_ms', 5000) / 1000.0
        mp_cd        = tmg.get('mp_potion_cooldown_ms', 8000) / 1000.0

        use_spoil    = combat.get('use_spoil', False)
        use_sweep    = combat.get('use_sweep', False)
        mode         = combat.get('mode', 'rotation')
        rotation     = combat.get('rotation', ['f2', 'f3', 'f4'])
        acquire_ms   = hunt.get('target_acquire_delay_ms', 220)
        trust_target = combat.get('trust_target_next', True)
        max_fight_s  = combat.get('max_fight_seconds', 20)

        if not self._zone_enabled():
            self._log(
                "ZONA DE FARM neconfigurata! Ruleaza calibrate_zone.bat "
                "si defineste portiunea de harta.", "error")
            self._running = False
            self._paused = True
            self._set_state(State.EROARE)
            return

        z = self._get_zone_cfg()
        n_wp = len(z.get('waypoints', []))
        self._log(
            f"Zona activa: X[{z.get('x_min')}..{z.get('x_max')}] "
            f"Y[{z.get('y_min')}..{z.get('y_max')}] - {n_wp} puncte patrula")

        self._set_state(State.SCAN_ZONE)
        stats_t = time.time()

        while self._running:
            if self._paused:
                time.sleep(0.15)
                continue

            if self.hwnd and not win32gui.IsWindow(self.hwnd):
                self.hwnd = self._find_l2_window()
                if self.hwnd:
                    self.sender = create_sender(self.config, self.hwnd)
                    self.mover.hwnd = self.hwnd
                else:
                    self._log("Fereastra L2 s-a inchis! Pauzez botul.")
                    self.pause()
                    continue

            now = time.time()
            if now - stats_t > 2.0:
                self._emit_stats()
                self._emit_memory_status()
                stats_t = now

            if not self._check_self_hp():
                if now - self._last_hp_pot_t > hp_cd:
                    self._press('potion_hp')
                    self._last_hp_pot_t = now
                    self.stats['potions_hp'] += 1
                    self._log("HP SCAZUT! Potiune HP folosita.")
                    time.sleep(0.3)

            if self._needs_recovery() and self.state != State.RECOVERY:
                self._state_before_recovery = self.state
                if self.mover:
                    self.mover.stop_movement()
                self._set_state(State.RECOVERY)

            if self.state == State.SCAN_ZONE:
                self._do_scan_zone(acquire_ms, trust_target)

            elif self.state == State.FIGHT:
                self._do_fight(attack_ms, skill_ms, mode, rotation, use_spoil,
                               max_fight_s, trust_target)

            elif self.state == State.LOOT_DROP:
                self._do_loot_drop(loot_n, loot_ms, use_sweep, death_ms)

            elif self.state == State.RECOVERY:
                self._do_recovery(mp_cd)

            if self.state not in (State.SCAN_ZONE, State.LOOT_DROP):
                time.sleep(self._r(loop_ms, var=0.3))

        if self.mover:
            self.mover.stop_movement()
        self._log("Thread bot terminat.")

    # -----------------------------------------------------------------------
    # Utilitare
    # -----------------------------------------------------------------------
    def _find_l2_window(self):
        import win32gui
        titles = self.config.get('window_titles')
        if not titles:
            titles = [self.config.get('window_title', 'Lineage II')]
        found = []

        def cb(hwnd, _):
            if not win32gui.IsWindowVisible(hwnd):
                return
            t = win32gui.GetWindowText(hwnd)
            for title in titles:
                if title.lower() in t.lower():
                    found.append(hwnd)
                    break

        win32gui.EnumWindows(cb, None)
        return found[0] if found else None
