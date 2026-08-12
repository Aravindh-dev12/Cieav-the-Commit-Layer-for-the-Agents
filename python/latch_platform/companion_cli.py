from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from datetime import datetime,timezone
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

from .config import Settings
from .mcp_launcher import _install_id,main as mcp_main
from .a2a_launcher import main as a2a_main

_DATA=("NONE","ACCOUNT","CONTACT","LOCATION","IDENTITY","FINANCIAL","HEALTH","CREDENTIAL","BIOMETRIC","FILE","MESSAGE","WORK","OTHER")
_RISK=("LOW","MEDIUM","HIGH","CRITICAL")

def _now()->str:return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def _file(settings:Settings)->Path:return settings.state_dir/"companion-tasks.json"
def _load(settings:Settings)->list[dict]:
    try:
        value=json.loads(_file(settings).read_text("utf-8"));return value if isinstance(value,list) else []
    except (FileNotFoundError,json.JSONDecodeError):return []
def _save(settings:Settings,tasks:list[dict])->None:
    settings.ensure();p=_file(settings);tmp=p.with_name(f"{p.name}.{os.getpid()}.tmp");tmp.write_text(json.dumps(tasks[-1000:],indent=2)+"\n","utf-8")
    try:os.chmod(tmp,0o600)
    except OSError:pass
    os.replace(tmp,p)
def _device(settings:Settings)->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}/v1/devices/register",data=json.dumps({"installId":_install_id(settings),"deviceName":"CIEAV Companion"}).encode(),headers={"content-type":"application/json"},method="POST")
    try:
        with urlopen(req,timeout=4) as r:return json.loads(r.read().decode() or "{}")
    except URLError as exc:raise RuntimeError("CIEAV local authority is offline") from exc
def _request(settings:Settings,token:str,path:str,method="GET",payload:dict|None=None)->dict:
    req=Request(f"http://127.0.0.1:{settings.api_port}{path}",data=json.dumps(payload).encode() if payload is not None else None,headers={"content-type":"application/json","authorization":f"Bearer {token}"},method=method)
    try:
        with urlopen(req,timeout=6) as r:return json.loads(r.read().decode() or "{}")
    except HTTPError as exc:
        try:d=json.loads(exc.read().decode() or "{}");msg=d.get("error") or d.get("detail") or str(exc)
        except Exception:msg=str(exc)
        raise RuntimeError(msg) from exc

def _status(task:dict,intents:dict[str,dict],loops:list[dict])->str:
    intent=intents.get(task.get("intentId",""));related=[x for x in loops if x.get("intentId")==task.get("intentId")]
    if not intent:return"MISSING_INTENT"
    if intent.get("status")!="ACTIVE":return str(intent.get("status"))
    if any(x.get("status")=="BREACHED" for x in related):return"RECOVERY_NEEDED"
    if any(x.get("status")=="RECOVERING" for x in related):return"RECOVERING"
    if any(x.get("status") in {"OPEN","WAITING"} for x in related):return"VERIFYING"
    if related and all(x.get("status")=="RESOLVED" for x in related):return"SETTLED"
    return"DELEGATED" if task.get("delegatedAt") else"PLANNED"

def build_parser()->argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav-companion",description="Create explicit CIEAV authority envelopes and safely delegate them to agent protocols")
    sub=p.add_subparsers(dest="command",required=True)
    c=sub.add_parser("create",help="Create a Companion task backed by a durable CIEAV Intent Contract")
    c.add_argument("--goal",required=True);c.add_argument("--allow-action",dest="actions",action="append",required=True);c.add_argument("--deny-action",dest="denied",action="append",default=[]);c.add_argument("--allow-target",dest="targets",action="append",default=[]);c.add_argument("--deny-target",dest="denied_targets",action="append",default=[]);c.add_argument("--data-category",dest="data",action="append",choices=_DATA,default=[]);c.add_argument("--max-risk",choices=_RISK,default="MEDIUM");c.add_argument("--approval-at",choices=_RISK);c.add_argument("--completion",action="append",required=True);c.add_argument("--owner-id",default="local-human");c.add_argument("--owner-name");c.add_argument("--organization");c.add_argument("--expires-at");c.add_argument("--max-delegation-depth",type=int,default=1);c.add_argument("--allow-external-recipients",action="store_true");c.add_argument("--max-amount",type=float);c.add_argument("--currency",default="USD")
    sub.add_parser("list",help="List Companion tasks with state derived from CIEAV reality")
    s=sub.add_parser("show",help="Show one Companion task and its current Intent/Open Loops");s.add_argument("task_id")
    d=sub.add_parser("delegate",help="Launch a scoped MCP or A2A bridge for a Companion task");d.add_argument("task_id");d.add_argument("--protocol",choices=["mcp","a2a"],default="mcp");d.add_argument("--agent-id",default="cieav-companion");d.add_argument("--agent-name",default="CIEAV Companion");d.add_argument("--ttl",type=int,default=900);d.add_argument("--port",type=int,default=8792)
    return p

def main(argv:list[str]|None=None)->int:
    try:
        args=build_parser().parse_args(argv);settings=Settings.load();dev=_device(settings);token=dev.get("token")
        if not isinstance(token,str):raise RuntimeError("CIEAV device registration failed")
        tasks=_load(settings)
        if args.command=="create":
            if args.max_amount is not None and args.max_amount<0:raise ValueError("max amount cannot be negative")
            categories=list(dict.fromkeys(args.data or ["NONE"]));constraints={"allowedActionTypes":list(dict.fromkeys(args.actions)),"deniedActionTypes":list(dict.fromkeys(args.denied)),"allowedTargets":list(dict.fromkeys(args.targets)),"deniedTargets":list(dict.fromkeys(args.denied_targets)),"maxRisk":args.max_risk,"allowedDataCategories":categories,"allowExternalRecipients":bool(args.allow_external_recipients),"maxDelegationDepth":max(0,min(16,args.max_delegation_depth)),"requireIndependentVerification":True,**({"humanApprovalAtOrAbove":args.approval_at} if args.approval_at else {}),**({"maxAmount":{"currency":args.currency.upper(),"value":args.max_amount}} if args.max_amount is not None else {})}
            context={"organizationId":args.organization} if args.organization else {}
            payload={"owner":{"id":args.owner_id,"kind":"HUMAN",**({"displayName":args.owner_name} if args.owner_name else {})},"goal":args.goal,"constraints":constraints,"completionCriteria":args.completion,"contextLabels":context,**({"expiresAt":args.expires_at} if args.expires_at else {})}
            result=_request(settings,token,"/v1/intents","POST",payload);intent=result.get("intent")
            if not isinstance(intent,dict) or not intent.get("id"):raise RuntimeError("CIEAV did not create the Intent Contract")
            task={"id":str(uuid.uuid4()),"intentId":intent["id"],"goal":args.goal,"createdAt":_now(),"allowedActionTypes":constraints["allowedActionTypes"],"maxRisk":args.max_risk,"state":"PLANNED"};tasks.append(task);_save(settings,tasks);print(json.dumps({"task":task,"intent":intent},indent=2,ensure_ascii=False));return 0
        intents={x["id"]:x for x in _request(settings,token,"/v1/intents").get("intents",[]) if isinstance(x,dict) and isinstance(x.get("id"),str)};loops=_request(settings,token,"/v1/open-loops").get("openLoops",[])
        if args.command=="list":print(json.dumps({"tasks":[{**t,"state":_status(t,intents,loops)} for t in tasks]},indent=2,ensure_ascii=False));return 0
        task=next((x for x in tasks if x.get("id")==args.task_id),None)
        if not task:raise RuntimeError("Companion task not found")
        if args.command=="show":print(json.dumps({"task":{**task,"state":_status(task,intents,loops)},"intent":intents.get(task["intentId"]),"openLoops":[x for x in loops if x.get("intentId")==task["intentId"]]},indent=2,ensure_ascii=False));return 0
        if args.command=="delegate":
            if task["intentId"] not in intents:raise RuntimeError("Companion Intent Contract is missing")
            task["delegatedAt"]=_now();task["protocol"]=args.protocol;_save(settings,tasks)
            common=["--agent-id",args.agent_id,"--agent-name",args.agent_name,"--intent",task["intentId"],"--max-risk",task.get("maxRisk","MEDIUM"),"--ttl",str(max(60,min(3600,args.ttl)))]
            for action in task.get("allowedActionTypes",[]):common.extend(["--action",action])
            if args.protocol=="a2a":common.extend(["--port",str(args.port)]);return a2a_main(common)
            return mcp_main(common)
    except KeyboardInterrupt:return 130
    except Exception as exc:print(f"CIEAV Companion error: {exc}",file=sys.stderr);return 1
    return 2

if __name__=="__main__":raise SystemExit(main())
