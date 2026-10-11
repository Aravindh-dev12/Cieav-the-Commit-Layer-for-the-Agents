import pytest
from commit_layer import cfo
from commit_layer import gateway
from commit_layer.models import Action, RiskLevel


def test_cfo_budget_evaluation_under_limit():
    cfo.reset_spend()
    cfo.set_budget(25.0)
    action = Action(tool_name="send_payment", args={"amount": 10.0, "to": "merchant_a"})
    is_viol, risk, reason = cfo.evaluate_financial_policy(action)
    assert not is_viol
    assert risk is None


def test_cfo_budget_violation_exceeds_budget():
    cfo.reset_spend()
    cfo.set_budget(25.0)
    action = Action(tool_name="send_payment", args={"amount": 35.0, "to": "merchant_a"})
    is_viol, risk, reason = cfo.evaluate_financial_policy(action)
    assert is_viol
    assert risk == RiskLevel.CRITICAL
    assert "exceeds remaining budget allowance" in reason


def test_cfo_single_tx_cap_violation():
    cfo.reset_spend()
    cfo.set_budget(500.0)
    action = Action(tool_name="send_payment", args={"amount": 150.0, "to": "merchant_a"})
    is_viol, risk, reason = cfo.evaluate_financial_policy(action)
    assert is_viol
    assert risk == RiskLevel.CRITICAL
    assert "exceeds policy ceiling" in reason


def test_cfo_record_spend_and_unit_economics():
    cfo.reset_spend()
    cfo.set_budget(25.0)
    rem = cfo.record_spend(5.0)
    assert rem == 20.0
    cfo.record_protected_action(tokens_saved=2500, reused_procedure=True)
    stats = cfo.get_cfo_status()
    assert stats["current_spend_usd"] == 5.0
    assert stats["remaining_budget_usd"] == 20.0
    assert stats["protected_actions_count"] >= 1
    assert stats["total_savings_usd"] > 0.0


def test_cfo_gateway_integration():
    cfo.reset_spend()
    cfo.set_budget(25.0)
    # An action attempting to spend more than remaining budget gets escalated to CRITICAL
    action = gateway.intercept("send_payment", {"amount": 40.0, "to": "merchant_b"})
    res = gateway.process(action)
    assert res["status"] == "pending"
    assert res["risk"] == "CRITICAL"
    assert any("CFO Policy" in r for r in res["reasons"])
