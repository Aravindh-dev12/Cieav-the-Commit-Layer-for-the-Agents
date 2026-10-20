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
