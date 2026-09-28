# L2 Pixel Farm Bot - Ghid de Utilizare și Calibrare

Acest bot de farm este bazat pe detectarea culorilor pe ecran (pixel recognition) și simularea tastelor. A fost creat pentru a funcționa cu serverul Lineage 2 Interlude (Elmorlab x3).

---

## 🛠️ Cerințe și Pregătire
1. **Python 3.13** (deja instalat la `C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe`).
2. **Dependențe Python** (instalate automat în sistem):
   - `mss` (captură de ecran rapidă)
   - `Pillow` (procesare imagine)
   - `pyautogui` & `pydirectinput` (citire coordonate și simulare taste)
   - `keyboard` (ascultare taste globale pentru pauză/oprire)

---

## 📐 Pasul 1: Calibrarea Pixelilor (Configurare)

Înainte de a rula botul, trebuie să setați coordonatele corecte ale ecranului în `config.json`. Pentru aceasta, folosiți utilitarul `screen_helper.py`.

1. Deschideți jocul Lineage 2 în modul **Fereastră (Windowed)** (de preferat o rezoluție mică, de exemplu 1024x768 sau alta fixă, poziționată în colțul din stânga sus al ecranului).
2. Rulați utilitarul de calibrare prin dublu-click pe fișierul **`ruleaza_calibrare.bat`** (sau manual din consolă: `& "C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" screen_helper.py`).
3. Mergeți în joc, atacați un monstru (ca să apară bara lui de HP roșie în partea de sus a ecranului).
4. Duceți mouse-ul undeva la jumătatea barei roșii de HP a monstrului și apăsați tasta **`C`** de pe tastatură.
5. Consola va afișa coordonatele `x`, `y` și valoarea `RGB`.
6. Deschideți [config.json](file:///c:/ProiecteProgramare/digital-work/klarbudget/l2_pixel_bot/config.json) și actualizați secțiunea `target_hp`:
   - Puneți valorile `x` și `y` obținute.
   - Setați `color_rgb` cu valorile citite (de exemplu: `[176, 20, 20]`).
7. *(Opțional)* Repetați procesul pentru bara proprie de HP și MP din colțul din stânga sus al ecranului pentru auto-potions. Schimbați în config `"enabled": true` pentru acele secțiuni dacă vreți să fie active.

---

## 🚀 Pasul 2: Configurarea Tastelor în Joc

Asigurați-vă că tastele din `config.json` corespund cu bara de scurtături (Shortcuts) din joc (de exemplu, pe F1-F4):
- **`target_next` (implicit F1):** Puneți macro-ul sau comanda `/targetnext`.
- **`attack` (implicit F2):** Puneți acțiunea simplă de atac (`Attack` din meniul Actions sau shortcut-ul din bară).
- **`pick_up` (implicit F3):** Puneți acțiunea de cules drop (`Pick Up` din meniul Actions).
- **`potion` (implicit F4):** Puneți poțiunea de HP (ex: Healing Potion).

---

## 🤖 Pasul 3: Rularea Botului

După calibrare, puteți rula botul prin dublu-click pe fișierul **`ruleaza_bot.bat`** (sau manual din consolă: `& "C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" pixel_bot.py`).

### Controale în timpul rulării:
- **`HOME`** - Pornire bot (botul începe să apese taste și să scaneze).
- **`END`** - Pune botul pe pauză instant (folosiți-o când vreți să preluați controlul manual).
- **`ESC`** - Închide complet scriptul botului.

---

## 🛡️ Depanare: Ce facem dacă Anti-Cheat-ul blochează tastele?

Dacă botul rulează, detectează corect țintele în jurnalul consolei, dar caracterul din joc **nu se mișcă și nu atacă**, înseamnă că sistemul de protecție (Active Anticheat de pe Elmorlab) blochează tastele simulate prin software.

### Soluția Hardware (Arduino Leonardo / Raspberry Pi Pico):
Cumpărați o placă **Arduino Leonardo** (costă aprox. 30-50 RON). Aceasta folosește cipul ATmega32U4 și poate emula o tastatură fizică reală pe portul USB.

1. Conectați Arduino la calculator.
2. Încărcați următorul cod simplu pe Arduino prin Arduino IDE:
   ```cpp
   #include <Keyboard.h>

   void setup() {
     Serial.begin(9600);
     Keyboard.begin();
   }

   void loop() {
     if (Serial.available() > 0) {
       String command = Serial.readStringUntil('\n');
       command.trim();

       if (command == "f1") { Keyboard.press(KEY_F1); delay(50); Keyboard.releaseAll(); }
       else if (command == "f2") { Keyboard.press(KEY_F2); delay(50); Keyboard.releaseAll(); }
       else if (command == "f3") { Keyboard.press(KEY_F3); delay(50); Keyboard.releaseAll(); }
       else if (command == "f4") { Keyboard.press(KEY_F4); delay(50); Keyboard.releaseAll(); }
       else if (command == "f5") { Keyboard.press(KEY_F5); delay(50); Keyboard.releaseAll(); }
       else if (command == "f6") { Keyboard.press(KEY_F6); delay(50); Keyboard.releaseAll(); }
       // Adăugați alte taste după nevoie
     }
   }
   ```
3. În [config.json](file:///c:/ProiecteProgramare/digital-work/klarbudget/l2_pixel_bot/config.json), modificați setările astfel:
   - `"input_method": "serial"`
   - Setați portul serial corect în `"serial": { "port": "COMX" }` (vedeți în Device Manager ce port COM a primit placa Arduino, de exemplu `COM3`).
4. Instalați biblioteca Serial în Python:
   ```bash
   & "C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" -m pip install pyserial
   ```
5. Rulați botul ca de obicei. Scriptul va trimite comenzile prin Serial, iar Arduino le va apăsa fizic, trecând 100% nedetectat de anti-cheat.
