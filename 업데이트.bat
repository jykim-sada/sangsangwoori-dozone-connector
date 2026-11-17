@echo off
cd /d "%~dp0"
if exist ".git" (
  git pull --ff-only
  call npm install --no-audit --no-fund
  echo Update finished. config.json and the login state are kept.
) else if exist "..\.git" (
  cd ..
  git pull --ff-only
  cd /d "%~dp0"
  call npm install --no-audit --no-fund
  echo Update finished. config.json and the login state are kept.
) else (
  echo This folder was not installed with git, so it cannot update itself.
  echo Run the git installer .bat once to switch to git; after that updates are automatic.
)
pause
