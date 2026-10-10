"""Deterministic risk rules – the safety floor.

AI can never lower these.  The classifier can only RAISE risk above this floor.
"""
from __future__ import annotations
from commit_layer.models import Action, RiskLevel


def evaluate(action: Action) -> tuple[RiskLevel, list[str]]:
    """Evaluate an action and return (risk_level, reasons)."""
    tool = action.tool_name
    args = action.args

    # ── Read-only tools ─────────────────────────────────────────
    if tool.startswith(('read_', 'get_', 'list_')):
        return RiskLevel.LOW, ["Read-only tool"]

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

    # ── Unknown tool → HIGH ─────────────────────────────────────
    return RiskLevel.HIGH, [f"Unknown tool: {tool}"]
