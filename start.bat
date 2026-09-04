@echo off
setlocal
title CareerNexus Launcher - Team VertexSquad
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV=%BACKEND%\venv"
set "VPY=%VENV%\Scripts\python.exe"

echo ============================================================
echo    CareerNexus  -  Team VertexSquad   ^(SIH26044^)
echo ============================================================
echo.

REM ------------------------------------------------------------
REM  1. Find a working Python on this PC
REM ------------------------------------------------------------
set "SYSPY="
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "SYSPY=py -3"
if defined SYSPY goto PY_FOUND

python -c "import sys" >nul 2>&1
if not errorlevel 1 set "SYSPY=python"
if defined SYSPY goto PY_FOUND

python3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "SYSPY=python3"
if defined SYSPY goto PY_FOUND

echo  [X] Python was not found on this computer.
echo.
echo      Install Python 3.10 or newer from:
echo        https://www.python.org/downloads/
echo      IMPORTANT: tick "Add python.exe to PATH" during setup,
echo      then close this window and run start.bat again.
echo.
pause
exit /b 1

:PY_FOUND
echo  [1/5] Python found            : %SYSPY%

REM ------------------------------------------------------------
REM  2. Validate the virtual environment
REM     A venv copied from another PC has a hard-coded path in
REM     pyvenv.cfg and will not run -- detect that and rebuild.
REM ------------------------------------------------------------
if not exist "%VPY%" goto BUILD_VENV
"%VPY%" -c "import sys" >nul 2>&1
if errorlevel 1 (
    echo  [2/5] Virtual environment    : broken ^(copied from another PC^) - rebuilding
    rmdir /s /q "%VENV%" >nul 2>&1
    goto BUILD_VENV
)
echo  [2/5] Virtual environment    : OK
goto VENV_READY

:BUILD_VENV
echo  [2/5] Virtual environment    : creating, please wait...
%SYSPY% -m venv "%VENV%"
if errorlevel 1 (
    echo.
    echo  [X] Could not create the virtual environment.
    echo      Try running this file as Administrator, or check that
    echo      antivirus is not blocking Python.
    echo.
    pause
    exit /b 1
)

:VENV_READY

REM ------------------------------------------------------------
REM  3. Dependencies
REM ------------------------------------------------------------
"%VPY%" -c "import fastapi, uvicorn, sqlalchemy, jwt, pypdf, dotenv" >nul 2>&1
if not errorlevel 1 (
    echo  [3/5] Dependencies           : OK
    goto DEPS_READY
)

echo  [3/5] Dependencies           : installing ^(1-3 min on first run^)...
"%VPY%" -m pip install --quiet --upgrade pip >nul 2>&1
"%VPY%" -m pip install --quiet -r "%BACKEND%\requirements.txt"
"%VPY%" -c "import fastapi, uvicorn, sqlalchemy, jwt, pypdf, dotenv" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [X] Dependency install failed.
    echo      Check your internet connection and run start.bat again.
    echo.
    pause
    exit /b 1
)
echo        Dependencies installed.

:DEPS_READY

REM ------------------------------------------------------------
REM  4. Configuration
REM     No .env is fine: the backend falls back to a local SQLite
REM     database and seeds demo data automatically. Only Google
REM     sign-in and the AI features need real keys.
REM ------------------------------------------------------------
if exist "%BACKEND%\.env" (
    echo  [4/5] Configuration          : backend\.env found
) else (
    echo  [4/5] Configuration          : no .env - using local SQLite
    echo        Note: Google sign-in and AI features need backend\.env
)

REM ------------------------------------------------------------
REM  5. Launch both servers, then open the browser
REM     Use localhost -- NOT 127.0.0.1 -- because only
REM     http://localhost:5500 is a registered Google OAuth origin.
REM ------------------------------------------------------------
echo  [5/5] Starting servers...
echo.

start "CareerNexus Backend"  /D "%BACKEND%"  cmd /k ""%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
timeout /t 4 /nobreak >nul

start "CareerNexus Frontend" /D "%FRONTEND%" cmd /k ""%VPY%" serve.py 5500"
timeout /t 3 /nobreak >nul

start "" "http://localhost:5500"

echo ============================================================
echo    Frontend : http://localhost:5500
echo    Backend  : http://127.0.0.1:8000        (docs at /docs)
echo.
echo    Demo login : aayushswapnali@gmail.com / demo1234
echo.
echo    Two new windows opened - keep them open while presenting.
echo    Closing them stops the app.
echo ============================================================
echo.
pause
