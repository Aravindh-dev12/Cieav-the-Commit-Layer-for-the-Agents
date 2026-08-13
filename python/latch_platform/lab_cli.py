from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

from .config import Settings
from .mcp_launcher import _install_id


def _device(settings:Settings)->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}/v1/devices/register",data=json.dumps({"installId":_install_id(settings),"deviceName":"CIEAV Action Lab"}).encode(),headers={"content-type":"application/json"},method="POST")
    with urlopen(req,timeout=4) as r:return json.loads(r.read().decode() or "{}")

def _post(settings:Settings,token:str,path:str,payload:dict)->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}{path}",data=json.dumps(payload).encode(),headers={"content-type":"application/json","authorization":f"Bearer {token}"},method="POST")
    try:
        with urlopen(req,timeout=8) as r:return json.loads(r.read().decode() or "{}")
    except HTTPError as exc:
        try:detail=json.loads(exc.read().decode() or "{}");message=detail.get("error") or detail.get("detail") or str(exc)
        except Exception:message=str(exc)
        raise RuntimeError(message) from exc
    except URLError as exc:raise RuntimeError("CIEAV local authority is offline") from exc

def _json_arg(value:str)->dict:
    p=Path(value).expanduser()
    raw=p.read_text("utf-8") if p.exists() else value
    out=json.loads(raw)
    if not isinstance(out,dict):raise ValueError("manifest must be a JSON object")
    return out

def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav-lab",description="Simulate CIEAV authority decisions without creating approvals or consumable permits")
    p.add_argument("--intent",required=True,help="Existing Intent Contract UUID")
    p.add_argument("--manifest",required=True,help="Action Manifest JSON or path to a JSON file")
    p.add_argument("--actor-id",default="action-lab-user")
    p.add_argument("--actor-kind",choices=["HUMAN","AGENT","SERVICE","ORGANIZATION","DEVICE"],default="HUMAN")
    p.add_argument("--amount",type=float)
    p.add_argument("--currency",default="USD")
    return p

def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load();device=_device(settings);token=device.get("token")
        if not isinstance(token,str):raise RuntimeError("CIEAV device registration did not return a token")
        payload={"intentId":args.intent,"actor":{"id":args.actor_id,"kind":args.actor_kind},"delegationChain":[],"manifest":_json_arg(args.manifest),**({"amount":{"currency":args.currency.upper(),"value":args.amount}} if args.amount is not None else {})}
        result=_post(settings,token,"/v1/reality/lab/evaluate",payload)
        if result.get("permit") or result.get("approval") or result.get("permitIssued") is not False:raise RuntimeError("Action Lab invariant violation: simulation returned execution authority")
        print(json.dumps(result,indent=2,ensure_ascii=False));return 0
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV Action Lab error: {exc}",file=sys.stderr);return 1

if __name__=="__main__":raise SystemExit(main())
