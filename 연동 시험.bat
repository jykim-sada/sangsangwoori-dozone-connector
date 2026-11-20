@echo off
cd /d "%~dp0"
rem The whole body is one block so it keeps working even if git pull replaces this file.
(
  if exist ".git" (
    echo Updating the program from GitHub first...
    git pull --ff-only
    call npm install --no-audit --no-fund
    node register-tasks.js
  )
  echo.
  echo A browser window will open. Log in to the groupware there (including the 2nd authentication) within 3 minutes.
  node dozone-sync.js --headed --dry-run
  pause
  exit /b
)
