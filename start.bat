@echo off
rem Chay Kanji Map bang cach double-click (Windows).
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS tai: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Dang cai thu vien lan dau...
  call npm install
  if errorlevel 1 (
    echo Cai thu vien that bai.
    pause
    exit /b 1
  )
)

set KANJI_OPEN=1
call npm start
pause
