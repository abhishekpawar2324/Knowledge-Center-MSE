@echo off
title Magic Knowledge Center - Git Push to GitHub
echo ======================================================================
echo        MAGIC KNOWLEDGE CENTER - PUSH TO 'Dev-Abhishek'
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

echo Repository: https://github.com/abhishekpawar2324/Knowledge-Center-MSE.git
echo Branch:     Dev-Abhishek
echo.
echo Pushing commits to GitHub...
echo.

"%GIT_CMD%" push origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] Code successfully pushed to 'Dev-Abhishek' on GitHub!
    echo ======================================================================
) else (
    echo.
    echo [NOTICE] If push was rejected, run '4_pull_updates.bat' first.
)

echo.
pause
