@echo off
cd /d "%~dp0"
set "PY=C:\Users\mtcle\AppData\Local\Programs\Python\Python313\python.exe"
"%PY%" -u patch_sig.py
pause
