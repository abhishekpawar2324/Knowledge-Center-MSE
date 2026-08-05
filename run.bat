@echo off
title Magic Knowledge Base Engine
echo [INFO] Changing drive to D:
d:
echo [INFO] Navigating to Magic Knowledge Base directory...
cd "d:\Knowledge Base\Windows XPI"
echo [INFO] Starting Python Uvicorn server on http://localhost:8000
python -m uvicorn backend.main:app --port 8000
pause
