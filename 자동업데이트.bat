@echo off
rem Pull the latest connector files from GitHub (only when this folder was installed with git),
rem then re-register the scheduled tasks from the new files. Keeps config.json and the login state.
cd /d "%~dp0"
if not exist ".git" exit /b 0
echo %date% %time% update start >> update.log
git pull --ff-only >> update.log 2>&1
call npm install --no-audit --no-fund >> update.log 2>&1
node register-tasks.js >> update.log 2>&1
echo %date% %time% update done >> update.log
