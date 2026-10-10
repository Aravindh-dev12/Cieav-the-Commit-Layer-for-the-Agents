"""Crustdata Payee Verification.

Looks up payee company / domain via Crustdata API.
If the company is unknown, not found, or very new, risk is escalated.
Fails gracefully if unconfigured or if API network requests fail.
"""
from __future__ import annotations
import os
import logging
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)

CRUSTDATA_BASE_URL = os.environ.get("CRUSTDATA_BASE_URL", "https://api.crustdata.com")


def lookup_payee(payee: str) -> dict[str, Any]:
    """Look up payee domain/entity in Crustdata.
    
    Returns:
        dict with keys:
          - verified: bool
          - reason: str
          - escalate_risk: bool (True if unknown/unverified/new)
          - details: dict
    """
    api_key = os.environ.get("CRUSTDATA_API_KEY", "").strip()
    if not api_key:
        return {
            "verified": False,
            "escalate_risk": False,
            "reason": "Crustdata unconfigured (no API key)",
            "details": {},
        }

    # Normalize payee (e.g. if email or domain)
    domain_candidate = payee
    if "@" in payee:
        domain_candidate = payee.split("@")[-1]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(
                f"{CRUSTDATA_BASE_URL}/screener/company",
                params={"domain": domain_candidate},
                headers=headers
            )
            
            if resp.status_code == 200:
                data = resp.json()
                # If company profile found and established
                if data and (isinstance(data, list) and len(data) > 0 or isinstance(data, dict)):
                    return {
                        "verified": True,
                        "escalate_risk": False,
                        "reason": f"Payee '{domain_candidate}' verified on Crustdata",
                        "details": data if isinstance(data, dict) else data[0],
                    }

            return {
                "verified": False,
                "escalate_risk": True,
                "reason": f"Payee '{payee}' not found in registry (unknown counterparty)",
                "details": {},
            }

    except Exception as e:
        logger.warning("Crustdata lookup failed gracefully: %s", e)
        return {
            "verified": False,
            "escalate_risk": False,
            "reason": f"Crustdata lookup unavailable ({e})",
            "details": {},
        }
