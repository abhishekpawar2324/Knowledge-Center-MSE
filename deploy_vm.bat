@echo off
title Magic Knowledge Center - VM Production Server
echo ======================================================================
echo           MAGIC SOFTWARE ENTERPRISES KNOWLEDGE CENTER
echo                 WINDOWS VM PRODUCTION LAUNCHER
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: 1. Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python was not found on this machine!
    echo Please ask IT to install Python 3.10, 3.11, or 3.12 (64-bit) and add to PATH.
    echo.
    pause
    exit /b 1
)

:: 2. Setup Local Isolated Virtual Environment (.venv) if needed
if not exist ".venv\Scripts\activate.bat" (
    echo [1/3] Creating self-contained Python virtual environment (.venv)...
    python -m venv .venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: 3. Activate Virtual Environment
call ".venv\Scripts\activate.bat"

:: 4. Install Dependencies (Offline-first from vendor\wheels or online fallback)
echo [2/3] Verifying runtime dependencies...
if exist "vendor\wheels" (
    echo Installing from pre-bundled offline wheels (Zero Internet Mode)...
    python -m pip install --no-index --find-links=vendor\wheels -r requirements.txt --quiet
) else (
    echo Installing dependencies from requirements.txt...
    python -m pip install -r requirements.txt --quiet
)

:: 5. Launch Knowledge Center Server on Port 8000
echo.
echo [3/3] Starting Magic Knowledge Center Server on Port 8000...
echo ======================================================================
echo  Knowledge Center is LIVE and accessible at:
echo  - Local:   http://localhost:8000
echo  - Network: http://[VM-IP-ADDRESS]:8000
echo.
echo  Default Super Admin: superadmin / admin@123
echo  Press Ctrl+C to stop the server.
echo ======================================================================
echo.

:: Launch the server using the virtual environment python
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4

pause
