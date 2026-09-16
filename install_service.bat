@echo off
title Install Magic Knowledge Center Windows Service
echo ======================================================================
echo     INSTALLING 24/7 BACKGROUND WINDOWS SERVICE: MagicKnowledgeCenter
echo ======================================================================
echo.

:: Require Administrator Privileges
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] This script requires Administrator privileges.
    echo Please right-click on 'install_service.bat' and select 'Run as administrator'.
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "logs" mkdir "logs"

:: 1. Locate Python runtime (Portable -> .venv -> System -> Program Files)
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
    echo Setting up self-contained portable Python runtime now...
    call setup_portable_runtime.bat
    set "PY_CMD=%SCRIPT_DIR%runtime\python.exe"
)

echo [1/3] Using Python Runtime: %PY_CMD%

:: 2. Prepare Windows Service Wrapper
if not exist "MagicService.exe" (
    echo [2/3] Preparing Windows Service Wrapper executable...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile 'MagicService.exe'" >nul 2>&1
)

if exist "MagicService.exe" (
    powershell -Command "$c = Get-Content 'service_config.xml' -Raw; $c = $c -replace '<executable>.*?</executable>', ('<executable>' + '%PY_CMD%' + '</executable>'); Set-Content 'MagicService.xml' -Value $c"
    echo [3/3] Registering and starting Windows Service via WinSW...
    MagicService.exe stop >nul 2>&1
    MagicService.exe uninstall >nul 2>&1
    MagicService.exe install
    MagicService.exe start
) else (
    echo [2/3] Registering native Windows Service via sc.exe...
    sc.exe delete MagicKnowledgeCenter >nul 2>&1
    sc.exe create MagicKnowledgeCenter binPath= "\"%PY_CMD%\" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000" start= auto DisplayName= "Magic Enterprise Knowledge Center"
    sc.exe description MagicKnowledgeCenter "Magic Software Enterprise Knowledge Center Server"
    net start MagicKnowledgeCenter
)

echo.
echo ======================================================================
echo [SUCCESS] Magic Knowledge Center is now running 24/7 as a Windows Service!
echo It will automatically start on VM boot and run without any user login.
echo.
echo URL: http://localhost:8000 (or http://[VM-IP-ADDRESS]:8000)
echo ======================================================================
echo.
pause
