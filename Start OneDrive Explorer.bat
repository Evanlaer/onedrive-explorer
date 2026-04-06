@echo off
title OneDrive Explorer
color 0B

echo.
echo  ===========================================
echo    OneDrive Explorer ^| Starting...
echo  ===========================================
echo.
echo  [1/2] Starting development server...
echo.

:: Start Vite dev server in background
start /B cmd /c "npm run dev > nul 2>&1"

:: Wait a few seconds for the server to be ready
timeout /t 4 /nobreak > nul

echo  [2/2] Opening browser at http://localhost:5173
echo.
start http://localhost:5173

echo  ==========================================
echo    App is running at http://localhost:5173
echo    Close this window to stop the server.
echo  ==========================================
echo.

:: Keep the server running until the user closes this window
cmd /c "npm run dev"
