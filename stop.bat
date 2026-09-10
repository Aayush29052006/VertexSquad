@echo off
setlocal
title CareerNexus - Stop Servers
cd /d "%~dp0"

echo ============================================================
echo    CareerNexus  -  Stop Servers
echo ============================================================
echo.

REM ------------------------------------------------------------
REM  The counterpart to start.bat. Frees the two ports it uses
REM  and closes the two server windows it opened, so the app can
REM  be restarted cleanly without hunting for the right windows.
REM
REM  Safe to run when nothing is running - it just reports that.
REM ------------------------------------------------------------

set "KILLED=0"

call :KILLPORT 8000 "Backend "
call :KILLPORT 5500 "Frontend"

REM ------------------------------------------------------------
REM  Close the cmd windows start.bat left behind. Killing the
REM  python process above does not close them, because they were
REM  opened with "cmd /k" and stay put once the server exits.
REM ------------------------------------------------------------
taskkill /f /fi "WINDOWTITLE eq CareerNexus Backend"  >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq CareerNexus Frontend" >nul 2>&1

echo.
if "%KILLED%"=="0" (
    echo  Nothing was listening on 8000 or 5500. Any leftover
    echo  server windows were closed anyway.
) else (
    echo  Stopped. Ports 8000 and 5500 are free again.
    echo  Run start.bat when you want the app back.
)
echo.
pause
exit /b 0

REM ------------------------------------------------------------
REM  :KILLPORT <port> <label>
REM  Kills whatever is listening on the port. Reads the owning
REM  PID from netstat rather than killing every python.exe, so an
REM  unrelated Python script running on this PC is left alone.
REM ------------------------------------------------------------
:KILLPORT
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:"TCP.*:%PORT% .*LISTENING"') do (
    if not "%%P"=="0" (
        taskkill /f /pid %%P >nul 2>&1
        if not errorlevel 1 (
            set "FOUND=1"
            set "KILLED=1"
        )
    )
)

if "%FOUND%"=="1" (
    echo  %LABEL% ^(port %PORT%^) : stopped
) else (
    echo  %LABEL% ^(port %PORT%^) : was not listening
)
exit /b 0
