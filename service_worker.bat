@echo off
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

"%SCRIPT_DIR%.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
