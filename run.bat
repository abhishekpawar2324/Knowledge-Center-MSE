@echo off
title Magic Enterprise Knowledge Center Engine
echo ======================================================================
echo           MAGIC SOFTWARE ENTERPRISES KNOWLEDGE CENTER
echo ======================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: 0. Verify the bundled runtime actually works before trusting it.
::    "runtime\python.exe exists" is not the same as "Python runs". A runtime
::    that arrived through source control can have python.exe and the stdlib zip
::    but none of the .pyd C extension modules, in which case the interpreter
::    starts and then dies on "import socket" - which uvicorn does immediately.
::    Testing the import here turns that into a clear, self-repairing message
::    instead of a traceback after the "server is LIVE" banner.
set "RUNTIME_BROKEN="
if exist "runtime\python.exe" (
    "runtime\python.exe" -c "import socket, ssl, sqlite3, ctypes" >nul 2>&1
    if errorlevel 1 set "RUNTIME_BROKEN=1"
)
if defined RUNTIME_BROKEN (
    echo [WARN] The 'runtime' folder is incomplete - python.exe cannot load its
    echo        C extension modules. Repairing it in place, nothing is deleted...
    echo.
    call setup_portable_runtime.bat
    echo.
)

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

:: NOTE: There is no frontend build step, and none should be added. The live
:: application is the hand-written UI in frontend\ (index.html, app.js,
:: styles.css), served directly by FastAPI. A build that outputs into that
:: folder would delete the running app.

echo [1/2] Using Python Runtime: %PY_CMD%
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
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
