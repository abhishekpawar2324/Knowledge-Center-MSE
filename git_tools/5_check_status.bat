@echo off
title Magic Knowledge Center - Git Status
echo ======================================================================
echo             MAGIC KNOWLEDGE CENTER - GIT STATUS & BRANCH
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

set "GIT_CMD="
if exist "%SCRIPT_DIR%portable_git\cmd\git.exe" (
    set "GIT_CMD=%SCRIPT_DIR%portable_git\cmd\git.exe"
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
    echo [ERROR] Git was not found on this computer.
    pause
    exit /b 1
)

echo [1] Current Active Branch:
"%GIT_CMD%" branch --show-current
echo.

echo [2] Working Tree Status:
echo ----------------------------------------------------------------------
"%GIT_CMD%" status
echo ----------------------------------------------------------------------
echo.

echo [3] Last 3 Commits:
"%GIT_CMD%" log --oneline -n 3
echo.

pause
