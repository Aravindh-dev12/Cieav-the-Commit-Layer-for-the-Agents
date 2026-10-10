"""FastAPI Application for Commit Layer Gateway.

Routes:
- GET  /                           -> Serves the unified landing page + auth modal + dashboard HTML
- GET  /logo.png                   -> Serves the custom logo
- GET  /favicon.ico                -> Serves the custom favicon
- GET  /api/state                  -> Current pending actions, sandbox state, receipts, cognitive debt
- POST /api/actions/intercept      -> Submits an agent action to the gateway pipeline
- POST /api/actions/{id}/approve   -> Human commits a pending action
- POST /api/actions/{id}/cancel    -> Human cancels a pending action
- POST /api/receipts/{id}/undo     -> Triggers undo on an OBSERVED_SUCCESS receipt with inverse
- GET  /api/receipts/verify        -> Verifies full Ed25519 hash-chain integrity
- POST /api/sandbox/reset          -> Resets the fake sandbox environment
- POST /api/demo/hostile-injection -> Simulates hostile $5000 injection attack
- POST /api/demo/safe-payment      -> Simulates routine $40 payment (previewable)
- POST /api/demo/flaky-payment     -> Simulates flaky payment with potential UNKNOWN outcome
"""
from __future__ import annotations
import os
from contextlib import asynccontextmanager
from typing import Any, Dict
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel

from commit_layer import gateway
from commit_layer import receipts
from commit_layer import sandbox
from commit_layer import friction
from commit_layer import telemetry
from commit_layer import agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize neatlogs & Ed25519 database
    telemetry.setup()
    receipts.init_db()
    yield
    # Shutdown: Flush traces
    telemetry.flush_and_shutdown()


app = FastAPI(title="Commit Layer Gateway", version="1.0.0", lifespan=lifespan)

UI_DIR = os.path.join(os.path.dirname(__file__), "ui")


class InterceptRequest(BaseModel):
    tool: str
    args: Dict[str, Any]
    agent_id: str = "agent-1"


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    ui_path = os.path.join(UI_DIR, "index.html")
    with open(ui_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/logo.png")
async def serve_logo():
    logo_path = os.path.join(UI_DIR, "logo.png")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo not found")


@app.get("/favicon.ico")
@app.get("/favicon.png")
async def serve_favicon():
    fav_path = os.path.join(UI_DIR, "favicon.png")
    if os.path.exists(fav_path):
        return FileResponse(fav_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/api/state")
async def get_state():
    _, _, key_id = receipts.get_signing_key()
    all_receipts = receipts.get_all_receipts()
    
    pending_formatted = {}
    for aid, action in gateway.pending_actions.items():
        pending_formatted[aid] = {
            "id": action.id,
            "tool_name": action.tool_name,
            "args_redacted": action.args_redacted,
            "risk": action.risk.name,
            "reasons": action.reasons,
            "decision": action.decision.value,
            "requires_typed_confirmation": action.decision.value == "preview_with_typed_confirmation"
        }

    return {
        "pending": pending_formatted,
        "receipts": all_receipts,
        "sandbox": sandbox.snapshot(),
        "cognitive_debt": friction.get_cognitive_debt(),
        "key_id": key_id
    }


@app.post("/api/actions/intercept")
async def intercept_action(req: InterceptRequest):
    action = gateway.intercept(tool_name=req.tool, args=req.args, agent_id=req.agent_id)
    result = gateway.process(action)
    return result


@app.post("/api/actions/{action_id}/approve")
async def approve_action(action_id: str):
    res = gateway.approve(action_id, approved_by="dashboard-human")
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.post("/api/actions/{action_id}/cancel")
async def cancel_action(action_id: str):
    res = gateway.cancel(action_id, cancelled_by="dashboard-human")
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.post("/api/receipts/{receipt_id}/undo")
async def undo_action(receipt_id: str):
    res = gateway.undo(receipt_id)
    if "error" in res:
        return JSONResponse(status_code=400, content=res)
    return res


@app.get("/api/receipts/verify")
async def verify_chain():
    valid, errors = receipts.verify_chain()
    return {"valid": valid, "errors": errors}


@app.post("/api/sandbox/reset")
async def reset_sandbox():
    sandbox.reset()
    return {"status": "reset", "state": sandbox.snapshot()}


@app.post("/api/demo/hostile-injection")
async def demo_hostile_injection():
    return agent.run_hostile_email_scenario()


@app.post("/api/demo/safe-payment")
async def demo_safe_payment():
    action = gateway.intercept("send_payment", {"amount": 40.0, "to": "merchant_a"}, agent_id="agent-demo")
    return gateway.process(action)


@app.post("/api/demo/flaky-payment")
async def demo_flaky_payment():
    action = gateway.intercept("flaky_payment", {"amount": 75.0, "to": "merchant_b"}, agent_id="agent-demo")
    return gateway.process(action)
