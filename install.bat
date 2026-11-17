@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Trying automatic install with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo.
    echo Please install Node.js LTS from https://nodejs.org  - green LTS button, then Next, Next...
    echo After installing, run install.bat again.
    start https://nodejs.org
    pause
    exit /b 1
  )
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
node install.js
pause
