#!/usr/bin/env python3
from __future__ import annotations

import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"scripts"/"make-release-manifest.py"
RENDER=ROOT/"scripts"/"render-installers.py"
VERSION="0.7.0"
CLOUD="https://cloud.example.test"
WINDOWS_SIGNER="0123456789ABCDEF0123456789ABCDEF01234567"
MACOS_SIGNER="Developer ID Application: CIEAV Example (ABCDE12345)"
RELEASE_KEY_ID="b"*64
RELEASE_RSA_MODULUS_B64=base64.b64encode(b"\x01"*384).decode("ascii")
RELEASE_RSA_EXPONENT_B64=base64.b64encode(b"\x01\x00\x01").decode("ascii")
RELEASE_PUBLIC_KEY_PEM_B64=base64.b64encode((
    "-----BEGIN PUBLIC KEY-----\n"+"A"*384+"\n-----END PUBLIC KEY-----\n"
).encode("ascii")).decode("ascii")


def build_metadata(root:Path,filename:str="cieav-runtime-0.7.0-linux-x64.zip",*,size:int=1234,platform:str="linux-x64",version:str=VERSION)->None:
    metadata={"platform":platform,"filename":filename,"sha256":"a"*64,"size":size,"version":version}
    (root/f"metadata-{platform}.json").write_text(json.dumps(metadata),"utf-8")


def manifest_case(*,filename:str="cieav-runtime-0.7.0-linux-x64.zip",cloud:str=CLOUD,channel:str="stable",size:int=1234,expect_ok:bool=True)->None:
    with tempfile.TemporaryDirectory(prefix="cieav-release-meta-") as td:
        root=Path(td); build_metadata(root,filename,size=size)
        proc=subprocess.run([sys.executable,str(MANIFEST),"--input-dir",str(root),"--output",str(root/"manifest.json"),"--version",VERSION,"--cloud-url",cloud,"--channel",channel],cwd=ROOT,capture_output=True,text=True)
        if expect_ok and proc.returncode!=0: raise AssertionError(proc.stderr or proc.stdout)
        if not expect_ok and proc.returncode==0: raise AssertionError(f"invalid manifest input was accepted: filename={filename!r} cloud={cloud!r} channel={channel!r}")
        if not expect_ok:return
        manifest=json.loads((root/"manifest.json").read_text("utf-8"))
        assert manifest["schemaVersion"]==3 and manifest["brand"]=="CIEAV"
        artifact=manifest["artifacts"]["linux-x64"]
        assert artifact["url"]==f"{channel}/{filename}"
        assert artifact["sha256"]=="a"*64 and artifact["size"]==size
        parsed={}
        for line in (root/"bootstrap-linux-x64.txt").read_text("utf-8").splitlines():
            if line:
                k,v=line.split("=",1);parsed[k]=v
        assert parsed=={"BRAND":"CIEAV","VERSION":VERSION,"CLOUD_URL":cloud.rstrip('/'),"ARTIFACT_PATH":f"{channel}/{filename}","SHA256":"a"*64}


def render_case(base:str,expect_ok:bool,*,cloud:str=CLOUD,version:str=VERSION,windows_signer:str=WINDOWS_SIGNER,macos_signer:str=MACOS_SIGNER)->None:
    with tempfile.TemporaryDirectory(prefix="cieav-render-") as td:
        out=Path(td)/"publish"
        proc=subprocess.run([
            sys.executable,str(RENDER),
            "--download-base-url",base,
            "--cloud-url",cloud,
            "--release-version",version,
            "--windows-signer-thumbprint",windows_signer,
            "--macos-signing-identity",macos_signer,
            "--release-key-id",RELEASE_KEY_ID,
            "--release-rsa-modulus-b64",RELEASE_RSA_MODULUS_B64,
            "--release-rsa-exponent-b64",RELEASE_RSA_EXPONENT_B64,
            "--release-public-key-pem-b64",RELEASE_PUBLIC_KEY_PEM_B64,
            "--output-dir",str(out)
        ],cwd=ROOT,capture_output=True,text=True)
        if expect_ok and proc.returncode!=0: raise AssertionError(proc.stderr or proc.stdout)
        if not expect_ok and proc.returncode==0: raise AssertionError(f"invalid installer trust input was accepted: base={base!r} cloud={cloud!r} version={version!r} windows_signer={windows_signer!r} macos_signer={macos_signer!r}")
        if not expect_ok:return
        ps=(out/"install.ps1").read_text("utf-8");sh=(out/"install.sh").read_text("utf-8");combined=ps+sh
        for placeholder in (
            "__CIEAV_DOWNLOAD_BASE_URL__",
            "__CIEAV_CLOUD_URL__",
            "__CIEAV_RELEASE_VERSION__",
            "__CIEAV_WINDOWS_SIGNER_THUMBPRINT__",
            "__CIEAV_MACOS_SIGNING_IDENTITY__",
            "__CIEAV_RELEASE_KEY_ID__",
            "__CIEAV_RELEASE_RSA_MODULUS_B64__",
            "__CIEAV_RELEASE_RSA_EXPONENT_B64__",
            "__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__",
        ):
            assert placeholder not in combined
        for source in (ps,sh):
            assert base.rstrip('/') in source and cloud.rstrip('/') in source and version in source
            assert windows_signer.upper() in source and macos_signer in source
        assert "release manifest version does not match the installer-pinned release" in ps
        assert "release metadata version does not match the installer-pinned release" in sh
        assert "does not match the installer-pinned endpoint" in ps and "does not match the installer-pinned endpoint" in sh
        assert "MaximumRedirection 0" in ps and "--max-redirs 0" in sh
        assert "Get-AuthenticodeSignature" in ps and "SignerCertificate.Thumbprint" in ps
        assert "codesign --verify --strict" in sh


def main()->None:
    manifest_case()
    for bad in ("../cieav-runtime-0.7.0-linux-x64.zip","cieav-runtime-0.7.0-linux-x64.zip\nINJECT=1","https://evil.test/runtime.zip","/cieav-runtime.zip"):
        manifest_case(filename=bad,expect_ok=False)
    manifest_case(cloud="http://cloud.example.test",expect_ok=False)
    manifest_case(cloud="https://user:pass@cloud.example.test",expect_ok=False)
    manifest_case(cloud="https://cloud.example.test/api?token=x",expect_ok=False)
    manifest_case(channel="../stable",expect_ok=False)
    manifest_case(size=0,expect_ok=False)
    render_case("https://downloads.example.test",True)
    for bad in ("http://downloads.example.test","https://user:pass@downloads.example.test","https://downloads.example.test/path","https://downloads.example.test/?token=x","https://downloads.example.test/#frag"):
        render_case(bad,False)
    for bad in ("http://cloud.example.test","https://user:pass@cloud.example.test","https://cloud.example.test/path","https://cloud.example.test/?token=x","https://cloud.example.test/#frag"):
        render_case("https://downloads.example.test",False,cloud=bad)
    for bad in ("", "../0.7.0", "0.7.0;touch", "0.7.0\nX=1", "x"*65):
        render_case("https://downloads.example.test",False,version=bad)
    for bad in ("", "not-a-thumbprint", "AA:BB:CC", "a"*39, "f"*129):
        render_case("https://downloads.example.test",False,windows_signer=bad)
    for bad in (
        "", "Developer ID\nInjected", "<script>", "x"*241,
        'Developer ID Application: CIEAV"; Write-Host pwned; #',
        "Developer ID Application: $(touch /tmp/pwned)",
        "Developer ID Application: `whoami`",
        "Developer ID Application: CIEAV; rm -rf /",
        "Developer ID Application: CIEAV\\evil",
    ):
        render_case("https://downloads.example.test",False,macos_signer=bad)
    print("CIEAV release metadata/origin/version/cloud/publisher-pin injection smoke passed")


if __name__=="__main__": main()