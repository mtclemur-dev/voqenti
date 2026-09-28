@echo off
:: Rulam ca Administrator
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Se solicita drepturi de Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title L2 Calibrare Pixeli v2.0
cd /d "%~dp0"
cls
echo ==============================================================
echo     L2 PIXEL BOT - Utilitar Calibrare Coordonate
echo ==============================================================
echo.
echo  Instructiuni rapide:
echo   1. Porniti jocul Lineage II in modul Windowed.
echo   2. Atacati un monstru (sa apara bara lui de HP rosie sus).
echo   3. Mutati cursorul pe bara de HP rosie a monstrului.
echo   4. Apasati C si selectati optiunea 1.
echo   5. Apasati T ca sa verificati daca detectia functioneaza.
echo   6. Repetati pentru bara proprie de HP si MP (optional).
echo.
echo  Pornire calibrare...
echo ==============================================================
echo.

"C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe" screen_helper.py

echo.
echo Calibrare inchisa.
pause
