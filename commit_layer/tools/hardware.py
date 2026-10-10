"""Hardware and Physical Device authority tool for Commit Layer.

Handles:
- tpm_sign_attestation: signs a payload with local Trusted Platform Module / Secure Enclave
- power_cycle_device: restarts or powers down hardware node
- flash_firmware: flashes microcode or firmware onto connected hardware
"""
from __future__ import annotations
from typing import Any, Optional, Callable
import hashlib
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer import sandbox

# In-memory hardware state in sandbox
sandbox.hardware_state = {
    "tpm_status": "TPM 2.0 Ready (MAA Attested)",
    "enrolled_devices": {
        "edge-node-01": {"status": "ONLINE", "firmware": "v3.4.1", "pcr_quote": "0x78ab12"},
        "robotics-controller-a": {"status": "ARMED", "firmware": "v1.0.8", "pcr_quote": "0x54cd89"}
    },
    "attestation_logs": []
}


class TpmSignAttestationTool(BaseTool):
    name = 'tpm_sign_attestation'
    description = 'Hardware-backed TPM 2.0 / Secure Enclave cryptographic signing'
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = str(args.get('payload', ''))
        pcr_index = args.get('pcr_index', 7)
        digest = hashlib.sha256(payload.encode()).hexdigest()
        signature = f"tpm2_sig_{digest[:16]}_{pcr_index}"

        record = {
            "pcr_index": pcr_index,
            "digest": digest,
            "hardware_signature": signature,
            "hardware_model": "Infineon TPM 2.0 / Windows CNG",
            "status": "ATTESTED"
        }
        sandbox.hardware_state["attestation_logs"].append(record)
        return record

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        if sandbox.hardware_state["attestation_logs"]:
            return Outcome.OBSERVED_SUCCESS
        return Outcome.UNKNOWN

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None


class PowerCycleDeviceTool(BaseTool):
    name = 'power_cycle_device'
    description = 'Power cycle or reboot a physical IoT/Edge device node'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        device_id = args.get('device_id', '')
        if not device_id:
            raise ValueError("device_id required")

        devs = sandbox.hardware_state["enrolled_devices"]
        if device_id not in devs:
            raise ValueError(f"Unknown hardware device: {device_id}")

        old_status = devs[device_id]["status"]
        devs[device_id]["status"] = "REBOOTING"
        return {
            "device_id": device_id,
            "previous_status": old_status,
            "status": "REBOOT_ISSUED"
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        dev_id = result.get('device_id')
        prev_st = result.get('previous_status')
        if not dev_id or not prev_st:
            return None

        def _cancel_reboot():
            sandbox.hardware_state["enrolled_devices"][dev_id]["status"] = prev_st
            return {"restored_device": dev_id, "status": prev_st}
        return _cancel_reboot
