@echo off
title L2 Offset Finder
cd /d "%~dp0"
echo Pornesc L2 Offset Finder...
echo Asigura-te ca L2 ruleaza si esti logat in joc!
echo.

set PYTHON=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe

if not exist "%PYTHON%" (
    echo EROARE: Python nu a fost gasit la %PYTHON%
    pause
    exit /b 1
)

"%PYTHON%" offset_finder.py
pause
