"""
Unit tests for CIEAV Hands-Free Computer Control & App Launcher.
"""
import pytest
from commit_layer.tools.app_launcher import app_launcher, AppLauncherTool, CloseApplicationTool
from commit_layer import gateway, receipts
from commit_layer.intent import plan_intent
from commit_layer.models import RiskLevel, Decision


def test_detect_app_intent():
    # 1. Natural language web service intents
    for q in ("hey cieav open my gmail", "open my gmail", "cieav open gmail", "open gmail"):
        res = app_launcher.detect_app_intent(q)
        assert res is not None
        assert res["action"] == "open"
        assert "gmail" in res["target"].lower()

    # 2. Desktop app intents
    for q in ("launch calculator", "open calculator", "start calculator"):
        res = app_launcher.detect_app_intent(q)
        assert res is not None
        assert res["action"] == "open"
        assert "calculator" in res["target"].lower()

    # 3. Web video / developer platform intents
    for q in ("open youtube", "launch vscode", "open github"):
        res = app_launcher.detect_app_intent(q)
        assert res is not None
        assert res["action"] == "open"


def test_app_launcher_tool_governed_auto_commit():
    # Open application must auto-commit without manual confirmation prompts
    res = app_launcher.launch_governed({"action": "open", "target": "calc"})
    assert res["tool"] == "open_application"
    assert "result" in res
    inner = res["result"]
    assert inner.get("status") == "committed"
    assert inner.get("outcome") == "OBSERVED_SUCCESS"
    assert "receipt_id" in inner

    # Verify receipt was recorded in Ed25519 hash chain
    receipt = receipts.get_receipt(inner["receipt_id"])
    assert receipt is not None
    assert receipt["tool"] == "open_application"
    assert receipt["undo_state"] == "AVAILABLE"


def test_routine_intents_do_not_require_typed_commit():
    # Safe and routine tasks must NOT require typed confirmation
    safe_plans = [
        "open my gmail",
        "open youtube",
        "launch calculator",
        "take note Meeting with team tomorrow",
        "scaffold project fast-api-service"
    ]
    for prompt in safe_plans:
        plan = plan_intent(prompt)
        assert plan.get("requires_typed_confirmation") is False, f"Prompt '{prompt}' unexpectedly required typed confirmation!"


def test_destructive_critical_intents_require_typed_commit():
    # Only truly critical / irreversible actions must require typed COMMIT
    critical_plans = [
        "empty recycle bin",
        "delete file critical_payload.dat",
        "power cycle edge-device-01",
        "grant admin permission to unknown-agent",
        "pay $900 to external_vendor"
    ]
    for prompt in critical_plans:
        plan = plan_intent(prompt)
        assert plan.get("requires_typed_confirmation") is True, f"Prompt '{prompt}' should require typed confirmation!"
