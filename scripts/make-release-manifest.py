#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    ap=argparse.ArgumentParser(); ap.add_argument("--input-dir",default="release-out"); ap.add_argument("--output",default="release-out/manifest.json"); ap.add_argument("--version",required=True); ap.add_argument("--cloud-url",required=True); ap.add_argument("--channel",default="stable"); args=ap.parse_args()
    cloud_url=args.cloud_url.rstrip("/")
    if not cloud_url.startswith("https://"): raise SystemExit("cloud URL must use HTTPS")
    inp=Path(args.input_dir); artifacts={}
    for path in sorted(inp.glob("metadata-*.json")):
        data=json.loads(path.read_text("utf-8")); key=data["platform"]
        if data["version"]!=args.version: raise SystemExit(f"version mismatch in {path}")
        artifacts[key]={"url":f"{args.channel}/{data['filename']}","sha256":data["sha256"],"size":data["size"]}
    if not artifacts: raise SystemExit("no runtime metadata files found")
    manifest={"schemaVersion":2,"brand":"CIEAV","legacyBrand":"LATCH","version":args.version,"channel":args.channel,"cloudUrl":cloud_url,"privacy":{"durableUserState":"local","cloudInference":"transient-minimized","rawSecretsSent":False,"rawFormValuesSent":False,"fullPageTextSent":False},"artifacts":artifacts}
    output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True); output.write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n","utf-8"); print(output)


if __name__=="__main__": main()
