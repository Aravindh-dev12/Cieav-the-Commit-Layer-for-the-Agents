#!/usr/bin/env python3
from __future__ import annotations

import argparse,hashlib,json,os,platform,shutil,stat,subprocess,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REPORTS=ROOT/"release"/"reports";MAX_CAPTURE=64_000

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
    system={"Windows":"windows","Darwin":"macos","Linux":"linux"}.get(platform.system(),platform.system().lower());machine=platform.machine().lower();arch="arm64" if machine in {"arm64","aarch64"} else "x64" if machine in {"x86_64","amd64"} else machine;return f"{system}-{arch}"
def find_archive(release_dir:Path,target:str)->Path:
    matches=sorted(release_dir.glob(f"cieav-runtime-*-{target}.zip"),key=lambda p:p.stat().st_mtime,reverse=True)
    if not matches:raise RuntimeError(f"No CIEAV runtime archive for {target} found in {release_dir}")
    return matches[0]
def run(cmd:list[str],*,cwd:Path,env:dict[str,str]|None=None)->dict:
    proc=subprocess.run(cmd,cwd=cwd,env=env,capture_output=True,text=True,timeout=45);out=(proc.stdout or "")[-MAX_CAPTURE:];err=(proc.stderr or "")[-MAX_CAPTURE:]
    if proc.returncode!=0:raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd)}\nstdout:\n{out}\nstderr:\n{err}")
    return{"command":cmd,"stdout":out,"stderr":err}
def inspect_archive_names(archive:Path)->list[str]:
    forbidden_exact={"gateway-token","local-api-signing-secret","receipt-signing-secret","hf-token","cieav-release-private.pem","cieav-code-sign.pfx","cieav-developer-id.p12"};forbidden_suffixes=(".pfx",".p12",".key","private.pem");bad=[]
    with zipfile.ZipFile(archive) as zf:
        for name in zf.namelist():
            leaf=Path(name).name.lower()
            if leaf in forbidden_exact or any(leaf.endswith(x) for x in forbidden_suffixes):bad.append(name)
            if "/.cieav/" in f"/{name.lower()}" or "/.latch/" in f"/{name.lower()}":bad.append(name)
    return sorted(set(bad))
def check_windows_signature(path:Path,thumbprint:str|None)->dict|None:
    if platform.system()!="Windows":return None
    ps=shutil.which("pwsh") or shutil.which("powershell")
    if not ps:raise RuntimeError("PowerShell is required to verify Windows Authenticode signatures")
    literal_path="'"+str(path).replace("'","''")+"'";script=(f"$s=Get-AuthenticodeSignature -LiteralPath {literal_path};"+"if($s.Status -ne 'Valid' -or -not $s.SignerCertificate){throw ('invalid Authenticode status: '+$s.Status)};"+"$o=[pscustomobject]@{Status=[string]$s.Status;Thumbprint=[string]$s.SignerCertificate.Thumbprint;Subject=[string]$s.SignerCertificate.Subject};"+"$o|ConvertTo-Json -Compress")
    proc=subprocess.run([ps,"-NoProfile","-Command",script],capture_output=True,text=True,timeout=30)
    if proc.returncode!=0:raise RuntimeError(f"Authenticode verification failed for {path}: {(proc.stderr or proc.stdout).strip()}")
    data=json.loads(proc.stdout.strip().splitlines()[-1])
    if thumbprint and data.get("Thumbprint","").replace(" ","").upper()!=thumbprint.replace(" ","").upper():raise RuntimeError(f"Windows signer thumbprint mismatch for {path.name}")
    return data
def check_macos_signature(path:Path,identity:str|None)->dict|None:
    if platform.system()!="Darwin":return None
    run(["codesign","--verify","--strict","--verbose=2",str(path)],cwd=path.parent);proc=subprocess.run(["codesign","-dv","--verbose=4",str(path)],capture_output=True,text=True,timeout=30);text=(proc.stderr or "")+(proc.stdout or "")
    if proc.returncode!=0:raise RuntimeError(f"codesign identity inspection failed for {path}")
    if identity and f"Authority={identity}" not in text:raise RuntimeError(f"macOS signer identity mismatch for {path.name}")
    return{"identityPinned":bool(identity),"identity":identity}
def executable(path:Path)->None:
    if os.name!="nt":path.chmod(path.stat().st_mode|stat.S_IXUSR)

def main()->None:
    ap=argparse.ArgumentParser(description="Qualify a freshly extracted CIEAV release runtime on the current OS");ap.add_argument("--archive",type=Path);ap.add_argument("--release-dir",type=Path,default=ROOT/"release-out");ap.add_argument("--mode",choices=("local","publish"),default="local");ap.add_argument("--windows-signer-thumbprint",default=os.environ.get("CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT",""));ap.add_argument("--macos-signing-identity",default=os.environ.get("CIEAV_MACOS_SIGNING_IDENTITY",""));args=ap.parse_args()
    target=host_target();archive=(args.archive or find_archive(args.release_dir.resolve(),target)).resolve()
    if not archive.exists():raise SystemExit(f"Archive not found: {archive}")
    bad_names=inspect_archive_names(archive)
    if bad_names:raise SystemExit("Release archive contains forbidden secret material: "+", ".join(bad_names[:20]))
    git=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip();dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    if dirty:raise SystemExit("Clean runtime qualification requires a clean git worktree")
    package=json.loads((ROOT/"package.json").read_text("utf-8"));checks={}
    with tempfile.TemporaryDirectory(prefix="cieav-clean-runtime-") as td:
        extract_root=Path(td)/"first-extract"
        with zipfile.ZipFile(archive) as zf:zf.extractall(extract_root)
        runtime=extract_root/"cieav-runtime"
        if not runtime.is_dir():raise RuntimeError("Archive does not contain top-level cieav-runtime directory")
        meta=json.loads((runtime/"runtime.json").read_text("utf-8"))
        if meta.get("brand")!="CIEAV":raise RuntimeError("runtime brand mismatch")
        if meta.get("version")!=package.get("version"):raise RuntimeError("runtime version does not match package version")
        if meta.get("platform")!=target:raise RuntimeError(f"runtime target {meta.get('platform')} != host {target}")
        if int(meta.get("bundleFormat",0))<8:raise RuntimeError("runtime bundle format is too old for managed Agent/Commitment runtime qualification")
        for key in ("platformBoundaryVerified","releaseBoundaryVerified","canonicalNamespaceVerified","controlCenterRealityBoundaryVerified"):
            if meta.get(key) is not True:raise RuntimeError(f"runtime metadata missing {key}")
        protocols=meta.get("agentProtocols") or {};agent_runtime=meta.get("agentRuntime") or {};effect_node=meta.get("effectNode") or {}
        if not protocols.get("mcp") or not protocols.get("a2a") or not protocols.get("effectNode"):raise RuntimeError("runtime protocol metadata is incomplete")
        for key in ("managed","commitmentRuntime","toolBroker","proactiveScheduler","apiBundled"):
            if agent_runtime.get(key) is not True:raise RuntimeError(f"managed agent runtime metadata missing {key}")
        for key in ("signedAuthority","replayProtected","remoteTlsRequired"):
            if effect_node.get(key) is not True:raise RuntimeError(f"Effect Node metadata missing {key}")
        checks["runtimeMetadata"]=True
        exe=runtime/"bin"/("cieav.exe" if os.name=="nt" else "cieav");node=runtime/"runtime"/("node.exe" if os.name=="nt" else "node")
        if not exe.exists() or not node.exists():raise RuntimeError("runtime executable or bundled Node is missing")
        executable(exe);executable(node);checks["cieavHelp"]=bool(run([str(exe),"--help"],cwd=runtime));checks["nodeVersion"]=bool(run([str(node),"--version"],cwd=runtime))
        for label,rel in {"browserWrapperSyntax":"apps/browser/main.mjs","browserCoreSyntax":"apps/browser/main-core.mjs","semanticApiSyntax":"apps/api/dist/server.js","mcpSyntax":"apps/mcp/dist/index.js","a2aSyntax":"apps/a2a/dist/index.mjs","effectNodeSyntax":"apps/node/dist/index.js"}.items():
            file=runtime/rel
            if not file.exists():raise RuntimeError(f"packaged runtime missing {rel}")
            run([str(node),"--check",str(file)],cwd=runtime);checks[label]=True
        run([str(node),str(runtime/"apps/node/dist/index.js")],cwd=runtime);checks["effectNodeHelp"]=True
        for command in (["companion","--help"],["lab","--help"],["a2a","--help"],["mcp","--help"],["gateway","--help"]):run([str(exe),*command],cwd=runtime)
        checks["cliSurfaces"]=True
        win_sig=check_windows_signature(exe,args.windows_signer_thumbprint or None)
        if platform.system()=="Windows":
            bridge=runtime/"apps"/"browser"/"cdp-win-bridge.exe"
            if not bridge.exists():raise RuntimeError("Windows runtime missing cdp-win-bridge.exe")
            bridge_sig=check_windows_signature(bridge,args.windows_signer_thumbprint or None);checks["windowsAuthenticode"]={"cieav":win_sig,"cdpBridge":bridge_sig}
        mac_sig=check_macos_signature(exe,args.macos_signing_identity or None)
        if mac_sig is not None:checks["macosCodeSign"]=mac_sig
        relocated_parent=Path(td)/"relocated"/"deep"/"path";relocated_parent.mkdir(parents=True);relocated=relocated_parent/"cieav-runtime";shutil.copytree(runtime,relocated);relocated_exe=relocated/"bin"/exe.name;executable(relocated_exe);run([str(relocated_exe),"--help"],cwd=relocated);checks["relocation"]=True
    evidence={"schemaVersion":1,"product":"CIEAV","version":package["version"],"mode":args.mode,"target":target,"commit":git,"archive":{"filename":archive.name,"sha256":sha256_file(archive),"size":archive.stat().st_size},"verifiedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),"checks":checks};digest=hashlib.sha256(canonical(evidence).encode("utf-8")).hexdigest();attestation={**evidence,"digestAlgorithm":"SHA-256","digest":digest};REPORTS.mkdir(parents=True,exist_ok=True);filename=f"cieav-runtime-smoke-{package['version']}-{args.mode}-{target}-{git[:12]}.json";(REPORTS/filename).write_text(json.dumps(attestation,indent=2)+"\n","utf-8");(REPORTS/"latest-runtime-smoke.json").write_text(json.dumps(attestation,indent=2)+"\n","utf-8");print(json.dumps({"ok":True,"report":str(REPORTS/filename),"target":target,"archive":archive.name,"digest":digest},indent=2))
if __name__=="__main__":main()
