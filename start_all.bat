@echo off
REM ESP32 to Frontend Complete Setup Script for Windows
REM Run this .bat file to start all components

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║    ESP32 Data Transmission Pipeline - Quick Start          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

setlocal enabledelayedexpansion
set PROJECT_ROOT=%~dp0
echo Project Root: %PROJECT_ROOT%
echo.

REM Step 1: Verify Setup
echo [Step 1] Verifying Setup...
echo Running verification script...
cd /d "%PROJECT_ROOT%"
python verify_setup.py

set /p CONTINUE="Continue to start services? (y/n) "
if /i not "%CONTINUE%"=="y" exit /b 0

REM Step 2: Backend
echo.
echo [Step 2] Starting Backend Server
cd /d "%PROJECT_ROOT%backend"

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
pip install -r requirements.txt -q

echo.
echo ✅ Backend environment ready
echo Starting: python main.py
start "ESP32 Backend" cmd /k "cd /d "%PROJECT_ROOT%backend" && call venv\Scripts\activate.bat && python main.py"

timeout /t 3 /nobreak

REM Step 3: Frontend
echo.
echo [Step 3] Starting Frontend Server
cd /d "%PROJECT_ROOT%frontend"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)

echo.
echo ✅ Frontend environment ready
echo Starting: npm run dev
start "ESP32 Frontend" cmd /k "cd /d "%PROJECT_ROOT%frontend" && npm run dev"

timeout /t 2 /nobreak

REM Step 4: Optional ESP32 Upload
echo.
echo [Step 4] ESP32 Setup
set /p UPLOAD="Upload code to ESP32? (y/n) "
if /i "%UPLOAD%"=="y" (
    where pio >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo Uploading to ESP32...
        cd /d "%PROJECT_ROOT%ESP32\master"
        call pio run --target upload
        
        set /p MONITOR="Open serial monitor? (y/n) "
        if /i "!MONITOR!"=="y" (
            call pio device monitor --baud 115200
        )
    ) else (
        echo ⚠️  platformio not installed
        echo Install with: pip install platformio
        echo Then run: cd "%PROJECT_ROOT%ESP32\master" && pio run --target upload
    )
)

REM Display completion message
cls
echo.
echo ═════════════════════════════════════════════════════════════
echo ✅ All Services Started!
echo ═════════════════════════════════════════════════════════════
echo.
echo 🌐 Frontend:   http://localhost:5173
echo 🔌 Backend:    http://192.168.254.110:8000
echo 📊 API Docs:   http://192.168.254.110:8000/docs
echo.
echo Next steps:
echo   1. Open frontend: http://localhost:5173
echo   2. Login with your credentials
echo   3. Navigate to device page to see real-time data
echo.
echo To monitor:
echo   Backend logs:  Check "ESP32 Backend" terminal window
echo   Frontend logs: Check "ESP32 Frontend" terminal window
echo   ESP32 logs:    Open serial monitor at 115200 baud
echo.
echo Press Ctrl+C in any terminal to stop that service
echo.
pause
