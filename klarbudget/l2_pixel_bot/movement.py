"""
movement.py v3 - Miscare L2 prin LEFT-CLICK pe teren

In L2 Interlude:
  - LEFT-CLICK pe teren  = personajul merge acolo (CORECT)
  - RIGHT-CLICK          = rotire camera (gresit, de aceea camera se rotea)
  - WASD/Numpad          = miscare directa, dar problematic cu chat-ul

Aceasta versiune foloseste LEFT-CLICK pe teren ca metoda principala.
"""

import ctypes
import ctypes.wintypes
import time
import random

# ---------------------------------------------------------------------------
# SendInput keyboard structures
# ---------------------------------------------------------------------------
INPUT_KEYBOARD     = 1
KEYEVENTF_KEYUP    = 0x0002
KEYEVENTF_SCANCODE = 0x0008

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk",         ctypes.wintypes.WORD),
        ("wScan",       ctypes.wintypes.WORD),
        ("dwFlags",     ctypes.wintypes.DWORD),
        ("time",        ctypes.wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.wintypes.ULONG)),
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT)]

class INPUT(ctypes.Structure):
    _anonymous_ = ["_input"]
    _fields_ = [
        ("type",   ctypes.wintypes.DWORD),
        ("_input", _INPUT_UNION),
    ]

_user32 = ctypes.windll.user32

# Mouse event flags
MOUSEEVENTF_MOVE      = 0x0001
MOUSEEVENTF_LEFTDOWN  = 0x0002   # <-- LEFT click pentru miscare!
MOUSEEVENTF_LEFTUP    = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP   = 0x0010
MOUSEEVENTF_ABSOLUTE  = 0x8000

# Scan codes PS/2
SCAN = {
    'w': 0x11, 'a': 0x1E, 's': 0x1F, 'd': 0x20,
    'esc': 0x01, 'enter': 0x1C, 'space': 0x39,
    'f1': 0x3B, 'f2': 0x3C, 'f3': 0x3D, 'f4': 0x3E,
    'f5': 0x3F, 'f6': 0x40, 'f7': 0x41, 'f8': 0x42,
    'f9': 0x43, 'f10': 0x44, 'f11': 0x57, 'f12': 0x58,
    '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05,
    '5': 0x06, '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0A,
    'q': 0x10, 'e': 0x12, 'r': 0x13, 't': 0x14,
    'g': 0x22, 'z': 0x2C, 'x': 0x2D, 'c': 0x2E,
}


def _send_scancode(scan: int, key_up: bool = False):
    flags = KEYEVENTF_SCANCODE | (KEYEVENTF_KEYUP if key_up else 0)
    inp = INPUT(type=INPUT_KEYBOARD)
    inp.ki.wScan   = scan
    inp.ki.dwFlags = flags
    _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))


# ---------------------------------------------------------------------------
class MovementController:
    def __init__(self, hwnd, config: dict):
        self.hwnd   = hwnd
        self.config = config
        self._walks = 0

    def _focus(self):
        """Aduce L2 in prim-plan (necesar pentru WASD / click pe teren)."""
        try:
            import win32gui
            import win32con
            import win32process
            import win32api
            if not self.hwnd or not win32gui.IsWindow(self.hwnd):
                return
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
            time.sleep(0.14)
        except Exception:
            pass

    def press_key(self, key: str, hold_s: float = 0.12):
        """Apasa o tasta in L2 prin SendInput scancode (functioneaza cu focus)."""
        sc = SCAN.get(key.lower())
        if not sc:
            return False
        self._focus()
        time.sleep(0.04)
        _send_scancode(sc, key_up=False)
        time.sleep(max(0.08, hold_s))
        _send_scancode(sc, key_up=True)
        return True

    def _get_client_rect(self):
        try:
            import win32gui
            if self.hwnd and win32gui.IsWindow(self.hwnd):
                return win32gui.GetClientRect(self.hwnd)
        except Exception:
            pass
        return None

    def _client_size(self):
        r = self._get_client_rect()
        if r:
            return (r[2] - r[0], r[3] - r[1])
        return (1280, 720)

    def _client_center(self):
        w, h = self._client_size()
        return (w // 2, h // 2)

    def _get_rect(self):
        try:
            import win32gui
            if self.hwnd and win32gui.IsWindow(self.hwnd):
                return win32gui.GetWindowRect(self.hwnd)
        except Exception:
            pass
        return None

    def _window_center(self):
        cx, cy = self._client_center()
        try:
            import win32gui
            if self.hwnd:
                return win32gui.ClientToScreen(self.hwnd, (cx, cy))
        except Exception:
            pass
        return (_user32.GetSystemMetrics(0) // 2, _user32.GetSystemMetrics(1) // 2)

    def _window_size(self):
        return self._client_size()

    # -----------------------------------------------------------------------
    # Click pe teren - PostMessage (fara focus) sau mouse fizic (fallback)
    # -----------------------------------------------------------------------
    def _click_client(self, client_x: int, client_y: int):
        """Left-click in zona de joc L2 prin PostMessage - nu necesita focus."""
        try:
            import win32api
            WM_LBUTTONDOWN = 0x0201
            WM_LBUTTONUP   = 0x0202
            MK_LBUTTON     = 0x0001
            lparam = win32api.MAKELONG(int(client_x), int(client_y))
            try:
                win32api.SendMessage(self.hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
                time.sleep(0.025)
                win32api.SendMessage(self.hwnd, WM_LBUTTONUP, 0, lparam)
            except Exception:
                win32api.PostMessage(self.hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
                time.sleep(0.025)
                win32api.PostMessage(self.hwnd, WM_LBUTTONUP, 0, lparam)
            return True
        except Exception:
            return False

    def _left_click_at(self, x: int, y: int):
        """Left-click la coordonate ecran (fallback)."""
        try:
            import win32api, win32con
            win32api.SetCursorPos((int(x), int(y)))
            time.sleep(0.03)
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, int(x), int(y), 0, 0)
            time.sleep(0.025)
            win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, int(x), int(y), 0, 0)
        except Exception:
            pass

    def _click_forward(self, turn_x: int = 0, use_screen: bool = False):
        """Click pe solul din fata personajului."""
        cx, cy = self._client_center()
        _, h   = self._client_size()
        ground_y = cy + int(h * 0.22) + random.randint(-15, 15)
        target_x = cx + turn_x + random.randint(-8, 8)
        if use_screen:
            sx, sy = self._window_center()
            self._left_click_at(sx + turn_x, sy + int(h * 0.22))
        elif not self._click_client(target_x, ground_y):
            sx, sy = self._window_center()
            self._left_click_at(sx + turn_x, sy + int(h * 0.22))

    def _click_turn_right(self, use_screen: bool = False):
        w = self._client_size()[0]
        self._click_forward(turn_x=int(w * 0.28), use_screen=use_screen)

    def _click_turn_left(self, use_screen: bool = False):
        w = self._client_size()[0]
        self._click_forward(turn_x=-int(w * 0.28), use_screen=use_screen)

    # -----------------------------------------------------------------------
    # Keyboard fallback (Escape prefix pentru chat)
    # -----------------------------------------------------------------------
    def _press_escape(self):
        sc = SCAN.get('esc', 0x01)
        _send_scancode(sc, key_up=False)
        time.sleep(0.04)
        _send_scancode(sc, key_up=True)
        time.sleep(0.1)

    def key_down(self, key: str):
        sc = SCAN.get(key.lower())
        if sc:
            _send_scancode(sc, key_up=False)

    def key_up(self, key: str):
        sc = SCAN.get(key.lower())
        if sc:
            _send_scancode(sc, key_up=True)

    def hold_key(self, key: str, duration_s: float):
        self._press_escape()
        self.key_down(key)
        time.sleep(duration_s)
        self.key_up(key)

    def stop_movement(self):
        for k in ['w', 'a', 's', 'd']:
            sc = SCAN.get(k)
            if sc:
                _send_scancode(sc, key_up=True)

    # -----------------------------------------------------------------------
    # Vanatoare (hunt cycle)
    # -----------------------------------------------------------------------
    def hunt(self, check_target_fn, is_active_fn) -> bool:
        h      = self.config.get('hunting', {})
        method = h.get('movement_method', 'mouse')
        if method == 'keyboard':
            return self._hunt_keyboard(check_target_fn, is_active_fn, h)
        if method == 'mouse':
            return self._hunt_mouse_physical(check_target_fn, is_active_fn, h)
        return self._hunt_postmessage(check_target_fn, is_active_fn, h)

    def _hunt_postmessage(self, check_target_fn, is_active_fn, h) -> bool:
        """Miscare prin click PostMessage - functioneaza fara focus pe L2."""
        walk_ms     = h.get('walk_time_ms', 3500)
        check_ms    = h.get('check_target_interval_ms', 250) / 1000.0
        turn_delay  = h.get('turn_time_ms', 450) / 1000.0
        return_home = h.get('return_home_after_walks', 8)
        click_every = 0.7

        start      = time.time()
        last_click = 0.0
        found      = False

        while time.time() - start < walk_ms / 1000.0:
            if not is_active_fn():
                return False

            now = time.time()
            if now - last_click >= click_every:
                self._click_forward()
                last_click = now

            time.sleep(check_ms)
            if check_target_fn():
                found = True
                break

        if found:
            self._walks = 0
            return True

        self._walks += 1
        if self._walks % return_home == 0:
            for _ in range(4):
                self._click_turn_right()
                time.sleep(0.35)
            self._walks = 0
        else:
            if random.random() > 0.5:
                self._click_turn_right()
            else:
                self._click_turn_left()
            time.sleep(turn_delay)
        return False

    def _hunt_mouse_physical(self, check_target_fn, is_active_fn, h) -> bool:
        """
        Vanatoare prin LEFT-CLICK fizic pe ecran (necesita focus L2).
        """
        walk_ms     = h.get('walk_time_ms', 3500)
        check_ms    = h.get('check_target_interval_ms', 250) / 1000.0
        turn_delay  = h.get('turn_time_ms', 450) / 1000.0
        return_home = h.get('return_home_after_walks', 8)
        click_every = 0.8

        self._focus()

        start      = time.time()
        last_click = 0.0
        found      = False

        while time.time() - start < walk_ms / 1000.0:
            if not is_active_fn():
                return False

            now = time.time()
            if now - last_click >= click_every:
                self._click_forward(use_screen=True)
                last_click = now

            time.sleep(check_ms)

            if check_target_fn():
                found = True
                break

        if found:
            self._walks = 0
            return True

        self._walks += 1

        if self._walks % return_home == 0:
            for _ in range(5):
                self._click_turn_right(use_screen=True)
                time.sleep(0.45)
            self._walks = 0
        else:
            if random.random() > 0.5:
                self._click_turn_right(use_screen=True)
            else:
                self._click_turn_left(use_screen=True)
            time.sleep(turn_delay)

        return False

    def walk_segment(self, is_active_fn, duration_s: float = 1.5):
        """Mers scurt inainte (mouse fizic) - pentru apropiere de mob."""
        if not is_active_fn():
            return
        self._focus()
        start = time.time()
        click_every = 0.65
        last_click = 0.0
        while time.time() - start < max(0.4, duration_s):
            if not is_active_fn():
                return
            now = time.time()
            if now - last_click >= click_every:
                self._click_forward(use_screen=True)
                last_click = now
            time.sleep(0.12)

    def _hunt_keyboard(self, check_target_fn, is_active_fn, h) -> bool:
        walk_ms    = h.get('walk_time_ms', 2200)
        check_ms   = h.get('check_target_interval_ms', 350) / 1000.0
        turn_ms    = h.get('turn_time_ms', 550) / 1000.0
        return_home = h.get('return_home_after_walks', 8)
        walk_key   = h.get('walk_key', 'w')
        left_key   = h.get('turn_left_key', 'a')
        right_key  = h.get('turn_right_key', 'd')

        self._focus()
        self._press_escape()

        self.key_down(walk_key)
        start = time.time()
        found = False

        while time.time() - start < walk_ms / 1000.0:
            if not is_active_fn():
                self.key_up(walk_key)
                return False
            time.sleep(check_ms)
            if check_target_fn():
                found = True
                break

        self.key_up(walk_key)

        if found:
            self.stop_movement()
            self._walks = 0
            return True

        self._walks += 1

        if self._walks % return_home == 0:
            self._press_escape()
            self.key_down(right_key)
            time.sleep(turn_ms * 3)
            self.key_up(right_key)
            self._walks = 0
        else:
            turn_key = right_key if random.random() > 0.5 else left_key
            self._press_escape()
            self.key_down(turn_key)
            time.sleep(turn_ms * random.uniform(0.7, 1.3))
            self.key_up(turn_key)

        self.stop_movement()
        return False

    # -----------------------------------------------------------------------
    # Patrulare zona farm (WASD, fara click-uri mouse)
    # -----------------------------------------------------------------------
    def _steer_toward(self, dx: float, dy: float):
        """Orientare + mers sustinut spre waypoint."""
        h = self.config.get('hunting', {})
        walk_key  = h.get('walk_key', 'w')
        left_key  = h.get('turn_left_key', 'a')
        right_key = h.get('turn_right_key', 'd')
        back_key  = h.get('back_key', 's')
        turn_ms   = h.get('turn_time_ms', 550) / 1000.0
        walk_s    = max(0.8, h.get('walk_time_ms', 3500) / 1000.0 * 0.35)

        self._focus()
        self._press_escape()
        self.stop_movement()

        if abs(dx) > abs(dy) * 0.6:
            turn = right_key if dx > 0 else left_key
            self.key_down(turn)
            time.sleep(turn_ms * 0.45)
            self.key_up(turn)
        elif dy < -abs(dx) * 0.3:
            self.key_down(back_key)
            time.sleep(turn_ms * 0.35)
            self.key_up(back_key)

        self.key_down(walk_key)
        time.sleep(walk_s)
        self.key_up(walk_key)

    def patrol_segment(self, get_pos_fn, dest_x: float, dest_y: float,
                       arrival: float, check_target_fn, is_active_fn,
                       max_seconds: float = 12.0):
        """
        Mergi spre un waypoint din zona de farm.
        Returneaza (arrived: bool, found_target: bool)
        """
        if is_active_fn is None:
            is_active_fn = lambda: True

        self._focus()
        start = time.time()
        last_target_check = 0.0
        target_check_every = 0.45

        while time.time() - start < max_seconds:
            if not is_active_fn():
                self.stop_movement()
                return False, False

            now = time.time()
            if now - last_target_check >= target_check_every:
                if check_target_fn():
                    self.stop_movement()
                    return False, True
                last_target_check = now

            pos = get_pos_fn()
            if pos is None:
                h = self.config.get('hunting', {})
                walk_key = h.get('walk_key', 'w')
                walk_s = max(0.6, h.get('walk_time_ms', 3500) / 1000.0 * 0.25)
                self._focus()
                self._press_escape()
                self.key_down(walk_key)
                time.sleep(walk_s)
                self.key_up(walk_key)
                continue

            sx, sy = pos
            dx = dest_x - sx
            dy = dest_y - sy
            dist = (dx * dx + dy * dy) ** 0.5

            if dist <= arrival:
                self.stop_movement()
                return True, False

            self._steer_toward(dx, dy)
            time.sleep(0.05)

        self.stop_movement()
        return False, False

    def patrol_timed(self, walk_ms: int, check_target_fn, is_active_fn) -> bool:
        """Fallback fara pozitie RAM: merge inainte un timp fix."""
        h = self.config.get('hunting', {})
        walk_key = h.get('walk_key', 'w')
        check_ms = h.get('check_target_interval_ms', 350) / 1000.0

        self._focus()
        self._press_escape()
        self.key_down(walk_key)
        start = time.time()
        found = False
        while time.time() - start < walk_ms / 1000.0:
            if not is_active_fn():
                self.key_up(walk_key)
                return False
            time.sleep(check_ms)
            if check_target_fn():
                found = True
                break
        self.key_up(walk_key)
        self.stop_movement()
        return found
