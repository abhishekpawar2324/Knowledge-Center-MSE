@echo off
title Magic Knowledge Center - Git Push to Remote
echo ======================================================================
echo           MAGIC KNOWLEDGE CENTER - GIT PUSH TO REMOTE REPO
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git is not installed or not in PATH.
    pause
    exit /b 1
)

:: Check if remote origin is configured
git remote get-url origin >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] No remote repository URL is configured yet.
    echo Please paste your remote repository URL (e.g. https://github.com/your-org/knowledge-center.git):
    set /p REMOTE_URL="Repository URL: "
    if not "%REMOTE_URL%"=="" (
        git remote add origin %REMOTE_URL%
        echo Remote 'origin' configured to: %REMOTE_URL%
    ) else (
        echo [ERROR] No URL provided. Push cancelled.
        pause
        exit /b 1
    )
)

echo.
echo Pushing latest commits to remote repository...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Code successfully pushed to remote repository!
    echo You can now go to your Office VM and run 'git_pull_updates.bat' to update.
    echo ======================================================================
) else (
    echo.
    echo [NOTICE] If this is your first push and the remote has files, you may need to run:
    echo git pull origin main --rebase
    echo before pushing.
)

echo.
pause
