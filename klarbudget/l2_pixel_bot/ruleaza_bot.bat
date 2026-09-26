@echo off
:: Solicita drepturi de Administrator (necesar pentru biblioteca keyboard)
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Se solicita drepturi de Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title L2 Pixel Farm Bot v2.0
cd /d "%~dp0"

:: Verifica daca Python exista
if not exist "C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" (
    echo [EROARE] Python nu a fost gasit!
    echo Calea asteptata: C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe
    pause
    exit /b 1
)

:: Lanseaza interfata grafica (GUI)
"C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" bot_gui.py

if %errorLevel% NEQ 0 (
    echo.
    echo [EROARE] Botul s-a inchis cu eroare. Detalii mai sus.
    pause
)
