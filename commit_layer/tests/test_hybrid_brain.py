"""
Unit Tests for CIEAV Native SuperAgent Brain (Qwen-3.5-9B Local Engine).
"""
import pytest
from commit_layer.hybrid_brain import (
    hybrid_brain,
    qwen35_engine,
    LlamaPersona,
    QwenCoderPersona,
    HybridSuperAgentBrain
)


def test_qwen35_engine_availability_and_metadata():
    """Verify Qwen-3.5-9B GGUF file detection, size, and metadata."""
    assert qwen35_engine.is_available is True
    assert "Qwen3.5-9B-Q4_K_M.gguf" in qwen35_engine.model_path
    assert qwen35_engine.model_size_gb >= 5.0


def test_llama_persona_dag_planning():
    """Verify persona decomposes complex user goals into strategic DAG phases."""
    # Web / Landing Page
    plan_web = LlamaPersona.generate_plan("build an awwwards modern landing page")
    assert "Next.js" in plan_web["architecture"]
    assert len(plan_web["phases"]) >= 4

    # API / Backend
    plan_api = LlamaPersona.generate_plan("create a fastapi microservice with database")
    assert "FastAPI" in plan_api["architecture"]
    assert len(plan_api["phases"]) >= 4

    # Code Healer
    plan_heal = LlamaPersona.generate_plan("fix bug in pytest test_suite")
    assert "Devin-Class" in plan_heal["architecture"]
    assert len(plan_heal["phases"]) >= 4

    # General Mission
    plan_gen = LlamaPersona.generate_plan("audit security posture of repository")
    assert "Autonomous Sovereign" in plan_gen["architecture"]
    assert len(plan_gen["phases"]) >= 3


def test_qwen_coder_persona_synthesis():
    """Verify Qwen coder synthesizes production code and precise JSON tool schemas."""
    # FastAPI code generation
    gen_api = QwenCoderPersona.generate_code_snippet("create fastapi server")
    assert "FastAPI" in gen_api["code"]
    assert gen_api["filename"] == "app_api.py"

    # Fibonacci algorithm
    gen_fib = QwenCoderPersona.generate_code_snippet("write fibonacci sequence")
    assert "fibonacci_sequence" in gen_fib["code"]
    assert gen_fib["filename"] == "fibonacci.py"

    # Tool Call: Empty Recycle Bin
    tool_bin = QwenCoderPersona.synthesize_tool_call("empty recycle bin")
    assert tool_bin is not None
    assert tool_bin["tool"] == "empty_recycle_bin"

    # Tool Call: Clean Temp
    tool_temp = QwenCoderPersona.synthesize_tool_call("clean temp cache")
    assert tool_temp is not None
    assert tool_temp["tool"] == "run_terminal_command"

    # Tool Call: Explicit File Creation
    tool_file = QwenCoderPersona.synthesize_tool_call("create test_script.py with print('hello world')")
    assert tool_file is not None
    assert tool_file["tool"] == "repo_file_action"
    assert tool_file["args"]["file_path"] == "test_script.py"

    # Tool Call: Terminal Command
    tool_cmd = QwenCoderPersona.synthesize_tool_call("run git status")
    assert tool_cmd is not None
    assert tool_cmd["tool"] == "run_terminal_command"
    assert tool_cmd["args"]["command"] == "git status"


def test_hybrid_brain_system_summary():
    """Verify operational telemetry and Qwen-3.5-9B offline sovereignty."""
    summary = hybrid_brain.get_system_summary()
    assert "Qwen-3.5-9B" in summary["engine"]
    assert summary["model_size_gb"] >= 5.0
    assert summary["cloud_dependencies"] == "0% (Completely Sovereign Offline)"
    assert "cieav-decider-v2" in summary["components"]["router"]


def test_hybrid_brain_architecture_card_and_encoding():
    """Verify architecture card renders correctly and is 100% CP1252 / UTF-8 safe."""
    card = hybrid_brain.render_architecture_card()
    assert "CIEAV NATIVE SUPERAGENT CORE" in card
    assert "Qwen-3.5-9B" in card

    # Encoding safety check
    card.encode("utf-8")
    card.encode("cp1252", errors="strict")


def test_hybrid_brain_process_query_planning():
    """Verify end-to-end query processing for architectural planning."""
    res = hybrid_brain.process_query("design modern portfolio website")
    assert res["type"] == "strategic_plan"
    assert "Next.js" in res["plan"]["architecture"]
    assert "message" in res
    assert res["decision"]["latency_ms"] >= 0.0

    # Encoding check on output message
    res["message"].encode("utf-8")
    res["message"].encode("cp1252", errors="strict")
