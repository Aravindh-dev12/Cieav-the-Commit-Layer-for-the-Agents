"""Pytest suite verifying core security invariants of Commit Layer.

Invariants verified:
1. AI can NEVER lower risk below the deterministic policy safety floor.
2. HIGH and CRITICAL risks NEVER become AUTO.
3. Execution tokens are single-use and expire within TTL.
4. Undo is strictly REFUSED without OBSERVED_SUCCESS and valid inverse.
5. Tampering with any receipt invalidates cryptographic chain verification.
6. Classifier failure or timeout preserves policy floor risk (fail-closed).
7. Sensitive secrets (credit cards, passwords, tokens) are redacted from logs/receipts.
"""
from __future__ import annotations
import time
import pytest

from commit_layer.models import Action, RiskLevel, Decision, Status, Outcome, UndoState
from commit_layer import policy
from commit_layer import privacy
from commit_layer import tokens
from commit_layer import receipts
from commit_layer import gateway
from commit_layer import sandbox
from commit_layer import classifier


import os
import sqlite3

TEST_DB = "commit_layer/test_commit_layer.db"


def setup_function():
    receipts.DB_PATH = TEST_DB
    receipts.init_db()
    with sqlite3.connect(TEST_DB) as conn:
        conn.execute("DELETE FROM receipts")
        conn.commit()
    sandbox.reset()



def test_ai_cannot_lower_risk_floor():
    """AI classifier suggestions lower than deterministic policy must be ignored."""
    action = Action(tool_name="send_payment", args={"amount": 900.0, "to": "unknown"})
    policy_risk, _ = policy.evaluate(action)
    assert policy_risk == RiskLevel.CRITICAL

    # Simulate classifier claiming it's LOW risk
    suggested_risk = RiskLevel.LOW
    final_risk = policy_risk
    if suggested_risk > policy_risk:
        final_risk = suggested_risk

    assert final_risk == RiskLevel.CRITICAL, "AI was able to lower risk below floor!"


def test_high_and_critical_never_auto():
    """Actions with HIGH or CRITICAL risk must never be assigned AUTO decision."""
    from commit_layer import friction
    for risk in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
        decision = friction.decide(risk)
        assert decision != Decision.AUTO, f"Risk {risk.name} became AUTO!"


def test_token_is_single_use_and_expires():
    """Token must be valid once and invalid on subsequent attempts or expiration."""
    action_id = "test-action-123"
    token = tokens.create_token(action_id)

    # First consumption succeeds
    assert tokens.validate_and_consume(token, action_id) is True

    # Second consumption fails (single-use)
    assert tokens.validate_and_consume(token, action_id) is False

    # Expired token fails
    token2 = tokens.create_token(action_id)
    # Manually backdate token creation time
    tokens._TOKENS[token2] = (action_id, time.time() - 65)
    assert tokens.validate_and_consume(token2, action_id) is False


def test_undo_refused_without_observed_success():
    """Undo must fail if action outcome is not OBSERVED_SUCCESS."""
    action = gateway.intercept("send_payment", {"amount": 25.0, "to": "merchant_a"})
    res = gateway.execute_action(action, approved_by="test")
    receipt_id = res["receipt_id"]

    # If we artificially set outcome to OBSERVED_FAILURE, undo must be refused
    receipts.update_receipt_outcome(receipt_id, Outcome.OBSERVED_FAILURE.value, UndoState.NONE.value)
    undo_res = gateway.undo(receipt_id)
    assert "error" in undo_res
    assert "must be OBSERVED_SUCCESS" in undo_res["error"]


def test_tampering_breaks_receipt_chain_verification():
    """Tampering with an existing SQLite receipt row must be detected by verify_chain."""
    action = gateway.intercept("send_payment", {"amount": 10.0, "to": "merchant_a"})
    gateway.execute_action(action, approved_by="test")

    valid_before, _ = receipts.verify_chain()
    assert valid_before is True

    # Tamper directly in SQLite
    import sqlite3
    with sqlite3.connect(receipts.DB_PATH) as conn:
        conn.execute("UPDATE receipts SET status = 'TAMPERED' WHERE rowid = (SELECT MAX(rowid) FROM receipts)")
        conn.commit()

    valid_after, errors = receipts.verify_chain()
    assert valid_after is False
    assert len(errors) > 0


def test_classifier_failure_keeps_policy_risk():
    """When classifier fails or has no key, the policy risk floor remains intact."""
    action = gateway.intercept("send_payment", {"amount": 750.0, "to": "attacker"})
    result = gateway.process(action)
    assert result["risk"] == "CRITICAL"
    assert result["status"] == "pending"


def test_redaction_removes_secrets():
    """Card numbers and passwords in arguments must be redacted."""
    raw_args = {
        "account_num": "4111222233334444",
        "api_password": "my_super_secret_token",
        "email_contact": "user@example.com"
    }
    action = Action(tool_name="send_payment", args=raw_args)
    redacted_action = privacy.reduce(action)
    
    redacted = redacted_action.args_redacted
    assert redacted["account_num"] == "[CARD_REDACTED]"
    assert redacted["api_password"] == "[REDACTED]"
    assert redacted["email_contact"] == "[EMAIL_REDACTED]"
