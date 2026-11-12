@echo off
setlocal
cd /d "%~dp0"

echo ======================================================================
echo  CropLedger - Automated Test Suite
echo ======================================================================

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Run setup.bat first.
    exit /b 1
)

echo [*] Running Python backend and analytics test suite...
".venv\Scripts\python.exe" -m pytest --cov=src --cov-report=term-missing
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Backend tests failed.
    exit /b 1
)

echo [*] Running Frontend TypeScript typecheck...
call npm --prefix frontend run typecheck
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Frontend TypeScript check failed.
    exit /b 1
)

echo ======================================================================
echo  [PASS] All CropLedger checks passed.
echo ======================================================================
endlocal
