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

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/"release"/"reports"
MAX_CAPTURE=48_000
WINDOWS_RUN_KEY=r"Software\Microsoft\Windows\CurrentVersion\Run"
WINDOWS_RUN_VALUE="CIEAV Gateway"


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


def service_present()->bool:
    system=platform.system()
    if system=="Linux":return (Path.home()/".config/systemd/user/cieav-gateway.service").exists()
    if system=="Darwin":return (Path.home()/"Library/LaunchAgents/ai.cieav.gateway.plist").exists()
    if system=="Windows":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_READ) as key:
                value,_=winreg.QueryValueEx(key,WINDOWS_RUN_VALUE)
                return bool(str(value).strip())
        except FileNotFoundError:
            return False
    raise RuntimeError(f"Unsupported platform: {system}")


def find_archive(release_dir:Path,target:str)->Path:
    matches=sorted(release_dir.glob(f"cieav-runtime-*-{target}.zip"),key=lambda p:p.stat().st_mtime,reverse=True)
    if not matches:raise RuntimeError(f"No runtime archive for {target} in {release_dir}")
    return matches[0]


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
    if service_present():raise SystemExit("Refusing to overwrite an existing CIEAV Gateway service. Use a clean test user/machine and uninstall CIEAV first.")
    dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    if dirty:raise SystemExit("Service lifecycle qualification requires a clean git worktree")
    commit=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    package=json.loads((ROOT/"package.json").read_text("utf-8"));target=host_target();archive=(args.archive or find_archive(args.release_dir.resolve(),target)).resolve()
    if not archive.exists():raise SystemExit(f"Archive not found: {archive}")
    archive_identity={"filename":archive.name,"sha256":sha256_file(archive),"size":archive.stat().st_size}
    checks={};installed=False
    with tempfile.TemporaryDirectory(prefix="cieav-service-lifecycle-") as td:
        root=Path(td)/"runtime";state=Path(td)/"state"
        with zipfile.ZipFile(archive) as zf:zf.extractall(root)
        runtime=root/"cieav-runtime";exe=runtime/"bin"/exe_name()
        if not exe.exists():raise RuntimeError("packaged CIEAV executable missing")
        executable(exe)
        env=dict(os.environ);env.update({"CIEAV_HOME":str(runtime),"LATCH_HOME":str(runtime),"CIEAV_STATE_DIR":str(state),"LATCH_STATE_DIR":str(state),"CIEAV_CLOUD_URL":"https://example.invalid","LATCH_CLOUD_URL":"https://example.invalid"})
        try:
            pre=status_payload(exe,runtime,env);checks["preInstallStatus"]=not bool(pre.get("service",{}).get("installed")) and not service_present()
            if not checks["preInstallStatus"]:raise RuntimeError("pre-install service status is not clean")
            run([str(exe),"gateway","install"],cwd=runtime,env=env);installed=True
            if not service_present():raise RuntimeError("Gateway service was not installed")
            live=wait_active(exe,runtime,env,True);checks["install"]=True;checks["status"]=bool(live.get("service",{}).get("installed")) and bool(live.get("service",{}).get("active")) and live.get("gateway")!="offline"
            if not checks["status"]:raise RuntimeError("installed service did not expose a live Gateway")
            run([str(exe),"gateway","stop"],cwd=runtime,env=env);wait_active(exe,runtime,env,False);checks["stop"]=True
            run([str(exe),"gateway","start"],cwd=runtime,env=env);wait_active(exe,runtime,env,True);checks["start"]=True
            run([str(exe),"gateway","restart"],cwd=runtime,env=env);wait_active(exe,runtime,env,True);checks["restart"]=True
            run([str(exe),"gateway","uninstall"],cwd=runtime,env=env);installed=False;time.sleep(.3)
            if service_present():raise RuntimeError("Gateway service still exists after uninstall")
            post=status_payload(exe,runtime,env);checks["uninstall"]=not bool(post.get("service",{}).get("installed"))
        finally:
            if installed or service_present():subprocess.run([str(exe),"gateway","uninstall"],cwd=runtime,env=env,capture_output=True,text=True,timeout=30)
        if service_present():raise RuntimeError("cleanup failed: CIEAV service still present")
        checks["cleanup"]=True
    evidence={"schemaVersion":1,"product":"CIEAV","version":package["version"],"mode":args.mode,"target":target,"commit":commit,"archive":archive_identity,"verifiedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),"checks":checks}
    digest=hashlib.sha256(canonical(evidence).encode()).hexdigest();out={**evidence,"digestAlgorithm":"SHA-256","digest":digest}
    REPORTS.mkdir(parents=True,exist_ok=True);name=f"cieav-service-lifecycle-{package['version']}-{args.mode}-{target}-{commit[:12]}.json";(REPORTS/name).write_text(json.dumps(out,indent=2)+"\n","utf-8");(REPORTS/"latest-service-lifecycle.json").write_text(json.dumps(out,indent=2)+"\n","utf-8")
    print(f"CIEAV service lifecycle qualification PASS · {target} · {archive.name}")
    print(f"Evidence: {REPORTS/name}")


if __name__=="__main__":main()
