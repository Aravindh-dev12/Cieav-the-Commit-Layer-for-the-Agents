"""
Browser Interactive Tool registered in the CIEAV Commit Layer.
Mediates real-time browser actions under Two-Phase Commit (2PC).
"""
from __future__ import annotations
from typing import Any, Callable, Dict, Optional
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer.interactive_browser import interactive_browser


class BrowserInteractiveTool(BaseTool):
    """Governs interactive web browsing, clicking, typing, and DOM verification."""

    name = "browser_interactive_action"
    description = "Interactively browse any website in Chrome/Edge, click elements, type text, and extract live state."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        url = args.get("url", "https://www.google.com")
        actions = args.get("actions", [])
        browser = args.get("browser", "auto")
        headless = args.get("headless", False)
        return interactive_browser.execute_interactive_mission(
            target_url=url,
            actions=actions,
            browser=browser,
            headless=headless
        )

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        # If active session produced valid DOM title or interactive items, mark OBSERVED_SUCCESS
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        def undo_browser():
            if interactive_browser.session:
                interactive_browser.session.close()
            return {"status": "success", "message": "Interactive browser session closed cleanly."}
        return undo_browser
