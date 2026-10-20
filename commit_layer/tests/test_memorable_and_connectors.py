import pytest
import os
import time

from commit_layer.memorable import procedural_memory, ProceduralMemoryStore
from commit_layer.connectors import connector_manager, opendots_workspace, OpenConnectorTool
from commit_layer import gateway
from commit_layer.models import RiskLevel, Decision, Outcome


def test_memorable_record_and_recall():
    db_path = f"commit_layer/test_mem_{int(time.time()*1000)}.db"
    mem = ProceduralMemoryStore(db_path=db_path)
    
    intent = "Deploy microservice alpha to staging cluster"
    steps = [
        {"tool_name": "deploy_service", "args": {"service": "alpha", "env": "staging"}, "outcome": "OBSERVED_SUCCESS"}
    ]
    
    # 1. Record run
    graph = mem.record_successful_run(intent=intent, domain="software", steps=steps, tokens_saved_estimate=1500)
    assert graph.task_hash is not None
    assert graph.success_count == 1

    # 2. Recall exact / lexical match
    recalled = mem.recall("Deploy microservice alpha to staging cluster")
    assert recalled is not None
    assert len(recalled.steps) == 1
    assert recalled.steps[0].tool_name == "deploy_service"


def test_open_agent_connector_dispatch_through_commit_gateway():
    # Verify connectors list
    connectors = connector_manager.list_connectors()
    conn_ids = [c["connector_id"] for c in connectors]
    assert "github" in conn_ids
    assert "slack" in conn_ids
    assert "custom_http" in conn_ids

    # Intercept and process connector action through CIEAV gateway
    action = gateway.intercept(
        tool_name="dispatch_connector_action",
        args={"connector_id": "github", "endpoint": "/repos/commit-layer/commits", "payload": {"repo": "my-app"}},
        agent_id="test-connector-agent"
    )
    result = gateway.process(action)
    assert result["status"] == "pending"
    assert result["risk"] == "MEDIUM"

    # Approve and observe receipt creation
    approved = gateway.approve(result["action_id"], approved_by="admin-user")
    assert approved["status"] == "committed"
    assert approved["outcome"] == Outcome.OBSERVED_SUCCESS.value
    assert "receipt_id" in approved


def test_opendots_workspace_byom_sessions():
    workspace_info = opendots_workspace.get_workspace_info()
    assert workspace_info["self_hosted"] is True
    assert "ollama" in workspace_info["supported_providers"]

    session = opendots_workspace.create_session(model_provider="ollama", model_name="llama3.3:70b")
    assert session.session_id.startswith("dots_sess_")
    assert session.model_name == "llama3.3:70b"


def test_memorable_rejects_greetings_and_conversational_intents():
    db_path = f"commit_layer/test_mem_greetings_{int(time.time()*1000)}.db"
    mem = ProceduralMemoryStore(db_path=db_path)

    # 1. Recording a greeting must be rejected (returns None)
    res = mem.record_successful_run(
        intent="hi",
        domain="general",
        steps=[{"tool_name": "run_terminal_command", "args": {"command": "echo hi"}}]
    )
    assert res is None

    # 2. Recalling a greeting must return None
    assert mem.recall("hi") is None
    assert mem.recall("hello") is None
    assert mem.recall("hey") is None
    assert mem.recall("what ur name") is None
