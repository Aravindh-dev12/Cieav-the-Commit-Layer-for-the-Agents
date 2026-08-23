#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from latch_platform.cli import build_parser
from latch_platform.config import Settings
import latch_platform.gateway as gateway_module
from latch_platform.gateway import ControlHandler, Gateway


def settings_for(root: Path, state: Path, offset: int = 0) -> Settings:
    return Settings(
        root=root,
        state_dir=state,
        gateway_port=18791 + offset,
        control_port=18790 + offset,
        api_port=18787 + offset,
        token_file=state / "gateway-token",
        local_api_secret_file=state / "local-api-signing-secret",
        receipt_signing_secret_file=state / "receipt-signing-secret",
        hf_token_file=state / "hf-token",
        runtime_file=state / "gateway-runtime.json",
        log_file=state / "gateway.log",
    )


def assert_private(path: Path) -> None:
    if os.name != "nt":
        assert (path.stat().st_mode & 0o077) == 0, f"{path} must not be group/world accessible"


def http_status(port: int, path: str, token: str, method: str = "GET") -> int:
    req=Request(f"http://127.0.0.1:{port}{path}",method=method,headers={"authorization":f"Bearer {token}"})
    try:
        with urlopen(req,timeout=2) as response: return response.status
    except HTTPError as exc: return exc.code


def signed_browser_dispatch(commit_token: str, *, ticket: dict, action: dict, normalized_arguments_digest: str) -> dict:
    operation,target,computed_arguments_digest,action_digest=gateway_module._browser_action_binding(action)
    assert computed_arguments_digest==normalized_arguments_digest
    route_digest=gateway_module._digest({"toolId":ticket["toolId"],"protocol":"BROWSER","operation":operation,"target":target,"normalizedArgumentsDigest":normalized_arguments_digest})
    assert route_digest==ticket["routeDigest"]
    envelope={"version":1,"ticketId":ticket["id"],"proposalId":ticket["proposalId"],"realityBoundCommitId":ticket["realityBoundCommitId"],"toolId":ticket["toolId"],"authorizationDigest":ticket["authorizationDigest"],"routeDigest":ticket["routeDigest"],"normalizedArgumentsDigest":normalized_arguments_digest,"downstreamRef":"browser+cieav:"+"d"*64,"ticketIssuedAt":ticket["issuedAt"],"ticketExpiresAt":ticket["expiresAt"],"ticketConsumedAt":ticket["consumedAt"],"actionDigest":action_digest}
    material="\n".join(["CIEAV_BROWSER_COMMIT_DISPATCH_V1","1",envelope["ticketId"],envelope["proposalId"],envelope["realityBoundCommitId"],envelope["toolId"],envelope["authorizationDigest"],envelope["routeDigest"],envelope["normalizedArgumentsDigest"],envelope["downstreamRef"],envelope["ticketIssuedAt"],envelope["ticketExpiresAt"],envelope["ticketConsumedAt"],envelope["actionDigest"]])
    envelope["signature"]=hmac.new(commit_token.encode(),material.encode(),hashlib.sha256).hexdigest()
    return{"version":1,"envelope":envelope,"action":action}


def write_execution_fabric_state(gateway: Gateway, payload: dict) -> None:
    gateway.s.state_dir.mkdir(parents=True,exist_ok=True)
    mac=gateway_module._hmac_b64url(gateway.execution_fabric_verification_secret,gateway_module._canonical(payload))
    (gateway.s.state_dir/"execution-fabric-state.json").write_text(json.dumps({"payload":payload,"mac":mac}),"utf-8")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    assert (root / "apps/browser/main.mjs").exists()
    assert (root / "apps/browser/control-auth.mjs").exists()
    assert (root / "apps/browser/test-lab.html").exists()
    assert (root / "apps/api").exists()

    parser = build_parser()
    for argv in [
        ["gateway", "run"],
        ["gateway", "install"],
        ["gateway", "start"],
        ["gateway", "stop"],
        ["gateway", "restart"],
        ["gateway", "status"],
        ["gateway", "pause"],
        ["gateway", "resume"],
        ["gateway", "restart-surface"],
        ["doctor"],
        ["dashboard"],
        ["test-lab"],
        ["audit", "tail"],
        ["audit", "verify"],
    ]:
        parsed = parser.parse_args(argv)
        assert parsed.command

    with tempfile.TemporaryDirectory(prefix="cieav-platform-") as td:
        base = Path(td)
        a = settings_for(root, base / "user-a", 0)
        b = settings_for(root, base / "user-b", 20)

        a_token = a.token()
        a_api = a.local_api_secret()
        a_receipt = a.receipt_signing_secret()
        a_replay = a.browser_replay_secret()
        b_token = b.token()
        b_api = b.local_api_secret()
        b_receipt = b.receipt_signing_secret()
        b_replay = b.browser_replay_secret()

        assert len(a_token) >= 32
        assert len(a_api) >= 32
        assert len(a_receipt) >= 32
        assert len(a_replay) >= 43
        assert a.token() == a_token
        assert a.local_api_secret() == a_api
        assert a.receipt_signing_secret() == a_receipt
        assert a.browser_replay_secret() == a_replay

        assert a.state_dir != b.state_dir
        assert a_token != b_token
        assert a_api != b_api
        assert a_receipt != b_receipt
        assert a_replay != b_replay
        assert a_api != a_receipt
        assert b_api != b_receipt

        for s in (a, b):
            assert_private(s.state_dir)
            assert_private(s.token_file)
            assert_private(s.local_api_secret_file)
            assert_private(s.receipt_signing_secret_file)

        commit_token="K"*64
        os.environ["CIEAV_BROWSER_COMMIT_TOKEN"]=commit_token
        g = Gateway(a)
        assert g.test_lab_url == "http://127.0.0.1:18791/test-lab"
        assert len(g.semantic_router_token)>=43
        assert not secrets.compare_digest(g.semantic_router_token,g.token)
        assert secrets.compare_digest(g.browser_commit_token,commit_token)
        assert not secrets.compare_digest(g.browser_commit_token,g.token)
        assert len(g.execution_fabric_verification_secret)>=43
        bootstrap=g._semantic_bootstrap()
        try:
            parsed_bootstrap=json.loads(bytes(bootstrap).decode("utf-8"))
            assert parsed_bootstrap["gatewayToken"]==g.token
            assert parsed_bootstrap["semanticRouterToken"]==g.semantic_router_token
            assert parsed_bootstrap["semanticRouterToken"]!=parsed_bootstrap["gatewayToken"]
            assert len(parsed_bootstrap["jwtSecret"])>=32
            assert len(parsed_bootstrap["receiptSigningSecret"])>=32
            assert parsed_bootstrap["jwtSecret"]!=parsed_bootstrap["receiptSigningSecret"]
        finally:
            bootstrap[:]=b"\0"*len(bootstrap)
        health = g.public_health()
        assert health["platform"] in {"CIEAV Gateway", "LATCH Gateway"}
        assert health["paused"] is False
        assert health["surfaceRunning"] is False

        ControlHandler.gateway=g
        scope_server=ThreadingHTTPServer(("127.0.0.1",0),ControlHandler)
        scope_thread=threading.Thread(target=scope_server.serve_forever,daemon=True)
        scope_thread.start()
        try:
            scope_port=int(scope_server.server_address[1])
            assert http_status(scope_port,"/v1/hf/status",g.semantic_router_token)==200
            assert http_status(scope_port,"/v1/pause",g.semantic_router_token,"POST")==401
            assert g.paused is False
            assert http_status(scope_port,"/v1/status",g.token)==200
            assert http_status(scope_port,"/v1/browser-commit/verify",g.token,"POST")==401
        finally:
            scope_server.shutdown(); scope_server.server_close(); scope_thread.join(timeout=2)

        with patch.dict(os.environ,{"CIEAV_TEST_AUTO_APPROVE":"1","LATCH_TEST_AUTO_APPROVE":"1","CIEAV_BROWSER_CONTROL_TOKEN":"polluted","LATCH_BROWSER_CONTROL_TOKEN":"polluted-legacy","CIEAV_BROWSER_REPLAY_KEY":"polluted-replay"},clear=False):
            base_env=g._base_env()
            dedicated="C"*64
            surface_env=g._surface_env(dedicated)
            semantic_env=g._semantic_env()
            assert "CIEAV_TEST_AUTO_APPROVE" not in base_env
            assert "LATCH_TEST_AUTO_APPROVE" not in base_env
            assert "CIEAV_BROWSER_CONTROL_TOKEN" not in base_env
            assert "LATCH_BROWSER_CONTROL_TOKEN" not in base_env
            assert "CIEAV_BROWSER_REPLAY_KEY" not in base_env
            assert "CIEAV_BROWSER_REPLAY_KEY" not in semantic_env
            assert surface_env["CIEAV_TEST_AUTO_APPROVE"] == "0"
            assert "LATCH_TEST_AUTO_APPROVE" not in surface_env
            assert surface_env["CIEAV_REQUIRE_PRODUCTION_API"] == "1"
            assert surface_env["CIEAV_BROWSER_CONTROL_TOKEN"] == dedicated
            assert surface_env["CIEAV_BROWSER_REPLAY_KEY"] == a_replay
            assert surface_env["CIEAV_BROWSER_REPLAY_KEY"] != surface_env["CIEAV_BROWSER_CONTROL_TOKEN"]
            assert surface_env["CIEAV_BROWSER_REPLAY_KEY"] != g.browser_commit_token
            assert surface_env["CIEAV_BROWSER_CONTROL_TOKEN"] != g.token
            assert semantic_env["CIEAV_BROWSER_COMMIT_TOKEN"] == commit_token
            for secret_name in ("JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN"):
                assert secret_name not in semantic_env
                assert secret_name not in surface_env

        first=g._surface_env()["CIEAV_BROWSER_CONTROL_TOKEN"]
        second=g._surface_env()["CIEAV_BROWSER_CONTROL_TOKEN"]
        assert len(first)>=43 and len(second)>=43 and first!=second
        assert g._surface_env()["CIEAV_BROWSER_REPLAY_KEY"]==a_replay

        now=datetime.now(timezone.utc);issued=(now-timedelta(seconds=2)).isoformat();consumed=(now-timedelta(seconds=1)).isoformat();expires=(now+timedelta(seconds=30)).isoformat()
        action={"operation":"CLICK","pageUrl":"https://example.test/order/1","selector":"#submit"}
        _,target,args_digest,_=gateway_module._browser_action_binding(action)
        route_digest=gateway_module._digest({"toolId":"browser-click","protocol":"BROWSER","operation":"CLICK","target":target,"normalizedArgumentsDigest":args_digest})
        ticket={"id":"ticket-0001","version":1,"proposalId":"proposal-0001","intentId":"intent-0001","taskId":"task-0001","toolId":"browser-click","authorizationDigest":"a"*64,"realityBoundCommitId":"rbc-0001","credentialLeaseId":"lease-0001","routeDigest":route_digest,"issuedAt":issued,"expiresAt":expires,"status":"CONSUMED","consumedAt":consumed}
        route_event={"id":"audit-route","version":1,"scopeDeviceId":"device","phase":"ROUTE","outcome":"PASS","ticketId":ticket["id"],"summary":"route","detailsDigest":"f"*64,"eventHash":"0"*64,"createdAt":consumed}
        state_payload={"version":1,"attestations":[],"tools":[],"leases":[],"graphs":[],"proposals":[],"tickets":[ticket],"audit":[route_event]}
        write_execution_fabric_state(g,state_payload)
        dispatch=signed_browser_dispatch(commit_token,ticket=ticket,action=action,normalized_arguments_digest=args_digest)
        verified=g.verify_browser_commit(dispatch)
        assert verified["ok"] is True and verified["trustedAuthorityStateVerified"] is True and verified["executionAuthorityIssued"] is False
        tampered_dispatch={**dispatch,"action":{**action,"selector":"#tampered"}}
        try:g.verify_browser_commit(tampered_dispatch)
        except ValueError as exc:assert "action_digest_mismatch" in str(exc)
        else:raise AssertionError("Gateway verifier accepted altered browser action")
        state_payload["audit"]=[];write_execution_fabric_state(g,state_payload)
        try:g.verify_browser_commit(dispatch)
        except ValueError as exc:assert "route_audit_missing" in str(exc)
        else:raise AssertionError("Gateway verifier accepted ticket without ROUTE/PASS audit")
        state_payload["audit"]=[route_event,{"id":"audit-execute","version":1,"scopeDeviceId":"device","phase":"EXECUTE","outcome":"PASS","ticketId":ticket["id"],"summary":"execute","detailsDigest":"e"*64,"eventHash":"1"*64,"createdAt":consumed}];write_execution_fabric_state(g,state_payload)
        try:g.verify_browser_commit(dispatch)
        except ValueError as exc:assert "execution_already_attempted" in str(exc)
        else:raise AssertionError("Gateway verifier accepted ticket with prior EXECUTE attempt")
        write_execution_fabric_state(g,{**state_payload,"audit":[route_event]})
        state_path=g.s.state_dir/"execution-fabric-state.json";corrupt=json.loads(state_path.read_text("utf-8"));corrupt["mac"]="invalid";state_path.write_text(json.dumps(corrupt),"utf-8")
        try:g.verify_browser_commit(dispatch)
        except RuntimeError as exc:assert "state_integrity_failed" in str(exc)
        else:raise AssertionError("Gateway verifier accepted unauthenticated Execution Fabric state")

        with patch.object(g, "open_surface_url", return_value={"ok": True, "url": g.test_lab_url}) as open_url:
            result = g.open_test_lab()
            assert result["ok"] is True
            open_url.assert_called_once_with(g.test_lab_url)

        g.paused = True
        with patch.object(g, "_browser_health", return_value={"ok": True}):
            try:
                g.open_surface_url("https://example.com")
            except RuntimeError as exc:
                assert "paused" in str(exc).lower()
            else:
                raise AssertionError("paused Gateway must not open protected URLs")

    print("CIEAV Python Gateway smoke test passed")
    print("CIEAV per-user local authority isolation passed")
    print("CIEAV production test-auto suppression passed")
    print("CIEAV per-surface browser control capability isolation passed")
    print("CIEAV durable browser replay-key isolation passed")
    print("CIEAV browser commit Gateway authority-state verification passed")
    print("CIEAV semantic/admin Gateway capability split passed")
    print("CIEAV audit verification command is available")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())