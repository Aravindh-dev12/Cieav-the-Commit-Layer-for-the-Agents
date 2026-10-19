@echo off
title CIEAV -- 6-Domain Live Real-World Test Suite
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.10+ from python.org
    pause
    exit /b 1
)

python test_real_world_cieav_live.py
echo.
echo ==============================================================================
echo Test run complete. Press any key to close this window.
echo ==============================================================================
pause >nul
endlocal
