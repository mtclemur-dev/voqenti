@echo off
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Se solicita drepturi de Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title L2 Calibrare Offseturi RAM
cd /d "%~dp0"

set "PY=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"
if not exist "%PY%" (
    echo [EROARE] Python negasit: %PY%
    pause
    exit /b 1
)

echo.
echo  CALIBRARE OFFSETURI pentru Elmorlab
echo  ====================================
echo.
echo  1. Porneste Lineage 2 si logheaza personajul
echo  2. Noteaza HP si MP exact din joc
echo  3. Urmeaza instructiunile din script
echo.

"%PY%" -u find_offsets.py
pause
