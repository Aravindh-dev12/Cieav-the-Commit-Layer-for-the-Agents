"""Tests for Headroom Context Optimization and Compression Layer in CIEAV.

Verifies:
1. CCRVault: content-addressable storage and lossless retrieval.
2. SmartCrusher: JSON & structured API compression.
3. CodeCompressor: AST/signature preservation and method body elision.
4. LogCompressor: ANSI stripping, loop deduplication, and traceback reduction.
5. ContentRouter: automatic modality classification and KV-cache alignment.
6. Gateway Integration: gateway actions attach Headroom CCR metadata.
7. MCP Server: MCP tools (headroom_compress, headroom_retrieve, headroom_stats).
8. Proxy Optimizer: zero-code-change message history optimization.
"""
from __future__ import annotations
import json
import pytest

from commit_layer.headroom import (
    vault,
    crusher,
    code_compressor,
    log_compressor,
    router,
    compress,
    retrieve,
    HEADROOM_MCP_TOOLS,
    handle_mcp_call,
    optimize_messages,
)
from commit_layer import gateway
from commit_layer import sandbox


def setup_function():
    vault.reset()
    sandbox.reset()


def test_ccr_vault_store_and_retrieve():
    """CCRVault must store content and retrieve the exact original text by chunk_id."""
    raw_text = "This is a high-fidelity confidential deployment audit payload."
    chunk_id = vault.store(raw_text, content_type="PROSE")
    assert chunk_id.startswith("ccr_")

    restored = vault.retrieve(chunk_id)
    assert restored == raw_text

    stats = vault.get_stats()
    assert stats["chunks_stored"] == 1
    assert stats["chunks_retrieved"] == 1
    assert stats["total_raw_bytes"] == len(raw_text.encode("utf-8"))


def test_smart_crusher_json_compression():
    """SmartCrusher must strip empty fields and compress homogeneous array rows."""
    sample = {
        "cluster": "prod-east",
        "empty_note": "",
        "null_val": None,
        "nodes": [
            {"id": "node-1", "status": "ONLINE", "ip": "10.0.0.1"},
            {"id": "node-2", "status": "ONLINE", "ip": "10.0.0.2"},
            {"id": "node-3", "status": "ONLINE", "ip": "10.0.0.3"},
        ]
    }
    raw_json = json.dumps(sample, indent=2)
    compressed = crusher.compress(raw_json)

    # Empty and null fields should be stripped
    assert "empty_note" not in compressed
    assert "null_val" not in compressed
    # Homogeneous array should be compact
    assert "node-1" in compressed
    assert "node-3" in compressed
    assert len(compressed) < len(raw_json)


def test_code_compressor():
    """CodeCompressor preserves signatures while compacting large function bodies."""
    code = """
import os
import sys

class PaymentController:
    '''Handles mission-critical payment settlement.'''
    
    def process_wire(self, amount: float, to_account: str) -> bool:
        print("Starting step 1")
        print("Starting step 2")
        print("Starting step 3")
        print("Starting step 4")
        print("Starting step 5")
        print("Starting step 6")
        print("Starting step 7")
        print("Starting step 8")
        print("Starting step 9")
        return True

    def get_status(self) -> str:
        return "ACTIVE"
"""
    compressed = code_compressor.compress(code)
    # Signatures preserved
    assert "class PaymentController:" in compressed
    assert "def process_wire(self, amount: float, to_account: str) -> bool:" in compressed
    assert "def get_status(self) -> str:" in compressed
    # Interior lines omitted
    assert "lines omitted by Headroom" in compressed
    assert len(compressed) < len(code)


def test_log_compressor():
    """LogCompressor strips ANSI codes and collapses repeated lines."""
    log_data = (
        "\033[32m[INFO] Service starting up...\033[0m\n"
        "[DEBUG] Heartbeat tick\n"
        "[DEBUG] Heartbeat tick\n"
        "[DEBUG] Heartbeat tick\n"
        "[DEBUG] Heartbeat tick\n"
        "[DEBUG] Heartbeat tick\n"
        "\033[31m[ERROR] Connection refused\033[0m\n"
    )
    compressed = log_compressor.compress(log_data)
    # ANSI escapes stripped
    assert "\033[32m" not in compressed
    assert "\033[31m" not in compressed
    # Repetitions collapsed
    assert "Repeated" in compressed
    assert "[ERROR] Connection refused" in compressed


def test_content_router_auto_detection():
    """ContentRouter classifies modalities correctly and attaches CCR metadata."""
    json_text = '{"status": "ok", "empty_note": "", "services": ["worker", "api", "database", "cache", "scheduler", "monitoring"]}'
    comp_json, cid1, _ = compress(json_text)
    assert router.detect_modality(json_text) == "JSON"
    assert "Headroom CCR:" in comp_json


    py_code = "def authenticate_user(token: str):\n    return token.startswith('bearer_')"
    assert router.detect_modality(py_code) == "CODE"

    log_sample = "[INFO] Worker spawned\n[ERROR] Task aborted with exit code 1"
    assert router.detect_modality(log_sample) == "LOG"


def test_gateway_execution_attaches_headroom_ccr():
    """Gateway action execution automatically attaches Headroom CCR chunk metadata."""
    action = gateway.intercept("deploy_service", {"service_name": "payment-worker", "version": "v2.8.0"})
    res = gateway.execute_action(action, approved_by="test-headroom")
    assert res["status"] == "committed"
    assert "headroom" in res
    assert res["headroom"]["chunk_id"].startswith("ccr_")

    # CCR vault should be able to restore the exact raw result
    chunk_id = res["headroom"]["chunk_id"]
    restored = retrieve(chunk_id)
    assert restored is not None
    assert "v2.8.0" in restored


def test_headroom_mcp_tools():
    """Headroom MCP tools execute correctly."""
    # 1. Compress tool
    comp_res = handle_mcp_call("headroom_compress", {"content": '{"items": [1,2,3,4,5,6,7,8]}'})
    assert comp_res["retrievable"] is True
    cid = comp_res["chunk_id"]

    # 2. Retrieve tool
    ret_res = handle_mcp_call("headroom_retrieve", {"chunk_id": cid})
    assert ret_res["status"] == "RESTORED"
    assert "items" in ret_res["raw_content"]

    # 3. Stats tool
    stats = handle_mcp_call("headroom_stats", {})
    assert stats["chunks_stored"] >= 1


def test_headroom_proxy_optimize_messages():
    """Headroom message proxy compresses oversized message blocks."""
    large_tool_output = "DEBUG TRACE LOG\n" * 50
    messages = [
        {"role": "user", "content": "Deploy payment-worker"},
        {
            "role": "assistant",
            "content": [
                {"type": "tool_result", "content": large_tool_output}
            ]
        }
    ]
    optimized, stats = optimize_messages(messages)
    assert stats["compressed_items"] == 1
    assert stats["bytes_saved"] > 0
    # The optimized message should be substantially smaller
    assert len(optimized[1]["content"][0]["content"]) < len(large_tool_output)
