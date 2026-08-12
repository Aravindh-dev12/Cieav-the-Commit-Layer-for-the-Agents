#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts"/"make-release-manifest.py"
VERSION="0.7.0"
CLOUD="https://cloud.example.test"


def run_case(filename:str,expect_ok:bool)->Path:
    td=tempfile.TemporaryDirectory()
    root=Path(td.name)
    # Keep the temporary directory alive by attaching it to the returned Path.
    metadata={"platform":"linux-x64","filename":filename,"sha256":"a"*64,"size":1234,"version":VERSION}
    (root/"metadata-linux-x64.json").write_text(json.dumps(metadata),"utf-8")
    proc=subprocess.run([sys.executable,str(SCRIPT),"--input-dir",str(root),"--output",str(root/"manifest.json"),"--version",VERSION,"--cloud-url",CLOUD,"--channel","stable"],capture_output=True,text=True)
    if expect_ok and proc.returncode!=0: raise AssertionError(proc.stderr or proc.stdout)
    if not expect_ok and proc.returncode==0: raise AssertionError("malicious release filename was accepted")
    if not expect_ok:
        td.cleanup()
        return Path()
    manifest=json.loads((root/"manifest.json").read_text("utf-8"))
    assert manifest["schemaVersion"]==3 and manifest["brand"]=="CIEAV"
    assert manifest["artifacts"]["linux-x64"]["sha256"]=="a"*64
    lines=(root/"bootstrap-linux-x64.txt").read_text("utf-8").splitlines()
    expected={
        "BRAND":"CIEAV",
        "VERSION":VERSION,
        "CLOUD_URL":CLOUD,
        "ARTIFACT_PATH":f"stable/{filename}",
        "SHA256":"a"*64,
    }
    parsed={}
    for line in lines:
        if not line: continue
        k,v=line.split("=",1); parsed[k]=v
    assert parsed==expected
    td.cleanup()
    return root


def main()->None:
    run_case("cieav-runtime-0.7.0-linux-x64.zip",True)
    run_case("../cieav-runtime-0.7.0-linux-x64.zip",False)
    run_case("cieav-runtime-0.7.0-linux-x64.zip\nINJECT=1",False)
    print("CIEAV release metadata smoke passed")


if __name__=="__main__": main()
