@echo off
title Restart Magic Knowledge Center Service
echo ======================================================================
echo           RESTARTING MAGIC KNOWLEDGE CENTER SERVICE
echo ======================================================================
echo.

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ======================================================================
    echo [ACTION REQUIRED] Please right-click 'restart_service.bat' and select:
    echo                   'Run as administrator'
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

echo [1/3] Stopping Magic Knowledge Center Service...
MagicService.exe stop >nul 2>&1
net stop MagicKnowledgeCenter >nul 2>&1

echo [2/3] Terminating any stale python worker processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Terminating stale worker PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /FI "IMAGENAME eq python.exe" >nul 2>&1

timeout /t 2 /nobreak >nul

echo [3/3] Starting Magic Knowledge Center Service with updated Groq AI...
MagicService.exe start

echo.
echo Service status:
sc query MagicKnowledgeCenter
echo.
echo ======================================================================
echo  Service restarted successfully! Latest Groq AI engine is LIVE at:
echo  http://localhost:8000
echo ======================================================================
pause
