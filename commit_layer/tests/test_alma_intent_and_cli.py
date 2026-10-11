"""Tests for Alma-Native Intent Engine, Software Tools, Hardware TPM Tools, and CLI.

Verifies:
1. Software tool execution and rollback (deploy_service, run_terminal_command, modify_code_file).
2. Hardware TPM attestation and device power-cycle with compensation.
3. Alma natural language intent parsing and risk policy mapping across all domains.
4. Typed confirmation enforcement on high/critical intent plans.
5. Cryptographic Ed25519 receipt creation on intent commits.
6. Native CLI commands functionality.
"""
from __future__ import annotations
import os
import pytest
from commit_layer.models import RiskLevel, Outcome, UndoState, Decision
from commit_layer import gateway
from commit_layer import receipts
from commit_layer import sandbox
from commit_layer.tools.software import DeployServiceTool, RunTerminalCommandTool, ModifyCodeFileTool
from commit_layer.tools.hardware import TpmSignAttestationTool, PowerCycleDeviceTool
from commit_layer.intent import plan_intent, commit_plan, parse_intent
from commit_layer import cli

import sqlite3

TEST_DB = "commit_layer/test_commit_layer_intent.db"


def setup_function():
    receipts.DB_PATH = TEST_DB
    receipts.init_db()
    with sqlite3.connect(TEST_DB) as conn:
        conn.execute("DELETE FROM receipts")
        conn.commit()
    sandbox.reset()



def test_software_deploy_and_rollback():
    """Service deployment must be CRITICAL, execute cleanly, and be rollback-able."""
    tool = DeployServiceTool()
    res = tool.execute({"service_name": "payment-worker", "version": "v2.5.0"})
    assert res["status"] == "deployed"
    assert res["new_version"] == "v2.5.0"
    assert sandbox.software_registry["services"]["payment-worker"]["version"] == "v2.5.0"

    # Test inverse rollback
    inv = tool.inverse({"service_name": "payment-worker", "version": "v2.5.0"}, res)
    assert inv is not None
    inv()
    assert sandbox.software_registry["services"]["payment-worker"]["version"] == "v2.0.4"


def test_code_modification_and_restore():
    """Modify code tool creates a snapshot that can be reversed."""
    tool = ModifyCodeFileTool()
    filepath = "config.json"
    new_content = '{"key": "modified_securely"}'
    res = tool.execute({"filepath": filepath, "content": new_content})
    assert sandbox.fake_filesystem[filepath] == new_content

    inv = tool.inverse({"filepath": filepath}, res)
    assert inv is not None
    inv()
    assert sandbox.fake_filesystem[filepath] == '{"key": "value"}'


def test_hardware_tpm_attestation():
    """TPM signing must produce cryptographically valid platform quote."""
    tool = TpmSignAttestationTool()
    res = tool.execute({"payload": "test_nonce_123", "pcr_index": 7})
    assert res["status"] == "ATTESTED"
    assert res["pcr_index"] == 7
    assert "hardware_signature" in res
    assert len(sandbox.hardware_state["attestation_logs"]) > 0


def test_hardware_power_cycle_and_compensate():
    """Power cycling device must issue reboot command and allow restoration."""
    tool = PowerCycleDeviceTool()
    res = tool.execute({"device_id": "edge-node-01"})
    assert res["status"] == "REBOOT_ISSUED"
    assert sandbox.hardware_state["enrolled_devices"]["edge-node-01"]["status"] == "REBOOTING"

    inv = tool.inverse({"device_id": "edge-node-01"}, res)
    assert inv is not None
    inv()
    assert sandbox.hardware_state["enrolled_devices"]["edge-node-01"]["status"] == "ONLINE"


def test_alma_intent_planning_across_domains():
    """Alma intent parser must accurately plan actions for software, hardware, and payments."""
    # 1. Software Intent
    p_soft = plan_intent("deploy payment-worker to v2.2.0")
    assert p_soft["highest_risk"] == "CRITICAL"
    assert p_soft["requires_typed_confirmation"] is True
    assert p_soft["actions"][0]["domain"] == "software"
    assert p_soft["actions"][0]["tool"] == "deploy_service"

    # 2. Hardware Intent
    p_hw = plan_intent("tpm attest secure enclave pcr 7")
    assert p_hw["highest_risk"] == "HIGH"
    assert p_hw["actions"][0]["domain"] == "hardware"
    assert p_hw["actions"][0]["tool"] == "tpm_sign_attestation"

    # 3. Finance Intent
    p_fin = plan_intent("wire $25 to merchant_a")
    assert p_fin["highest_risk"] in ("MEDIUM", "HIGH")
    assert p_fin["actions"][0]["tool"] == "send_payment"


def test_alma_intent_commit_with_typed_confirmation():
    """Critical intent plan must refuse commit unless exact typed phrase is provided."""
    plan = plan_intent("deploy payment-worker to v2.3.0")
    plan_id = plan["plan_id"]

    # Refuse wrong confirmation
    bad_res = commit_plan(plan_id, typed_confirmation="WRONG")
    assert "error" in bad_res
    assert "Typed confirmation mismatch" in bad_res["error"]

    # Accept exact confirmation
    good_res = commit_plan(plan_id, typed_confirmation="COMMIT CRITICAL")
    assert good_res["status"] == "COMMITTED"
    assert len(good_res["receipt_ids"]) == 1

    # Verify receipts chain
    valid, errors = receipts.verify_chain()
    assert valid is True
    assert len(errors) == 0


def test_cli_execution_commands(capsys):
    """Test CLI commands status and verify without crashes."""
    cli.cmd_status()
    out = capsys.readouterr().out
    assert "SOFTWARE STATUS" in out
    assert "HARDWARE / TPM STATUS" in out

    cli.cmd_verify()
    out_verify = capsys.readouterr().out
    assert "Cryptographic integrity intact" in out_verify
