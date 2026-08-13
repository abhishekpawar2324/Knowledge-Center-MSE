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

:: 1. Ensure runtime virtual environment exists
if not exist ".venv\Scripts\python.exe" (
    echo [1/3] Setting up Python virtual environment...
    python -m venv .venv
    call ".venv\Scripts\activate.bat"
    if exist "vendor\wheels" (
        python -m pip install --no-index --find-links=vendor\wheels -r requirements.txt --quiet
    ) else (
        python -m pip install -r requirements.txt --quiet
    )
)

:: 2. Download or use WinSW executable
if not exist "MagicService.exe" (
    echo [2/3] Preparing Windows Service Wrapper executable...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile 'MagicService.exe'" >nul 2>&1
    if not exist "MagicService.exe" (
        echo [INFO] Direct download unavailable. Creating native Windows Service via sc.exe fallback...
        sc.exe create MagicKnowledgeCenter binPath= "\"%SCRIPT_DIR%.venv\Scripts\python.exe\" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000" start= auto DisplayName= "Magic Enterprise Knowledge Center"
        sc.exe description MagicKnowledgeCenter "Magic Software Enterprise Knowledge Center Server"
        net start MagicKnowledgeCenter
        echo.
        echo [SUCCESS] Windows Service 'MagicKnowledgeCenter' created and started!
        pause
        exit /b 0
    )
)

:: Copy configuration to match executable name
copy /y "service_config.xml" "MagicService.xml" >nul

:: 3. Install and Start the Service
echo [3/3] Registering and starting Windows Service...
MagicService.exe install
MagicService.exe start

echo.
echo ======================================================================
echo [SUCCESS] Magic Knowledge Center is now running 24/7 as a Windows Service!
echo It will automatically start on VM boot and run without any user login.
echo.
echo URL: http://localhost:8000 (or http://[VM-IP]:8000)
echo ======================================================================
echo.
pause
