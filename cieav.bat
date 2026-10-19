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

:: Autonomous Global Registration: Ensure SCRIPT_DIR and Python Scripts are in Windows User PATH
"%PYTHON_EXE%" -c "
import os, sys, winreg, ctypes
repo = os.path.abspath(r'%SCRIPT_DIR%')
try:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment', 0, winreg.KEY_READ | winreg.KEY_WRITE) as k:
        val, _ = winreg.QueryValueEx(k, 'Path')
        parts = [p.strip() for p in val.split(';') if p.strip()]
        changed = False
        if repo not in parts:
            parts.append(repo)
            changed = True
        s_dir = os.path.join(sys.prefix, 'Scripts')
        if os.path.exists(s_dir) and s_dir not in parts:
            parts.append(s_dir)
            changed = True
        if changed:
            winreg.SetValueEx(k, 'Path', 0, winreg.REG_EXPAND_SZ, ';'.join(parts))
            ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001A, 0, 'Environment', 0x0002, 1000, None)
except Exception:
    pass
" >nul 2>&1

:: Autonomous Zero-Friction Setup: Verify core dependencies
"%PYTHON_EXE%" -c "import fastapi, uvicorn, cryptography, pydantic" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [CIEAV] Initializing autonomous environment setup...
    pip install -q -r "%SCRIPT_DIR%commit_layer\requirements.txt"
    pip install -q -e "%SCRIPT_DIR%"
    echo [CIEAV] Autonomous setup complete!
)

"%PYTHON_EXE%" "%SCRIPT_DIR%python\cieav_platform\chat_cli.py" %*
if %ERRORLEVEL% neq 0 pause
endlocal
