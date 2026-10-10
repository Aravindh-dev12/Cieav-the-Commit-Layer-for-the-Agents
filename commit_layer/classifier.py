"""Frontier AI Classifier & Consequence Algebra Evaluator.

Can ONLY raise risk above the deterministic policy floor, never lower it.
Uses multi-provider ensemble voting (OpenAI, Anthropic, Baseten, Bedrock, Gemini, xAI, Kimi)
with Consequence Algebra and cross-verification anomaly detection.
"""
from __future__ import annotations
import os
import logging
from commit_layer.models import Action, RiskLevel

logger = logging.getLogger(__name__)

def classify(action: Action) -> tuple[RiskLevel | None, str]:
    """
    Classify risk using the local Decision Model or Frontier Ensemble / AWS Bedrock.
    Returns (risk_level, reason) or (None, '') if unavailable or fails.
    
    The classifier can only RAISE risk above the policy floor.
    If it fails or times out, we keep the policy risk (fail conservative).
    """
    # 1. If remote frontier providers or AWS Bedrock are configured, use them
    try:
        from commit_layer.frontier_intelligence import classify_with_ensemble, get_active_providers
        active = get_active_providers()
        if active:
            risk, reason, trace = classify_with_ensemble(action)
            if risk is not None:
                return risk, reason
    except Exception as e:
        logger.debug("Remote ensemble not active: %s", e)

    # 2. AWS Bedrock Converse fallback
    if os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY"):
        try:
            from commit_layer import telemetry
            client, provider = telemetry.get_llm_client()
            if client and provider == "bedrock":
                model_id = os.environ.get("AWS_BEDROCK_MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
                prompt = f"Analyze action {action.tool_name} args {action.args_redacted}. Output: RISK: LOW|MEDIUM|HIGH|CRITICAL - reason"
                resp = client.converse(
                    modelId=model_id,
                    messages=[{"role": "user", "content": [{"text": prompt}]}]
                )
                txt = resp["output"]["message"]["content"][0]["text"].strip()
                if "RISK:" in txt:
                    parts = txt.split("RISK:")[1].strip().split(" - ", 1)
                    lvl = RiskLevel[parts[0].strip().upper()]
                    rsn = parts[1].strip() if len(parts) > 1 else "AWS Bedrock decision"
                    return lvl, f"AWS Bedrock Converse: {rsn}"
        except Exception as e:
            logger.warning("AWS Bedrock Converse failed: %s", e)

    # 3. Embedded Local Decision Model (Always live, local-first, zero API keys required)
    try:
        from commit_layer.decision_model import local_decision_model, DecisionQuestion
        args_payload = action.args or action.args_redacted
        action_desc = f"{action.tool_name} with parameters {args_payload} executed by {action.agent_id}"
        decisions = local_decision_model.decide(
            text=action_desc,
            questions=[
                DecisionQuestion(id="risk_tier", type="choice", choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"], question="What is the risk level?"),
                DecisionQuestion(id="is_destructive", type="predicate", question="Is this action destructive or irreversible?")
            ]
        )
        tier_data = decisions.get("risk_tier", {})
        chosen_tier = tier_data.get("choice", "LOW")
        probs = tier_data.get("probabilities", {})
        top_prob = probs.get(chosen_tier, 0.0)
        
        local_risk = RiskLevel[chosen_tier]
        return local_risk, f"Local Decision Model (cieav-decider-mini): {chosen_tier} ({int(top_prob*100)}% confidence)"
    except Exception as e:
        logger.warning("Local decision model fallback failed: %s", e)
        return None, ""


