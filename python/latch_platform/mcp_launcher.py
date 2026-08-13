from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import Settings

_SECRET_ENV=("CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN","CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN","CIEAV_AUDIT_INTEGRITY_KEY","LATCH_AUDIT_INTEGRITY_KEY","JWT_SECRET","RECEIPT_SIGNING_SECRET","HF_TOKEN","HUGGING_FACE_HUB_TOKEN","OPENAI_API_KEY")

def _install_id(settings:Settings)->str:
    settings.ensure();file=settings.state_dir/"device.json"
    try:
        value=json.loads(file.read_text("utf-8"));install=value.get("installId")
        if isinstance(install,str) and len(install)>=12:return install
    except (FileNotFoundError,json.JSONDecodeError):pass
    install=f"cieav_{secrets.token_urlsafe(32)}";tmp=file.with_name(f"{file.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"installId":install}),"utf-8")
    try:os.chmod(tmp,0o600)
    except OSError:pass
    os.replace(tmp,file)
    return install

def _issue(settings:Settings,payload:dict)->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}/v1/agent-sessions",data=json.dumps(payload).encode("utf-8"),headers={"content-type":"application/json","accept":"application/json","authorization":f"Bearer {settings.token()}"},method="POST")
    try:
        with urlopen(req,timeout=5) as response:return json.loads(response.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try:detail=json.loads(exc.read().decode("utf-8") or "{}").get("error") or str(exc)
        except Exception:detail=str(exc)
        raise RuntimeError(f"CIEAV agent-session issuance failed: {detail}") from exc
    except URLError as exc:raise RuntimeError("CIEAV local authority is offline; start the CIEAV Gateway before launching MCP") from exc

def _node(settings:Settings)->str:
    bundled=settings.root/"runtime"/("node.exe" if os.name=="nt" else "node")
    if bundled.exists():return str(bundled)
    found=shutil.which("node")
    if found:return found
    raise RuntimeError("CIEAV Node runtime is missing")

def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav-mcp",description="Launch the CIEAV MCP bridge with a short-lived scoped agent session")
    p.add_argument("--agent-id",required=True)
    p.add_argument("--agent-name")
    p.add_argument("--provider",default="mcp")
    p.add_argument("--intent",dest="intents",action="append",required=True,help="Authorized CIEAV Intent Contract UUID; repeat for multiple")
    p.add_argument("--action",dest="actions",action="append",required=True,help="Authorized semantic action type; repeat for multiple. Use * only when intentionally granting all action types")
    p.add_argument("--max-risk",choices=["LOW","MEDIUM","HIGH","CRITICAL"],default="HIGH")
    p.add_argument("--ttl",type=int,default=900,help="Agent session lifetime in seconds (60-3600)")
    return p

def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load();ttl=max(60,min(3600,args.ttl))
        issued=_issue(settings,{"installId":_install_id(settings),"agent":{"id":args.agent_id,**({"displayName":args.agent_name} if args.agent_name else {}),**({"provider":args.provider} if args.provider else {})},"allowedIntentIds":list(dict.fromkeys(args.intents)),"allowedActionTypes":list(dict.fromkeys(args.actions)),"maxRisk":args.max_risk,"ttlSeconds":ttl})
        token=issued.get("token")
        if not isinstance(token,str) or len(token)<40:raise RuntimeError("CIEAV local authority did not return an agent token")
        entry=settings.root/"apps"/"mcp"/"dist"/"index.js"
        if not entry.exists():raise RuntimeError("CIEAV MCP bridge is not built; install a complete CIEAV runtime or run the workspace build")
        env=dict(os.environ)
        for key in _SECRET_ENV:env.pop(key,None)
        env["CIEAV_AGENT_TOKEN"]=token;env["CIEAV_API_URL"]=f"http://127.0.0.1:{settings.api_port}"
        node=_node(settings)
        os.execve(node,[node,str(entry)],env)
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV MCP error: {exc}",file=sys.stderr,flush=True);return 1
    return 2

if __name__=="__main__":raise SystemExit(main())
