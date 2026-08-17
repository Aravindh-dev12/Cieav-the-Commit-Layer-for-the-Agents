#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import stat
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/"release"/"reports"
MAX_CAPTURE=48_000
WINDOWS_RUN_KEY=r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_RUN_VALUE="CIEAV Gateway"
WINDOWS_TEST_PREFIX="cieav-service-lifecycle-"


def canonical(value):
    if isinstance(value,list):return "["+",".join(canonical(x) for x in value)+"]"
    if isinstance(value,dict):return "{"+",".join(json.dumps(k,separators=(",",":"))+":"+canonical(value[k]) for k in sorted(value))+"}"
    return json.dumps(value,separators=(",",":"))


def sha256_file(path:Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()


def host_target()->str:
    system={"Windows":"windows","Darwin":"macos","Linux":"linux"}.get(platform.system(),platform.system().lower())
    machine=platform.machine().lower();arch="arm64" if machine in {"arm64","aarch64"} else "x64" if machine in {"x86_64","amd64"} else machine
    return f"{system}-{arch}"


def run(cmd:list[str],*,cwd:Path,env:dict[str,str],ok=(0,),timeout=45)->subprocess.CompletedProcess:
    p=subprocess.run(cmd,cwd=cwd,env=env,capture_output=True,text=True,timeout=timeout)
    if p.returncode not in ok:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd)}\nstdout:\n{(p.stdout or '')[-MAX_CAPTURE:]}\nstderr:\n{(p.stderr or '')[-MAX_CAPTURE:]}")
    return p


def windows_registered_command()->str|None:
    if platform.system()!="Windows":return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_READ) as key:
            value,_=winreg.QueryValueEx(key,WINDOWS_RUN_VALUE)
            return str(value).strip() or None
    except FileNotFoundError:
        return None


def service_present()->bool:
    system=platform.system()
    if system=="Linux":return (Path.home()/".config/systemd/user/cieav-gateway.service").exists()
    if system=="Darwin":return (Path.home()/"Library/LaunchAgents/ai.cieav.gateway.plist").exists()
    if system=="Windows":return bool(windows_registered_command())
    raise RuntimeError(f"Unsupported platform: {system}")


def windows_gateway_health(port:int=8791)->dict|None:
    try:
        with urlopen(f"http://127.0.0.1:{port}/health",timeout=.8) as response:raw=response.read(65537)
        if len(raw)>65536:return None
        value=json.loads(raw.decode("utf-8") or "{}")
        return value if isinstance(value,dict) and value.get("platform")=="CIEAV Gateway" else None
    except Exception:return None


def windows_process_info(pid:int)->dict|None:
    ps=os.environ.get("COMSPEC")
    powershell="powershell.exe"
    script=(f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}';"
            "if($p){[pscustomobject]@{ExecutablePath=[string]$p.ExecutablePath;CommandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress}")
    try:
        p=subprocess.run([powershell,"-NoProfile","-NonInteractive","-Command",script],capture_output=True,text=True,timeout=8)
        if p.returncode!=0 or not (p.stdout or "").strip():return None
        value=json.loads((p.stdout or "").strip().splitlines()[-1]);return value if isinstance(value,dict) else None
    except Exception:return None


def delete_windows_registration()->None:
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_SET_VALUE) as key:winreg.DeleteValue(key,WINDOWS_RUN_VALUE)
    except FileNotFoundError:pass


def is_lifecycle_owned_text(value:str|None)->bool:
    text=(value or "").lower()
    return WINDOWS_TEST_PREFIX in text and "gateway-service.ps1" in text


def kill_lifecycle_gateway_if_verified(port:int=8791)->bool:
    health=windows_gateway_health(port)
    if not health:return True
    pid=health.get("gatewayPid")
    if not isinstance(pid,int) or pid<=0:return False
    info=windows_process_info(pid) or {};image=str(info.get("ExecutablePath") or "").lower();command=str(info.get("CommandLine") or "").lower()
    owned=WINDOWS_TEST_PREFIX in image or WINDOWS_TEST_PREFIX in command
    if not owned or "cieav.exe" not in (image+" "+command):return False
    try:subprocess.run(["taskkill","/PID",str(pid),"/T","/F"],capture_output=True,text=True,timeout=8)
    except Exception:return False
    deadline=time.time()+6
    while time.time()<deadline:
        if not windows_gateway_health(port):return True
        time.sleep(.15)
    return not bool(windows_gateway_health(port))


def recover_stale_lifecycle_service()->bool:
    """Recover only a stale service created by this smoke harness.

    A real/user CIEAV installation remains protected by the clean-machine refusal.
    Recovery is allowed only when the HKCU Run command carries this harness's
    unique temporary-directory prefix. Any live process must independently prove
    the same prefix before it may be terminated.
    """
    if platform.system()!="Windows":return False
    registered=windows_registered_command()
    if not is_lifecycle_owned_text(registered):return False
    if not kill_lifecycle_gateway_if_verified():
        raise RuntimeError("Refusing stale lifecycle cleanup: live Gateway process is not verified as lifecycle-test owned")
    delete_windows_registration()
    if windows_registered_command():raise RuntimeError("Failed to remove stale lifecycle-test HKCU startup registration")
    print("Recovered stale CIEAV service-lifecycle test registration",flush=True)
    return True


def cleanup_current_lifecycle_service(exe:Path,runtime:Path,env:dict[str,str],state:Path)->None:
    """Best-effort product uninstall followed by verified test-owned fallback cleanup."""
    if not service_present() and not windows_gateway_health(int(env.get("CIEAV_GATEWAY_PORT","8791"))):return
    errors=[]
    try:
        p=subprocess.run([str(exe),"gateway","uninstall"],cwd=runtime,env=env,capture_output=True,text=True,timeout=20)
        if p.returncode!=0:errors.append(f"gateway uninstall rc={p.returncode}: {((p.stderr or p.stdout) or '').strip()[-2000:]}")
    except subprocess.TimeoutExpired:errors.append("gateway uninstall timed out")
    except Exception as exc:errors.append(f"gateway uninstall failed: {type(exc).__name__}: {exc}")
    if not service_present():return
    if platform.system()=="Windows":
        registered=windows_registered_command();expected_marker=str(state/"gateway-service.ps1").lower()
        if not registered or expected_marker not in registered.lower() or not is_lifecycle_owned_text(registered):
            raise RuntimeError("; ".join(errors+["refusing fallback cleanup: registration is not owned by this lifecycle run"]))
        port=int(env.get("CIEAV_GATEWAY_PORT","8791"))
        if not kill_lifecycle_gateway_if_verified(port):
            raise RuntimeError("; ".join(errors+["refusing fallback cleanup: Gateway process ownership could not be verified"]))
        delete_windows_registration()
        if service_present():raise RuntimeError("; ".join(errors+["fallback cleanup could not remove HKCU startup registration"]))
        return
    raise RuntimeError("; ".join(errors+["service remains installed after lifecycle cleanup"]))


def archive_runtime_metadata(archive:Path)->dict:
    with zipfile.ZipFile(archive) as zf:
        try: raw=zf.read("cieav-runtime/runtime.json")
        except KeyError as exc: raise RuntimeError("runtime archive is missing cieav-runtime/runtime.json") from exc
    try: value=json.loads(raw.decode("utf-8"))
    except Exception as exc: raise RuntimeError("runtime archive metadata is unreadable") from exc
    if not isinstance(value,dict):raise RuntimeError("runtime archive metadata is not an object")
    return value


def find_archive(release_dir:Path,target:str,version:str)->Path:
    matches=sorted(release_dir.glob(f"cieav-runtime-{version}-{target}.zip"),key=lambda p:p.stat().st_mtime,reverse=True)
    if not matches:raise RuntimeError(f"No runtime archive for CIEAV {version} {target} in {release_dir}")
    return matches[0]


def validate_archive(archive:Path,*,version:str,target:str)->dict:
    meta=archive_runtime_metadata(archive)
    if meta.get("brand")!="CIEAV":raise RuntimeError("runtime archive brand mismatch")
    if meta.get("version")!=version:raise RuntimeError(f"runtime archive version {meta.get('version')} != source version {version}")
    if meta.get("platform")!=target:raise RuntimeError(f"runtime archive target {meta.get('platform')} != host {target}")
    if int(meta.get("bundleFormat",0))<8:raise RuntimeError("runtime archive is stale: bundleFormat < 8; rebuild the current managed Agent/Commitment runtime before service qualification")
    agent_runtime=meta.get("agentRuntime") or {}
    if not all(agent_runtime.get(key) is True for key in ("managed","commitmentRuntime","toolBroker","proactiveScheduler","apiBundled")):
        raise RuntimeError("runtime archive does not contain the managed Agent/Commitment runtime")
    return meta


def exe_name()->str:return "cieav.exe" if os.name=="nt" else "cieav"


def executable(path:Path):
    if os.name!="nt":path.chmod(path.stat().st_mode|stat.S_IXUSR)


def status_payload(exe:Path,runtime:Path,env:dict[str,str])->dict:
    p=run([str(exe),"gateway","status"],cwd=runtime,env=env)
    try:return json.loads(p.stdout)
    except Exception as exc:raise RuntimeError(f"Gateway status did not return JSON: {p.stdout[-2000:]}") from exc


def wait_active(exe:Path,runtime:Path,env:dict[str,str],expected:bool,timeout:float=12.0)->dict:
    deadline=time.time()+timeout;last={}
    while time.time()<deadline:
        last=status_payload(exe,runtime,env);active=bool(last.get("service",{}).get("active"))
        if active is expected:
            if expected and last.get("gateway")=="offline":time.sleep(.25);continue
            return last
        time.sleep(.25)
    raise RuntimeError(f"Gateway service active={expected} was not observed before timeout; last={json.dumps(last)[:1800]}")


def main()->None:
    ap=argparse.ArgumentParser(description="Exercise the packaged CIEAV per-user OS service lifecycle on a clean test account")
    ap.add_argument("--archive",type=Path)
    ap.add_argument("--release-dir",type=Path,default=ROOT/"release-out")
    ap.add_argument("--mode",choices=("local","publish"),default="local")
    ap.add_argument("--confirm-service-mutation",action="store_true",help="Required acknowledgement: this test installs/removes the per-user CIEAV Gateway service")
    args=ap.parse_args()
    if not args.confirm_service_mutation:raise SystemExit("Refusing OS service mutation without --confirm-service-mutation")
    if service_present():
        recover_stale_lifecycle_service()
    if service_present():
        detail=f" Registered command: {windows_registered_command()}" if platform.system()=="Windows" else ""
        raise SystemExit("Refusing to overwrite an existing CIEAV Gateway service. Use a clean test user/machine and uninstall CIEAV first."+detail)
    dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    if dirty:raise SystemExit("Service lifecycle qualification requires a clean git worktree")
    commit=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    package=json.loads((ROOT/"package.json").read_text("utf-8"));target=host_target();archive=(args.archive or find_archive(args.release_dir.resolve(),target,package["version"])).resolve()
    if not archive.exists():raise SystemExit(f"Archive not found: {archive}")
    runtime_meta=validate_archive(archive,version=package["version"],target=target)
    archive_identity={"filename":archive.name,"sha256":sha256_file(archive),"size":archive.stat().st_size,"bundleFormat":runtime_meta["bundleFormat"]}
    checks={};installed=False
    with tempfile.TemporaryDirectory(prefix=WINDOWS_TEST_PREFIX) as td:
        root=Path(td)/"runtime";state=Path(td)/"state"
        with zipfile.ZipFile(archive) as zf:zf.extractall(root)
        runtime=root/"cieav-runtime";exe=runtime/"bin"/exe_name()
        if not exe.exists():raise RuntimeError("packaged CIEAV executable missing")
        executable(exe)
        env=dict(os.environ);env.update({"CIEAV_HOME":str(runtime),"LATCH_HOME":str(runtime),"CIEAV_STATE_DIR":str(state),"LATCH_STATE_DIR":str(state),"CIEAV_CLOUD_URL":"https://example.invalid","LATCH_CLOUD_URL":"https://example.invalid"})
        failure:BaseException|None=None;cleanup_failure:BaseException|None=None
        try:
            pre=status_payload(exe,runtime,env);checks["preInstallStatus"]=not bool(pre.get("service",{}).get("installed")) and not service_present()
            if not checks["preInstallStatus"]:raise RuntimeError("pre-install service status is not clean")
            run([str(exe),"gateway","install"],cwd=runtime,env=env);installed=True
            if not service_present():raise RuntimeError("Gateway service was not installed")
            live=wait_active(exe,runtime,env,True);checks["install"]=True;checks["status"]=bool(live.get("service",{}).get("installed")) and bool(live.get("service",{}).get("active")) and live.get("gateway")!="offline"
            if not checks["status"]:raise RuntimeError("installed service did not expose a live Gateway")
            if bool(live.get("surfaceRunning")):raise RuntimeError("headless Gateway service unexpectedly auto-started a browser surface")
            checks["headlessByDefault"]=True
            run([str(exe),"gateway","stop"],cwd=runtime,env=env,timeout=20);wait_active(exe,runtime,env,False);checks["stop"]=True
            run([str(exe),"gateway","start"],cwd=runtime,env=env,timeout=20);live=wait_active(exe,runtime,env,True);checks["start"]=True
            if bool(live.get("surfaceRunning")):raise RuntimeError("headless Gateway restart unexpectedly auto-started a browser surface")
            run([str(exe),"gateway","restart"],cwd=runtime,env=env,timeout=25);live=wait_active(exe,runtime,env,True);checks["restart"]=True
            if bool(live.get("surfaceRunning")):raise RuntimeError("headless Gateway restart unexpectedly auto-started a browser surface")
            run([str(exe),"gateway","uninstall"],cwd=runtime,env=env,timeout=20);installed=False;time.sleep(.3)
            if service_present():raise RuntimeError("Gateway service still exists after uninstall")
            post=status_payload(exe,runtime,env);checks["uninstall"]=not bool(post.get("service",{}).get("installed"))
        except BaseException as exc:
            failure=exc
        finally:
            if installed or service_present():
                try:cleanup_current_lifecycle_service(exe,runtime,env,state);installed=False
                except BaseException as exc:cleanup_failure=exc
        if service_present() and cleanup_failure is None:cleanup_failure=RuntimeError("cleanup failed: CIEAV service still present")
        if failure is not None:
            if cleanup_failure is not None:raise RuntimeError(f"{failure}\nAdditionally lifecycle cleanup failed: {cleanup_failure}") from failure
            raise failure
        if cleanup_failure is not None:raise cleanup_failure
        checks["cleanup"]=True
    evidence={"schemaVersion":1,"product":"CIEAV","version":package["version"],"mode":args.mode,"target":target,"commit":commit,"archive":archive_identity,"verifiedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),"checks":checks}
    digest=hashlib.sha256(canonical(evidence).encode()).hexdigest();out={**evidence,"digestAlgorithm":"SHA-256","digest":digest}
    REPORTS.mkdir(parents=True,exist_ok=True);name=f"cieav-service-lifecycle-{package['version']}-{args.mode}-{target}-{commit[:12]}.json";(REPORTS/name).write_text(json.dumps(out,indent=2)+"\n","utf-8");(REPORTS/"latest-service-lifecycle.json").write_text(json.dumps(out,indent=2)+"\n","utf-8")
    print(f"CIEAV service lifecycle qualification PASS · {target} · {archive.name}")
    print(f"Evidence: {REPORTS/name}")


if __name__=="__main__":main()
