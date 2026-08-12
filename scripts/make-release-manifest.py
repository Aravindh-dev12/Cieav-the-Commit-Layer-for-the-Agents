#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

SAFE_VERSION=re.compile(r"^[A-Za-z0-9._-]{1,80}$")
SAFE_PLATFORM=re.compile(r"^[a-z0-9-]{3,40}$")
SAFE_SHA256=re.compile(r"^[0-9a-f]{64}$")


def clean(value:str,name:str)->str:
    if "\n" in value or "\r" in value: raise SystemExit(f"{name} contains a newline")
    return value


def clean_cloud_url(value:str)->str:
    raw=clean(value.strip().rstrip("/"),"cloud URL")
    try: u=urlsplit(raw)
    except ValueError as exc: raise SystemExit("cloud URL is invalid") from exc
    if u.scheme!="https" or not u.hostname: raise SystemExit("cloud URL must use HTTPS")
    if u.username or u.password: raise SystemExit("cloud URL must not contain credentials")
    if u.query or u.fragment: raise SystemExit("cloud URL must not contain query or fragment")
    netloc=u.hostname if u.port in (None,443) else f"{u.hostname}:{u.port}"
    path=u.path.rstrip("/")
    return urlunsplit(("https",netloc,path,"",""))


def main() -> None:
    ap=argparse.ArgumentParser(); ap.add_argument("--input-dir",default="release-out"); ap.add_argument("--output",default="release-out/manifest.json"); ap.add_argument("--version",required=True); ap.add_argument("--cloud-url",required=True); ap.add_argument("--channel",default="stable"); args=ap.parse_args()
    version=clean(args.version,"version"); channel=clean(args.channel,"channel"); cloud_url=clean_cloud_url(args.cloud_url)
    if not SAFE_VERSION.fullmatch(version): raise SystemExit("version contains unsupported characters")
    if not SAFE_PLATFORM.fullmatch(channel): raise SystemExit("channel contains unsupported characters")
    inp=Path(args.input_dir); artifacts={}
    for metadata in sorted(inp.glob("metadata-*.json")):
        data=json.loads(metadata.read_text("utf-8")); key=clean(str(data["platform"]),"platform"); filename=clean(str(data["filename"]),"filename"); digest=str(data["sha256"]).lower()
        if not SAFE_PLATFORM.fullmatch(key): raise SystemExit(f"invalid platform in {metadata}")
        if key in artifacts: raise SystemExit(f"duplicate runtime metadata for {key}")
        if data["version"]!=version: raise SystemExit(f"version mismatch in {metadata}")
        if not SAFE_SHA256.fullmatch(digest): raise SystemExit(f"invalid SHA-256 in {metadata}")
        if "/" in filename or "\\" in filename or not filename.startswith("cieav-runtime-") or not filename.endswith(".zip"): raise SystemExit(f"invalid runtime filename in {metadata}")
        size=data.get("size")
        if isinstance(size,bool) or not isinstance(size,int) or size<=0: raise SystemExit(f"invalid runtime size in {metadata}")
        artifact_path=f"{channel}/{filename}"
        artifacts[key]={"url":artifact_path,"sha256":digest,"size":size}
        bootstrap=inp/f"bootstrap-{key}.txt"
        bootstrap.write_text("\n".join(["BRAND=CIEAV",f"VERSION={version}",f"CLOUD_URL={cloud_url}",f"ARTIFACT_PATH={artifact_path}",f"SHA256={digest},"[:-1],""]),"utf-8")
    if not artifacts: raise SystemExit("no runtime metadata files found")
    manifest={"schemaVersion":3,"brand":"CIEAV","legacyBrand":"LATCH","version":version,"channel":channel,"cloudUrl":cloud_url,"privacy":{"durableUserState":"local","cloudInference":"transient-minimized","rawSecretsSent":False,"rawFormValuesSent":False,"fullPageTextSent":False},"artifacts":artifacts}
    output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True); output.write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n","utf-8"); print(output)


if __name__=="__main__": main()
