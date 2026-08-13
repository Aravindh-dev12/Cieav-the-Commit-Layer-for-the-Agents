#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPORTS=ROOT/"release"/"reports"


def canonical(value):
    if isinstance(value,list):return "["+",".join(canonical(x) for x in value)+"]"
    if isinstance(value,dict):return "{"+",".join(json.dumps(k,separators=(",",":"))+":"+canonical(value[k]) for k in sorted(value))+"}"
    return json.dumps(value,separators=(",",":"))


def sha256_file(path:Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()


def target()->str:
    machine=platform.machine().lower();arch="arm64" if machine in {"arm64","aarch64"} else "x64" if machine in {"x86_64","amd64"} else machine
    return f"macos-{arch}"


def find_archive(release_dir:Path)->Path:
    matches=sorted(release_dir.glob(f"cieav-runtime-*-{target()}.zip"),key=lambda p:p.stat().st_mtime,reverse=True)
    if not matches:raise RuntimeError(f"No CIEAV macOS runtime archive for {target()} in {release_dir}")
    return matches[0]


def main()->None:
    ap=argparse.ArgumentParser(description="Submit the exact CIEAV macOS runtime archive for Apple notarization and emit qualification evidence")
    ap.add_argument("--archive",type=Path)
    ap.add_argument("--release-dir",type=Path,default=ROOT/"release-out")
    ap.add_argument("--mode",choices=("local","publish"),default="publish")
    ap.add_argument("--key",type=Path,default=Path(os.environ["CIEAV_APPLE_NOTARY_KEY_PATH"]) if os.environ.get("CIEAV_APPLE_NOTARY_KEY_PATH") else None)
    ap.add_argument("--key-id",default=os.environ.get("CIEAV_APPLE_NOTARY_KEY_ID",""))
    ap.add_argument("--issuer",default=os.environ.get("CIEAV_APPLE_NOTARY_ISSUER",""))
    args=ap.parse_args()
    if platform.system()!="Darwin":raise SystemExit("Apple notarization qualification must run on macOS")
    if not args.key or not args.key.is_file():raise SystemExit("Set CIEAV_APPLE_NOTARY_KEY_PATH or pass --key with the App Store Connect API .p8 key")
    if not args.key_id or not args.issuer:raise SystemExit("Apple notarization key ID and issuer are required")
    dirty=subprocess.run(["git","status","--porcelain"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
    if dirty:raise SystemExit("Notarization qualification requires a clean git worktree")
    commit=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip();pkg=json.loads((ROOT/"package.json").read_text("utf-8"));archive=(args.archive or find_archive(args.release_dir.resolve())).resolve()
    identity={"filename":archive.name,"sha256":sha256_file(archive),"size":archive.stat().st_size}
    cmd=["xcrun","notarytool","submit",str(archive),"--key",str(args.key),"--key-id",args.key_id,"--issuer",args.issuer,"--wait","--timeout","30m","--output-format","json"]
    proc=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=1900)
    if proc.returncode!=0:raise SystemExit(f"Apple notarization failed ({proc.returncode}): {(proc.stderr or proc.stdout)[-8000:]}")
    try:result=json.loads(proc.stdout)
    except Exception as exc:raise SystemExit(f"notarytool did not return JSON: {proc.stdout[-4000:]}") from exc
    status=str(result.get("status") or "");submission=str(result.get("id") or result.get("submissionId") or "")
    if status.lower()!="accepted" or not submission:raise SystemExit(f"Apple notarization was not accepted: status={status!r} id={submission!r}")
    evidence={"schemaVersion":1,"product":"CIEAV","kind":"APPLE_NOTARIZATION","version":pkg["version"],"mode":args.mode,"target":target(),"commit":commit,"archive":identity,"submissionId":submission,"status":"Accepted","verifiedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}
    digest=hashlib.sha256(canonical(evidence).encode()).hexdigest();out={**evidence,"digestAlgorithm":"SHA-256","digest":digest};REPORTS.mkdir(parents=True,exist_ok=True);name=f"cieav-notarization-{pkg['version']}-{args.mode}-{target()}-{commit[:12]}.json";(REPORTS/name).write_text(json.dumps(out,indent=2)+"\n","utf-8");(REPORTS/"latest-notarization.json").write_text(json.dumps(out,indent=2)+"\n","utf-8")
    print(f"CIEAV Apple notarization PASS · {submission} · {archive.name}")
    print(f"Evidence: {REPORTS/name}")


if __name__=="__main__":main()
