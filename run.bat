@echo off
title Magic Enterprise Knowledge Center Engine
echo ======================================================================
echo           MAGIC SOFTWARE ENTERPRISES KNOWLEDGE CENTER
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: 1. Locate Python runtime (Portable runtime -> .venv -> System Python -> Program Files)
set "PY_CMD="
if exist "runtime\python.exe" (
    set "PY_CMD=%SCRIPT_DIR%runtime\python.exe"
) else if exist ".venv\Scripts\python.exe" (
    set "PY_CMD=%SCRIPT_DIR%.venv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        for /f "delims=" %%I in ('where python') do (
            if not defined PY_CMD set "PY_CMD=%%I"
        )
    ) else if exist "C:\Python311\python.exe" (
        set "PY_CMD=C:\Python311\python.exe"
    ) else if exist "C:\Program Files\Python311\python.exe" (
        set "PY_CMD=C:\Program Files\Python311\python.exe"
    ) else if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
        set "PY_CMD=%LocalAppData%\Programs\Python\Python311\python.exe"
    )
)

if "%PY_CMD%"=="" (
    echo [INFO] Python was not found on this machine.
    echo Automatically setting up self-contained portable Python runtime...
    call setup_portable_runtime.bat
    if exist "runtime\python.exe" (
        set "PY_CMD=%SCRIPT_DIR%runtime\python.exe"
    ) else (
        echo [ERROR] Could not initialize Python runtime.
        pause
        exit /b 1
    )
)

echo [1/2] Using Python Runtime: %PY_CMD%
echo [2/2] Starting Magic Knowledge Center Server on Port 8000...
echo.
echo ======================================================================
echo  Knowledge Center is LIVE and accessible at:
echo  - Local:   http://localhost:8000
echo  - Network: http://[VM-IP-ADDRESS]:8000
echo.
echo  Default Admin Account: admin / admin
echo  Press Ctrl+C to stop the server.
echo ======================================================================
echo.

"%PY_CMD%" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server terminated with error code %ERRORLEVEL%.
)

pause
