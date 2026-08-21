#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/"release"/"reports"
MAX_CAPTURE=64_000
MARKER_TEXT="CIEAV_ROLLBACK_SENTINEL_V1"
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


def install_paths()->tuple[Path,Path,list[Path]]:
    if os.name=="nt":
        base=Path(os.environ.get("LOCALAPPDATA") or (Path.home()/"AppData/Local"));root=base/"CIEAV"
        return root,Path(str(root)+".previous"),[]
    root=Path.home()/".local/share/cieav";bin_root=Path.home()/".local/bin"
    return root,Path(str(root)+".previous"),[bin_root/"cieav",bin_root/"latch"]


def service_present()->bool:
    system=platform.system()
    if system=="Linux":return (Path.home()/".config/systemd/user/cieav-gateway.service").exists()
    if system=="Darwin":return (Path.home()/"Library/LaunchAgents/ai.cieav.gateway.plist").exists()
    if system=="Windows":
        registered=False
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,WINDOWS_RUN_KEY,0,winreg.KEY_READ) as key:
                value,_=winreg.QueryValueEx(key,WINDOWS_RUN_VALUE)
                registered=bool(str(value).strip())
        except FileNotFoundError:
            pass
        legacy_task=any(subprocess.run(["schtasks","/Query","/TN",name],capture_output=True).returncode==0 for name in ("CIEAV Gateway","LATCH Gateway"))
        return registered or legacy_task
    return False


def windows_user_path()->str|None:
    if os.name!="nt":return None
    ps=shutil.which("pwsh") or shutil.which("powershell")
    if not ps:raise RuntimeError("PowerShell is required on Windows")
    p=subprocess.run([ps,"-NoProfile","-Command","[Environment]::GetEnvironmentVariable('Path','User')"],capture_output=True,text=True,timeout=20)
    if p.returncode!=0:raise RuntimeError("unable to read Windows user PATH")
    return p.stdout.rstrip("\r\n")


def restore_windows_user_path(value:str|None)->None:
    if os.name!="nt":return
    ps=shutil.which("pwsh") or shutil.which("powershell")
    encoded=json.dumps(value or "")
    p=subprocess.run([ps,"-NoProfile","-Command",f"[Environment]::SetEnvironmentVariable('Path',{encoded},'User')"],capture_output=True,text=True,timeout=20)
    if p.returncode!=0:raise RuntimeError("unable to restore Windows user PATH")


def clean_local_base_url(value:str)->str:
    try:u=urlsplit(value.strip())
    except ValueError as exc:raise SystemExit("--base-url is invalid") from exc
    if u.scheme!="https" or u.hostname!="localhost":raise SystemExit("local --base-url override must be HTTPS on localhost")
    if u.username or u.password or u.query or u.fragment or u.path not in ("","/"):raise SystemExit("local --base-url override must be a clean localhost HTTPS origin")
    netloc="localhost" if u.port in (None,443) else f"localhost:{u.port}"
    return urlunsplit(("https",netloc,"","",""))


def rendered_local_base_url(installer:Path)->str|None:
    if os.name!="nt" or installer.suffix.lower()!=".ps1":return None
    text=installer.read_text("utf-8",errors="strict")
    match=re.search(r'^\$PinnedCloudUrl\s*=\s*"([^"]+)"\s*$',text,re.MULTILINE)
    if not match:return None
    try:return clean_local_base_url(match.group(1))
    except SystemExit:return None


def installer_command(installer:Path)->list[str]:
    if os.name=="nt":
        ps=shutil.which("pwsh") or shutil.which("powershell")
        if not ps:raise RuntimeError("PowerShell is required for install.ps1")
        return [ps,"-NoProfile","-ExecutionPolicy","Bypass","-File",str(installer),"-NoService"]
    return [shutil.which("sh") or "/bin/sh",str(installer)]


def default_installer()->Path:return ROOT/"publish"/("install.ps1" if os.name=="nt" else "install.sh")


def main()->None:
    ap=argparse.ArgumentParser(description="Exercise a rendered signed CIEAV installer against a real HTTPS release distribution")
    ap.add_argument("--installer",type=Path,default=default_installer(),help="Rendered installer; defaults to publish/install.ps1 or publish/install.sh")
    ap.add_argument("--scenario",required=True,choices=("success","rollback"))
    ap.add_argument("--mode",choices=("local","publish"),default="publish")
    ap.add_argument("--base-url",help="Local-mode only: explicit trusted localhost HTTPS release origin")
    ap.add_argument("--confirm-install-mutation",action="store_true",help="Required: acknowledges mutation of the current user's CIEAV install paths")
    args=ap.parse_args()
    if not args.confirm_install_mutation:raise SystemExit("Refusing installer mutation without --confirm-install-mutation")
    installer=args.installer.resolve()
    if not installer.is_file():raise SystemExit(f"Installer not found: {installer}")
    if os.name=="nt" and installer.suffix.lower()!=".ps1":raise SystemExit("Windows live installer test requires rendered install.ps1")
    if os.name!="nt" and installer.name!="install.sh":raise SystemExit("Unix/macOS live installer test requires rendered install.sh")
    base_url=None
    if args.base_url:
        if args.mode!="local":raise SystemExit("--base-url override is forbidden outside local mode")
        base_url=clean_local_base_url(args.base_url)
    elif args.mode=="local":
        base_url=rendered_local_base_url(installer)
        if not base_url:raise SystemExit("local installer qualification requires a rendered localhost HTTPS trust origin or explicit --base-url")
    dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    if dirty:raise SystemExit("Installer qualification requires a clean git worktree")
    if service_present():raise SystemExit("Refusing live installer test while a CIEAV Gateway service already exists")
    install_root,backup_root,shims=install_paths()
    if install_root.exists() or backup_root.exists():raise SystemExit(f"Refusing to overwrite an existing CIEAV runtime or backup: {install_root}")
    for shim in shims:
        if shim.exists():raise SystemExit(f"Refusing to overwrite existing command shim: {shim}")
    commit=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip();package=json.loads((ROOT/"package.json").read_text("utf-8"));target=host_target();old_user_path=windows_user_path();marker=install_root/"ROLLBACK_SENTINEL"
    checks={"cleanStart":True,"serviceIsolation":True,"localEndpointOverride":bool(base_url)};proc=None
    try:
        if args.scenario=="rollback":
            install_root.mkdir(parents=True);marker.write_text(MARKER_TEXT,"utf-8");checks["priorRuntimeSeeded"]=True
        env=dict(os.environ);env["CIEAV_NO_SERVICE"]="1";env["LATCH_NO_SERVICE"]="1"
        if base_url:
            env["CIEAV_DOWNLOAD_BASE_URL"]=base_url
            env["LATCH_DOWNLOAD_BASE_URL"]=base_url
        proc=subprocess.run(installer_command(installer),cwd=ROOT,env=env,capture_output=True,text=True,timeout=180)
        combined=((proc.stdout or "")+"\n"+(proc.stderr or ""))[-MAX_CAPTURE:]
        if args.scenario=="success":
            if proc.returncode!=0:raise RuntimeError(f"installer unexpectedly failed ({proc.returncode})\n{combined}")
            runtime_meta=install_root/"runtime.json";exe=install_root/"bin"/("cieav.exe" if os.name=="nt" else "cieav")
            if not runtime_meta.is_file() or not exe.is_file():raise RuntimeError("successful installer did not leave a complete runtime")
            meta=json.loads(runtime_meta.read_text("utf-8"));checks["installedVersion"]=meta.get("version")==package["version"];checks["releaseBoundaryVerified"]=meta.get("releaseBoundaryVerified") is True
            if not all((checks["installedVersion"],checks["releaseBoundaryVerified"])):raise RuntimeError("installed runtime metadata does not match the candidate")
            help_run=subprocess.run([str(exe),"--help"],cwd=install_root,capture_output=True,text=True,timeout=30);checks["installedExecutable"]=help_run.returncode==0
            if not checks["installedExecutable"]:raise RuntimeError("installed CIEAV executable failed --help")
            checks["installerSuccess"]=True
        else:
            if proc.returncode==0:raise RuntimeError("rollback scenario unexpectedly succeeded; make the installer-pinned Cloud endpoint unavailable only after release download/verification")
            lower=combined.lower();checks["replacementReached"]="restoring previous runtime" in lower
            checks["priorRuntimeRestored"]=marker.is_file() and marker.read_text("utf-8")==MARKER_TEXT
            checks["backupConsumed"]=not backup_root.exists()
            checks["candidateRemoved"]=not (install_root/"runtime.json").exists()
            if not all((checks["replacementReached"],checks["priorRuntimeRestored"],checks["backupConsumed"],checks["candidateRemoved"])):raise RuntimeError("installer failed, but transactional rollback was not conclusively observed")
            checks["installerRollback"]=True
    finally:
        if service_present():
            exe=install_root/"bin"/("cieav.exe" if os.name=="nt" else "cieav")
            if exe.exists():subprocess.run([str(exe),"gateway","uninstall"],capture_output=True,text=True,timeout=30)
        if install_root.exists():shutil.rmtree(install_root,ignore_errors=True)
        if backup_root.exists():shutil.rmtree(backup_root,ignore_errors=True)
        for shim in shims:
            try:shim.unlink()
            except FileNotFoundError:pass
        restore_windows_user_path(old_user_path)
    if install_root.exists() or backup_root.exists() or any(x.exists() for x in shims) or service_present():raise RuntimeError("live installer smoke cleanup failed")
    checks["cleanup"]=True
    evidence={"schemaVersion":2,"product":"CIEAV","version":package["version"],"mode":args.mode,"scenario":args.scenario,"target":target,"commit":commit,"installer":{"filename":installer.name,"sha256":sha256_file(installer),"size":installer.stat().st_size},"endpointOverride":{"used":bool(base_url),"scope":"localhost-https-only" if base_url else None},"verifiedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),"checks":checks}
    digest=hashlib.sha256(canonical(evidence).encode()).hexdigest();out={**evidence,"digestAlgorithm":"SHA-256","digest":digest};REPORTS.mkdir(parents=True,exist_ok=True);name=f"cieav-installer-{args.scenario}-{package['version']}-{args.mode}-{target}-{commit[:12]}.json";(REPORTS/name).write_text(json.dumps(out,indent=2)+"\n","utf-8");(REPORTS/f"latest-installer-{args.scenario}.json").write_text(json.dumps(out,indent=2)+"\n","utf-8")
    print(f"CIEAV live installer {args.scenario} qualification PASS · {target}")
    print(f"Evidence: {REPORTS/name}")


if __name__=="__main__":main()
