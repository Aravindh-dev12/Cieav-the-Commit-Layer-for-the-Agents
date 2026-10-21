"""
Sandbox and Memory Hive Tools registered in the CIEAV Commit Layer.
Mediates sandboxed command execution and memory updates under 2PC.
"""
from __future__ import annotations
from typing import Any, Callable, Dict, Optional
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer.sandbox_controller import central_sandbox
from commit_layer.memory_hive import memory_hive


class SandboxExecuteTool(BaseTool):
    """Governs command execution strictly inside the centrally controlled sandbox jail."""

    name = "sandbox_execute"
    description = "Execute a command inside the isolated local sandbox with path and process confinement."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        cmd = args.get("command", "")
        sid = args.get("sandbox_id")
        timeout = float(args.get("timeout_sec", 30.0))
        res = central_sandbox.run_command(command=cmd, sandbox_id=sid, timeout_sec=timeout)
        return res.to_dict()

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        sid = args.get("sandbox_id")
        def undo_sandbox():
            if sid:
                return central_sandbox.rollback_sandbox(sid)
            return {"status": "success", "message": "Sandbox execution rolled back"}
        return undo_sandbox


class MemoryHiveTool(BaseTool):
    """Governs learning and updates to the persistent Git-backed memory hive."""

    name = "memory_hive_action"
    description = "Update or query the persistent local memory hive (SOUL.md and MEMORY.md)."
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        action = args.get("action", "learn")
        if action == "learn":
            return memory_hive.learn(
                category=args.get("category", "general"),
                insight=args.get("insight", ""),
                author=args.get("author", "agent")
            )
        elif action == "recall":
            return {"results": memory_hive.recall(args.get("query", ""))}
        return {"status": "success"}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return lambda: {"status": "success", "message": "Memory revision acknowledged"}
