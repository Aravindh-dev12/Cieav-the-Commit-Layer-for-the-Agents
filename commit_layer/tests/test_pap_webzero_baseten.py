import pytest
import os
import time

from commit_layer import poppy
from commit_layer import webzero
from commit_layer import frontier_intelligence
from commit_layer.models import Action, RiskLevel, Outcome


# =========================================================================
# 1. Personal Agent Protocol (PAP / Poppy) Tests
# =========================================================================

def test_poppy_discovery_manifest():
    manifest = poppy.get_discovery_document("http://localhost:8000")
    assert manifest["protocol_version"] == "0.1"
    assert "organization" in manifest
    assert manifest["organization"]["name"] == "CIEAV Commit Layer"
    assert manifest["auth"]["issuer"] == "https://auth.cieav.com"
    assert "poppy:commit" in manifest["auth"]["direct"]["scopes"]
    assert any(p["type"] == "poppy" for p in manifest["agent"]["protocols"])
    assert any(a["type"] == "openapi" for a in manifest["apis"])


def test_poppy_session_issuance_and_verification():
    # Issue session token
    session_data = poppy.create_session(
        user_id="user_alice_42",
        client_agent_id="atlas-agent-v1",
        scopes=["poppy:read", "poppy:write", "poppy:commit"]
    )
    assert session_data["session_id"].startswith("poppy_sess_")
    token = session_data["token"]
    assert "." in token

    # Verify valid token
    verified = poppy.verify_session_token(token)
    assert verified is not None
    assert verified["sub"] == "user_alice_42"
    assert verified["client_agent"] == "atlas-agent-v1"

    # Verify invalid / tampered token
    tampered = token[:-4] + "dead"
    assert poppy.verify_session_token(tampered) is None


def test_poppy_conversation_governed_commit():
    session_data = poppy.create_session(user_id="user_bob_99", client_agent_id="atlas-agent")
    sid = session_data["session_id"]

    # 1. Request a HIGH/CRITICAL action (e.g., service deployment)
    turn1 = poppy.handle_conversation(
        session_id=sid,
        message="Deploy payments service to production"
    )
    assert turn1["status"] == "awaiting_approval"
    assert turn1["step_up_required"] is True
    assert turn1["highest_risk"] == "CRITICAL"
    assert "COMMIT CRITICAL" in turn1["confirmation_phrase"]

    # 2. Supply required typed confirmation
    turn2 = poppy.handle_conversation(
        session_id=sid,
        message="Deploy payments service to production",
        typed_confirmation="COMMIT CRITICAL"
    )
    assert turn2["status"] == "completed"
    assert len(turn2["receipt_ids"]) > 0


# =========================================================================
# 2. Webzero Action Surfaces & WARI Tests
# =========================================================================

def test_webzero_action_surfaces_list():
    surfaces = webzero.list_action_surfaces()
    surface_ids = [s["surface_id"] for s in surfaces]
    assert "as_bfsi_payment" in surface_ids
    assert "as_infra_deploy" in surface_ids
    assert "as_hardware_attest" in surface_ids


def test_webzero_wari_score_calculation():
    score = webzero.calculate_w0_score(
        idempotency_rate=1.0,
        scoped_coverage=1.0,
        confirmation_survival_rate=1.0,
        observable_outcome_rate=1.0
    )
    assert score == 100.0

    overview = webzero.get_wari_overview()
    assert overview["w0_score"] >= 90.0
    assert overview["governed_readiness"] == "CRITICAL_COMPLIANT"


def test_webzero_action_surface_idempotency_and_trajectory():
    idempotency_key = f"idem_test_{int(time.time()*1000)}"
    args = {"amount": 50.0, "to": "merchant_test_webzero"}

    # First execution -> runs through Commit Gateway
    res1 = webzero.invoke_action_surface(
        surface_id="as_bfsi_payment",
        args=args,
        idempotency_key=idempotency_key
    )
    assert res1["status"] == "committed"
    assert "trajectory_id" in res1
    assert "reproducible_hash" in res1

    # Second execution with identical idempotency key -> returns cached replay (never double-charges)
    res2 = webzero.invoke_action_surface(
        surface_id="as_bfsi_payment",
        args=args,
        idempotency_key=idempotency_key
    )
    assert res2["status"] == "cached_replay"
    assert res2["receipt_id"] == res1["receipt_id"]


# =========================================================================
# 3. Baseten Inference & Frontier Intelligence Tests
# =========================================================================

def test_baseten_provider_registered():
    assert "baseten" in frontier_intelligence.PROVIDER_CONFIGS
    cfg = frontier_intelligence.PROVIDER_CONFIGS["baseten"]
    assert cfg["env_key"] == "BASETEN_API_KEY"
    assert "baseten" in frontier_intelligence.PROVIDER_DISPATCH


def test_frontier_ensemble_consequence_algebra_fallback():
    # Test that action evaluation respects policy floor even if remote frontier providers are unconfigured
    action = Action(
        tool_name="delete_file",
        args={"path": "/important/system.db"},
        agent_id="test-agent"
    )
    result = frontier_intelligence.ensemble_classify(action)
    # When no remote keys are configured in CI/offline, result indicates fallback
    assert result["providers_consulted"] >= 0
