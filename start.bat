@echo off
setlocal
title CareerNexus - Team VertexSquad
cd /d "%~dp0"

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VPY=%BACKEND%\venv\Scripts\python.exe"

echo ============================================================
echo    CareerNexus  -  Team VertexSquad   ^(SIH26044^)
echo ============================================================
echo.

REM ------------------------------------------------------------
REM  Sanity check: is the environment set up?
REM  If not, send the user to start_first_time.bat rather than
REM  failing with a cryptic Python error.
REM ------------------------------------------------------------
if not exist "%VPY%" goto NEED_SETUP

"%VPY%" -c "import fastapi, uvicorn, sqlalchemy, jwt, pypdf, dotenv" >nul 2>&1
if errorlevel 1 goto NEED_SETUP

REM ------------------------------------------------------------
REM  Launch. Use localhost -- NOT 127.0.0.1 -- because only
REM  http://localhost:5500 is a registered Google OAuth origin.
REM ------------------------------------------------------------
if exist "%BACKEND%\.env" (
    echo  Config   : backend\.env found - full features
) else (
    echo  Config   : no backend\.env - local SQLite, no Google/AI
)
echo  Starting servers...
echo.

start "CareerNexus Backend"  /D "%BACKEND%"  cmd /k ""%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
timeout /t 4 /nobreak >nul

start "CareerNexus Frontend" /D "%FRONTEND%" cmd /k ""%VPY%" serve.py 5500"
timeout /t 3 /nobreak >nul

REM  Open in a Chrome incognito window. A clean profile every time
REM  means no stale login, no cached CSS and no leftover local storage
REM  from the last run - which is what you want in front of judges.
call :FINDCHROME
if defined CHROME (
    start "" "%CHROME%" --incognito "http://localhost:5500"
) else (
    echo  [!] Chrome was not found, so no browser was opened.
    echo      Open an incognito window yourself and go to:
    echo        http://localhost:5500
    echo.
)

echo ============================================================
echo    Frontend : http://localhost:5500
echo    Backend  : http://127.0.0.1:8000        ^(docs at /docs^)
echo.
echo    Demo login : aayushswapnali@gmail.com / demo1234
echo.
echo    Two server windows opened - keep them open while
echo    presenting. Closing them stops the app.
echo ============================================================
echo.
pause
exit /b 0

REM ------------------------------------------------------------
REM  :FINDCHROME  ->  sets CHROME to chrome.exe, or leaves it unset
REM  Registry first: that is where Chrome records its own location,
REM  so this still works if it was installed somewhere unusual. The
REM  hard-coded paths are a fallback, including the per-user install
REM  that lands in AppData when there were no admin rights.
REM ------------------------------------------------------------
:FINDCHROME
set "CHROME="
set "APPKEY=SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"

for /f "tokens=2,*" %%A in ('reg query "HKCU\%APPKEY%" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "CHROME=%%B"
if defined CHROME if exist "%CHROME%" exit /b 0

for /f "tokens=2,*" %%A in ('reg query "HKLM\%APPKEY%" /ve 2^>nul ^| findstr /i "REG_SZ"') do set "CHROME=%%B"
if defined CHROME if exist "%CHROME%" exit /b 0

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" exit /b 0
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" exit /b 0
set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" exit /b 0

set "CHROME="
exit /b 0

REM ------------------------------------------------------------
:NEED_SETUP
echo  [X] The project is not set up on this computer yet.
echo.
echo      Either the virtual environment is missing, or it was
echo      copied from another PC and cannot run here.
echo.
echo      Fix it by running:
echo.
echo          start_first_time.bat
echo.
echo      That takes 1-3 minutes and only needs to be done once.
echo.
pause
exit /b 1
