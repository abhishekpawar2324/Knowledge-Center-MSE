@echo off
title Magic Knowledge Center - Offline Dependency Bundler
echo ======================================================================
echo     MAGIC SOFTWARE ENTERPRISES - OFFLINE DEPENDENCY BUNDLER
echo ======================================================================
echo.
echo This script downloads all required Python packages and wheels locally
echo into the 'vendor\wheels' folder.
echo.
echo Once bundled, you can copy the entire project folder to your office VM
echo and run it directly with ZERO internet and ZERO manual pip installs!
echo.
echo ======================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "vendor\wheels" mkdir "vendor\wheels"

echo.
echo [1/2] Downloading Python dependency wheels into vendor\wheels...
python -m pip download -r requirements.txt -d "vendor\wheels"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to download dependency wheels. Please ensure you have internet access.
    pause
    exit /b 1
)

echo.
echo [2/2] Verifying bundled wheels...
dir /b "vendor\wheels"

echo.
echo ======================================================================
echo [SUCCESS] All dependencies have been bundled into 'vendor\wheels'!
echo You can now copy this folder to the Windows VM for direct offline deployment.
echo ======================================================================
echo.
pause
