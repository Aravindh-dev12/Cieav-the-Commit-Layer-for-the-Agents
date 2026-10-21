"""
Unit and integration tests for CIEAV Central Controlled Sandbox & Memory Hive.
Validates escape prevention, path jail, process containment, SOUL.md, and MEMORY.md.
"""
import os
import pytest
from commit_layer.sandbox_controller import central_sandbox, SandboxEscapeViolation, SandboxPathJail
from commit_layer.memory_hive import memory_hive
from commit_layer.tools.base import TOOL_REGISTRY


def test_sandbox_path_jail_containment():
    """Verify SandboxPathJail strictly enforces containment and blocks escape attempts."""
    jail = SandboxPathJail(allowed_roots=[central_sandbox.workspace_root, central_sandbox.sandboxes_dir])

    # 1. Allowed paths
    allowed = os.path.join(central_sandbox.workspace_root, "projects", "test.py")
    assert jail.validate_path(allowed) is not None

    # 2. Path Traversal escape attempt
    escaped = os.path.join(central_sandbox.workspace_root, "..", "..", "Windows", "System32")
    with pytest.raises(SandboxEscapeViolation):
        jail.validate_path(escaped)

    # 3. Direct Root System escape attempt
    with pytest.raises(SandboxEscapeViolation):
        jail.validate_path(r"C:\Windows\System32\cmd.exe")


def test_sandbox_dangerous_command_blocked():
    """Verify destructive shell commands are intercepted and blocked prior to spawn."""
    with pytest.raises(SandboxEscapeViolation):
        central_sandbox.run_command("del /f /s /q C:\\")

    with pytest.raises(SandboxEscapeViolation):
        central_sandbox.run_command("format D: /fs:NTFS")

    with pytest.raises(SandboxEscapeViolation):
        central_sandbox.run_command("rm -rf /")


def test_sandbox_run_command_safe():
    """Verify safe commands execute with resource limits and scrubbed environment."""
    res = central_sandbox.run_command("python -c \"import os; print('SANDBOX_OK:', os.environ.get('CIEAV_SANDBOX_ACTIVE'))\"")
    res_dict = res.to_dict()

    assert res_dict["success"] is True
    assert res_dict["exit_code"] == 0
    assert "SANDBOX_OK: 1" in res_dict["stdout"]
    assert res_dict["elapsed_sec"] > 0
    assert isinstance(res_dict["peak_memory_mb"], (int, float))


def test_persistent_memory_hive():
    """Verify SOUL.md constitution, MEMORY.md learning, recall, and agent mailboxes."""
    # 1. SOUL.md Constitution
    soul_text = memory_hive.read_soul()
    assert "SOVEREIGN AGENT CONSTITUTION" in soul_text
    assert "Two-Phase Commit Safety Floor" in soul_text
    assert "Sandbox Containment" in soul_text

    # 2. Memory Learning
    learn_res = memory_hive.learn(
        category="security_policy",
        insight="Centrally controlled sandbox prevents agent escape across host.",
        author="test_runner"
    )
    assert learn_res["status"] == "success"

    # 3. Semantic Recall
    recalled = memory_hive.recall("sandbox escape", top_k=3)
    assert len(recalled) > 0
    assert any("sandbox" in r["content"].lower() or "escape" in r["content"].lower() for r in recalled)

    # 4. Inter-agent Mailbox (Munder Difflin pattern)
    msg = memory_hive.send_agent_message(
        sender="atlas",
        recipient="codex",
        subject="Task DAG Ticket #402",
        body="Implement AST validator inside sandboxed worktree."
    )
    assert msg["status"] == "success"
    inbox = memory_hive.list_inbox_messages("codex")
    assert len(inbox) > 0
    assert any(m["subject"] == "Task DAG Ticket #402" for m in inbox)


def test_sandbox_and_memory_tools_registered():
    """Verify tools are registered in TOOL_REGISTRY with 2PC inverse support."""
    assert "sandbox_execute" in TOOL_REGISTRY
    assert "memory_hive_action" in TOOL_REGISTRY

    assert TOOL_REGISTRY["sandbox_execute"].has_inverse is True
    assert TOOL_REGISTRY["memory_hive_action"].has_inverse is True
