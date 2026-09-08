@echo off
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /T /PID %%a >nul 2>&1
)
powershell -Command "Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
powershell -Command "Start-Sleep -Seconds 2"

"%SCRIPT_DIR%.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
