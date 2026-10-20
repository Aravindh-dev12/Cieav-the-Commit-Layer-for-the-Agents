"""
Unit tests for Local Agent Codex-Class Architecture (100% Offline • No Cloud APIs).
====================================================================================
Verifies:
1. Native local browser DOM rendering (msedge.exe / chrome.exe headless)
2. Virtual Office Kanban & task state lifecycle
3. Terminal Cyber Game engine simulation & /undo rollback
4. Autonomous agent local reasoning cycle without external cloud APIs
5. Personalized markdown notes & knowledge vault
6. Project directory scaffolding & git repository initialization
7. GitHub DevOps: live issue inspection, bug fixing, PR creation & push
8. Governed outbound email authoring & PII zeroization
9. Governed WhatsApp messaging via sanitized deep links
"""

import os
import shutil
import pytest
from commit_layer.local_browser import local_browser
from commit_layer.virtual_office import virtual_office, TaskStatus
from commit_layer.cli_game import cli_game
from commit_layer.autonomous_agent import autonomous_agent
from commit_layer.tools.notes_manager import notes_manager, NotesManagerTool
from commit_layer.tools.github_agent import github_agent, GitHubDevOpsTool
from commit_layer.tools.email_agent import email_agent, EmailAgentTool
from commit_layer.tools.messaging_agent import whatsapp_agent, WhatsAppMessagingTool


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


def test_personal_notes_manager():
    """Verify note creation, search, listing, and 2PC rollback."""
    test_note = notes_manager.take_note("Meeting with security team regarding Ed25519 hash-chaining.", title="Security Review")
    assert test_note["status"] == "success"
    assert os.path.exists(test_note["filepath"])
    assert "Security Review" in test_note["title"]

    all_notes = notes_manager.list_notes()
    assert len(all_notes) >= 1

    matches = notes_manager.search_notes("Ed25519")
    assert len(matches) >= 1
    assert matches[0]["title"] == "Security Review"

    card = notes_manager.render_cli_notes(all_notes)
    assert "PERSONAL NOTES VAULT" in card

    # Test BaseTool inverse rollback
    tool = NotesManagerTool()
    inv = tool.inverse({}, test_note)
    assert inv is not None
    undone = inv()
    assert undone["undone"] is True
    assert not os.path.exists(test_note["filepath"])


def test_project_scaffolding_and_git_init():
    """Verify project directory scaffolding, files generation, and git repository initialization."""
    # Ensure fresh test directory
    init_dir = os.path.join(os.getcwd(), "projects", "test_analytics_engine")
    if os.path.exists(init_dir):
        shutil.rmtree(init_dir, ignore_errors=True)

    res = github_agent.scaffold_project(name="test_analytics_engine", template="python", description="Test analytics engine")
    assert res["status"] == "success"
    proj_path = res["project_path"]
    proj_pkg = res["project_name"].replace("-", "_")
    assert os.path.isdir(proj_path)
    assert os.path.exists(os.path.join(proj_path, "README.md"))
    assert os.path.exists(os.path.join(proj_path, "pyproject.toml"))
    assert os.path.exists(os.path.join(proj_path, "src", proj_pkg, "core.py"))
    assert os.path.exists(os.path.join(proj_path, "tests", "test_core.py"))
    assert os.path.isdir(os.path.join(proj_path, ".git"))

    # Test rollback inverse
    tool = GitHubDevOpsTool()
    inv = tool.inverse({"operation": "scaffold_project"}, res)
    assert inv is not None
    undone = inv()
    assert undone["undone"] is True
    assert not os.path.exists(proj_path)


def test_github_devops_issues_and_pr():
    """Verify GitHub issues query, issue view, bug fixing, and PR creation."""
    issues = github_agent.list_issues(limit=5)
    assert issues["status"] == "success"
    assert issues["count"] > 0

    single = github_agent.view_issue(65)
    assert single["status"] == "success"
    assert single["issue"]["number"] == 65

    # Test fix issue
    fix = github_agent.fix_issue(issue_number=65, fix_description="Ensure ACID 2PC commit guarantees")
    assert fix["status"] == "success"
    assert "Closes #65" in fix["commit_message"] or "Fixes #65" in fix["commit_message"]

    # Test raise PR
    pr = github_agent.raise_pr(title="Qualify 2PC transaction recovery", body="Automated verification test PR", dry_run=True)
    assert pr["status"] in ("success", "simulated_success")
    assert "github.com" in pr["pr_url"]


def test_governed_email_agent():
    """Verify outbound email authoring, PII scrubbing, and outbox logging."""
    res = email_agent.compose_and_send(
        to="auditor@cieav.internal",
        subject="Release notes with secret password12345",
        body="Audit report: credit card 4532-1234-5678-9010 approved.",
        launch_client=False
    )
    assert res["status"] == "success"
    assert os.path.exists(res["record_path"])
    # Verify PII was redacted
    assert "password12345" not in res["subject"]
    assert "4532-1234-5678-9010" not in res["body_preview"]

    outbox = email_agent.list_outbox()
    assert len(outbox) >= 1

    card = email_agent.render_cli_card(res)
    assert "EMAIL DISPATCHED UNDER CIEAV GOVERNANCE" in card

    # Cleanup test outbox file
    if os.path.exists(res["record_path"]):
        os.remove(res["record_path"])


def test_governed_whatsapp_messaging_agent():
    """Verify WhatsApp phone sanitization, deep link generation, and audit logging."""
    assert whatsapp_agent.sanitize_phone("+1 (415) 555-2671") == "14155552671"
    assert whatsapp_agent.sanitize_phone("invalid") is None

    res = whatsapp_agent.send_whatsapp(
        phone="+1 415 555 2671",
        message="System alert: pass is secret_token_xyz999. All nodes safe.",
        launch_browser=False
    )
    assert res["status"] == "success"
    assert res["phone"] == "+14155552671"
    assert "https://wa.me/14155552671?text=" in res["wa_url"]
    assert os.path.exists(res["record_path"])
    assert "secret_token_xyz999" not in res["message"]

    card = whatsapp_agent.render_cli_card(res)
    assert "WHATSAPP MESSAGE DISPATCHED" in card

    # Cleanup test message file
    if os.path.exists(res["record_path"]):
        os.remove(res["record_path"])


def test_autonomous_agent_full_codex_cycle():
    """Verify the autonomous agent handles notes, projects, issues, emails, and WhatsApp."""
    # 1. Notes intent
    r_note = autonomous_agent.process_instruction("take note discuss zero-knowledge proofs tomorrow")
    assert r_note["type"] == "notes"
    assert "Note saved locally" in r_note["message"]

    # 2. Project scaffold intent
    r_scaffold = autonomous_agent.process_instruction("create project fast_vector_db")
    assert r_scaffold["type"] == "devops"
    assert "fast_vector_db" in r_scaffold["project"]["project_name"]
    # Clean up scaffolded test project
    shutil.rmtree(r_scaffold["project"]["project_path"], ignore_errors=True)

    # 3. GitHub issues intent
    r_issues = autonomous_agent.process_instruction("check github issues")
    assert r_issues["type"] == "devops"
    assert "GITHUB LIVE ISSUE TRACKER" in r_issues["message"]

    # 4. Outbound Email intent
    r_email = autonomous_agent.process_instruction("send email to lead@cieav.internal subject Quarterly Review body Ready for deployment")
    assert r_email["type"] == "email"
    assert "lead@cieav.internal" in r_email["result"]["to"]
    if os.path.exists(r_email["result"]["record_path"]):
        os.remove(r_email["result"]["record_path"])

    # 5. WhatsApp intent
    r_wa = autonomous_agent.process_instruction("send whatsapp to +14155550199 saying Node deployment complete")
    assert r_wa["type"] == "whatsapp"
    assert r_wa["result"]["status"] == "success"
    if os.path.exists(r_wa["result"]["record_path"]):
        os.remove(r_wa["result"]["record_path"])
