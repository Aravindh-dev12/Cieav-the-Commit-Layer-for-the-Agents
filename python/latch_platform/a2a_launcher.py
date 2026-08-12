from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
from datetime import datetime,timezone,timedelta
from pathlib import Path

from .config import Settings
from .mcp_launcher import _SECRET_ENV,_install_id,_issue,_node


def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav-a2a",description="Launch the loopback-only CIEAV A2A 1.0 governance agent with short-lived scoped authority")
    p.add_argument("--agent-id",required=True)
    p.add_argument("--agent-name")
    p.add_argument("--provider",default="a2a")
    p.add_argument("--intent",dest="intents",action="append",required=True,help="Authorized CIEAV Intent Contract UUID; repeat for multiple")
    p.add_argument("--action",dest="actions",action="append",required=True,help="Authorized semantic action type; repeat for multiple")
    p.add_argument("--max-risk",choices=["LOW","MEDIUM","HIGH","CRITICAL"],default="HIGH")
    p.add_argument("--ttl",type=int,default=900,help="Agent session lifetime in seconds (60-3600)")
    p.add_argument("--port",type=int,default=8792,help="Loopback A2A JSON-RPC port")
    p.add_argument("--session-file",help="Private JSON file where the ephemeral A2A URL/client capability is written")
    return p


def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load();ttl=max(60,min(3600,args.ttl));port=max(1024,min(65535,args.port))
        issued=_issue(settings,{"installId":_install_id(settings),"agent":{"id":args.agent_id,**({"displayName":args.agent_name} if args.agent_name else {}),**({"provider":args.provider} if args.provider else {})},"allowedIntentIds":list(dict.fromkeys(args.intents)),"allowedActionTypes":list(dict.fromkeys(args.actions)),"maxRisk":args.max_risk,"ttlSeconds":ttl})
        token=issued.get("token")
        if not isinstance(token,str) or len(token)<40:raise RuntimeError("CIEAV local authority did not return an agent token")
        entry=settings.root/"apps"/"a2a"/"dist"/"index.mjs"
        if not entry.exists():entry=settings.root/"apps"/"a2a"/"src"/"index.mjs"
        if not entry.exists():raise RuntimeError("CIEAV A2A bridge is not installed")
        client=secrets.token_urlsafe(48);session=Path(args.session_file).expanduser().resolve() if args.session_file else settings.state_dir/"a2a-session.json";session.parent.mkdir(parents=True,exist_ok=True)
        expires=issued.get("expiresAt") or (datetime.now(timezone.utc)+timedelta(seconds=ttl)).isoformat().replace("+00:00","Z")
        tmp=session.with_name(f"{session.name}.{os.getpid()}.tmp");tmp.write_text(json.dumps({"protocol":"A2A","protocolVersion":"1.0","url":f"http://127.0.0.1:{port}/rpc","agentCard":f"http://127.0.0.1:{port}/.well-known/agent-card.json","authorization":f"Bearer {client}","expiresAt":expires},indent=2)+"\n","utf-8")
        try:os.chmod(tmp,0o600)
        except OSError:pass
        os.replace(tmp,session)
        env=dict(os.environ)
        for key in _SECRET_ENV:env.pop(key,None)
        env["CIEAV_AGENT_TOKEN"]=token;env["CIEAV_API_URL"]=f"http://127.0.0.1:{settings.api_port}";env["CIEAV_A2A_CLIENT_TOKEN"]=client;env["CIEAV_A2A_PORT"]=str(port)
        node=_node(settings);print(f"CIEAV A2A client configuration: {session}",file=sys.stderr,flush=True);os.execve(node,[node,str(entry)],env)
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV A2A error: {exc}",file=sys.stderr,flush=True);return 1
    return 2

if __name__=="__main__":raise SystemExit(main())
