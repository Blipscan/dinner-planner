@echo off
setlocal

echo Stopping Dinner Party Planner on port 5000...
for /f "tokens=5" %%A in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
  echo Stopping PID %%A
  taskkill /PID %%A /F >nul 2>&1
)

echo Done.
endlocal
