#!/usr/bin/env python3
from latch_platform.companion_cli import _status


def main()->int:
    task={"intentId":"i1"};intents={"i1":{"status":"ACTIVE"}}
    assert _status(task,intents,[])=="PLANNED"
    assert _status({**task,"delegatedAt":"2026-01-01T00:00:00Z"},intents,[])=="DELEGATED"
    assert _status(task,intents,[{"intentId":"i1","status":"WAITING"}])=="VERIFYING"
    assert _status(task,intents,[{"intentId":"i1","status":"BREACHED"}])=="RECOVERY_NEEDED"
    assert _status(task,intents,[{"intentId":"i1","status":"RECOVERING"}])=="RECOVERING"
    assert _status(task,intents,[{"intentId":"i1","status":"RESOLVED"}])=="SETTLED"
    print("CIEAV Companion lifecycle derivation checks passed");return 0

if __name__=="__main__":raise SystemExit(main())
