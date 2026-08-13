@echo off
title Magic Knowledge Center - Git Commit Local
echo ======================================================================
echo       MAGIC KNOWLEDGE CENTER - COMMIT TO 'Dev-Abhishek'
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

set "GIT_CMD=git"
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
    ) else if exist "C:\Program Files\Git\bin\git.exe" (
        set "GIT_CMD=C:\Program Files\Git\bin\git.exe"
    ) else if exist "%LocalAppData%\Programs\Git\cmd\git.exe" (
        set "GIT_CMD=%LocalAppData%\Programs\Git\cmd\git.exe"
    ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
        set "GIT_CMD=C:\Program Files (x86)\Git\cmd\git.exe"
    ) else (
        echo [ERROR] Git is not found on this computer.
        pause
        exit /b 1
    )
)

"%GIT_CMD%" checkout Dev-Abhishek >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    "%GIT_CMD%" checkout -b Dev-Abhishek
)

echo Target Branch: Dev-Abhishek
echo.
echo Modified / New Files:
echo ----------------------------------------------------------------------
"%GIT_CMD%" status -s
echo ----------------------------------------------------------------------
echo.

set /p COMMIT_MSG="Enter commit description (Press Enter for auto-timestamp): "

if "%COMMIT_MSG%"=="" (
    set COMMIT_MSG=Update Knowledge Center codebase
)

echo.
echo [1/2] Staging all files...
"%GIT_CMD%" add .

echo.
echo [2/2] Committing changes: "%COMMIT_MSG%"
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo ======================================================================
echo [SUCCESS] Changes committed locally to branch 'Dev-Abhishek'!
echo To send to GitHub, run '3_push.bat'.
echo ======================================================================
echo.
pause
