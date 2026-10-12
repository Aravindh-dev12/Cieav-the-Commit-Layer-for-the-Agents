"""Deterministic risk rules – the safety floor.

AI can never lower these.  The classifier can only RAISE risk above this floor.
"""
from __future__ import annotations
from commit_layer.models import Action, RiskLevel


def evaluate(action: Action) -> tuple[RiskLevel, list[str]]:
    """Evaluate an action and return (risk_level, reasons)."""
    tool = action.tool_name
    args = action.args

    # ── Read-only & optimization tools ─────────────────────────
    if tool.startswith(('read_', 'get_', 'list_', 'headroom_')):
        return RiskLevel.LOW, ["Read-only / context optimization tool"]


    # ── Email ───────────────────────────────────────────────────
    if tool == 'send_email':
        return RiskLevel.MEDIUM, ["Sending email (new address assumed for safety)"]

    # ── Payments ────────────────────────────────────────────────
    if tool in ('send_payment', 'flaky_payment', 'payment'):
        amount = float(args.get('amount', 0))
        if amount > 500:
            return RiskLevel.CRITICAL, [f"Payment amount ${amount:.2f} > $500"]
        if amount >= 100:
            return RiskLevel.HIGH, [f"Payment amount ${amount:.2f} >= $100"]
        return RiskLevel.MEDIUM, [f"Payment amount ${amount:.2f} < $100"]

    # ── Destructive / privileged operations ─────────────────────
    if tool == 'delete_file':
        return RiskLevel.CRITICAL, ["Destructive file operation"]

    if tool == 'grant_access':
        return RiskLevel.CRITICAL, ["Access control modification"]

    # ── Software & Code operations ──────────────────────────────
    if tool == 'run_terminal_command':
        return RiskLevel.CRITICAL, ["Arbitrary shell/terminal execution in host environment"]

    if tool == 'deploy_service':
        return RiskLevel.CRITICAL, ["Production service deployment / container reconfiguration"]

    if tool in ('modify_code_file', 'repo_file_action'):
        op = args.get('operation', 'modify')
        return RiskLevel.CRITICAL, [f"Live repository filesystem action ({op})"]

    # ── Hardware & Physical operations ──────────────────────────
    if tool == 'power_cycle_device':
        return RiskLevel.CRITICAL, ["Physical hardware reboot/power cycle"]

    if tool == 'tpm_sign_attestation':
        return RiskLevel.HIGH, ["Hardware-backed TPM 2.0 enclave cryptographic signing"]

    # ── External Connectors (Open-Agent-Connector) ──────────────
    if tool == 'dispatch_connector_action':
        connector_id = args.get('connector_id', '')
        if connector_id in ('github', 'slack'):
            return RiskLevel.MEDIUM, [f"External service action dispatched via connector: {connector_id}"]
        return RiskLevel.HIGH, [f"External HTTP webhook dispatched via connector: {connector_id}"]

    if tool == 'job_application_action':
        company = args.get('company', 'Target Company')
        return RiskLevel.HIGH, [f"Outbound job application and candidate PII transmission to {company}"]

    # ── Unknown tool → HIGH ─────────────────────────────────────
    return RiskLevel.HIGH, [f"Unknown tool: {tool}"]


