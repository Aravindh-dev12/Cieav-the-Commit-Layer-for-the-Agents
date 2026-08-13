from __future__ import annotations

import argparse
import json
import sys
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

from .config import Settings

def _call(settings:Settings,path:str,method:str="GET")->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}{path}",headers={"accept":"application/json","content-type":"application/json","authorization":f"Bearer {settings.token()}"},data=b"{}" if method!="GET" else None,method=method)
    try:
        with urlopen(req,timeout=5) as response:return json.loads(response.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try:detail=json.loads(exc.read().decode("utf-8") or "{}").get("error") or str(exc)
        except Exception:detail=str(exc)
        raise RuntimeError(detail) from exc
    except URLError as exc:raise RuntimeError("CIEAV local authority is offline") from exc

def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav-approval",description="Inspect and decide trusted local CIEAV approval challenges");sub=p.add_subparsers(dest="command",required=True);sub.add_parser("list");a=sub.add_parser("approve");a.add_argument("id");d=sub.add_parser("deny");d.add_argument("id");return p

def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load()
        result=_call(settings,"/v1/reality/approvals") if args.command=="list" else _call(settings,f"/v1/reality/approvals/{args.id}/{'approve' if args.command=='approve' else 'deny'}","POST")
        print(json.dumps(result,indent=2,ensure_ascii=False));return 0
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV approval error: {exc}",file=sys.stderr);return 1

if __name__=="__main__":raise SystemExit(main())
