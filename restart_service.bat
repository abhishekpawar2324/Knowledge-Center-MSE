@echo off
title Restart Magic Knowledge Center Service
echo ======================================================================
echo           RESTARTING MAGIC KNOWLEDGE CENTER SERVICE
echo ======================================================================
echo.

cd /d "%~dp0"

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

echo [2/3] Terminating a stale Knowledge Center worker on port 8000 (if any)...
:: Only the process listening on port 8000 is stopped. Other Python programs on
:: this machine are left alone (this used to kill every python.exe).
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":8000 .*LISTENING"') do (
    echo Terminating stale worker PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo [3/3] Starting Magic Knowledge Center Service with updated Groq AI...
if exist "MagicService.exe" (
    MagicService.exe start
) else (
    net start MagicKnowledgeCenter
)
if errorlevel 1 (
    echo.
    echo [ERROR] The service did not start. Check the service logs.
    pause
    exit /b 1
)

echo.
echo Service status:
sc query MagicKnowledgeCenter
echo.
echo ======================================================================
echo  Service restarted successfully! Latest Groq AI engine is LIVE at:
echo  http://localhost:8000
echo ======================================================================
pause
