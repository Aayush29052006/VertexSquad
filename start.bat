@echo off
echo ===================================================
echo     Starting VertexMain Full-Stack Application     
echo ===================================================

:: 1. Launch FastAPI Backend in a separate window
echo Starting Backend (FastAPI + Supabase + Gemini AI) on http://127.0.0.1:8000 ...
start "VertexMain Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: 2. Wait 2 seconds for backend initialization
timeout /t 2 /nobreak >nul

:: 3. Launch default browser to frontend URL
echo Launching Browser...
start "" "http://127.0.0.1:5500"

:: 4. Start Frontend HTTP server on 127.0.0.1:5500
echo Starting Frontend Server on http://127.0.0.1:5500 ...
cd /d %~dp0
python -m http.server 5500 --bind 127.0.0.1
