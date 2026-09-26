@echo off
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
title Zona Farm SIMPLU
cd /d "%~dp0"
set "PY=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"
echo.
echo  === ZONA FARM SIMPLU ===
echo  1. Stai in mijlocul farm-ului
echo  2. Apasa C apoi S in fereastra care se deschide
echo.
"%PY%" -u calibrate_zone.py
pause
