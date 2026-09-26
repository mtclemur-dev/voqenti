@echo off
title L2 Simple Bot
cd /d "%~dp0"
echo Pornesc L2 Simple Bot...
echo.

set PYTHON=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe

if not exist "%PYTHON%" (
    echo EROARE: Python nu a fost gasit la %PYTHON%
    pause
    exit /b 1
)

"%PYTHON%" simple_bot.py
pause
