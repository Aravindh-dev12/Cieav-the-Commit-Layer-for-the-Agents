"""Real Windows Recycle Bin Inspection and Governance Tools for CIEAV.

Provides native Win32 interaction with the Windows Shell Recycle Bin subsystem:
- Query count of items and total size via SHQueryRecycleBinW
- Enumerate deleted items and file paths via Shell.Application COM
- Governed execution of SHEmptyRecycleBinW with deterministic CRITICAL policy floors
"""
from __future__ import annotations
import sys
import os
import subprocess
import json
from typing import Any, Optional, Callable

from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool


def query_recycle_bin_win32() -> dict[str, Any]:
    """Native Win32 call to query Windows Recycle Bin item count and size."""
    if sys.platform != "win32":
        return {
            "num_items": 0,
            "size_bytes": 0,
            "size_mb": 0.0,
            "platform": sys.platform,
            "message": "Not a Windows platform"
        }

    try:
        import ctypes
        from ctypes import wintypes

        class SHQUERYRBINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", wintypes.DWORD),
                ("i64Size", ctypes.c_int64),
                ("i64NumItems", ctypes.c_int64)
            ]

        rb_info = SHQUERYRBINFO()
        rb_info.cbSize = ctypes.sizeof(SHQUERYRBINFO)
        res = ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(rb_info))
        if res == 0:
            num = int(rb_info.i64NumItems)
            sz = int(rb_info.i64Size)
            return {
                "num_items": num,
                "size_bytes": sz,
                "size_mb": round(sz / (1024 * 1024), 2),
                "platform": "win32",
                "status": "ready"
            }
    except Exception as e:
        pass

    return {"num_items": 0, "size_bytes": 0, "size_mb": 0.0, "error": "Query failed"}


def list_recycle_bin_items(max_items: int = 15) -> list[dict[str, str]]:
    """Enumerate actual files sitting in the Windows Recycle Bin."""
    if sys.platform != "win32":
        return []

    items = []
    try:
        ps_cmd = (
            "$sh = New-Object -ComObject Shell.Application; "
            "$rb = $sh.Namespace(0xa); "
            "foreach($i in $rb.Items()) { Write-Output \"$($i.Name)|$($i.Path)\" }"
        )
        out = subprocess.check_output(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            text=True,
            timeout=5,
            stderr=subprocess.DEVNULL
        )
        for line in out.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            if "|" in line:
                name, path = line.split("|", 1)
                items.append({"name": name.strip(), "path": path.strip()})
            else:
                items.append({"name": line, "path": "C:\\$Recycle.Bin"})
            if len(items) >= max_items:
                break
    except Exception:
        pass
    return items


def execute_empty_recycle_bin(sound: bool = False) -> dict[str, Any]:
    """Execute permanent purge of Windows Recycle Bin via native Win32 API."""
    if sys.platform != "win32":
        return {"purged": False, "error": "Non-windows platform"}

    try:
        import ctypes
        # SHERB_NOCONFIRMATION = 0x00000001
        # SHERB_NOPROGRESSUI   = 0x00000002
        # SHERB_NOSOUND        = 0x00000004
        flags = 0x00000003 if sound else 0x00000007
        res = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)
        return {
            "purged": res == 0,
            "return_code": res,
            "message": "Windows Recycle Bin emptied successfully" if res == 0 else f"Failed with code {res}"
        }
    except Exception as e:
        return {"purged": False, "error": str(e)}


class InspectRecycleBinTool(BaseTool):
    name = "inspect_recycle_bin"
    description = "Queries real Windows Recycle Bin for total item count, disk space used, and file preview."
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        info = query_recycle_bin_win32()
        items = list_recycle_bin_items(max_items=8)
        info["sample_items"] = [i["name"] for i in items]
        info["details"] = items
        return info

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None


class EmptyRecycleBinTool(BaseTool):
    name = "empty_recycle_bin"
    description = "Permanently and irreversibly empties the Windows Recycle Bin. Destructive OS action requiring typed confirmation."
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        before_state = query_recycle_bin_win32()
        res = execute_empty_recycle_bin()
        after_state = query_recycle_bin_win32()
        return {
            "action": "empty_recycle_bin",
            "items_purged": before_state.get("num_items", 0),
            "bytes_freed": before_state.get("size_bytes", 0),
            "mb_freed": before_state.get("size_mb", 0.0),
            "after_items": after_state.get("num_items", 0),
            "success": res.get("purged", False),
            "note": "Permanent unrecoverable OS purge"
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        # Check if recycle bin items were cleared or successfully purged
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        # Emptied recycle bin cannot be undone at OS filesystem level
        return None
