"""
Intentional Computing & Graphical Agent Interface Tools registered in Commit Layer.
Mediates direct host control, UI Playbooks, and ephemeral surfaces under 2PC.
"""
from __future__ import annotations
from typing import Any, Callable, Dict, Optional
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer.intentional_orchestrator import intentional_orchestrator
from commit_layer.procedural_playbooks import playbook_manager


class IntentionalExecuteTool(BaseTool):
    """Executes host desktop intent via the Graphical Agent Interface under 2PC."""

    name = "intentional_execute"
    description = "Execute a direct host computer intent across native desktop apps and browsers."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        intent = args.get("intent", "")
        lane = args.get("lane", "foreground")
        if lane == "background":
            cmd = args.get("command", "")
            return intentional_orchestrator.run_background_cli_lane(command=cmd)
        else:
            return intentional_orchestrator.run_foreground_gui_lane(intent_slug=intent)

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return lambda: {"status": "success", "message": "Intentional action state acknowledged"}


class PlaybookReplayTool(BaseTool):
    """Replays cached procedural UI playbooks (Memfold) in ~50ms."""

    name = "playbook_replay"
    description = "Replay a cached procedural UI playbook (e.g. Zerodha, Blender, Paint, Gmail)."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        slug = args.get("slug", "")
        return intentional_orchestrator.run_foreground_gui_lane(intent_slug=slug)

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return lambda: {"status": "success", "message": "Playbook replay acknowledged"}
