@echo off
setlocal
rem One-time installer: gets the connector from GitHub with git so later updates are automatic.
rem Put this file inside the OLD connector folder (next to config.json) and double-click it.
set REPO=https://github.com/jykim-sada/sangsangwoori-dozone-connector.git
set DIR=%~dp0..\dozone-connector

where git >nul 2>&1
if errorlevel 1 (
  echo [1/3] git is not installed. Installing with winget...
  winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  echo.
  echo git was installed. CLOSE this window, then double-click this file ONCE MORE.
  pause
  exit /b 0
)

if exist "%DIR%\.git" (
  echo [1/3] Updating existing copy...
  cd /d "%DIR%" && git pull --ff-only
) else (
  echo [1/3] Downloading connector with git...
  git clone %REPO% "%DIR%"
  if errorlevel 1 (
    echo git clone failed. Check the internet connection and run this file again.
    pause
    exit /b 1
  )
)

echo [2/3] Copying settings and login state from the old folder (if present)...
if exist "%~dp0config.json" copy /y "%~dp0config.json" "%DIR%\config.json" >nul
if exist "%~dp0bizbox-state.json" copy /y "%~dp0bizbox-state.json" "%DIR%\bizbox-state.json" >nul
if exist "%~dp0bizbox-cache.json" copy /y "%~dp0bizbox-cache.json" "%DIR%\bizbox-cache.json" >nul

echo [3/3] Running install.bat in the new folder (press Enter at the 3 questions to keep current values)...
cd /d "%DIR%"
call install.bat
echo.
echo Done. From now on the scheduled task uses: %DIR%
echo The old folder can be deleted later. Updates arrive automatically every morning (or run UPDATE.bat).
pause
