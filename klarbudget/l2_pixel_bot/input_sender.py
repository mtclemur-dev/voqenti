"""
input_sender.py - Modul de trimitere taste pentru L2 Pixel Bot
Suporta 3 metode:
  1. window_message  - PostMessage direct la handle-ul ferestrei L2 (nu schimba focusul)
  2. foreground      - Focuseaza fereastra L2, trimite tasta, revine
  3. serial          - Arduino Leonardo / Raspberry Pi Pico (bypass hardware anti-cheat)
"""

import time
import sys


# --- Tabela de coduri VK (Virtual Key codes) ---
VK_CODES = {
    'f1':0x70, 'f2':0x71, 'f3':0x72, 'f4':0x73,
    'f5':0x74, 'f6':0x75, 'f7':0x76, 'f8':0x77,
    'f9':0x78, 'f10':0x79, 'f11':0x7A, 'f12':0x7B,
    '1':0x31,  '2':0x32,  '3':0x33,  '4':0x34,  '5':0x35,
    '6':0x36,  '7':0x37,  '8':0x38,  '9':0x39,  '0':0x30,
    'enter':0x0D, 'return':0x0D, 'tab':0x09, 'space':0x20,
    'esc':0x1B, 'escape':0x1B,
    'home':0x24, 'end':0x23, 'insert':0x2D, 'delete':0x2E,
    'page_up':0x21, 'page_down':0x22,
    'up':0x26, 'down':0x28, 'left':0x25, 'right':0x27,
    'shift':0x10, 'ctrl':0x11, 'alt':0x12,
    'a':0x41, 'b':0x42, 'c':0x43, 'd':0x44, 'e':0x45,
    'f':0x46, 'g':0x47, 'h':0x48, 'i':0x49, 'j':0x4A,
    'k':0x4B, 'l':0x4C, 'm':0x4D, 'n':0x4E, 'o':0x4F,
    'p':0x50, 'q':0x51, 'r':0x52, 's':0x53, 't':0x54,
    'u':0x55, 'v':0x56, 'w':0x57, 'x':0x58, 'y':0x59, 'z':0x5A,
}

WM_KEYDOWN = 0x0100
WM_KEYUP   = 0x0101


def _build_lparam(vk, is_up=False):
    """Construieste lParam pentru WM_KEYDOWN / WM_KEYUP."""
    try:
        import win32api
        scan = win32api.MapVirtualKey(vk, 0)
    except Exception:
        scan = 0
    repeat = 1
    lp = repeat | (scan << 16)
    if is_up:
        lp |= (1 << 30) | (1 << 31)
    return lp


class WindowMessageSender:
    """
    Trimite taste direct la fereastra jocului prin SendMessage.
    Nu necesita ca fereastra sa fie in prim-plan.
    Functineaza pentru taste UI/skill in L2 Interlude (nu pentru miscare WASD DirectInput).
    """
    def __init__(self, hwnd, press_duration_ms=50):
        self.hwnd = hwnd
        self.press_duration = press_duration_ms / 1000.0

    def press_key(self, key_name):
        try:
            import win32api
            import win32con
            key_name = key_name.lower().strip()
            vk = VK_CODES.get(key_name)
            if vk is None:
                print(f"[InputSender] Tasta necunoscuta: {key_name}")
                return
            lp_down = _build_lparam(vk, is_up=False)
            lp_up   = _build_lparam(vk, is_up=True)
            win32api.SendMessage(self.hwnd, WM_KEYDOWN, vk, lp_down)
            time.sleep(self.press_duration)
            win32api.SendMessage(self.hwnd, WM_KEYUP, vk, lp_up)
        except Exception as e:
            print(f"[InputSender] Eroare PostMessage pentru '{key_name}': {e}")

    def close(self):
        pass


class ForegroundSender:
    """
    Focuseaza fereastra L2, trimite tasta, revine la fereastra anterioara.
    Mai sigur daca PostMessage nu functioneaza (ex: anti-cheat mai strict).
    """
    def __init__(self, hwnd, press_duration_ms=50, keep_focus=False):
        self.hwnd = hwnd
        self.press_duration = press_duration_ms / 1000.0
        self.keep_focus = keep_focus

    def press_key(self, key_name):
        try:
            import win32api
            import win32gui
            key_name = key_name.lower().strip()
            vk = VK_CODES.get(key_name)
            if vk is None:
                print(f"[InputSender] Tasta necunoscuta: {key_name}")
                return

            prev_hwnd = win32gui.GetForegroundWindow()
            win32gui.SetForegroundWindow(self.hwnd)
            time.sleep(0.06)

            win32api.keybd_event(vk, 0, 0, 0)
            time.sleep(self.press_duration)
            win32api.keybd_event(vk, 0, 0x0002, 0)

            time.sleep(0.04)
            if not self.keep_focus and prev_hwnd and prev_hwnd != self.hwnd:
                try:
                    win32gui.SetForegroundWindow(prev_hwnd)
                except Exception:
                    pass
        except Exception as e:
            print(f"[InputSender] Eroare ForegroundSender pentru '{key_name}': {e}")

    def close(self):
        pass


class SerialSender:
    """
    Trimite comanda de tasta prin Serial catre un Arduino Leonardo / Raspberry Pi Pico.
    Placa Arduino emuleaza o tastatura fizica reala, trecand de anti-cheat hardware.
    """
    def __init__(self, port='COM3', baudrate=9600):
        try:
            import serial
            print(f"[InputSender] Conectare la Arduino pe {port} ({baudrate} baud)...")
            self.conn = serial.Serial(port, baudrate, timeout=1)
            time.sleep(2)  # Asteptam resetul Arduino-ului
            print("[InputSender] Conexiune Arduino stabilita!")
        except ImportError:
            print("[InputSender] EROARE: Instalati pyserial: pip install pyserial")
            sys.exit(1)
        except Exception as e:
            print(f"[InputSender] EROARE deschidere Serial {port}: {e}")
            sys.exit(1)

    def press_key(self, key_name):
        try:
            cmd = f"{key_name.lower().strip()}\n"
            self.conn.write(cmd.encode('utf-8'))
            time.sleep(0.06)
        except Exception as e:
            print(f"[InputSender] Eroare Serial pentru '{key_name}': {e}")

    def close(self):
        try:
            self.conn.close()
            print("[InputSender] Conexiune Serial inchisa.")
        except Exception:
            pass


def create_sender(config, hwnd):
    """
    Factory: Creaza tipul corect de sender pe baza configuratiei.
    """
    method = config.get("input_method", "window_message").lower()
    press_ms = config.get("timings", {}).get("key_press_duration_ms", 50)
    keep_focus = config.get("input_keep_focus", False)

    if method == "window_message":
        if hwnd:
            print(f"[InputSender] Folosesc WindowMessage (SendMessage) catre HWND={hwnd}")
            return WindowMessageSender(hwnd, press_duration_ms=press_ms)
        else:
            print("[InputSender] ATENTIE: Fereastra L2 nu a fost gasita! Caut fereastra...")
            return None
    elif method == "foreground":
        if hwnd:
            print(f"[InputSender] Folosesc Foreground (focus L2) HWND={hwnd} keep={keep_focus}")
            return ForegroundSender(hwnd, press_duration_ms=press_ms, keep_focus=keep_focus)
        else:
            return None
    elif method == "serial":
        serial_cfg = config.get("serial", {})
        return SerialSender(
            port=serial_cfg.get("port", "COM3"),
            baudrate=serial_cfg.get("baudrate", 9600)
        )
    else:
        print(f"[InputSender] Metoda necunoscuta: {method}. Folosesc window_message.")
        return WindowMessageSender(hwnd, press_duration_ms=press_ms) if hwnd else None
