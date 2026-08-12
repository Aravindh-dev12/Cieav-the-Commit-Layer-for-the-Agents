from __future__ import annotations

import os
import platform
import plistlib
import shutil
import subprocess
import sys
import time
from pathlib import Path

from .config import Settings

SERVICE_NAME = "latch-gateway"
LAUNCHD_LABEL = "ai.latch.gateway"
WINDOWS_TASK = "LATCH Gateway"


def _python() -> str:
    return str(Path(sys.executable).resolve())


def _module_command(settings: Settings) -> list[str]:
    executable = _python()
    if getattr(sys, "frozen", False):
        return [executable, "gateway", "run"]
    return [executable, "-m", "latch_platform.cli", "gateway", "run"]


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


def start(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit()
        subprocess.run(["systemctl", "--user", "start", SERVICE_NAME], check=True)
        return "Started LATCH Gateway service"
    if system == "darwin":
        _require_launchd_plist()
        domain = f"gui/{os.getuid()}"
        subprocess.run(["launchctl", "kickstart", "-k", f"{domain}/{LAUNCHD_LABEL}"], check=True)
        return "Started LATCH Gateway launchd agent"
    if system == "windows":
        _require_windows_task()
        subprocess.run(["schtasks", "/Run", "/TN", WINDOWS_TASK], check=True)
        return "Started LATCH Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def stop(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit()
        subprocess.run(["systemctl", "--user", "stop", SERVICE_NAME], check=True)
        return "Stopped LATCH Gateway service"
    if system == "darwin":
        _require_launchd_plist()
        domain = f"gui/{os.getuid()}"
        subprocess.run(["launchctl", "kill", "SIGTERM", f"{domain}/{LAUNCHD_LABEL}"], check=False)
        return "Stopped LATCH Gateway launchd agent"
    if system == "windows":
        _require_windows_task()
        subprocess.run(["schtasks", "/End", "/TN", WINDOWS_TASK], check=False)
        return "Stopped LATCH Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def restart(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit()
        subprocess.run(["systemctl", "--user", "restart", SERVICE_NAME], check=True)
        return "Restarted LATCH Gateway service"
    if system == "darwin":
        _require_launchd_plist()
        domain = f"gui/{os.getuid()}"
        subprocess.run(["launchctl", "kickstart", "-k", f"{domain}/{LAUNCHD_LABEL}"], check=True)
        return "Restarted LATCH Gateway launchd agent"
    if system == "windows":
        _require_windows_task()
        subprocess.run(["schtasks", "/End", "/TN", WINDOWS_TASK], check=False)
        time.sleep(.25)
        subprocess.run(["schtasks", "/Run", "/TN", WINDOWS_TASK], check=True)
        return "Restarted LATCH Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def service_status(settings: Settings) -> dict:
    system = _system()
    if system == "linux":
        unit = _systemd_unit()
        proc = subprocess.run(["systemctl", "--user", "is-active", SERVICE_NAME], capture_output=True, text=True)
        return {
            "platform": "systemd-user",
            "installed": unit.exists(),
            "active": proc.returncode == 0,
            "detail": proc.stdout.strip() or proc.stderr.strip() or "inactive",
        }
    if system == "darwin":
        plist = _launchd_plist()
        proc = subprocess.run(["launchctl", "print", f"gui/{os.getuid()}/{LAUNCHD_LABEL}"], capture_output=True, text=True)
        return {
            "platform": "launchd",
            "installed": plist.exists(),
            "active": proc.returncode == 0,
            "detail": "loaded" if proc.returncode == 0 else "not loaded",
        }
    if system == "windows":
        proc = subprocess.run(
            ["schtasks", "/Query", "/TN", WINDOWS_TASK, "/FO", "LIST", "/V"],
            capture_output=True,
            text=True,
        )
        detail = (proc.stdout or proc.stderr).strip()
        active = proc.returncode == 0 and any(
            marker in detail.lower() for marker in ["status:                               running", "status: running"]
        )
        return {
            "platform": "Task Scheduler",
            "installed": proc.returncode == 0,
            "active": active,
            "detail": detail[-700:] if detail else "not installed",
        }
    return {"platform": platform.system(), "installed": False, "active": False, "detail": "unsupported"}


def _systemd_unit() -> Path:
    return Path.home() / ".config" / "systemd" / "user" / f"{SERVICE_NAME}.service"


def _launchd_plist() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LAUNCHD_LABEL}.plist"


def _require_systemd_unit() -> None:
    if not _systemd_unit().exists():
        raise RuntimeError("LATCH Gateway is not installed. Run: latch gateway install")


def _require_launchd_plist() -> None:
    if not _launchd_plist().exists():
        raise RuntimeError("LATCH Gateway is not installed. Run: latch gateway install")


def _require_windows_task() -> None:
    proc = subprocess.run(["schtasks", "/Query", "/TN", WINDOWS_TASK], capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError("LATCH Gateway is not installed. Run: latch gateway install")


def _install_systemd(settings: Settings) -> str:
    if not shutil.which("systemctl"):
        raise RuntimeError("systemctl not found")
    unit = _systemd_unit()
    unit.parent.mkdir(parents=True, exist_ok=True)
    env_lines = "\n".join(f'Environment="{k}={_escape_systemd(v)}"' for k, v in _env(settings).items())
    command = " ".join(_quote_systemd(x) for x in _module_command(settings))
    content = f"""[Unit]
Description=LATCH always-on commit gateway
After=default.target

[Service]
Type=simple
WorkingDirectory={_quote_systemd(str(settings.root))}
{env_lines}
ExecStart={command}
Restart=on-failure
RestartSec=3
TimeoutStopSec=12

[Install]
WantedBy=default.target
"""
    unit.write_text(content, "utf-8")
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "--now", SERVICE_NAME], check=True)
    return f"Installed and started {unit}"


def _uninstall_systemd() -> str:
    unit = _systemd_unit()
    subprocess.run(["systemctl", "--user", "disable", "--now", SERVICE_NAME], check=False)
    if unit.exists():
        unit.unlink()
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
    return "Removed LATCH systemd user service"


def _escape_systemd(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _quote_systemd(value: str) -> str:
    return '"' + _escape_systemd(value) + '"'


def _install_launchd(settings: Settings) -> str:
    plist_path = _launchd_plist()
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    log_dir = settings.state_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "Label": LAUNCHD_LABEL,
        "ProgramArguments": _module_command(settings),
        "WorkingDirectory": str(settings.root),
        "EnvironmentVariables": _env(settings),
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "ThrottleInterval": 3,
        "StandardOutPath": str(log_dir / "gateway-service.out.log"),
        "StandardErrorPath": str(log_dir / "gateway-service.err.log"),
        "ProcessType": "Interactive",
    }
    with plist_path.open("wb") as f:
        plistlib.dump(payload, f)
    domain = f"gui/{os.getuid()}"
    subprocess.run(["launchctl", "bootout", domain, str(plist_path)], check=False, capture_output=True)
    subprocess.run(["launchctl", "bootstrap", domain, str(plist_path)], check=True)
    subprocess.run(["launchctl", "enable", f"{domain}/{LAUNCHD_LABEL}"], check=False)
    subprocess.run(["launchctl", "kickstart", "-k", f"{domain}/{LAUNCHD_LABEL}"], check=False)
    return f"Installed and started {plist_path}"


def _uninstall_launchd() -> str:
    plist_path = _launchd_plist()
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}", str(plist_path)], check=False, capture_output=True)
    if plist_path.exists():
        plist_path.unlink()
    return "Removed LATCH launchd agent"


def _install_windows(settings: Settings) -> str:
    command = subprocess.list2cmdline(_module_command(settings))
    env_prefix = " && ".join(f'set "{k}={v}"' for k, v in _env(settings).items())
    wrapped = f'cmd /d /c "cd /d {subprocess.list2cmdline([str(settings.root)])} && {env_prefix} && {command}"'
    subprocess.run(
        [
            "schtasks",
            "/Create",
            "/F",
            "/SC",
            "ONLOGON",
            "/TN",
            WINDOWS_TASK,
            "/TR",
            wrapped,
        ],
        check=True,
    )
    subprocess.run(["schtasks", "/Run", "/TN", WINDOWS_TASK], check=False)
    return "Installed LATCH Gateway as a per-user logon task"


def _uninstall_windows() -> str:
    subprocess.run(["schtasks", "/End", "/TN", WINDOWS_TASK], check=False)
    subprocess.run(["schtasks", "/Delete", "/F", "/TN", WINDOWS_TASK], check=False)
    return "Removed LATCH Gateway scheduled task"
