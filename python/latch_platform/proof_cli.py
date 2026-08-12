from __future__ import annotations

import argparse
import json
import sys
from urllib.error import HTTPError,URLError
from urllib.parse import urlencode
from urllib.request import Request,urlopen

from .config import Settings
from .mcp_launcher import _install_id

_KINDS=["DOM_STATE","NETWORK","NAVIGATION","PAGE_MESSAGE","ELEMENT_STATE","API_READBACK","PAYMENT","EMAIL","CALENDAR","FILESYSTEM","DATABASE","TELEMETRY","EXTERNAL_RECEIPT","TOOL_RESULT","HUMAN_ATTESTATION","OTHER"]

def _request(settings:Settings,path:str,method:str="GET",payload:dict|None=None)->dict:
    data=None if payload is None else json.dumps(payload).encode("utf-8");headers={"accept":"application/json","authorization":f"Bearer {settings.token()}"}
    if data is not None:headers["content-type"]="application/json"
    req=Request(f"http://127.0.0.1:{settings.api_port}{path}",headers=headers,data=data,method=method)
    try:
        with urlopen(req,timeout=5) as response:return json.loads(response.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try:detail=json.loads(exc.read().decode("utf-8") or "{}").get("error") or str(exc)
        except Exception:detail=str(exc)
        raise RuntimeError(detail) from exc
    except URLError as exc:raise RuntimeError("CIEAV local authority is offline") from exc

def _require(value:str):
    kind,sep,confidence=value.partition(":")
    if kind not in _KINDS:raise argparse.ArgumentTypeError(f"unknown proof kind: {kind}")
    try:conf=float(confidence) if sep else .7
    except ValueError:raise argparse.ArgumentTypeError("proof confidence must be numeric")
    if conf<0 or conf>1:raise argparse.ArgumentTypeError("proof confidence must be between 0 and 1")
    return{"kind":kind,"required":True,"minConfidence":conf}

def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav proof",description="Manage trusted CIEAV Proof Cases");sub=p.add_subparsers(dest="command",required=True)
    sub.add_parser("list");g=sub.add_parser("get");g.add_argument("id")
    c=sub.add_parser("create");c.add_argument("--intent",required=True);c.add_argument("--receipt");c.add_argument("--open-loop");c.add_argument("--expected",action="append",required=True);c.add_argument("--require",dest="requirements",action="append",type=_require,default=[]);c.add_argument("--deadline")
    a=sub.add_parser("attest");a.add_argument("id");a.add_argument("--summary",required=True);a.add_argument("--signal",choices=["SUPPORTS","CONTRADICTS","NEUTRAL"],default="SUPPORTS");a.add_argument("--confidence",type=float,default=1)
    return p

def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load();install=_install_id(settings)
        if args.command=="list":result=_request(settings,"/v1/proofs?"+urlencode({"installId":install}))
        elif args.command=="get":result=_request(settings,f"/v1/proofs/{args.id}?"+urlencode({"installId":install}))
        elif args.command=="create":result=_request(settings,"/v1/proofs","POST",{"installId":install,"proof":{"intentId":args.intent,**({"receiptId":args.receipt} if args.receipt else {}),**({"openLoopId":args.open_loop} if args.open_loop else {}),"plan":{"expectedState":args.expected,"requirements":args.requirements,**({"deadline":args.deadline} if args.deadline else {})}}})
        else:
            if args.confidence<0 or args.confidence>1:raise RuntimeError("confidence must be between 0 and 1")
            result=_request(settings,f"/v1/proofs/{args.id}/human-attestation","POST",{"installId":install,"summary":args.summary,"signal":args.signal,"confidence":args.confidence})
        print(json.dumps(result,indent=2,ensure_ascii=False));return 0
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV proof error: {exc}",file=sys.stderr);return 1

if __name__=="__main__":raise SystemExit(main())
