@echo off
title Restart Magic Knowledge Center Service
echo ======================================================================
echo           RESTARTING MAGIC KNOWLEDGE CENTER SERVICE
echo ======================================================================
echo.

if exist "MagicService.exe" (
    echo [1/3] Stopping service...
    MagicService.exe stop
    echo [2/3] Terminating any stale python processes listening on port 8000...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
        echo Killing old port 8000 worker PID: %%a
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
    echo [3/3] Starting service with latest Groq AI engine...
    MagicService.exe start
) else (
    net stop MagicKnowledgeCenter
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    net start MagicKnowledgeCenter
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
