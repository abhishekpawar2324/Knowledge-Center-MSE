@echo off
title Magic Knowledge Center - Setup Portable Python ^& Git Environment
echo ======================================================================
echo     MAGIC SOFTWARE ENTERPRISES - BUILD 100%% PORTABLE BUNDLE
echo                 (PORTABLE PYTHON + PORTABLE GIT)
echo ======================================================================
echo.
echo This script creates a 100%% SELF-CONTAINED portable environment:
echo  1. Portable Python 3.11 with all backend dependencies in 'runtime\'
echo  2. Portable Git for Windows in 'git_tools\portable_git\'
echo.
echo Once created, you can copy this entire project folder to ANY Windows
echo Server VM and it will work INSTANTLY with:
echo  - ZERO Python installation required on the VM
echo  - ZERO Git installation required on the VM
echo  - ZERO Node.js / npm required on the VM
echo  - ZERO internet connection required on the VM
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "temp" mkdir "temp"

:: ======================================================================
:: STEP A: PORTABLE PYTHON RUNTIME
:: ======================================================================
if not exist "runtime\python.exe" goto build_runtime
"runtime\python.exe" -c "import socket, ssl, sqlite3, ctypes" >nul 2>&1
if errorlevel 1 goto runtime_incomplete
echo [INFO] Portable Python runtime already present and healthy.
goto check_git

:runtime_incomplete
echo [WARN] 'runtime\python.exe' exists but cannot load its C extension modules.
echo        That happens when the folder came from source control rather than a
echo        real install. Repairing in place - the extract fills the gaps and
echo        deletes nothing.
echo.

:build_runtime

echo [1/4] Downloading official Python 3.11 Standalone Runtime (10MB)...
powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile 'temp\python-embed.zip'"

if not exist "temp\python-embed.zip" (
    echo [ERROR] Failed to download embedded Python runtime.
    pause
    exit /b 1
)

echo [2/4] Extracting portable Python into 'runtime' folder...
if not exist "runtime" mkdir "runtime"
powershell -Command "Expand-Archive -Path 'temp\python-embed.zip' -DestinationPath 'runtime' -Force"

echo [3/4] Configuring runtime environment paths...
if exist "runtime\python311._pth" (
    powershell -Command "(Get-Content 'runtime\python311._pth') -replace '#import site', 'import site' | Set-Content 'runtime\python311._pth'"
    echo .>> "runtime\python311._pth"
    echo Lib\site-packages>> "runtime\python311._pth"
    echo ..>> "runtime\python311._pth"
)

if not exist "runtime\get-pip.py" (
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'runtime\get-pip.py'"
)

echo [4/4] Bootstrapping pip and installing all Python dependencies...
"runtime\python.exe" "runtime\get-pip.py" --no-warn-script-location --quiet
"runtime\python.exe" -m pip install -r requirements.txt --no-warn-script-location --quiet

:: ======================================================================
:: STEP B: PORTABLE GIT RUNTIME
:: ======================================================================
:check_git
echo.
if exist "git_tools\portable_git\cmd\git.exe" (
    echo [INFO] Portable Git is already present in 'git_tools\portable_git'.
    goto finish_setup
)

echo [5/5] Downloading official MinGit / Portable Git for Windows (25MB)...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.45.2.windows.1/MinGit-2.45.2-64-bit.zip' -OutFile 'temp\mingit.zip'"

if exist "temp\mingit.zip" (
    echo Extracting Portable Git into 'git_tools\portable_git\'...
    if not exist "git_tools\portable_git" mkdir "git_tools\portable_git"
    powershell -Command "Expand-Archive -Path 'temp\mingit.zip' -DestinationPath 'git_tools\portable_git' -Force"
)

:finish_setup
if exist "temp" rmdir /s /q "temp"

echo.
echo ======================================================================
echo [SUCCESS] 100%% PORTABLE BUNDLE IS READY!
echo.
echo - Python:   runtime\python.exe (FastAPI, Uvicorn, SQLite, PDF/Docx)
echo - Git:      git_tools\portable_git\cmd\git.exe
echo.
echo You can now copy this entire folder to your Windows VM and double-click:
echo  -^> run.bat               (To run interactively)
echo  -^> install_service.bat   (To run 24/7 as Windows Service)
echo  -^> git_tools\1_commit_and_push.bat (To sync via Git with ZERO install)
echo ======================================================================
echo.
pause
