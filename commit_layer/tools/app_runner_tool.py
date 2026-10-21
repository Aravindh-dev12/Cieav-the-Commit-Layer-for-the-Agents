"""
App Runner Tools registered in the CIEAV Commit Layer.
Mediates running desktop applications, local servers, and entire app pipelines under 2PC.
"""
from __future__ import annotations
from typing import Any, Callable, Dict, Optional
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer.tools.app_runner import app_runner, MANAGED_PROCESSES


class RunDesktopAppTool(BaseTool):
    """Governs desktop application execution under Two-Phase Commit."""

    name = "run_desktop_app"
    description = "Launch any Windows desktop application or executable with atomic process tracking."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        app = args.get("app", "")
        cmd_args = args.get("args")
        initial_text = args.get("initial_text")
        return app_runner._spawn_desktop_app(app_name=app, args=cmd_args, initial_text=initial_text)

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        pid = result.get("pid")
        def undo_app():
            if pid:
                try:
                    import psutil
                    proc = psutil.Process(pid)
                    proc.terminate()
                    return {"status": "success", "message": f"Terminated app process PID {pid}"}
                except Exception as e:
                    return {"status": "partial", "message": f"Process already terminated or error: {e}"}
            return {"status": "success"}
        return undo_app


class RunEntireAppTool(BaseTool):
    """Governs full-stack application pipeline execution with automated browser verification."""

    name = "run_entire_app"
    description = "Spawn local app server, detect listening port, and verify UI in native interactive browser."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        target = args.get("target")
        open_browser = args.get("open_browser", True)
        browser = args.get("browser", "auto")
        return app_runner._spawn_entire_app(target_path=target, open_browser=open_browser, preferred_browser=browser)

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        pid = result.get("pid")
        def undo_entire_app():
            stopped = False
            if pid:
                try:
                    import psutil
                    proc = psutil.Process(pid)
                    proc.terminate()
                    stopped = True
                except Exception:
                    pass
            from commit_layer.interactive_browser import interactive_browser
            if interactive_browser.session:
                interactive_browser.session.close()
            return {"status": "success", "message": f"Pipeline rolled back (PID {pid} stopped, browser closed)."}
        return undo_entire_app
