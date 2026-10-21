"""
Unit and integration tests for CIEAV Autonomous Multi-Agent Swarm Runtime.
Zero mock data. Zero hardcoded dummy seeds. 100% dynamic execution under 2PC.
"""
import os
import ast
import pytest
from commit_layer.multi_agent_swarm import swarm_orchestrator, AutonomousMultiAgentSwarm
from commit_layer.virtual_office import virtual_office, TaskStatus
from commit_layer import receipts, gateway


def test_swarm_agent_initialization():
    """Verify all 5 specialized agents are initialized with explicit roles."""
    swarm = AutonomousMultiAgentSwarm()
    assert swarm.atlas.name == "Atlas"
    assert swarm.codex.name == "Codex"
    assert swarm.crust.name == "Crust"
    assert swarm.ops.name == "Ops"
    assert swarm.cfo.name == "CFO"


def test_swarm_execution_cycle_real_file_and_ast():
    """Verify end-to-end multi-agent pipeline generates a real AST-valid file on disk."""
    goal = "Build a lightweight health probe daemon in Python"
    
    progress_log = []
    def progress_tracker(cur, total, name, desc):
        progress_log.append((cur, total, name, desc))

    res = swarm_orchestrator.execute_swarm_mission(goal, progress_cb=progress_tracker)

    assert res["status"] == "success"
    assert res["goal"] == goal
    assert len(progress_log) == 5

    # 1. Atlas Blueprint
    assert "atlas" in res
    assert len(res["atlas"]["blueprint"]) > 10

    # 2. Codex Deliverable
    codex_info = res["codex"]
    filepath = codex_info["filepath"]
    assert os.path.exists(filepath), f"File {filepath} was not created on disk"
    assert codex_info["ast_valid"] is True
    assert codex_info["lines_of_code"] > 0

    with open(filepath, "r", encoding="utf-8") as f:
        code_body = f.read()
    # Confirm Python syntax parse
    parsed_ast = ast.parse(code_body)
    assert parsed_ast is not None

    # 3. Crust Security Audit
    crust_info = res["crust"]
    assert crust_info["audit_status"] in ("CERTIFIED_SECURE", "WARNING_FLAGGED")
    assert isinstance(crust_info["findings"], list)

    # 4. Ops Compilation & Telemetry
    ops_info = res["ops"]
    assert ops_info["compiled"] is True
    assert isinstance(ops_info["cpu_percent"], (int, float))

    # 5. CFO Cryptographic Receipt
    receipt_id = res["receipt_id"]
    assert receipt_id != ""
    r = receipts.get_receipt(receipt_id)
    assert r is not None
    assert r["agent_id"] == "cieav-swarm-cfo"
    assert r["status"] == "COMMITTED"


def test_virtual_office_kanban_sync_zero_mock():
    """Verify virtual office Kanban board reflects real dynamic tasks with 0 mock seeds."""
    virtual_office.tasks.clear()

    goal = "Verify system cache and network port telemetry"
    res = virtual_office.run_swarm_cycle(goal)

    assert res["status"] == "success"
    assert len(virtual_office.tasks) == 5

    board_text = virtual_office.render_board()
    assert "Atlas" in board_text or "atlas" in board_text
    assert "Codex" in board_text or "codex" in board_text
    assert "Crust" in board_text or "crust" in board_text
    assert "Ops" in board_text or "ops" in board_text
    assert "CFO" in board_text or "cfo" in board_text
    # Ensure no old hardcoded mock seeds remain
    assert "TASK-101" not in board_text
    assert "TASK-102" not in board_text


def test_swarm_render_card():
    """Verify render_swarm_card generates formatted terminal output without errors."""
    if not swarm_orchestrator.last_mission:
        swarm_orchestrator.execute_swarm_mission("Quick system health check")
    card = swarm_orchestrator.render_swarm_card(swarm_orchestrator.last_mission)
    assert "CIEAV AUTONOMOUS MULTI-AGENT SWARM" in card
    assert "Atlas" in card
    assert "Codex" in card
    assert "Crust" in card
    assert "Ops" in card
    assert "CFO" in card
