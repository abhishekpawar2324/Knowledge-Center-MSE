@echo off
title Magic Knowledge Center - Git Pull Updates on VM
echo ======================================================================
echo           MAGIC KNOWLEDGE CENTER - 1-CLICK PULL VM UPDATES
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set "GIT_CMD="
if exist "%SCRIPT_DIR%git_tools\portable_git\cmd\git.exe" (
    set "GIT_CMD=%SCRIPT_DIR%git_tools\portable_git\cmd\git.exe"
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
) else if exist "C:\Program Files\Git\bin\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\bin\git.exe"
) else if exist "%LocalAppData%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LocalAppData%\Programs\Git\cmd\git.exe"
) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Git\cmd\git.exe"
) else (
    where git >nul 2>&1
    if %ERRORLEVEL% EQU 0 set "GIT_CMD=git"
)

if "%GIT_CMD%"=="" (
    echo [ERROR] Git is not installed or not in PATH on this VM.
    pause
    exit /b 1
)

echo [1/2] Stashing any local server modifications...
"%GIT_CMD%" stash --include-untracked >nul 2>&1

echo [2/2] Fetching and applying latest code changes from 'Dev-Abhishek'...
"%GIT_CMD%" pull origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Knowledge Center has been updated with the latest code!
    echo If running as a Windows Service, restart it with 'restart_service.bat'
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Failed to pull updates. Check your network or git remote connection.
)

echo.
pause
