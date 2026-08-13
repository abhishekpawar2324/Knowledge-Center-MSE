@echo off
title Magic Knowledge Center - Git Pull Updates on VM
echo ======================================================================
echo           MAGIC KNOWLEDGE CENTER - 1-CLICK PULL VM UPDATES
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git is not installed or not in PATH on this VM.
    pause
    exit /b 1
)

echo [1/2] Fetching and applying latest code changes from remote...
git pull origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [2/2] Checking if new dependencies exist...
    if exist ".venv\Scripts\python.exe" (
        if exist "vendor\wheels" (
            .venv\Scripts\python.exe -m pip install --no-index --find-links=vendor\wheels -r requirements.txt --quiet
        ) else (
            .venv\Scripts\python.exe -m pip install -r requirements.txt --quiet
        )
    )
    echo.
    echo ======================================================================
    echo [SUCCESS] Knowledge Center has been updated with the latest code!
    echo If running as a Windows Service, restart it with 'start_service.bat'
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Failed to pull updates. Check your network or git remote connection.
)

echo.
pause
