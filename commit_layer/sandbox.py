"""Fake world state for sandbox demo.

Provides module-level singleton instances and a snapshot() function
that captures the entire world state for before/after comparison.
"""
from __future__ import annotations
import copy
from typing import Any


# ── Fake Bank Ledger ──────────────────────────────────────────────
bank_ledger: dict[str, float] = {
    'agent': 10000.0,
    'merchant_a': 0.0,
    'merchant_b': 0.0,
    'attacker_x': 0.0,
}


def transfer(from_account: str, to_account: str, amount: float) -> None:
    """Transfer money between accounts."""
    if from_account not in bank_ledger:
        bank_ledger[from_account] = amount
    if to_account not in bank_ledger:
        bank_ledger[to_account] = 0.0
    if bank_ledger[from_account] < amount:
        raise ValueError(f"Insufficient funds in {from_account}: {bank_ledger[from_account]} < {amount}")
    bank_ledger[from_account] -= amount
    bank_ledger[to_account] += amount


# ── Fake File System ──────────────────────────────────────────────
fake_filesystem: dict[str, str] = {
    'readme.md': 'Welcome to the sandbox!',
    'config.json': '{"key": "value"}',
    'data.csv': 'id,name,value\n1,test,100',
}

fake_trash: dict[str, str] = {}


# ── Fake Access List ──────────────────────────────────────────────
access_list: dict[str, set[str]] = {
    'admin': {'read', 'write', 'execute'},
    'guest': {'read'},
}


# ── Fake Email Outbox ────────────────────────────────────────────
email_outbox: list[dict[str, Any]] = []

# ── Fake Software & Code State ────────────────────────────────────
software_registry: dict[str, Any] = {
    "services": {
        "api-gateway": {"status": "running", "version": "v1.2.0"},
        "payment-worker": {"status": "running", "version": "v2.0.4"},
        "database-replica": {"status": "active", "version": "postgres-16"}
    },
    "terminal_history": [],
    "code_backups": {}
}

# ── Fake Hardware & TPM State ─────────────────────────────────────
hardware_state: dict[str, Any] = {
    "tpm_status": "TPM 2.0 Ready (MAA Attested)",
    "enrolled_devices": {
        "edge-node-01": {"status": "ONLINE", "firmware": "v3.4.1", "pcr_quote": "0x78ab12"},
        "robotics-controller-a": {"status": "ARMED", "firmware": "v1.0.8", "pcr_quote": "0x54cd89"}
    },
    "attestation_logs": []
}


# ── Snapshot for before/after comparison ─────────────────────────
def snapshot() -> dict[str, Any]:
    """Capture a deep copy of the entire sandbox state."""
    return {
        'bank_ledger': copy.deepcopy(bank_ledger),
        'filesystem': copy.deepcopy(fake_filesystem),
        'trash': copy.deepcopy(fake_trash),
        'access_list': {k: copy.deepcopy(v) for k, v in access_list.items()},
        'email_outbox': copy.deepcopy(email_outbox),
        'software': copy.deepcopy(software_registry),
        'hardware': copy.deepcopy(hardware_state),
    }


def reset() -> None:
    """Reset all sandbox state to initial values."""
    global bank_ledger, fake_filesystem, fake_trash, access_list, email_outbox, software_registry, hardware_state
    bank_ledger.clear()
    bank_ledger.update({'agent': 10000.0, 'merchant_a': 0.0, 'merchant_b': 0.0, 'attacker_x': 0.0})
    fake_filesystem.clear()
    fake_filesystem.update({
        'readme.md': 'Welcome to the sandbox!',
        'config.json': '{"key": "value"}',
        'data.csv': 'id,name,value\n1,test,100',
    })
    fake_trash.clear()
    access_list.clear()
    access_list.update({
        'admin': {'read', 'write', 'execute'},
        'guest': {'read'},
    })
    email_outbox.clear()
    software_registry.clear()
    software_registry.update({
        "services": {
            "api-gateway": {"status": "running", "version": "v1.2.0"},
            "payment-worker": {"status": "running", "version": "v2.0.4"},
            "database-replica": {"status": "active", "version": "postgres-16"}
        },
        "terminal_history": [],
        "code_backups": {}
    })
    hardware_state.clear()
    hardware_state.update({
        "tpm_status": "TPM 2.0 Ready (MAA Attested)",
        "enrolled_devices": {
            "edge-node-01": {"status": "ONLINE", "firmware": "v3.4.1", "pcr_quote": "0x78ab12"},
            "robotics-controller-a": {"status": "ARMED", "firmware": "v1.0.8", "pcr_quote": "0x54cd89"}
        },
        "attestation_logs": []
    })

