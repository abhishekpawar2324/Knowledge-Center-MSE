@echo off
title Magic Knowledge Center - 1-Click Commit and Push
echo ======================================================================
echo    MAGIC KNOWLEDGE CENTER - 1-CLICK COMMIT & PUSH TO 'Dev-Abhishek'
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
echo [1/3] Staging all files...
"%GIT_CMD%" add .

echo.
echo [2/3] Committing changes: "%COMMIT_MSG%"
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo [3/3] Pushing to GitHub (Dev-Abhishek)...
"%GIT_CMD%" push origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Changes committed and pushed to 'Dev-Abhishek' on GitHub!
    echo ======================================================================
) else (
    echo.
    echo [NOTICE] Push encountered an issue. You can run '4_pull_updates.bat' and try again.
)

echo.
pause
