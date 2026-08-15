@echo off
title Restart Magic Knowledge Center Service
echo ======================================================================
echo           RESTARTING MAGIC KNOWLEDGE CENTER SERVICE
echo ======================================================================
echo.

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Please right-click and select 'Run as administrator'.
    pause
    exit /b 1
)

if exist "MagicService.exe" (
    echo [1/2] Stopping service...
    MagicService.exe stop
    timeout /t 2 /nobreak >nul
    echo [2/2] Starting service with latest code...
    MagicService.exe start
) else (
    net stop MagicKnowledgeCenter
    net start MagicKnowledgeCenter
)

echo.
echo Service status:
sc query MagicKnowledgeCenter
echo.
echo ======================================================================
echo  Service restarted successfully! Latest code is now LIVE at:
echo  http://localhost:8000
echo ======================================================================
pause
