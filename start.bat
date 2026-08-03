@echo off
title V-Connect Portal Launcher
echo ============================================================
echo           V-CONNECT DEVELOPMENT PORTAL LAUNCHER
echo ============================================================
echo.

:: Start the backend API server in a separate terminal window
echo [1/2] Launching Express API Server...
start "V-Connect Backend Server" cmd /k "cd server && npm run dev"

:: Start the React frontend client in a separate terminal window
echo [2/2] Launching Vite Frontend Client...
start "V-Connect React Client" cmd /k "cd client && npm run dev"

echo.
echo ============================================================
echo [OK] Both servers have been launched in separate windows!
echo      - Backend Server: http://localhost:3001
echo      - React Client:   http://localhost:5173
echo ============================================================
echo.
pause
