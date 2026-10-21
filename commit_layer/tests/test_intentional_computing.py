"""
Unit and integration tests for CIEAV Intentional Computing & Graphical Agent Interface (GAI).
Validates Alma-class direct host computer control, Memfold procedural playbooks,
single-cursor GUI lock, 2PC safety gates, and ephemeral GenUI surfaces.
"""
import os
import pytest
from commit_layer.intentional_gai import hybrid_gai, UIAction
from commit_layer.procedural_playbooks import playbook_manager
from commit_layer.intentional_orchestrator import intentional_orchestrator
from commit_layer.intentional_overlay import intentional_overlay
from commit_layer.tools.base import TOOL_REGISTRY


def test_procedural_playbooks_canonical_and_user_md():
    """Verify pre-seeded Alma domain playbooks and USER.md preferences."""
    # 1. Verify USER.md
    user_prefs = playbook_manager.read_user_profile()
    assert "USER DIRECTIVES & PREFERENCES" in user_prefs
    assert "Zerodha Kite" in user_prefs
    assert "Risk Ceiling" in user_prefs

    # 2. Check canonical pre-seeded playbooks
    books = playbook_manager.list_playbooks()
    slugs = [b["slug"] for b in books]
    assert "zerodha_portfolio_inspect" in slugs
    assert "paint_draw_geometry" in slugs
    assert "blender_quick_export" in slugs
    assert "gmail_search_applications" in slugs
    assert "windows_credential_manager" in slugs
    assert "krunker_high_fps_inspect" in slugs

    # 3. Retrieve playbook by slug
    pb = playbook_manager.get_playbook("zerodha_portfolio_inspect")
    assert pb is not None
    assert pb["app"] == "Google Chrome / Microsoft Edge"
    assert len(pb["steps"]) >= 4

    # 4. Save and retrieve custom playbook
    saved = playbook_manager.save_playbook(
        intent_slug="test_custom_workflow",
        app="Visual Studio Code",
        description="Format document and commit changes.",
        steps=[{"type": "hotkey", "keys": ["shift", "alt", "f"]}]
    )
    assert saved["slug"] == "test_custom_workflow"
    retrieved = playbook_manager.get_playbook("test_custom_workflow")
    assert retrieved is not None
    assert retrieved["app"] == "Visual Studio Code"


def test_hybrid_gai_active_window_and_action_diff():
    """Verify structural window inspection and action-diff verification loop."""
    # 1. Structural window detection
    app = hybrid_gai.get_active_app()
    assert "title" in app
    assert "rect" in app
    assert isinstance(app["rect"]["right"], (int, float))

    # 2. Coordinate Grounding
    coords = hybrid_gai.ground_coordinates("canvas center", app)
    assert isinstance(coords, tuple)
    assert len(coords) == 2
    assert coords[0] > 0 and coords[1] > 0

    # 3. Action-Plus-Diff loop with safe noop / mouse action
    action = UIAction(
        action_type="hotkey",
        target_label="System Hotkey Safe Check",
        keys=[]
    )
    res = hybrid_gai.execute_with_diff_check(action)
    assert res["status"] == "success"
    assert "diff_detected" in res
    assert res["elapsed_sec"] >= 0


def test_intentional_orchestrator_gui_lock_and_lanes():
    """Verify single-cursor foreground lock, background lanes, and 2PC gate."""
    # 1. Background CLI lane inside sandbox
    bg_res = intentional_orchestrator.run_background_cli_lane(
        command="python -c \"print('BACKGROUND_LANE_OK')\""
    )
    assert bg_res["success"] is True
    assert "BACKGROUND_LANE_OK" in bg_res["stdout"]

    # 2. 2PC Safety Floor Gate classification
    safe_act = UIAction(action_type="click", target_label="Holdings Navigation Tab")
    safe_gate = intentional_orchestrator.human_approval_gate(safe_act)
    assert safe_gate["approved"] is True
    assert safe_gate["risk"] == "LOW"

    sensitive_act = UIAction(action_type="click", target_label="Buy 100 Shares Order Submit")
    sensitive_gate = intentional_orchestrator.human_approval_gate(sensitive_act)
    assert sensitive_gate["risk"] == "CRITICAL"
    assert "receipt_id" in sensitive_gate

    # 3. Procedural Playbook Replay through Orchestrator
    replay_res = intentional_orchestrator.run_foreground_gui_lane(intent_slug="test_custom_workflow")
    assert replay_res["status"] == "success"
    assert replay_res["mode"] == "playbook_replay"
    assert replay_res["steps_executed"] >= 1


def test_ephemeral_genui_surfaces():
    """Verify on-demand ephemeral surfaces (GenUI) for Zerodha and Gmail."""
    # Zerodha live card
    z_card = intentional_overlay.render_cli_ephemeral_surface("zerodha_portfolio_card", {
        "pnl": "+₹18,500.00 (+4.2%)",
        "holdings_count": 12,
        "margin_available": "₹62,000.00"
    })
    assert "ZERODHA KITE LIVE SESSION" in z_card
    assert "+₹18,500.00" in z_card
    assert "2PC GATE" in z_card

    # Gmail applications card
    g_card = intentional_overlay.render_cli_ephemeral_surface("gmail_application_views_card", {
        "companies": ["Microsoft", "Google", "OpenAI"]
    })
    assert "GMAIL APPLICATION VIEWS" in g_card
    assert "Microsoft" in g_card
    assert "OpenAI" in g_card


def test_intentional_tools_in_registry():
    """Verify intentional tools are registered in Commit Layer TOOL_REGISTRY with 2PC inverse."""
    assert "intentional_execute" in TOOL_REGISTRY
    assert "playbook_replay" in TOOL_REGISTRY

    assert TOOL_REGISTRY["intentional_execute"].has_inverse is True
    assert TOOL_REGISTRY["playbook_replay"].has_inverse is True
