@echo off
title Magic Enterprise Knowledge Center Engine
echo ======================================================================
echo           MAGIC SOFTWARE ENTERPRISES KNOWLEDGE CENTER
echo ======================================================================
echo.
echo [1/3] Checking and installing Python backend dependencies...
pip install -r requirements.txt --quiet

echo [2/3] Checking and installing Frontend UI dependencies...
call npm install --silent

echo [3/3] Starting Magic Knowledge Center Services...
echo.
start "Backend Engine" cmd /k "python -m uvicorn backend.main:app --reload --port 8000"
start "Frontend UI" cmd /k "npm run dev:frontend"

echo.
echo ======================================================================
echo  Knowledge Center is running!
echo  Open your browser and navigate to: http://localhost:5173
echo  Default Admin Account: superadmin / admin@123
echo ======================================================================
echo.
pause
