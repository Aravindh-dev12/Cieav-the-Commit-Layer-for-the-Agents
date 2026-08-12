from __future__ import annotations

import os
import platform
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

from .config import Settings

SERVICE_NAME = "latch-gateway"


def _python() -> str:
    return str(Path(sys.executable).resolve())


def _module_command(settings: Settings) -> list[str]:
    return [_python(), "-m", "latch_platform.cli", "gateway", "run"]


def _env(settings: Settings) -> dict[str, str]:
    return {
        "LATCH_HOME": str(settings.root),
        "LATCH_STATE_DIR": str(settings.state_dir),
        "LATCH_GATEWAY_PORT": str(settings.gateway_port),
        "LATCH_CONTROL_PORT": str(settings.control_port),
        "LATCH_API_PORT": str(settings.api_port),
    }


def _system() -> str:
    return platform.system().lower()


def install(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        return _install_systemd(settings)
    if system == "darwin":
        return _install_launchd(settings)
    if system == "windows":
        return _install_windows(settings)
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def uninstall(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        return _uninstall_systemd()
    if system == "darwin":
        return _uninstall_launchd()
    if system == "windows":
        return _uninstall_windows()
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def service_status(settings: Settings) -> dict:
    system = _system()
    if system == "linux":
        unit = Path.home() / ".config" / "systemd" / "user" / f"{SERVICE_NAME}.service"
        proc = subprocess.run(["systemctl", "--user", "is-active", SERVICE_NAME], capture_output=True, text=True)
        return {"platform": "systemd-user", "installed": unit.exists(), "active": proc.returncode == 0, "detail": proc.stdout.strip() or proc.stderr.strip()}
    if system == "darwin":
        label = "ai.latch.gateway"
        plist = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
        proc = subprocess.run(["launchctl", "print", f"gui/{os.getuid()}/{label}"], capture_output=True, text=True)
        return {"platform": "launchd", "installed": plist.exists(), "active": proc.returncode == 0, "detail": "loaded" if proc.returncode == 0 else "not loaded"}
    if system == "windows":
        proc = subprocess.run(["schtasks", "/Query", "/TN", "LATCH Gateway"], capture_output=True, text=True)
        return {"platform": "Task Scheduler", "installed": proc.returncode == 0, "active": proc.returncode == 0, "detail": proc.stdout.strip()[-500:]}
    return {"platform": platform.system(), "installed": False, "active": False, "detail": "unsupported"}


def _install_systemd(settings: Settings) -> str:
    if not shutil.which("systemctl"):
        raise RuntimeError("systemctl not found")
    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit = unit_dir / f"{SERVICE_NAME}.service"
    env_lines = "\n".join(f'Environment="{k}={v}"' for k, v in _env(settings).items())
    command = " ".join(_quote_systemd(x) for x in _module_command(settings))
    content = f"""[Unit]
Description=LATCH always-on commit gateway
After=default.target

[Service]
Type=simple
{env_lines}
ExecStart={command}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
"""
    unit.write_text(content, "utf-8")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", SERVICE_NAME], check=True)
    return f"Installed and started {unit}"


def _uninstall_systemd() -> str:
    unit = Path.home() / ".config" / "systemd" / "user" / f"{SERVICE_NAME}.service"
    subprocess.run(["systemctl", "--user", "disable", "--now", SERVICE_NAME], check=False)
    if unit.exists():
        unit.unlink()
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    return "Removed LATCH systemd user service"


def _quote_systemd(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _install_launchd(settings: Settings) -> str:
    label = "ai.latch.gateway"
    directory = Path.home() / "Library" / "LaunchAgents"
    directory.mkdir(parents=True, exist_ok=True)
    plist_path = directory / f"{label}.plist"
    log_dir = settings.state_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": label,
        "ProgramArguments": _module_command(settings),
        "EnvironmentVariables": _env(settings),
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "StandardOutPath": str(log_dir / "gateway-service.out.log"),
        "StandardErrorPath": str(log_dir / "gateway-service.err.log"),
        "ProcessType": "Interactive",
    }
    with plist_path.open("wb") as f:
        plistlib.dump(payload, f)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)
    subprocess.run(["launchctl", "enable", f"{domain}/{label}"], check=False)
    return f"Installed and started {plist_path}"


def _uninstall_launchd() -> str:
    label = "ai.latch.gateway"
    plist_path = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(plist_path)], check=False, capture_output=True)
    if plist_path.exists():
        plist_path.unlink()
    return "Removed LATCH launchd agent"


def _install_windows(settings: Settings) -> str:
    command = subprocess.list2cmdline(_module_command(settings))
    env_prefix = " && ".join(f'set "{k}={v}"' for k, v in _env(settings).items())
    wrapped = f'cmd /d /c "{env_prefix} && {command}"'
    subprocess.run([
        "schtasks", "/Create", "/F", "/SC", "ONLOGON", "/TN", "LATCH Gateway",
        "/TR", wrapped,
    ], check=True)
    subprocess.run(["schtasks", "/Run", "/TN", "LATCH Gateway"], check=False)
    return "Installed LATCH Gateway as a per-user logon task"


def _uninstall_windows() -> str:
    subprocess.run(["schtasks", "/Delete", "/F", "/TN", "LATCH Gateway"], check=False)
    return "Removed LATCH Gateway scheduled task"
