@echo off
title Start Magic Knowledge Center Service
echo Starting MagicKnowledgeCenter Windows Service...

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Please right-click and select 'Run as administrator'.
    pause
    exit /b 1
)

if exist "MagicService.exe" (
    MagicService.exe start
) else (
    net start MagicKnowledgeCenter
)

echo.
echo Service status:
sc query MagicKnowledgeCenter
pause
