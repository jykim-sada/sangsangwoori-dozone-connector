@echo off
rem Re-register the Windows scheduled tasks from the current files (daily run + daily update).
cd /d "%~dp0"
node register-tasks.js
pause
