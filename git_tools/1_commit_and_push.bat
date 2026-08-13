@echo off
title Magic Knowledge Center - 1-Click Commit & Push
echo ======================================================================
echo    MAGIC KNOWLEDGE CENTER - 1-CLICK COMMIT & PUSH (Dev-Abhishek)
echo ======================================================================
echo.

:: Resolve workspace root directory (parent of git_tools)
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

:: 1. Auto-detect Git executable
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
        echo Please install Git for Windows from: https://git-scm.com/download/win
        echo.
        pause
        exit /b 1
    )
)

:: 2. Ensure on Dev-Abhishek branch
"%GIT_CMD%" checkout Dev-Abhishek >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    "%GIT_CMD%" checkout -b Dev-Abhishek
)

echo Workspace: %CD%
echo Target Branch: Dev-Abhishek
echo.
echo Modified / New Files:
echo ----------------------------------------------------------------------
"%GIT_CMD%" status -s
echo ----------------------------------------------------------------------
echo.

:: 3. Prompt for commit description
set /p COMMIT_MSG="Enter commit description (Press Enter for auto-timestamp): "

if "%COMMIT_MSG%"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set COMMIT_MSG=Update Knowledge Center codebase
)

echo.
echo [1/2] Staging and Committing changes...
"%GIT_CMD%" add .
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo [2/2] Pushing to GitHub (branch: Dev-Abhishek)...
"%GIT_CMD%" push origin Dev-Abhishek

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================================
    echo [SUCCESS] All changes successfully committed and pushed to GitHub!
    echo ======================================================================
) else (
    echo.
    echo [NOTICE] Push encountered an issue. If remote has new changes, run '4_pull_updates.bat' first.
)

echo.
pause
