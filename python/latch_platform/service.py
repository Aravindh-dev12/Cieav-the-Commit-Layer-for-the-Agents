from __future__ import annotations

import json
import os
import platform
import plistlib
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from .config import Settings

SERVICE_NAME = "cieav-gateway"
LEGACY_SERVICE_NAME = "latch-gateway"
LAUNCHD_LABEL = "ai.cieav.gateway"
LEGACY_LAUNCHD_LABEL = "ai.latch.gateway"
WINDOWS_TASK = "CIEAV Gateway"
LEGACY_WINDOWS_TASK = "LATCH Gateway"
WINDOWS_LAUNCHER = "gateway-service.ps1"
WINDOWS_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_RUN_VALUE = "CIEAV Gateway"


def _python() -> str:
    return str(Path(sys.executable).resolve())


def _module_command(settings: Settings) -> list[str]:
    executable = _python()
    if getattr(sys, "frozen", False):
        return [executable, "gateway", "run"]
    return [executable, "-m", "latch_platform.cli", "gateway", "run"]


def _env(settings: Settings) -> dict[str, str]:
    runtime_dir = settings.root / "runtime"
    path_sep = ";" if platform.system().lower() == "windows" else ":"
    env = {
        "CIEAV_HOME": str(settings.root),
        "CIEAV_STATE_DIR": str(settings.state_dir),
        "CIEAV_GATEWAY_PORT": str(settings.gateway_port),
        "CIEAV_CONTROL_PORT": str(settings.control_port),
        "CIEAV_API_PORT": str(settings.api_port),
        # Temporary aliases for compatibility with JS/runtime modules that are
        # migrated independently.
        "LATCH_HOME": str(settings.root),
        "LATCH_STATE_DIR": str(settings.state_dir),
        "LATCH_GATEWAY_PORT": str(settings.gateway_port),
        "LATCH_CONTROL_PORT": str(settings.control_port),
        "LATCH_API_PORT": str(settings.api_port),
        "PATH": f"{runtime_dir}{path_sep}{os.environ.get('PATH','')}",
    }
    mappings = (
        ("CIEAV_CLOUD_URL", "LATCH_CLOUD_URL"),
        ("CIEAV_CLOUD_TIMEOUT_SECONDS", "LATCH_CLOUD_TIMEOUT_SECONDS"),
        ("CIEAV_VERSION", "LATCH_VERSION"),
        ("CIEAV_CHROMIUM", "LATCH_CHROMIUM"),
    )
    for primary, legacy in mappings:
        value = os.environ.get(primary) or os.environ.get(legacy)
        if value:
            env[primary] = value
            env[legacy] = value
    for key in (
        "OPENAI_API_KEY", "OPENAI_BASE_URL", "LATCH_AI_PROFILE",
        "LATCH_AI_FAST_MODEL", "LATCH_AI_PRIMARY_MODEL",
        "LATCH_AI_VERIFIER_MODEL", "LATCH_AI_TIMEOUT_MS",
        "CIEAV_RECEIPT_STORE", "CIEAV_PHP_BIN", "CIEAV_XAMPP_MYSQL_BRIDGE",
        "CIEAV_MYSQL_HOST", "CIEAV_MYSQL_PORT", "CIEAV_MYSQL_DATABASE",
        "CIEAV_MYSQL_USER", "CIEAV_CDP_WIN_BRIDGE", "CIEAV_UI_MODE",
        "CIEAV_HEADLESS", "CIEAV_START_URL", "CIEAV_NOTIFICATIONS",
        "CIEAV_NATIVE_APPROVAL_HELPER",
    ):
        value = os.environ.get(key)
        if value:
            env[key] = value
    return env


def _system() -> str:
    return platform.system().lower()


def install(settings: Settings) -> str:
    system = _system()
    if system == "linux": return _install_systemd(settings)
    if system == "darwin": return _install_launchd(settings)
    if system == "windows": return _install_windows(settings)
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def uninstall(settings: Settings) -> str:
    system = _system()
    if system == "linux": return _uninstall_systemd()
    if system == "darwin": return _uninstall_launchd()
    if system == "windows": return _uninstall_windows(settings)
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def start(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit(); subprocess.run(["systemctl", "--user", "start", SERVICE_NAME], check=True)
        return "Started CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kickstart","-k",f"{domain}/{LAUNCHD_LABEL}"],check=True)
        return "Started CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_startup(settings); _start_windows(settings)
        return "Started CIEAV Gateway user process"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def stop(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit(); subprocess.run(["systemctl", "--user","stop",SERVICE_NAME],check=True); return "Stopped CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kill","SIGTERM",f"{domain}/{LAUNCHD_LABEL}"],check=False); return "Stopped CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_startup(settings); _stop_windows(settings); return "Stopped CIEAV Gateway user process"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def restart(settings: Settings) -> str:
    stop(settings)
    time.sleep(0.25)
    return start(settings)


def status(settings: Settings) -> dict[str, object]:
    system = _system()
    configured = False
    detail: str | None = None
    if system == "linux":
        configured = Path.home().joinpath(".config/systemd/user", f"{SERVICE_NAME}.service").exists()
    elif system == "darwin":
        configured = Path.home().joinpath("Library/LaunchAgents", f"{LAUNCHD_LABEL}.plist").exists()
    elif system == "windows":
        configured = _windows_startup_active(settings)
    try:
        with urlopen(f"http://127.0.0.1:{settings.gateway_port}/health", timeout=1.5) as response:
            health = json.loads(response.read().decode("utf-8"))
            running = response.status == 200 and bool(health.get("ok"))
            return {"configured": configured, "running": running, "detail": detail, "health": health}
    except Exception as exc:
        return {"configured": configured, "running": False, "detail": str(exc), "health": None}


def _install_systemd(settings: Settings) -> str:
    unit_dir = Path.home() / ".config/systemd/user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit = unit_dir / f"{SERVICE_NAME}.service"
    command = " ".join(_quote_systemd(x) for x in _module_command(settings))
    lines = ["[Unit]", "Description=CIEAV Gateway", "After=network.target", "", "[Service]", f"ExecStart={command}", "Restart=on-failure", "RestartSec=2"]
    for key, value in _env(settings).items():
        lines.append(f"Environment={_quote_systemd(f'{key}={value}')}" )
    lines += ["", "[Install]", "WantedBy=default.target", ""]
    unit.write_text("\n".join(lines), encoding="utf-8")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", SERVICE_NAME], check=True)
    return "Installed CIEAV Gateway systemd user service"


def _uninstall_systemd() -> str:
    unit = Path.home() / ".config/systemd/user" / f"{SERVICE_NAME}.service"
    subprocess.run(["systemctl", "--user", "disable", "--now", SERVICE_NAME], check=False)
    unit.unlink(missing_ok=True)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    return "Uninstalled CIEAV Gateway systemd user service"


def _require_systemd_unit() -> None:
    unit = Path.home() / ".config/systemd/user" / f"{SERVICE_NAME}.service"
    if not unit.exists(): raise RuntimeError("CIEAV Gateway systemd service is not installed")


def _install_launchd(settings: Settings) -> str:
    launch_dir = Path.home() / "Library/LaunchAgents"
    launch_dir.mkdir(parents=True, exist_ok=True)
    plist = launch_dir / f"{LAUNCHD_LABEL}.plist"
    payload = {"Label": LAUNCHD_LABEL, "ProgramArguments": _module_command(settings), "RunAtLoad": True, "KeepAlive": True, "EnvironmentVariables": _env(settings)}
    plist.write_bytes(plistlib.dumps(payload))
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist)], check=False)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist)], check=True)
    return "Installed CIEAV Gateway launchd agent"


def _uninstall_launchd() -> str:
    plist = Path.home() / "Library/LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist)], check=False)
    plist.unlink(missing_ok=True)
    return "Uninstalled CIEAV Gateway launchd agent"


def _require_launchd_plist() -> None:
    plist = Path.home() / "Library/LaunchAgents" / f"{LAUNCHD_LABEL}.plist"
    if not plist.exists(): raise RuntimeError("CIEAV Gateway launchd agent is not installed")


def _windows_launcher(settings: Settings) -> Path:
    return settings.state_dir / WINDOWS_LAUNCHER


def _windows_process_env(settings: Settings) -> dict[str, str]:
    env = dict(os.environ)
    env.update(_env(settings))
    return env


def _write_windows_launcher(settings: Settings) -> Path:
    launcher = _windows_launcher(settings)
    launcher.parent.mkdir(parents=True, exist_ok=True)
    cmd = subprocess.list2cmdline(_module_command(settings))
    launcher.write_text(
        "$ErrorActionPreference = 'Stop'\n"
        "$env:PYTHONUTF8 = '1'\n"
        f"$cmd = {json.dumps(cmd)}\n"
        "Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c', $cmd) -WindowStyle Hidden\n",
        encoding="utf-8",
    )
    return launcher


def _install_windows(settings: Settings) -> str:
    launcher = _write_windows_launcher(settings)
    command = f'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{launcher}"'
    subprocess.run(["reg", "add", f"HKCU\\{WINDOWS_RUN_KEY}", "/v", WINDOWS_RUN_VALUE, "/t", "REG_SZ", "/d", command, "/f"], check=True, stdout=subprocess.DEVNULL)
    _stop_windows(settings)
    _start_windows(settings)
    return "Installed CIEAV Gateway Windows user startup"


def _uninstall_windows(settings: Settings) -> str:
    _stop_windows(settings)
    subprocess.run(["reg", "delete", f"HKCU\\{WINDOWS_RUN_KEY}", "/v", WINDOWS_RUN_VALUE, "/f"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _windows_launcher(settings).unlink(missing_ok=True)
    return "Uninstalled CIEAV Gateway Windows user startup"


def _windows_startup_active(settings: Settings) -> bool:
    result = subprocess.run(["reg", "query", f"HKCU\\{WINDOWS_RUN_KEY}", "/v", WINDOWS_RUN_VALUE], check=False, capture_output=True, text=True)
    return result.returncode == 0


def _require_windows_startup(settings: Settings) -> None:
    if not _windows_startup_active(settings): raise RuntimeError("CIEAV Gateway Windows user startup is not installed")


def _start_windows(settings: Settings) -> None:
    launcher = _write_windows_launcher(settings)
    subprocess.Popen(["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", str(launcher)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=_windows_process_env(settings), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _stop_windows(settings: Settings) -> None:
    marker = str(settings.root).replace("'", "''")
    script = f"Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like '*{marker}*' -and ($_.CommandLine -like '*cieav_platform*gateway*run*' -or $_.CommandLine -like '*latch_platform.cli*gateway*run*') }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _quote_systemd(value: str) -> str:
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
