"""
Unit tests for CIEAV Agent Tool Server (Hermes / Instinct Interop) and Web Intelligence.
"""
import pytest
from commit_layer.agent_tool_server import agent_tool_server
from commit_layer.web_intel import web_intel
from commit_layer.autonomous_agent import autonomous_agent


def test_agent_tool_server_catalog_and_schemas():
    tools = agent_tool_server.list_tools()
    assert len(tools) >= 7
    names = [t["function"]["name"] for t in tools]
    assert "repo_file_action" in names
    assert "run_terminal_command" in names
    assert "inspect_recycle_bin" in names
    assert "empty_recycle_bin" in names
    assert "web_research" in names
    assert "local_browser_navigate" in names
    assert "system_diagnostics" in names

    # Check OpenAI JSON schema formatting
    for t in tools:
        assert t["type"] == "function"
        assert "name" in t["function"]
        assert "description" in t["function"]
        assert "parameters" in t["function"]
        assert t["function"]["parameters"]["type"] == "object"


def test_agent_tool_server_execution_governance():
    # Test safe read-only tool execution through 2PC
    res = agent_tool_server.execute_tool(
        tool_name="inspect_recycle_bin",
        arguments={},
        agent_id="hermes-unit-test"
    )
    assert "action_id" in res
    assert res["tool"] == "inspect_recycle_bin"
    assert res["risk"] == "LOW"
    assert res["decision"] == "auto"
    assert res["result"]["status"] == "committed"
    assert res["result"]["outcome"] == "OBSERVED_SUCCESS"


def test_web_intel_encyclopedia_lookup():
    # Test live encyclopedia knowledge retrieval
    info = web_intel.lookup_encyclopedia("Artificial intelligence")
    assert info is not None
    assert "Artificial intelligence" in info["title"]
    assert len(info["extract"]) > 20
    assert "Wikipedia" in info["source"]


def test_web_intel_query_grounding():
    grounded = web_intel.ground_query("What is Artificial intelligence?")
    assert grounded is not None
    assert "[LIVE ENCYCLOPEDIA GROUNDING" in grounded
    assert "Artificial intelligence" in grounded


def test_autonomous_agent_real_qa_no_canned_text():
    # Test that general question is not intercepted by the old canned boilerplate
    res = autonomous_agent.process_instruction("what is artificial intelligence?")
    assert res["type"] == "answer"
    # Ensure it's not the generic canned boilerplate
    assert "As your sovereign local agent, I specialize in" not in res["message"]
    assert len(res["message"]) > 50
