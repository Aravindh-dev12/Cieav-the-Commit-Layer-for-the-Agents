@echo off
title CIEAV -- Sovereign Agent OS (A2A Runtime)
setlocal
set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=python"

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.10+ from python.org
    pause
    exit /b 1
)

"%PYTHON_EXE%" "%SCRIPT_DIR%python\cieav_platform\chat_cli.py" %*
if %ERRORLEVEL% neq 0 pause
endlocal
