@echo off
setlocal
title CareerNexus - First Time Setup
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "VENV=%BACKEND%\venv"
set "VPY=%VENV%\Scripts\python.exe"

echo ============================================================
echo    CareerNexus  -  FIRST TIME SETUP
echo    Team VertexSquad   ^(SIH26044^)
echo ============================================================
echo.
echo  Run this ONCE after cloning or copying the project.
echo  For everyday use afterwards, run start.bat instead.
echo.

REM ------------------------------------------------------------
REM  1. Find a working Python
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
echo      1. Download Python 3.10 or newer:
echo           https://www.python.org/downloads/
echo      2. During install, TICK "Add python.exe to PATH"
echo      3. Close this window and run start_first_time.bat again
echo.
pause
exit /b 1

:PY_FOUND
for /f "tokens=*" %%v in ('%SYSPY% -c "import sys;print(sys.version.split()[0])"') do set "PYVER=%%v"
echo  [1/4] Python found            : %SYSPY%  ^(version %PYVER%^)

REM ------------------------------------------------------------
REM  2. Create the virtual environment (always fresh)
REM     A venv copied from another PC hard-codes that PC's Python
REM     path in pyvenv.cfg and can never work here, so we rebuild.
REM ------------------------------------------------------------
if exist "%VENV%" (
    echo  [2/4] Removing old virtual environment...
    rmdir /s /q "%VENV%" >nul 2>&1
)
echo  [2/4] Creating virtual environment...
%SYSPY% -m venv "%VENV%"
if errorlevel 1 (
    echo.
    echo  [X] Could not create the virtual environment.
    echo      - Try running this file as Administrator
    echo      - Or check that antivirus is not blocking Python
    echo.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM  3. Install dependencies
REM ------------------------------------------------------------
echo  [3/4] Installing dependencies ^(1-3 minutes, please wait^)...
"%VPY%" -m pip install --quiet --upgrade pip >nul 2>&1
"%VPY%" -m pip install -r "%BACKEND%\requirements.txt"
if errorlevel 1 (
    echo.
    echo  [X] Dependency install failed.
    echo      Check your internet connection, then run this file again.
    echo.
    pause
    exit /b 1
)

"%VPY%" -c "import fastapi, uvicorn, sqlalchemy, jwt, pypdf, dotenv" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [X] Dependencies installed but some packages are missing.
    echo      Run this file again, or install manually:
    echo        venv\Scripts\python -m pip install -r backend\requirements.txt
    echo.
    pause
    exit /b 1
)
echo        All packages installed and verified.

REM ------------------------------------------------------------
REM  4. Configuration check
REM ------------------------------------------------------------
if exist "%BACKEND%\.env" (
    echo  [4/4] Configuration          : backend\.env found - full features
) else (
    echo  [4/4] Configuration          : backend\.env NOT found
    echo.
    echo        The app will still run using a local SQLite database
    echo        with demo data seeded automatically.
    echo.
    echo        These features need backend\.env to work:
    echo          - Google Sign-In
    echo          - AI chatbot and AI resume parsing
    echo          - Shared Supabase database
    echo.
    echo        To enable them, copy backend\.env from a teammate,
    echo        or copy backend\.env.example to backend\.env and
    echo        fill in the values.
)

echo.
echo ============================================================
echo    SETUP COMPLETE
echo.
echo    From now on, just run:   start.bat
echo ============================================================
echo.

choice /c YN /m "Start the app now"
if errorlevel 2 goto DONE
call "%ROOT%start.bat"

:DONE
endlocal
