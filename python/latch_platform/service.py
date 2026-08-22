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
        _require_systemd_unit(); subprocess.run(["systemctl","--user","stop",SERVICE_NAME],check=True); return "Stopped CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kill","SIGTERM",f"{domain}/{LAUNCHD_LABEL}"],check=False); return "Stopped CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_startup(settings); _stop_windows(settings); return "Stopped CIEAV Gateway user process"
    raise RuntimeError(f"Unsupported platform: {platform.system()}")


def restart(settings: Settings) -> str:
    system = _system()
    if system == "linux":
        _require_systemd_unit(); subprocess.run(["systemctl","--user","restart",SERVICE_NAME],check=True); return "Restarted CIEAV Gateway service"
    if system == "darwin":
        _require_launchd_plist(); domain=f"gui/{os.getuid()}"; subprocess.run(["launchctl","kickstart","-k",f"{domain}/{LAUNCHD_LABEL}"],check=True); return "Restarted CIEAV Gateway launchd agent"
    if system == "windows":
        _require_windows_startup(settings); _stop_windows(settings); time.sleep(.25); _start_windows(settings); return "Restarted CIEAV Gateway user process"
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
        registered=_windows_registered_command()
        expected=_windows_startup_command(settings)
        installed=registered==expected
        health=_windows_gateway_health(settings)
        legacy=any(subprocess.run(["schtasks","/Query","/TN",name],capture_output=True).returncode==0 for name in (WINDOWS_TASK,LEGACY_WINDOWS_TASK))
        if installed:
            detail=f"HKCU startup registered; gateway pid={health.get('gatewayPid')}" if health else "HKCU startup registered; gateway offline"
        elif registered:
            detail="HKCU startup entry points to a different CIEAV runtime"
        else:
            detail="not installed"
        return {"platform":"Windows user startup","installed":installed,"active":bool(health),"legacyInstalled":legacy,"detail":detail}
    return {"platform":platform.system(),"installed":False,"active":False,"detail":"unsupported"}


def _systemd_unit() -> Path: return Path.home()/".config"/"systemd"/"user"/f"{SERVICE_NAME}.service"
def _legacy_systemd_unit() -> Path: return Path.home()/".config"/"systemd"/"user"/f"{LEGACY_SERVICE_NAME}.service"
def _launchd_plist() -> Path: return Path.home()/"Library"/"LaunchAgents"/f"{LAUNCHD_LABEL}.plist"
def _legacy_launchd_plist() -> Path: return Path.home()/"Library/LaunchAgents"/f"{LEGACY_LAUNCHD_LABEL}.plist"
def _windows_launcher(settings: Settings) -> Path: return settings.state_dir/WINDOWS_LAUNCHER

def _require_systemd_unit() -> None:
    if not _systemd_unit().exists(): raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")
def _require_launchd_plist() -> None:
    if not _launchd_plist().exists(): raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")
def _require_windows_startup(settings: Settings) -> None:
    if _windows_registered_command()!=_windows_startup_command(settings): raise RuntimeError("CIEAV Gateway is not installed. Run: cieav gateway install")

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

def _windows_launcher_command(settings: Settings) -> list[str]:
    return ["powershell.exe","-NoProfile","-NonInteractive","-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-File",str(_windows_launcher(settings))]

def _windows_startup_command(settings: Settings) -> str:
    return subprocess.list2cmdline(_windows_launcher_command(settings))

def _windows_registered_command() -> str | None:
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_READ) as key:
            value,_=winreg.QueryValueEx(key,WINDOWS_RUN_VALUE)
            return str(value)
    except FileNotFoundError:
        return None

def _set_windows_registration(settings: Settings) -> None:
    import winreg
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_SET_VALUE) as key:
        winreg.SetValueEx(key,WINDOWS_RUN_VALUE,0,winreg.REG_SZ,_windows_startup_command(settings))

def _delete_windows_registration() -> None:
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key,WINDOWS_RUN_VALUE)
    except FileNotFoundError:
        pass

def _windows_gateway_health(settings: Settings) -> dict | None:
    try:
        # Gateway /health can synchronously inspect the semantic child with a
        # 1.5s inner timeout. Keep the outer Windows service probe above that
        # bound so a live Gateway is not misclassified as offline.
        with urlopen(f"http://127.0.0.1:{settings.gateway_port}/health",timeout=2.5) as response:
            raw=response.read(65537)
        if len(raw)>65536:return None
        value=json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(value,dict) or value.get("platform")!="CIEAV Gateway":return None
        pid=value.get("gatewayPid")
        if not isinstance(pid,int) or pid<=0:return None
        return value
    except Exception:
        return None

def _windows_process_path(pid: int) -> str | None:
    ps=shutil.which("powershell") or shutil.which("pwsh")
    if not ps:return None
    script=f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if($p){{$p.ExecutablePath}}"
    proc=subprocess.run([ps,"-NoProfile","-Command",script],capture_output=True,text=True,timeout=10)
    value=(proc.stdout or "").strip()
    return value or None

def _windows_process_env(settings: Settings) -> dict[str, str]:
    env=dict(os.environ)
    env.update(_env(settings))
    return env

def _service_log_tail(settings: Settings, limit: int = 5000) -> str:
    parts=[]
    for name in ("gateway-service.out.log","gateway-service.err.log"):
        path=settings.state_dir/name
        try:
            text=path.read_text("utf-8",errors="replace")[-limit:]
        except OSError:
            continue
        if text.strip():parts.append(f"{name}:\n{text}")
    return "\n".join(parts)[-limit:]

def _start_windows(settings: Settings) -> None:
    if _windows_gateway_health(settings):return
    settings.state_dir.mkdir(parents=True,exist_ok=True)
    out_path=settings.state_dir/"gateway-service.out.log";err_path=settings.state_dir/"gateway-service.err.log"
    creationflags=(getattr(subprocess,"CREATE_NEW_PROCESS_GROUP",0x00000200)|getattr(subprocess,"CREATE_NO_WINDOW",0x08000000))
    with out_path.open("ab") as out, err_path.open("ab") as err:
        child=subprocess.Popen(_module_command(settings),cwd=settings.root,env=_windows_process_env(settings),stdin=subprocess.DEVNULL,stdout=out,stderr=err,close_fds=True,creationflags=creationflags)
    time.sleep(.2)
    code=child.poll()
    if code is not None:
        tail=_service_log_tail(settings)
        raise RuntimeError(f"CIEAV Gateway exited during Windows startup with code {code}"+(f"\n{tail}" if tail else ""))

def _stop_windows(settings: Settings) -> None:
    health=_windows_gateway_health(settings)
    if not health:return
    pid=int(health["gatewayPid"])
    actual=_windows_process_path(pid)
    expected=_python()
    if not actual or os.path.normcase(str(Path(actual).resolve()))!=os.path.normcase(str(Path(expected).resolve())):
        raise RuntimeError(f"Refusing to stop PID {pid}: process image does not match the CIEAV runtime")
    subprocess.run(["taskkill","/PID",str(pid),"/T","/F"],check=False,capture_output=True,text=True)
    deadline=time.time()+6.0
    while time.time()<deadline:
        if not _windows_gateway_health(settings):return
        time.sleep(.15)
    raise RuntimeError("CIEAV Gateway did not stop before timeout")

def _write_windows_launcher(settings: Settings) -> Path:
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
    return launcher

def _remove_legacy_windows_tasks() -> None:
    for task in (WINDOWS_TASK,LEGACY_WINDOWS_TASK):
        subprocess.run(["schtasks","/End","/TN",task],check=False,capture_output=True)
        subprocess.run(["schtasks","/Delete","/F","/TN",task],check=False,capture_output=True)

def _install_windows(settings:Settings)->str:
    _remove_legacy_windows_tasks()
    launcher=_write_windows_launcher(settings)
    try:
        _set_windows_registration(settings)
        _start_windows(settings)
    except Exception:
        _delete_windows_registration(); launcher.unlink(missing_ok=True); raise
    return f"Installed CIEAV Gateway as a per-user startup app using {launcher}"

def _uninstall_windows(settings:Settings)->str:
    _stop_windows(settings)
    _delete_windows_registration()
    _remove_legacy_windows_tasks()
    _windows_launcher(settings).unlink(missing_ok=True)
    return "Removed CIEAV Gateway per-user startup registration"