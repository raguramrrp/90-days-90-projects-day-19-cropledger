@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ======================================================================
echo  CropLedger - Agricultural Market Intelligence Windows Setup
echo ======================================================================

:: 1. Locate Python 3.11+
set PYTHON_CMD=
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PYTHON_CMD=python
) else (
    py -3 --version >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PYTHON_CMD=py -3
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] Python 3.11+ was not found on PATH.
    echo Install Python from https://www.python.org/downloads/ and add it to PATH.
    exit /b 1
)

for /f "tokens=*" %%i in ('%PYTHON_CMD% --version') do set PYTHON_VER=%%i
echo [*] Detected %PYTHON_VER%

:: 2. Create project virtual environment
if not exist ".venv\Scripts\python.exe" (
    echo [*] Creating virtual environment (.venv)...
    %PYTHON_CMD% -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        exit /b 1
    )
    echo [OK] Virtual environment created.
) else (
    echo [OK] Virtual environment (.venv) already exists.
)

:: 3. Install Python dependencies
echo [*] Installing Python dependencies from requirements.txt...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install Python dependencies.
    exit /b 1
)
echo [OK] Python dependencies installed.

:: 4. Check Node.js / npm and build React frontend
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js / npm was not found on PATH.
    echo Install Node.js 20+ from https://nodejs.org/ and add it to PATH.
    exit /b 1
)

echo [*] Installing frontend npm packages...
call npm --prefix frontend install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install frontend packages.
    exit /b 1
)

echo [*] Building frontend production bundle...
call npm --prefix frontend run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Frontend build failed.
    exit /b 1
)
echo [OK] Frontend built cleanly.

:: 5. Initialize local directories and .env (never overwrite existing .env)
if not exist "data" mkdir data
if not exist "screenshots" mkdir screenshots

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [OK] Created .env from .env.example.
) else (
    echo [OK] Existing .env preserved.
)

:: 6. Initialize database schema, export sample CSV, and seed clearly labelled demo dataset if empty
echo [*] Initializing database and sample dataset...
".venv\Scripts\python.exe" scripts\init_db.py --seed-demo --export-csv
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Database initialization failed.
    exit /b 1
)

echo ======================================================================
echo  CropLedger Setup Complete!
echo    - Launch App : run.bat
echo    - Dev Mode   : run.bat --dev
echo    - Run Tests  : test.bat
echo ======================================================================
endlocal
