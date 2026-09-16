@echo off
title Magic Knowledge Center - Git Save & Commit
echo ======================================================================
echo           MAGIC KNOWLEDGE CENTER - 1-CLICK GIT SAVE & COMMIT
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: Check if git is installed
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git for Windows from: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Check if git repository is initialized
if not exist ".git" (
    echo [INFO] Initializing Git repository...
    git init
    git branch -M main
)

echo.
echo [1/3] Current Git Status:
echo ----------------------------------------------------------------------
git status -s
echo ----------------------------------------------------------------------
echo.

:: Prompt for commit message
set /p COMMIT_MSG="Enter a short description of your changes (Press Enter for auto-date): "

if "%COMMIT_MSG%"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set COMMIT_MSG=Update Knowledge Center codebase - %datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%
)

echo.
echo [2/3] Staging all modified files...
git add .

echo.
echo [3/3] Saving commit to local history: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"

echo.
echo ======================================================================
echo [SUCCESS] Changes saved and committed locally!
echo.
echo To send these changes to your remote server (GitHub/GitLab), run:
echo -> git_push_to_remote.bat
echo ======================================================================
echo.
pause
