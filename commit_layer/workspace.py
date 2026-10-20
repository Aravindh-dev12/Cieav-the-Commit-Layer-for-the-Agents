"""
CIEAV Workspace & Path Resolver.
=================================
Safely resolves working directory roots and prevents PermissionError when
the agent is launched from protected host OS directories (e.g., C:\\WINDOWS\\System32).
"""

from __future__ import annotations
import os
import logging

logger = logging.getLogger(__name__)


def get_workspace_root() -> str:
    """
    Resolve a safe, writable workspace directory.
    If the current working directory is a Windows system folder or unwritable,
    falls back to the CIEAV repo root or user home directory.
    """
    cwd = os.getcwd()
    windir = os.environ.get("WINDIR", r"C:\Windows").lower()
    system_root = os.environ.get("SystemRoot", r"C:\Windows").lower()
    
    is_system_dir = cwd.lower().startswith(windir) or cwd.lower().startswith(system_root)
    if not is_system_dir:
        try:
            test_path = os.path.join(cwd, ".cieav_perm_test")
            with open(test_path, "w") as f:
                f.write("test")
            os.remove(test_path)
            return cwd
        except (PermissionError, OSError):
            pass

    # Fallback to repo root: <repo_root>/commit_layer/workspace.py
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        test_path = os.path.join(repo_root, ".cieav_perm_test")
        with open(test_path, "w") as f:
            f.write("test")
        os.remove(test_path)
        return repo_root
    except (PermissionError, OSError):
        user_home = os.path.join(os.path.expanduser("~"), ".cieav")
        os.makedirs(user_home, exist_ok=True)
        return user_home


def get_data_dir(name: str) -> str:
    """
    Get a safe, guaranteed writable path for a data directory
    (e.g., personal_notes, projects, personal_outbox, personal_messages).
    """
    root = get_workspace_root()
    target = os.path.join(root, name)
    try:
        os.makedirs(target, exist_ok=True)
    except (PermissionError, OSError):
        target = os.path.join(os.path.expanduser("~"), ".cieav", name)
        try:
            os.makedirs(target, exist_ok=True)
        except Exception as e:
            logger.warning(f"Could not create data dir {target}: {e}")
    return target
