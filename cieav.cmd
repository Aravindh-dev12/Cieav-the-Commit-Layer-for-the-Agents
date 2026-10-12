@echo off
rem CIEAV Native Windows Command Launcher
rem Enables running `cieav` directly from PowerShell, CMD, or Terminal

setlocal
set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=python"

rem Check if python is available
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.10+
    exit /b 1
)

rem Forward all arguments to the CIEAV governed chat CLI
"%PYTHON_EXE%" "%SCRIPT_DIR%python\cieav_platform\chat_cli.py" %*
endlocal
