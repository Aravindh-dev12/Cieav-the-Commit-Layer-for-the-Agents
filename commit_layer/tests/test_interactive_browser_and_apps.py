"""
Unit and integration tests for CIEAV Universal Interactive Browser & App Runner.
Tests live CDP browser control (Chrome/Edge), desktop software, and full-stack pipelines under 2PC.
"""
import os
import time
import pytest
import psutil

from commit_layer.interactive_browser import (
    find_browser_executable,
    InteractiveBrowserSession,
    interactive_browser
)
from commit_layer.tools.app_runner import app_runner, UniversalAppRunner
from commit_layer.tools.base import TOOL_REGISTRY
from commit_layer import receipts


def test_browser_executable_discovery():
    """Verify host browser discovery finds a valid browser binary."""
    path, name = find_browser_executable("auto")
    assert path is not None
    assert os.path.exists(path)
    assert name in ("Google Chrome", "Microsoft Edge")


def test_interactive_browser_cdp_session():
    """Verify live Chrome/Edge CDP session, DOM extraction, clicking, and screenshot."""
    session = InteractiveBrowserSession(browser_type="auto", headless=True)
    res = session.start(initial_url="https://example.com")
    assert res["status"] in ("success", "partial")

    if res.get("interactive_cdp"):
        assert session.ws_url is not None

        # 1. DOM Summary & Title
        dom = session.get_dom_summary()
        assert "Example" in dom.get("title", "")
        assert dom.get("interactive_count", 0) >= 1

        # 2. Click Element by visible text
        click_res = session.click_element("Learn more")
        assert click_res.get("status") in ("success", "not_found")

        # 3. Screenshot Capture via CDP
        ss_res = session.capture_screenshot()
        assert ss_res["status"] == "success"
        assert os.path.exists(ss_res["file_path"])
        assert ss_res["file_size"] > 0

    session.close()
    assert session.proc is None or session.proc.poll() is not None


def test_universal_desktop_app_runner():
    """Verify running a desktop application under Two-Phase Commit governance."""
    res = app_runner.run_desktop_app("notepad", initial_text="CIEAV Autonomous Computer Control Active")
    assert res["status"] == "success"
    assert "notepad" in res["app"].lower()
    pid = res["pid"]
    assert pid is not None

    # Verify process is alive in psutil
    assert psutil.pid_exists(pid)

    # Verify Ed25519 receipt
    receipt_id = res.get("receipt_id")
    assert receipt_id != ""
    r = receipts.get_receipt(receipt_id)
    assert r is not None
    assert r["agent_id"] == "cieav-app-runner"

    # Terminate process
    try:
        p = psutil.Process(pid)
        p.terminate()
    except Exception:
        pass


def test_run_entire_app_pipeline():
    """Verify running an entire application pipeline with automated verification."""
    # Test on the projects directory (static web or local server)
    res = app_runner.run_entire_app(target_path="projects", open_browser=False)
    assert res["status"] == "success"
    assert res["reversible"] is True
    assert "receipt_id" in res

    pid = res.get("pid")
    if pid and psutil.pid_exists(pid):
        try:
            psutil.Process(pid).terminate()
        except Exception:
            pass


def test_commit_layer_tools_registered_with_inverse():
    """Verify all new browser and app runner tools are registered in TOOL_REGISTRY with inverse."""
    assert "browser_interactive_action" in TOOL_REGISTRY
    assert "run_desktop_app" in TOOL_REGISTRY
    assert "run_entire_app" in TOOL_REGISTRY

    assert TOOL_REGISTRY["browser_interactive_action"].has_inverse is True
    assert TOOL_REGISTRY["run_desktop_app"].has_inverse is True
    assert TOOL_REGISTRY["run_entire_app"].has_inverse is True
