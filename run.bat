@echo off
setlocal
cd /d "%~dp0"

echo ======================================================================
echo  CropLedger - Agricultural Market Intelligence
echo ======================================================================

if not exist ".venv\Scripts\python.exe" (
    echo [!] Virtual environment missing. Running setup.bat...
    call "%~dp0setup.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Setup failed. Review the output above.
        pause
        exit /b 1
    )
)

if not exist "frontend\dist\index.html" (
    echo [*] Building frontend production bundle...
    call npm --prefix frontend run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
)

set PYTHONUTF8=1
set PYTHONUNBUFFERED=1

if "%~1"=="--dev" (
    echo [*] Starting CropLedger in Development Mode...
    echo     - Backend API : http://127.0.0.1:8000/docs
    echo     - Frontend UI : http://127.0.0.1:5173
    start "CropLedger FastAPI" cmd /k ""%~dp0.venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload"
    call npm --prefix frontend run dev
    exit /b %ERRORLEVEL%
)

echo.
echo [*] Starting CropLedger server...
echo     Open in browser : http://127.0.0.1:8000
echo     API Swagger Docs: http://127.0.0.1:8000/docs
echo     Press Ctrl+C to stop cleanly.
echo.

".venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port 8000
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] CropLedger stopped unexpectedly. Check port 8000 or logs above.
    pause
    exit /b 1
)

endlocal
