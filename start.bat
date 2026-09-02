@echo off
echo ===================================================
echo            Starting CareerNexus (VertexSquad)
echo ===================================================

REM 1. Backend  --  FastAPI on http://127.0.0.1:8000
echo Starting backend API on http://127.0.0.1:8000 ...
if exist "%~dp0backend\venv\Scripts\python.exe" (
    start "CareerNexus Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
) else (
    start "CareerNexus Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
)

REM 2. Wait for the backend to come up
timeout /t 2 /nobreak >nul

REM 3. Frontend  --  static files on http://127.0.0.1:5500
echo Starting frontend on http://127.0.0.1:5500 ...
start "CareerNexus Frontend" cmd /k "cd /d %~dp0frontend && python -m http.server 5500 --bind 127.0.0.1"

REM 4. Open the browser
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:5500"
