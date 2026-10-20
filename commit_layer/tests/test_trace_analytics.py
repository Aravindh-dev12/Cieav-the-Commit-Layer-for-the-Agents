"""
Tests for Grounded Trace Analytics, Token Spend & Error Dataset Synthesizer.
=============================================================================
Verifies:
1. Real latency trace calculation from database.
2. Verified model token spend breakdown (CFO + Headroom CCR).
3. JSONL error dataset synthesis and file integrity.
"""

import os
import pytest
from commit_layer.trace_analytics import trace_analytics


def test_highest_latency_traces():
    """Trace analytics must extract real operations and compute p50/p95/p99 percentiles."""
    res = trace_analytics.get_highest_latency_traces(limit=5)
    assert res["status"] in ("success", "empty")
    if res["status"] == "success":
        assert res["total_traces_analyzed"] > 0
        assert res["p50_latency_ms"] >= 0
        assert len(res["highest_latency_traces"]) <= 5
        card = trace_analytics.render_latency_card(res)
        assert "Highest Latency Traces" in card


def test_token_spend_by_model():
    """Token spend must break down costs by model without hallucinations."""
    spend = trace_analytics.get_token_spend_by_model()
    assert spend["status"] == "success"
    assert "models" in spend
    assert len(spend["models"]) == 3
    assert spend["total_tokens_billed"] > 0
    assert "headroom_compression" in spend
    card = trace_analytics.render_token_spend_card(spend)
    assert "Verified Token Spend" in card


def test_turn_errors_into_dataset():
    """Dataset generator must produce a valid JSONL file."""
    test_out = "data/test_error_dataset.jsonl"
    try:
        ds = trace_analytics.turn_errors_into_dataset(output_path=test_out)
        assert ds["status"] == "success"
        assert os.path.exists(test_out)
        assert ds["samples_count"] > 0
        assert ds["format"].startswith("JSONL")
        card = trace_analytics.render_dataset_card(ds)
        assert "Error Dataset Synthesized" in card
    finally:
        if os.path.exists(test_out):
            os.remove(test_out)


def test_greeting_and_model_subscription_query():
    """Verify short friendly greeting and subscribed models monitoring queries."""
    from commit_layer.autonomous_agent import autonomous_agent

    # 1. Short friendly greeting test (no long bullet list)
    for g in ("hi ceiav", "hi cieav", "hi cieva", "hello", "hey"):
        res = autonomous_agent.process_instruction(g)
        assert res["type"] == "greeting"
        assert res["message"] == "Hey! Great to see you. How can I help you today?"
        assert "Whether you want to:" not in res["message"]
        assert "•" not in res["message"]

    # 2. Subscribed models and token usage query
    for q in ("modle token used", "model token used", "tokens used"):
        res = autonomous_agent.process_instruction(q)
        assert res["type"] == "cfo_spend"
        assert "Subscribed Models" in res["message"]
        assert "cieav-decider-v2" in res["message"]
        assert res["data"]["total_tokens_billed"] > 0

    # 3. Account and subscription discovery query - Strict isolated checks
    # Gemini strict check: ONLY Gemini info, zero Claude or ChatGPT
    res_gemini = autonomous_agent.process_instruction("check my gemini subscription")
    assert res_gemini["type"] == "account_discovery"
    assert "GEMINI" in res_gemini["message"]
    assert "Gemini Pro" in res_gemini["message"]
    assert "aravindh1653@gmail.com" in res_gemini["message"]
    assert "Claude" not in res_gemini["message"]
    assert "ChatGPT" not in res_gemini["message"]
    assert "cieav-decider-v2" not in res_gemini["message"]

    # Claude strict check: ONLY Claude info, zero ChatGPT or Gemini
    res_claude = autonomous_agent.process_instruction("check my claude subscription")
    assert res_claude["type"] == "account_discovery"
    assert "CLAUDE" in res_claude["message"]
    assert "ChatGPT" not in res_claude["message"]
    assert "Gemini" not in res_claude["message"]
    assert "cieav-decider-v2" not in res_claude["message"]

    # ChatGPT strict check: ONLY ChatGPT info, zero Claude or Gemini
    res_chatgpt = autonomous_agent.process_instruction("check my chatgpt subscription")
    assert res_chatgpt["type"] == "account_discovery"
    assert "CHATGPT" in res_chatgpt["message"]
    assert "Claude" not in res_chatgpt["message"]
    assert "Gemini" not in res_chatgpt["message"]
    assert "cieav-decider-v2" not in res_chatgpt["message"]

    # General overview: contains all detected models + CIEAV sovereign core
    res_general = autonomous_agent.process_instruction("my subscriptions")
    assert res_general["type"] == "account_discovery"
    assert "ACCOUNT DISCOVERY" in res_general["message"]
    assert "Claude" in res_general["message"]
    assert "ChatGPT" in res_general["message"]
    assert "Gemini" in res_general["message"]
    assert "cieav-decider-v2" in res_general["message"]

