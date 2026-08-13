@echo off
title Uninstall Magic Knowledge Center Windows Service
echo ======================================================================
echo           UNINSTALLING MagicKnowledgeCenter WINDOWS SERVICE
echo ======================================================================
echo.

net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Please right-click and select 'Run as administrator'.
    pause
    exit /b 1
)

if exist "MagicService.exe" (
    MagicService.exe stop
    MagicService.exe uninstall
) else (
    net stop MagicKnowledgeCenter
    sc.exe delete MagicKnowledgeCenter
)

echo.
echo [SUCCESS] Windows Service 'MagicKnowledgeCenter' uninstalled.
pause
