"""
Test Suite: Futuristic Agent-to-Agent (A2A) Communications & REA Economic Ledger
================================================================================
Comprehensive automated tests verifying:
  1. Resource-Event-Agent (REA) Economic Ontology (ISO/IEC 15944-4)
  2. Double-entry conservation laws and escrow reservation locks
  3. Bilateral Two-Phase Commit (2PC) between autonomous agents
  4. Lossless Two-Phase Rollback (/undo)
  5. Cryptographic Ed25519 mutual authentication handshake
  6. A2A decision governance via cieav-decider-v2 and CFO spending limits
  7. End-to-end FastAPI HTTP endpoints
"""

import json
import time
import urllib.request
import urllib.error
import pytest

from commit_layer.rea import rea_ledger, REALedger, CommitmentStatus, EventType
from commit_layer.a2a import a2a_network, AgentProfile, A2AMessage
from commit_layer import receipts, gateway


# =========================================================================
# 1. REA Economic Primitives & Balance Invariants
# =========================================================================

def test_rea_mint_and_available_balances():
    """Verify resource minting and available balance isolation."""
    ledger = REALedger()
    res = ledger.mint_resource("test-agent-alpha", "GPU_HOURS", 20.0)
    assert res.amount == 20.0
    assert res.escrowed == 0.0
    assert res.available_amount == 20.0
    assert ledger.get_agent_balance("test-agent-alpha", "GPU_HOURS") == 20.0


def test_rea_escrow_locking_in_phase_one_prepare():
    """Verify that preparing an exchange locks resources in escrow to prevent double-spending."""
    ledger = REALedger()
    ledger.mint_resource("agent-buyer", "USD_CREDITS", 100.0)
    ledger.mint_resource("agent-seller", "GPU_HOURS", 10.0)

    # Propose exchange: $50 USD for 5 GPU hours
    comm = ledger.propose_exchange(
        initiator_agent="agent-buyer",
        responder_agent="agent-seller",
        give_resource_type="USD_CREDITS",
        give_amount=50.0,
        take_resource_type="GPU_HOURS",
        take_amount=5.0
    )
    assert comm.status == CommitmentStatus.PROPOSED

    # Prepare exchange (Phase 1 2PC)
    prep = ledger.prepare_exchange(comm.commitment_id)
    assert prep.status == CommitmentStatus.PREPARED
    assert prep.permit_token != ""

    # Check available vs escrowed
    assert ledger.get_agent_balance("agent-buyer", "USD_CREDITS") == 50.0  # 100 - 50 in escrow
    assert ledger.get_agent_balance("agent-seller", "GPU_HOURS") == 5.0     # 10 - 5 in escrow


def test_rea_two_phase_atomic_commit():
    """Verify that Phase 2 atomic commit debits escrow, credits counterparties, and mints Ed25519 receipts."""
    ledger = REALedger()
    ledger.mint_resource("agent-buyer", "USD_CREDITS", 100.0)
    ledger.mint_resource("agent-seller", "STORAGE_GB", 50.0)

    comm = ledger.propose_exchange(
        initiator_agent="agent-buyer",
        responder_agent="agent-seller",
        give_resource_type="USD_CREDITS",
        give_amount=30.0,
        take_resource_type="STORAGE_GB",
        take_amount=20.0
    )
    prepared = ledger.prepare_exchange(comm.commitment_id)
    committed, receipt_id = ledger.commit_exchange(prepared.commitment_id, approved_by="test-evaluator")

    assert committed.status == CommitmentStatus.COMMITTED
    assert receipt_id != ""

    # Balances after atomic swap
    assert ledger.get_agent_balance("agent-buyer", "USD_CREDITS") == 70.0
    assert ledger.get_agent_balance("agent-buyer", "STORAGE_GB") == 20.0
    assert ledger.get_agent_balance("agent-seller", "USD_CREDITS") == 30.0
    assert ledger.get_agent_balance("agent-seller", "STORAGE_GB") == 30.0

    # Verify reciprocal REA events (Duality)
    assert len(committed.events) == 2
    ev1 = ledger.events[committed.events[0]]
    ev2 = ledger.events[committed.events[1]]
    assert ev1.dual_event_id == ev2.event_id
    assert ev2.dual_event_id == ev1.event_id


def test_rea_abort_and_escrow_quarantine_release():
    """Verify that aborting a prepared transaction releases quarantined escrows with zero loss."""
    ledger = REALedger()
    ledger.mint_resource("agent-alice", "USD_CREDITS", 80.0)
    ledger.mint_resource("agent-bob", "API_KEYS", 5.0)

    comm = ledger.propose_exchange(
        initiator_agent="agent-alice",
        responder_agent="agent-bob",
        give_resource_type="USD_CREDITS",
        give_amount=40.0,
        take_resource_type="API_KEYS",
        take_amount=2.0
    )
    ledger.prepare_exchange(comm.commitment_id)
    assert ledger.get_agent_balance("agent-alice", "USD_CREDITS") == 40.0

    # Abort
    aborted = ledger.abort_exchange(comm.commitment_id, reason="Seller timeout")
    assert aborted.status == CommitmentStatus.ABORTED

    # Escrows restored
    assert ledger.get_agent_balance("agent-alice", "USD_CREDITS") == 80.0
    assert ledger.get_agent_balance("agent-bob", "API_KEYS") == 5.0


def test_rea_lossless_two_phase_rollback_undo():
    """Verify that a committed exchange can be lossless-ly rolled back (/undo)."""
    ledger = REALedger()
    ledger.mint_resource("agent-x", "USD_CREDITS", 200.0)
    ledger.mint_resource("agent-y", "GPU_HOURS", 20.0)

    comm = ledger.propose_exchange(
        initiator_agent="agent-x",
        responder_agent="agent-y",
        give_resource_type="USD_CREDITS",
        give_amount=50.0,
        take_resource_type="GPU_HOURS",
        take_amount=10.0
    )
    ledger.prepare_exchange(comm.commitment_id)
    committed, _ = ledger.commit_exchange(comm.commitment_id)

    assert ledger.get_agent_balance("agent-x", "GPU_HOURS") == 10.0

    # Execute Two-Phase Rollback
    rolled_back = ledger.rollback_committed_exchange(committed.commitment_id, reason="Audit discrepancy")
    assert rolled_back.status == CommitmentStatus.ROLLED_BACK

    # Both agent balances restored byte-for-byte
    assert ledger.get_agent_balance("agent-x", "USD_CREDITS") == 200.0
    assert ledger.get_agent_balance("agent-x", "GPU_HOURS") == 0.0
    assert ledger.get_agent_balance("agent-y", "USD_CREDITS") == 0.0
    assert ledger.get_agent_balance("agent-y", "GPU_HOURS") == 20.0


# =========================================================================
# 2. Futuristic Agent-to-Agent (A2A) Protocol Tests
# =========================================================================

def test_a2a_agent_discovery_and_manifests():
    """Verify agent directory, capability manifests, and pricing."""
    agents = a2a_network.list_agents()
    assert len(agents) >= 3

    agent_ids = [a["agent_id"] for a in agents]
    assert "agent-atlas-personal" in agent_ids
    assert "agent-hyperbolic-compute" in agent_ids
    assert "agent-crust-intel" in agent_ids

    # Check capability filtering
    gpu_providers = a2a_network.list_agents(capability="gpu_inference")
    assert any(a["agent_id"] == "agent-hyperbolic-compute" for a in gpu_providers)


def test_a2a_cryptographic_mutual_handshake():
    """Verify 3-way challenge-response mutual attestation handshake."""
    res = a2a_network.mutual_handshake("agent-atlas-personal", "agent-hyperbolic-compute")
    assert res["status"] == "success"
    assert res["attestation"] == "ED25519_MUTUALLY_VERIFIED"
    assert res["channel_id"].startswith("chan_")


def test_a2a_bilateral_exchange_with_decision_governance():
    """Verify autonomous A2A procurement with decision engine telemetry and 2PC settlement."""
    # Atlas buys 2 GPU hours ($9.00 total)
    res = a2a_network.execute_a2a_bilateral_exchange(
        buyer_id="agent-atlas-personal",
        seller_id="agent-hyperbolic-compute",
        resource_needed="GPU_HOURS",
        amount_needed=2.0
    )
    assert res["status"] == "COMMITTED"
    assert res["commitment_id"].startswith("commit_")
    assert res["receipt_id"] != ""
    assert res["undo_available"] is True
    assert "governance" in res
    assert res["governance"]["shannon_entropy"] is not None


def test_a2a_cfo_budget_guardrails_on_large_transactions():
    """Verify that an A2A transaction exceeding the $100 ceiling requires typed confirmation."""
    # Attempt to procure 50 GPU hours ($225.00 total) without typed confirmation
    res = a2a_network.execute_a2a_bilateral_exchange(
        buyer_id="agent-atlas-personal",
        seller_id="agent-hyperbolic-compute",
        resource_needed="GPU_HOURS",
        amount_needed=50.0,
        operator_typed_confirmation=""
    )
    assert res["status"] == "HELD_FOR_CONFIRMATION"
    assert res["requires_typed_confirmation"] is True
    assert "exceeds $100.00 policy cap" in res["reason"]

    # Now confirm with typed confirmation "COMMIT"
    confirmed_res = a2a_network.execute_a2a_bilateral_exchange(
        buyer_id="agent-atlas-personal",
        seller_id="agent-hyperbolic-compute",
        resource_needed="GPU_HOURS",
        amount_needed=50.0,
        operator_typed_confirmation="COMMIT"
    )
    assert confirmed_res["status"] == "COMMITTED"


# =========================================================================
# 3. Live FastAPI HTTP Server Endpoints Verification
# =========================================================================

def test_live_http_a2a_list_agents():
    """Verify live HTTP GET /api/a2a/agents."""
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/api/a2a/agents")
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "success"
            assert len(data["agents"]) >= 3
    except urllib.error.URLError as e:
        pytest.skip(f"Live server not running: {e}")


def test_live_http_a2a_handshake_endpoint():
    """Verify live HTTP POST /api/a2a/handshake."""
    payload = {
        "initiator_id": "agent-atlas-personal",
        "responder_id": "agent-crust-intel"
    }
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8000/api/a2a/handshake",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "success"
            assert data["attestation"] == "ED25519_MUTUALLY_VERIFIED"
    except urllib.error.URLError as e:
        pytest.skip(f"Live server not running: {e}")


def test_live_http_rea_ledger_endpoint():
    """Verify live HTTP GET /api/a2a/rea/ledger."""
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/api/a2a/rea/ledger")
        with urllib.request.urlopen(req, timeout=3) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "success"
            assert "portfolios" in data
            assert "agent-atlas-personal" in data["portfolios"]
    except urllib.error.URLError as e:
        pytest.skip(f"Live server not running: {e}")
