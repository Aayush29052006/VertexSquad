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
REM  A server left over from a previous run holds the port, so the new
REM  one dies instantly with "address already in use" and the app looks
REM  broken. Catch that here and say what to do about it.
call :PORTBUSY 8000
if errorlevel 1 goto ALREADY_RUNNING
call :PORTBUSY 5500
if errorlevel 1 goto ALREADY_RUNNING

echo  Starting servers...
echo.

start "CareerNexus Backend"  /D "%BACKEND%"  cmd /k ""%VPY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM  Wait for the backend to actually accept connections before opening
REM  the browser. It takes over a minute on a cold start - it has to
REM  reach Supabase first - and a fixed pause opened the site against a
REM  dead API, so every page came up full of errors.
echo  Waiting for the backend ^(first start can take up to two minutes^)...
call :WAITPORT 8000 180
if errorlevel 1 goto BACKEND_SLOW
echo        Backend is up.

start "CareerNexus Frontend" /D "%FRONTEND%" cmd /k ""%VPY%" serve.py 5500"
call :WAITPORT 5500 30
if errorlevel 1 goto FRONTEND_FAILED
echo        Frontend is up.
echo.

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
REM  :WAITPORT <port> <seconds>  ->  errorlevel 1 if it never opened
REM  Polls with a real TCP connect rather than netstat, so it waits
REM  for the server to be answering, not merely bound.
REM ------------------------------------------------------------
:WAITPORT
powershell -NoProfile -Command "$end=(Get-Date).AddSeconds(%~2); while((Get-Date) -lt $end){ try{ $c=New-Object Net.Sockets.TcpClient('127.0.0.1',%~1); $c.Close(); exit 0 } catch { Start-Sleep -Milliseconds 700 } }; exit 1"
exit /b %errorlevel%

REM ------------------------------------------------------------
REM  :PORTBUSY <port>  ->  errorlevel 1 if something already holds it
REM ------------------------------------------------------------
:PORTBUSY
netstat -aon | findstr /r /c:"TCP.*:%~1 .*LISTENING" >nul 2>&1
if errorlevel 1 exit /b 0
set "BUSYPORT=%~1"
exit /b 1

REM ------------------------------------------------------------
:ALREADY_RUNNING
echo.
echo  [X] Port %BUSYPORT% is already in use - CareerNexus is probably
echo      still running from an earlier session.
echo.
echo      Run stop.bat first, then start.bat again.
echo.
pause
exit /b 1

REM ------------------------------------------------------------
:BACKEND_SLOW
echo.
echo  [X] The backend did not come up within two minutes.
echo.
echo      Look at the "CareerNexus Backend" window for the real error.
echo      The usual cause is no internet: on start it connects to the
echo      Supabase database, and that attempt has to time out first.
echo.
echo      You can still demo offline - rename backend\.env to
echo      backend\.env.off and run this again to use local SQLite.
echo.
pause
exit /b 1

REM ------------------------------------------------------------
:FRONTEND_FAILED
echo.
echo  [X] The frontend did not come up on port 5500.
echo      Look at the "CareerNexus Frontend" window for the error.
echo.
pause
exit /b 1

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
