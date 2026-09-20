@echo off
:: Solicita drepturi de Administrator (necesar pentru citire RAM)
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Se solicita drepturi de Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title L2 RAM Test
cd /d "%~dp0"

set "PY=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"

if not exist "%PY%" (
    echo [EROARE] Python nu a fost gasit!
    echo Calea asteptata: %PY%
    echo.
    echo Instaleaza Python 3.13 sau actualizeaza calea in test_ram.bat
    echo.
    pause
    exit /b 1
)

echo ========================================
echo   TEST CITIRE RAM - Lineage 2
echo ========================================
echo.
echo Python: %PY%
echo Folder: %CD%
echo.
echo Porneste jocul INAINTE de test daca nu e deja deschis.
echo.

"%PY%" -u test_ram.py
set ERR=%errorLevel%

echo.
if %ERR% NEQ 0 (
    echo [EROARE] Scriptul s-a inchis cu cod %ERR%.
    echo Citeste mesajele de mai sus.
) else (
    echo Test terminat normal.
)
echo.
pause
