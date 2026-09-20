# Ghid Cheat Engine — Gasire Offseturi Stabile pentru L2 Interlude
## Specific pentru Elmorlab x3 (l2.exe / l2.bin, 32-bit)

---

## PREGĂTIRE

1. Descarca Cheat Engine de la: https://www.cheatengine.org  
2. Dezactiveaza antivirusul temporar (CE este detectat fals de multi AV)
3. Porneste L2, logheaza personajul, intra in joc
4. Porneste Cheat Engine ca **Administrator** (click dreapta → Run as Admin)
5. In CE: **File → Open Process** → alege `l2.exe` sau `l2.bin`
   - Bifati **"Enable Speedhack"** = NU
   - Lasati **"Pause game while scanning"** = NU (jocul trebuie sa ruleze)

---

## PASUL 1 — Gaseste adresa HP curent

### 1.1 Prima scanare

1. In bara de stanga CE: **Value Type = 4 Bytes**
2. **Scan Type = Exact Value**
3. Uita-te la HP-ul personajului in joc (ex: `1250`)
4. Scrie `1250` in casuta **Value** → click **First Scan**
5. Asteapta sa termine (poate dura 10-30 sec)

### 1.2 Ingustarea rezultatelor

1. In joc: bea un elixir / fii lovit de un mob → HP-ul scade (ex: acum `980`)
2. In CE: scrie `980` → click **Next Scan**
3. Repeta de 3-4 ori pana ai sub 20 de adrese in lista din stanga

### 1.3 Identifica adresa corecta

1. Click pe fiecare adresa din lista → valoarea se schimba in timp real
2. Adresa corecta: valoarea se schimba EXACT cu HP-ul din joc
3. Dublu-click pe ea → apare jos in lista (adaugata la favorites)
4. Noteaza adresa (ex: `0x12A4F5C8`)

> ⚠️ Aceasta adresa este DINAMICA — se schimba la fiecare sesiune.  
> De aceea avem nevoie de Pointer Scan.

---

## PASUL 2 — Găsește Pointerul Verde (Adresa Stabila)

### 2.1 "Find out what accesses this address" (Metoda cheie)

1. Click dreapta pe adresa HP din lista favorites → **"Find out what accesses this address"**
2. Apare o fereastra → click **OK** (adauga un breakpoint de memorie)
3. In joc: misca personajul sau asteapta 2-3 secunde → HP-ul e citit in mod repetat
4. In CE vei vedea **instructiuni assembly** care apar — ex:
   ```
   mov eax,[ecx+0x3E8]     ;  ← aceasta instrucțiune citeste HP
   ```
5. Click pe acea instructiune → jos apare **"More information"**
6. Noteaza: **ECX = 0x1A2B3000** (valoarea registrului in acel moment)

> Aceasta valoare (ECX/ESI/EAX etc.) este **baza structurii personajului**.  
> Offsetul HP este numarul din instructiune (ex: `0x3E8`).

### 2.2 Inchide fereastra si adauga manual adresa de baza

1. Inchide fereastra "Code that accessed..."
2. In bara de sus CE: scrie in casuta **hex address**: adresa bazei (ex: `0x1A2B3000`)
3. Click dreapta → **"Add address manually"** → **OK**
4. Aceasta adresa de baza este TOT dinamica — acum facem pointer scan pe ea

---

## PASUL 3 — Pointer Scan (Gaseste Adresa Verde)

### 3.1 Pointer Scan pe adresa de baza

1. Click dreapta pe adresa de baza (ex: `0x1A2B3000`) → **Pointer scan for this address**
2. Setari recomandate:
   - **Max level (depth)**: `3`
   - **Max offset**: `0x500`
   - **Pointer must be 32-bit**: ✓ (L2 e 32-bit)
   - **Only static addresses** — NU bifa (cauta tot)
3. Click **OK** → alege un loc sa salvezi fisierul `.ptr`
4. Asteapta scanarea (poate dura 2-10 minute!)

### 3.2 Gaseste Pointerul Stabil

1. Dupa scan, apare o lista imensa cu pointeri
2. **Filtru important**: Coloanele cu adrese **verzi** = adrese statice din .exe  
   Coloanele cu adrese **albe/negre** = heap (dinamice, nu ne intereseaza)
3. Sorteaza dupa **"Depth"** (nivel mic = mai probabil stabil)
4. Cauta intrari cu un lant scurt: ex: `l2.exe+0x12A3F0 → +0x0 → +0x3E8`

### 3.3 Validare (cel mai important pas!)

1. Noteaza un pointer candidat din lista
2. **Reporneste jocul complet** (log out, relog)
3. Deschide CE din nou, ataseaza la l2.exe
4. Manual address → adauga pointerul notat (cu toate nivelele)
5. **Daca valoarea HP apare corect** = pointerul e STABIL ✓

---

## PASUL 4 — Gaseste Target ID

### 4.1 Scanare Target ID (0 → valoare)

1. In joc: NU selecta nicio tinta
2. CE: **Value Type = 4 Bytes, Scan Type = Exact Value, Value = 0** → First Scan
3. In joc: click pe un MOB sa il selectezi ca tinta
4. CE: **Scan Type = Changed Value** → Next Scan
5. Repeta de 2-3 ori (selecteaza/deselecteaza tinta alternativ):
   - Fara tinta: Next Scan cu valoarea `0`
   - Cu tinta: Next Scan cu **valoarea exacta a ID-ului** (il gasesti mai jos)

### 4.2 Cum gasesti ID-ul exact al mob-ului

- Tinteste un mob → uita-te la `Target HP` in UI
- Alternativ: in `offset_finder.py` → Metoda 5 (Snapshot Diff) iti arata valoarea

### 4.3 Pointer Scan pentru Target ID

- Repeta pasii 3.1 - 3.3 pentru adresa Target ID

---

## PASUL 5 — Gaseste Coordonatele (X, Y)

### 5.1 Coordonate de tip Float

1. CE: **Value Type = Float** (coordonatele in L2 sunt floating-point)
2. **Scan Type = Exact Value**
3. Uita-te la coordonatele din joc (comanda `/loc` in chat)
4. Scrie valoarea X → First Scan
5. Misca personajul → scrie noua valoare X → Next Scan
6. Repeta pana ai 1-5 adrese

### 5.2 Alternativa: Value Type = Double

- Unele versiuni de L2 stocheaza coordonatele ca `Double` (8 bytes)
- Incearca daca `Float` nu da rezultate

---

## REZUMAT OFFSET-URI COMUNE in L2 Interlude

Acestea sunt valori **tipice** (pot varia intre clienti!):

```
Offset HP          =  0x3E8   sau  0x408
Offset MP          =  0x3EC   sau  0x40C
Offset MaxHP       =  0x3F0   sau  0x410
Offset MaxMP       =  0x3F4   sau  0x414
Offset X (float)   =  0x110   sau  0x14C
Offset Y (float)   =  0x114   sau  0x150
Offset Z (float)   =  0x118   sau  0x154
Offset Level       =  0x18C
Offset TargetID    =  0x4C    sau  0x50  (in structura target)
```

> Aceste valori sunt **puncte de start** pentru scan, nu garantate.

---

## PASUL 6 — Adauga Offseturile in simple_bot.py

Dupa ce ai gasit adresele stabile, deschide `simple_bot.py` si umple sectiunea:

```python
PROCESS_NAME     = "l2.bin"      # sau "l2.exe"
BASE_ADDRESS     = 0x400000      # baza l2.exe (de obicei fixa)

# Offseturi fata de baza structurii personajului
HP_OFFSET        = 0x3E8         # valoarea ta gasita
MP_OFFSET        = 0x3EC         # valoarea ta gasita  
MAX_HP_OFFSET    = 0x3F0
MAX_MP_OFFSET    = 0x3F4
TARGET_ID_OFFSET = 0x4C
TARGET_HP_OFFSET = 0x420         # de cautat
MY_X_OFFSET      = 0x110
MY_Y_OFFSET      = 0x114
TARGET_X_OFFSET  = 0x200         # de cautat
TARGET_Y_OFFSET  = 0x204
```

---

## TROUBLESHOOTING

| Problema | Solutie |
|---|---|
| CE nu vede procesul L2 | Porneste CE ca Administrator |
| Prima scanare are milioane de rezultate | Normal — HP-ul 100 apare pretutindeni; schimba HP si fa Next Scan |
| Pointer Scan dureaza prea mult | Micsoreaza Max Level la 2, Max Offset la 0x200 |
| Pointerul gasit nu functioneaza dupa relog | Nivelul e prea mare; incearca lant mai scurt |
| L2 crasheaza cand atasezi CE | Normal pe unele servere cu anticheat; nu poti face nimic |
| Valoarea HP e tot 0 in bot | Verifica: este adresa in bytes sau in procente? L2 stocheaza HP in unitati absolute |

---

*Ghid creat pentru Elmorlab x3 Interlude — offset_finder.py + simple_bot.py*
