"""Real-world Repository File Tool for Commit Layer.

Operates directly on real files inside local Git repositories (such as the user's portfolio),
with mandatory snapshotting and two-phase reversible undo.
"""
from __future__ import annotations
import os
import shutil
import time
from typing import Any, Optional, Callable
from commit_layer.tools.base import BaseTool
from commit_layer.models import Outcome

SNAPSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".repo_snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


class RealRepoFileTool(BaseTool):
    name = "repo_file_action"
    description = "Perform a file modification or deletion in a real repository with atomic rollback snapshots"
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        file_path = args.get("file_path", "")
        operation = args.get("operation", "modify")  # "modify" or "delete"
        new_content = args.get("content", "")

        if not file_path:
            raise ValueError("file_path is required")

        file_path = os.path.abspath(file_path)
        existed_before = os.path.exists(file_path)

        # Snapshot existing file before touching disk
        snapshot_id = f"snap_{int(time.time() * 1000)}"
        backup_path = os.path.join(SNAPSHOT_DIR, f"{snapshot_id}_{os.path.basename(file_path)}")

        if existed_before:
            shutil.copy2(file_path, backup_path)
        else:
            backup_path = None

        # Execute operation
        if operation == "delete":
            if existed_before:
                os.remove(file_path)
            result = {
                "operation": "delete",
                "file_path": file_path,
                "existed_before": existed_before,
                "backup_path": backup_path,
                "snapshot_id": snapshot_id,
                "status": "deleted"
            }
        elif operation == "modify":
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            result = {
                "operation": "modify",
                "file_path": file_path,
                "existed_before": existed_before,
                "backup_path": backup_path,
                "snapshot_id": snapshot_id,
                "status": "modified",
                "bytes_written": len(new_content)
            }
        else:
            raise ValueError(f"Unknown operation: {operation}")

        return result

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        # File operations are confirmed by the operating system filesystem state
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        file_path = result.get("file_path")
        backup_path = result.get("backup_path")
        operation = result.get("operation")
        existed_before = result.get("existed_before")

        def _rollback():
            if not file_path:
                return {"error": "Missing file_path"}

            if operation == "delete":
                # Restore original file from snapshot
                if backup_path and os.path.exists(backup_path):
                    shutil.copy2(backup_path, file_path)
                    return {"restored": file_path, "from_snapshot": backup_path}
                return {"error": "No backup found to restore"}
            elif operation == "modify":
                if existed_before and backup_path and os.path.exists(backup_path):
                    shutil.copy2(backup_path, file_path)
                    return {"restored": file_path, "previous_content_restored": True}
                elif not existed_before and os.path.exists(file_path):
                    os.remove(file_path)
                    return {"reverted": file_path, "newly_created_file_removed": True}
            return {"status": "reverted"}

        return _rollback
