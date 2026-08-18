@echo off
title Magic Knowledge Center - Git Pull Updates
echo ======================================================================
echo        MAGIC KNOWLEDGE CENTER - PULL FROM 'Dev-Abhishek'
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

"%GIT_CMD%" checkout Dev-Abhishek >nul 2>&1

echo [1/2] Stashing any local server modifications...
"%GIT_CMD%" stash --include-untracked >nul 2>&1

echo [2/2] Pulling latest updates from GitHub (Dev-Abhishek)...
echo.

"%GIT_CMD%" pull origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Latest changes from 'Dev-Abhishek' pulled successfully!
    echo ======================================================================
) else (
    echo.
    echo [ERROR] Failed to pull updates. Check your network or git connection.
)

echo.
pause
