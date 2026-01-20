@echo off
setlocal

echo ============================================
echo Dinner Party Planner — Safe Local Beta
echo ============================================
echo.

REM Move to this script's directory
cd /d "%~dp0"

REM Ensure server folder exists
if not exist "server\package.json" (
  echo ERROR: server folder not found.
  pause
  exit /b 1
)

REM Ensure .env exists
if not exist "server\.env" (
  echo ERROR: server\.env is missing.
  echo Copy server\.env.example to server\.env and add your ANTHROPIC_API_KEY.
  echo.
  pause
  exit /b 1
)

REM Check for API key in .env
set "ANTHROPIC_API_KEY="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"ANTHROPIC_API_KEY=" "server\.env"`) do set "ANTHROPIC_API_KEY=%%B"
if "%ANTHROPIC_API_KEY%"=="" (
  echo.
  echo ERROR: ANTHROPIC_API_KEY is not set in server\.env
  echo Please set it before running this app.
  echo Example:
  echo   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
  echo.
  pause
  exit /b 1
)

echo Installing backend dependencies...
pushd server
npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  popd
  pause
  exit /b 1
)
popd

echo Starting backend on port 5000...
start "Dinner Planner Backend" cmd /k "cd /d \"%~dp0server\" && set PORT=5000 && npm start"

REM Give backend time to start
timeout /t 2 >nul

REM Open browser
start http://localhost:5000/

echo.
echo App launched successfully.
echo.
endlocal
