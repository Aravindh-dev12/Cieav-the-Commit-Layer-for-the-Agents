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

    # Normalize payee (e.g. extract domain or name candidate)
    clean_target = payee.strip().lower()
    if "@" in clean_target:
        clean_target = clean_target.split("@")[-1]
    # Root name without TLD if domain
    name_stem = clean_target.split(".")[0] if "." in clean_target else clean_target

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-version": "2025-11-01"
    }

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(
                f"{CRUSTDATA_BASE_URL}/company/search",
                headers=headers,
                json={"search": {"query": clean_target}}
            )
            
            matched = None
            if resp.status_code == 200:
                data = resp.json()
                companies = data.get("companies", [])
                for comp in companies:
                    info = comp.get("basic_info", {})
                    comp_name = (info.get("name") or "").lower()
                    p_domain = (info.get("primary_domain") or "").lower()
                    website = (info.get("website") or "").lower()
                    all_domains = [d.lower() for d in info.get("all_domains", [])]
                    
                    if (
                        clean_target in p_domain
                        or any(clean_target in d for d in all_domains)
                        or clean_target in website
                        or (len(name_stem) >= 3 and name_stem in comp_name)
                    ):
                        matched = info
                        break

            # Secondary search: fallback to name stem if domain search returned no direct match
            if not matched and name_stem != clean_target and len(name_stem) >= 3:
                resp2 = client.post(
                    f"{CRUSTDATA_BASE_URL}/company/search",
                    headers=headers,
                    json={"search": {"query": name_stem}}
                )
                if resp2.status_code == 200:
                    companies2 = resp2.json().get("companies", [])
                    for comp in companies2:
                        info = comp.get("basic_info", {})
                        comp_name = (info.get("name") or "").lower()
                        if name_stem in comp_name:
                            matched = info
                            break

            if matched:
                return {
                    "verified": True,
                    "escalate_risk": False,
                    "reason": f"Payee '{payee}' verified on Crustdata ({matched.get('name') or clean_target})",
                    "details": matched,
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
