@echo off
cd /d "%~dp0"
echo A browser window will open. Log in to the groupware there (including the 2nd authentication) within 3 minutes.
node dozone-sync.js --headed --dry-run
pause
