"""
Unit tests for Local Agent Codex-Class Architecture (100% Offline • No Cloud APIs).
====================================================================================
Verifies:
1. Native local browser DOM rendering (msedge.exe / chrome.exe headless)
2. Virtual Office Kanban & task state lifecycle
3. Terminal Cyber Game engine simulation & /undo rollback
4. Autonomous agent local reasoning cycle without external cloud APIs
"""

import pytest
from commit_layer.local_browser import local_browser
from commit_layer.virtual_office import virtual_office, TaskStatus
from commit_layer.cli_game import cli_game
from commit_layer.autonomous_agent import autonomous_agent


def test_local_browser_native_detection_and_dom():
    """Verify host has a native browser and can headlessly dump DOM without cloud APIs."""
    assert local_browser.is_available() is True
    assert local_browser.browser_name in ("Microsoft Edge", "Google Chrome")

    # Headless DOM extraction on local Uvicorn server
    res = local_browser.dump_dom("http://localhost:8000", timeout_sec=8)
    assert res["status"] == "success"
    assert "CIEAV" in res.get("title", "")
    assert res.get("char_count", 0) > 0


def test_virtual_office_kanban_lifecycle():
    """Verify virtual office tasks, team assignment, and board rendering."""
    # Add new task
    task = virtual_office.add_task("Build offline AST compiler", assigned_to="codex", priority="HIGH")
    assert task.task_id in virtual_office.tasks
    assert task.assigned_to == "codex"
    assert task.status == TaskStatus.IN_PROGRESS

    # Advance task to DONE
    finished = virtual_office.advance_task(task.task_id, new_status=TaskStatus.DONE, deliverable="compiler.py")
    assert finished is not None
    assert finished.status == TaskStatus.DONE
    assert finished.deliverable == "compiler.py"

    # Board rendering produces formatted text
    board = virtual_office.render_board()
    assert "CIEAV VIRTUAL OFFICE" in board
    assert task.task_id in board
    assert "Codex-Lead" in board


def test_cli_game_engine_defense_and_rollback():
    """Verify terminal game loop, threat mitigation, and 2PC lossless rollback."""
    initial_score = cli_game.score
    res_scan = cli_game.play_turn("scan")
    assert "SCAN COMPLETED" in res_scan
    assert cli_game.score > initial_score

    res_shield = cli_game.play_turn("shield")
    assert "SAFETY FLOOR ENGAGED" in res_shield

    # Test 2PC undo rollback restoring health
    res_undo = cli_game.play_turn("undo")
    assert "2PC LOSSLESS ROLLBACK" in res_undo
    assert cli_game.health == 100


def test_autonomous_agent_offline_instruction_cycle():
    """Verify autonomous agent routes instructions across domains with zero cloud keys."""
    # Test office route
    res_office = autonomous_agent.process_instruction("office status")
    assert res_office["type"] == "office"
    assert "board" in res_office

    # Test browser route
    res_browser = autonomous_agent.process_instruction("browser http://localhost:8000")
    assert res_browser["type"] == "browser"
    assert "CIEAV" in res_browser["message"]

    # Test game route
    res_game = autonomous_agent.process_instruction("play cyber commit")
    assert res_game["type"] == "game"
    assert "CYBER COMMIT" in res_game["message"]


def test_web_commerce_shopping_agent():
    """Verify autonomous web store search and product resolution."""
    from commit_layer.web_commerce import web_commerce
    res = web_commerce.search_store("clothes in amazon", platform="amazon", launch_browser=False)
    assert res["status"] == "success"
    assert res["platform"] == "Amazon"
    assert len(res["items"]) >= 5
    first = res["items"][0]
    assert "price" in first
    assert "url" in first
    assert first["price"] > 0
    assert "https://www.amazon.com/dp/" in first["url"]
    
    # Test rendering card in CLI
    card = web_commerce.render_cli_results(res)
    assert "LIVE WEB STORE AGENT" in card
    assert "AMAZON" in card
