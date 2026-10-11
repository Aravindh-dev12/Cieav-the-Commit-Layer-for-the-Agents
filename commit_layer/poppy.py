"""
Autonomous Agent Gateway Protocol Implementation for CIEAV Commit Layer.

Provides standardized agent federation and boundary governance:
1. Discovery at `/.well-known/poppy.json`
2. Unified session management across APIs, MCP, and external agents
3. Governed conversations between personal agents and organization agents
4. Integration with CIEAV's Consequence Algebra & Two-Phase Commit receipts
"""

from __future__ import annotations
import dataclasses
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from typing import Any, Optional

from commit_layer.models import Action, RiskLevel, Decision
from commit_layer import gateway
from commit_layer import intent
from commit_layer import receipts

logger = logging.getLogger(__name__)

POPPY_VERSION = "0.1"
POPPY_SECRET = os.environ.get("POPPY_SECRET", "cieav-poppy-protocol-secret-key-2026")
ORG_NAME = os.environ.get("POPPY_ORG_NAME", "CIEAV Commit Layer")
ORG_DOMAIN = os.environ.get("POPPY_ORG_DOMAIN", "cieav.com")
AUTH_ISSUER = os.environ.get("POPPY_AUTH_ISSUER", "https://auth.cieav.com")

# In-memory session registry (backed by HMAC signature)
ACTIVE_POPPY_SESSIONS: dict[str, dict[str, Any]] = {}


@dataclasses.dataclass
class PoppyMessage:
    role: str  # "user", "agent", "company"
    sender_type: str  # "person" or "ai"
    content: str
    structured_payload: dict[str, Any] = dataclasses.field(default_factory=dict)
    timestamp: float = dataclasses.field(default_factory=time.time)


def get_discovery_document(base_url: str = "") -> dict[str, Any]:
    """
    Returns the Agent Gateway Protocol discovery manifest (/.well-known/poppy.json).
    """
    api_base = base_url.rstrip("/") if base_url else ""
    return {
        "protocol_version": POPPY_VERSION,
        "organization": {
            "name": ORG_NAME,
            "domain": ORG_DOMAIN
        },
        "auth": {
            "issuer": AUTH_ISSUER,
            "direct": {
                "scopes": ["poppy:read", "poppy:write", "poppy:commit"]
            }
        },
        "agent": {
            "protocols": [
                {
                    "type": "poppy",
                    "endpoint": f"{api_base}/api/poppy/conversations"
                }
            ]
        },
        "apis": [
            {
                "type": "openapi",
                "schema": f"{api_base}/openapi.json"
            },
            {
                "type": "mcp",
                "endpoint": f"{api_base}/api/mcp"
            }
        ],
        "extensions": {
            "commit_layer": {
                "hash_chain": True,
                "tamper_proof_receipts": True,
                "consequence_algebra": True,
                "undo_available": True
            }
        }
    }


def create_session(user_id: str, client_agent_id: str = "atlas-personal-agent", scopes: Optional[list[str]] = None) -> dict[str, Any]:
    """
    Issue a new Poppy session token for a personal agent acting on behalf of a user.
    """
    scopes = scopes or ["poppy:read", "poppy:write", "poppy:commit"]
    session_id = f"poppy_sess_{uuid.uuid4().hex[:12]}"
    now = time.time()
    expires_at = now + 86400  # 24 hours

    payload = {
        "sub": user_id,
        "client_agent": client_agent_id,
        "session_id": session_id,
        "scopes": scopes,
        "iat": now,
        "exp": expires_at
    }

    # Generate HMAC-SHA256 signature for the session token
    canonical = json.dumps(payload, sort_keys=True)
    sig = hmac.new(POPPY_SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    token = f"{session_id}.{sig}"

    session_record = {
        **payload,
        "token": token,
        "created_at": now
    }
    ACTIVE_POPPY_SESSIONS[session_id] = session_record

    return {
        "session_id": session_id,
        "token": token,
        "user_id": user_id,
        "scopes": scopes,
        "expires_at": expires_at,
        "organization": ORG_NAME
    }


def verify_session_token(token: str) -> Optional[dict[str, Any]]:
    """
    Validate and authenticate a Poppy session token.
    """
    try:
        parts = token.split(".", 1)
        if len(parts) != 2:
            return None
        session_id, sig = parts
        session = ACTIVE_POPPY_SESSIONS.get(session_id)
        if not session:
            return None

        # Verify expiration
        if time.time() > session["exp"]:
            ACTIVE_POPPY_SESSIONS.pop(session_id, None)
            return None

        # Verify signature
        payload = {
            "sub": session["sub"],
            "client_agent": session["client_agent"],
            "session_id": session["session_id"],
            "scopes": session["scopes"],
            "iat": session["iat"],
            "exp": session["exp"]
        }
        canonical = json.dumps(payload, sort_keys=True)
        expected_sig = hmac.new(POPPY_SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None

        return session
    except Exception as e:
        logger.warning("Poppy token verification failed: %s", e)
        return None


def handle_conversation(
    session_id: str,
    message: str,
    sender_type: str = "ai",
    structured_payload: Optional[dict[str, Any]] = None,
    typed_confirmation: str = ""
) -> dict[str, Any]:
    """
    Handle a structured conversation turn in the Personal Agent Protocol.
    Connects the personal agent's intent directly into CIEAV's Intent Engine
    and Consequence Algebra.
    """
    session = ACTIVE_POPPY_SESSIONS.get(session_id)
    if not session:
        return {
            "status": "unauthorized",
            "reply": "Invalid or expired Poppy session. Please sign in or initialize session.",
            "step_up_required": True
        }

    # Evaluate intent through CIEAV Commit Layer
    plan = intent.plan_intent(prompt=message, context=structured_payload, agent_id=session.get("client_agent", "poppy-agent"))

    # If action requires typed confirmation or is HIGH/CRITICAL
    if plan["requires_typed_confirmation"] and not typed_confirmation:
        return {
            "status": "awaiting_approval",
            "reply": f"Action requires explicit user confirmation. Safety policy flagged: {plan['highest_risk']}.",
            "plan_id": plan["plan_id"],
            "highest_risk": plan["highest_risk"],
            "step_up_required": True,
            "confirmation_phrase": plan["confirmation_phrase"],
            "actions": plan["actions"],
            "sender_type": "ai"
        }

    # If already confirmed or LOW/MEDIUM risk
    commit_res = intent.commit_plan(
        plan_id=plan["plan_id"],
        approved_by=f"poppy-user-{session['sub']}",
        typed_confirmation=typed_confirmation
    )

    if "error" in commit_res:
        return {
            "status": "rejected",
            "reply": f"Commit failed: {commit_res['error']}",
            "plan_id": plan["plan_id"],
            "error": commit_res["error"]
        }

    return {
        "status": "completed",
        "reply": f"Task successfully committed across {plan['action_count']} verified action(s). Signed Ed25519 receipt generated.",
        "plan_id": plan["plan_id"],
        "receipt_ids": commit_res.get("receipt_ids", []),
        "results": commit_res.get("results", []),
        "sender_type": "company"
    }


def discover_remote_company(domain: str) -> dict[str, Any]:
    """
    Client-side Poppy discovery: inspects remote domain for /.well-known/poppy.json.
    """
    import urllib.request
    clean_domain = domain.replace("https://", "").replace("http://", "").rstrip("/")
    url = f"https://{clean_domain}/.well-known/poppy.json"
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CIEAV-Poppy-Agent/0.1"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                return {
                    "discovered": True,
                    "domain": clean_domain,
                    "poppy_manifest": data
                }
    except Exception as e:
        logger.info("Remote poppy discovery failed for %s: %s", domain, e)

    return {
        "discovered": False,
        "domain": clean_domain,
        "reason": "Remote server does not expose /.well-known/poppy.json or timed out"
    }
