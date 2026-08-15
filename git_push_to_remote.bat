@echo off
title Magic Knowledge Center - Git Push to Remote
echo ======================================================================
echo           MAGIC KNOWLEDGE CENTER - GIT PUSH TO REMOTE REPO
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
    echo [ERROR] Git is not installed or not in PATH.
    pause
    exit /b 1
)

:: Ensure on Dev-Abhishek branch
"%GIT_CMD%" checkout Dev-Abhishek >nul 2>&1

echo Target Branch: Dev-Abhishek
echo.
echo Staging and committing any uncommitted changes...
"%GIT_CMD%" add .
"%GIT_CMD%" commit -m "Update Knowledge Center codebase" >nul 2>&1

echo.
echo Pushing latest commits to GitHub (Dev-Abhishek)...
"%GIT_CMD%" push origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Code successfully pushed to 'Dev-Abhishek' on GitHub!
    echo You can now go to your Office VM and run 'git_pull_updates.bat' to update.
    echo ======================================================================
) else (
    echo.
    echo [NOTICE] Push failed or was rejected. Trying to reconcile...
    "%GIT_CMD%" pull origin Dev-Abhishek --rebase
    "%GIT_CMD%" push origin Dev-Abhishek
)

echo.
pause
