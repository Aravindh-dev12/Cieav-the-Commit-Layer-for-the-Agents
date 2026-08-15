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

SERVICE_NAME = "cieav-gateway"
LEGACY_SERVICE_NAME = "latch-gateway"
LAUNCHD_LABEL = "ai.cieav.gateway"
LEGACY_LAUNCHD_LABEL = "ai.latch.gateway"
WINDOWS_TASK = "CIEAV Gateway"
LEGACY_WINDOWS_TASK = "LATCH Gateway"
WINDOWS_LAUNCHER = "gateway-service.ps1"


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
        _require_windows_task(); subprocess.run(["schtasks","/Run","/TN",WINDOWS_TASK],check=True)
        return "Started CIEAV Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def stop(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit(); subprocess.run(["systemctl","--user","stop",SERVICE_NAME],check=True); return "Stopped CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kill","SIGTERM",f"{domain}/{LAUNCHD_LABEL}"],check=False); return "Stopped CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_task(); subprocess.run(["schtasks","/End","/TN",WINDOWS_TASK],check=False); return "Stopped CIEAV Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def restart(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit(); subprocess.run(["systemctl","--user","restart",SERVICE_NAME],check=True); return "Restarted CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kickstart","-k",f"{domain}/{LAUNCHD_LABEL}"],check=True); return "Restarted CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_task(); subprocess.run(["schtasks","/End","/TN",WINDOWS_TASK],check=False); time.sleep(.25); subprocess.run(["schtasks","/Run","/TN",WINDOWS_TASK],check=True); return "Restarted CIEAV Gateway scheduled task"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def service_status(settings: Settings) -> dict:
    system = _system()
    if system == "linux":
        unit = _systemd_unit(); proc = subprocess.run(["systemctl","--user","is-active",SERVICE_NAME],capture_output=True,text=True)
        legacy = _legacy_systemd_unit().exists()
        return {"platform":"systemd-user","installed":unit.exists(),"active":proc.returncode==0,"legacyInstalled":legacy,"detail":proc.stdout.strip() or proc.stderr.strip() or "inactive"}
    if system == "darwin":
        plist = _launchd_plist(); proc=subprocess.run(["launchctl","print",f"gui/{os.getuid()}/{LAUNCHD_LABEL}"],capture_output=True,text=True)
        return {"platform":"launchd","installed":plist.exists(),"active":proc.returncode==0,"legacyInstalled":_legacy_launchd_plist().exists(),"detail":"loaded" if proc.returncode==0 else "not loaded"}
    if system == "windows":
        proc=subprocess.run(["schtasks","/Query","/TN",WINDOWS_TASK,"/FO","LIST","/V"],capture_output=True,text=True); detail=(proc.stdout or proc.stderr).strip()
        legacy=subprocess.run(["schtasks","/Query","/TN",LEGACY_WINDOWS_TASK],capture_output=True).returncode==0
        active=proc.returncode==0 and "running" in detail.lower()
        return {"platform":"Task Scheduler","installed":proc.returncode==0,"active":active,"legacyInstalled":legacy,"detail":detail[-700:] if detail else "not installed"}
    return {"platform":platform.system(),"installed":False,"active":False,"detail":"unsupported"}


def _systemd_unit() -> Path: return Path.home()/".config"/"systemd"/"user"/f"{SERVICE_NAME}.service"
def _legacy_systemd_unit() -> Path: return Path.home()/".config"/"systemd"/"user"/f"{LEGACY_SERVICE_NAME}.service"
def _launchd_plist() -> Path: return Path.home()/"Library"/"LaunchAgents"/f"{LAUNCHD_LABEL}.plist"
def _legacy_launchd_plist() -> Path: return Path.home()/"Library"/"LaunchAgents"/f"{LEGACY_LAUNCHD_LABEL}.plist"
def _windows_launcher(settings: Settings) -> Path: return settings.state_dir/WINDOWS_LAUNCHER

def _require_systemd_unit() -> None:
    if not _systemd_unit().exists(): raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")
def _require_launchd_plist() -> None:
    if not _launchd_plist().exists(): raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")
def _require_windows_task() -> None:
    if subprocess.run(["schtasks","/Query","/TN",WINDOWS_TASK],capture_output=True).returncode!=0: raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")

def _escape_systemd(value:str)->str: return value.replace("\\","\\\\").replace('"','\\"')
def _quote_systemd(value:str)->str: return '"'+_escape_systemd(value)+'"'
def _quote_powershell(value: str) -> str: return "'" + value.replace("'", "''") + "'"

def _remove_legacy_linux() -> None:
    subprocess.run(["systemctl","--user","disable","--now",LEGACY_SERVICE_NAME],check=False,capture_output=True)
    if _legacy_systemd_unit().exists(): _legacy_systemd_unit().unlink()

def _install_systemd(settings:Settings)->str:
    if not shutil.which("systemctl"): raise RuntimeError("systemctl not found")
    _remove_legacy_linux()
    unit=_systemd_unit(); unit.parent.mkdir(parents=True,exist_ok=True)
    env_lines="\n".join(f'Environment="{k}={_escape_systemd(v)}"' for k,v in _env(settings).items())
    command=" ".join(_quote_systemd(x) for x in _module_command(settings))
    unit.write_text(f"""[Unit]\nDescription=CIEAV always-on commit gateway\nAfter=default.target\n\n[Service]\nType=simple\nWorkingDirectory={_quote_systemd(str(settings.root))}\n{env_lines}\nExecStart={command}\nRestart=on-failure\nRestartSec=3\nTimeoutStopSec=12\n\n[Install]\nWantedBy=default.target\n""","utf-8")
    subprocess.run(["systemctl","--user","daemon-reload"],check=True); subprocess.run(["systemctl","--user","enable","--now",SERVICE_NAME],check=True)
    return f"Installed and started {unit}"

def _uninstall_systemd()->str:
    for name,path in ((SERVICE_NAME,_systemd_unit()),(LEGACY_SERVICE_NAME,_legacy_systemd_unit())):
        subprocess.run(["systemctl","--user","disable","--now",name],check=False)
        if path.exists(): path.unlink()
    subprocess.run(["systemctl","--user","daemon-reload"],check=False); return "Removed CIEAV Gateway systemd service"

def _install_launchd(settings:Settings)->str:
    plist_path=_launchd_plist(); plist_path.parent.mkdir(parents=True,exist_ok=True); log_dir=settings.state_dir; log_dir.mkdir(parents=True,exist_ok=True); domain=f"gui/{os.getuid()}"
    subprocess.run(["launchctl","bootout",domain,str(_legacy_launchd_plist())],check=False,capture_output=True)
    if _legacy_launchd_plist().exists(): _legacy_launchd_plist().unlink()
    payload={"Label":LAUNCHD_LABEL,"ProgramArguments":_module_command(settings),"WorkingDirectory":str(settings.root),"EnvironmentVariables":_env(settings),"RunAtLoad":True,"KeepAlive":{"SuccessfulExit":False},"ThrottleInterval":3,"StandardOutPath":str(log_dir/"gateway-service.out.log"),"StandardErrorPath":str(log_dir/"gateway-service.err.log"),"ProcessType":"Interactive"}
    with plist_path.open("wb") as f: plistlib.dump(payload,f)
    subprocess.run(["launchctl","bootout",domain,str(plist_path)],check=False,capture_output=True); subprocess.run(["launchctl","bootstrap",domain,str(plist_path)],check=True); subprocess.run(["launchctl","enable",f"{domain}/{LAUNCHD_LABEL}"],check=False); subprocess.run(["launchctl","kickstart","-k",f"{domain}/{LAUNCHD_LABEL}"],check=False)
    return f"Installed and started {plist_path}"

def _uninstall_launchd()->str:
    domain=f"gui/{os.getuid()}"
    for label,path in ((LAUNCHD_LABEL,_launchd_plist()),(LEGACY_LAUNCHD_LABEL,_legacy_launchd_plist())):
        subprocess.run(["launchctl","bootout",domain,str(path)],check=False,capture_output=True)
        if path.exists(): path.unlink()
    return "Removed CIEAV Gateway launchd agent"

def _install_windows(settings:Settings)->str:
    subprocess.run(["schtasks","/End","/TN",LEGACY_WINDOWS_TASK],check=False,capture_output=True); subprocess.run(["schtasks","/Delete","/F","/TN",LEGACY_WINDOWS_TASK],check=False,capture_output=True)
    launcher=_windows_launcher(settings); launcher.parent.mkdir(parents=True,exist_ok=True)
    env_lines=[f"$env:{key}={_quote_powershell(value)}" for key,value in _env(settings).items()]
    command=_module_command(settings)
    invoke="& "+" ".join(_quote_powershell(part) for part in command)
    script="\r\n".join([
        "$ErrorActionPreference='Stop'",
        *env_lines,
        f"Set-Location -LiteralPath {_quote_powershell(str(settings.root))}",
        invoke,
        "exit $LASTEXITCODE",
        "",
    ])
    launcher.write_text(script,"utf-8-sig")
    task_action=subprocess.list2cmdline(["powershell.exe","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",str(launcher)])
    if len(task_action)>261:
        launcher.unlink(missing_ok=True)
        raise RuntimeError(f"Windows scheduled-task launcher path is too long ({len(task_action)} characters); move CIEAV state to a shorter path")
    try:
        subprocess.run(["schtasks","/Create","/F","/SC","ONLOGON","/TN",WINDOWS_TASK,"/TR",task_action],check=True)
    except Exception:
        launcher.unlink(missing_ok=True)
        raise
    subprocess.run(["schtasks","/Run","/TN",WINDOWS_TASK],check=False)
    return f"Installed CIEAV Gateway as a per-user logon task using {launcher}"

def _uninstall_windows(settings:Settings)->str:
    for task in (WINDOWS_TASK,LEGACY_WINDOWS_TASK):
        subprocess.run(["schtasks","/End","/TN",task],check=False); subprocess.run(["schtasks","/Delete","/F","/TN",task],check=False)
    _windows_launcher(settings).unlink(missing_ok=True)
    return "Removed CIEAV Gateway scheduled task"
