@echo off
cd /d "%~dp0"
title Clip Cutter
where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist node_modules goto :hasmods
echo Installing dependencies - first run only, takes a minute...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
:hasmods

if exist .next\BUILD_ID goto :built
echo Building the app - first run only...
call npm run build
if errorlevel 1 goto :fail
:built

echo.
echo  Clip Cutter is running at http://127.0.0.1:3000
echo  Close this window to stop it.
echo.
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & start http://127.0.0.1:3000"
call npm start
goto :eof

:nonode
echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
pause
exit /b 1

:fail
echo.
echo Something went wrong - see the messages above.
pause
exit /b 1
