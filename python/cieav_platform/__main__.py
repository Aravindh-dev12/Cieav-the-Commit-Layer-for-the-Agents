from __future__ import annotations

import os
import sys

def _ensure_global_registration() -> None:
    """Silently ensure repository directory and Python Scripts are in persistent User PATH."""
    if os.environ.get("_CIEAV_PATH_VERIFIED"):
        return
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if sys.platform == "win32":
            import winreg
            import ctypes
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_READ | winreg.KEY_WRITE) as key:
                val, _ = winreg.QueryValueEx(key, "Path")
                parts = [p.strip() for p in val.split(";") if p.strip()]
                changed = False
                if project_root not in parts:
                    parts.append(project_root)
                    changed = True
                scripts_dir = os.path.join(sys.prefix, "Scripts")
                if os.path.exists(scripts_dir) and scripts_dir not in parts:
                    parts.append(scripts_dir)
                    changed = True
                if changed:
                    new_val = ";".join(parts)
                    winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_val)
                    HWND_BROADCAST = 0xFFFF
                    WM_SETTINGCHANGE = 0x001A
                    SMTO_ABORTIFHUNG = 0x0002
                    ctypes.windll.user32.SendMessageTimeoutW(
                        HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment", SMTO_ABORTIFHUNG, 200, None
                    )
            os.environ["_CIEAV_PATH_VERIFIED"] = "1"
        elif sys.platform in {"linux", "darwin"}:
            local_bin = os.path.expanduser("~/.local/bin")
            os.makedirs(local_bin, exist_ok=True)
            target = os.path.join(local_bin, "cieav")
            src = os.path.join(project_root, "cieav")
            if not os.path.exists(target) and os.path.exists(src):
                try:
                    os.symlink(src, target)
                except OSError:
                    pass
            os.environ["_CIEAV_PATH_VERIFIED"] = "1"
    except Exception:
        pass


def _get_chat_main():
    if __package__:
        from .chat_cli import main as chat_main
    else:
        from cieav_platform.chat_cli import main as chat_main
    return chat_main


def entrypoint() -> int:
    _ensure_global_registration()
    args = sys.argv[1:]
    if not args:
        return _get_chat_main()([])
    
    first = args[0].lower()
    if first in {"web", "ui", "/web", "dashboard", "console"}:
        import webbrowser
        import urllib.request
        import time
        import subprocess
        
        server_running = False
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=1) as resp:
                server_running = resp.status == 200
        except Exception:
            server_running = False

        if not server_running:
            print("[CIEAV] Starting background local gateway server on http://127.0.0.1:8000...")
            subprocess.Popen([sys.executable, "-m", "uvicorn", "commit_layer.app:app", "--host", "127.0.0.1", "--port", "8000"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1.5)

        print("[CIEAV] Opening Web Console at http://127.0.0.1:8000 ...")
        webbrowser.open("http://127.0.0.1:8000")
        return 0

    if first in {"test", "tests", "/test", "run-tests"}:
        import subprocess
        return subprocess.call([sys.executable, "test_real_world_cieav_live.py"])

    if first in {"chat", "code", "agent"}:
        return _get_chat_main()(args[1:])
    if first in {"/status", "status", "/receipts", "receipts", "/undo", "undo", "/help", "help", "/reset", "reset", "/jobs", "jobs", "/report", "report", "recyclebin", "/recyclebin", "/decide", "decide", "/model", "model", "dots", "/dots", "opendots", "/opendots", "hermes", "/hermes", "instinct", "/instinct"}:
        return _get_chat_main()(args)
    if first == "mcp":
        if __package__:
            from .mcp_launcher import main as mcp_main
        else:
            from cieav_platform.mcp_launcher import main as mcp_main
        return mcp_main(args[1:])
    if first == "a2a":
        if __package__:
            from .a2a_launcher import main as a2a_main
        else:
            from cieav_platform.a2a_launcher import main as a2a_main
        return a2a_main(args[1:])
    if first == "companion":
        if len(args) == 1:
            return _get_chat_main()(["companion"])
        if __package__:
            from .companion_cli import main as companion_main
        else:
            from cieav_platform.companion_cli import main as companion_main
        return companion_main(args[1:])
    if first == "openclaw":
        if __package__:
            from .openclaw_cli import main as openclaw_main
        else:
            from cieav_platform.openclaw_cli import main as openclaw_main
        return openclaw_main(args[1:])
    if first in {"lab", "action-lab"}:
        if __package__:
            from .lab_cli import main as lab_main
        else:
            from cieav_platform.lab_cli import main as lab_main
        return lab_main(args[1:])
    if first == "approval":
        if __package__:
            from .approval_cli import main as approval_main
        else:
            from cieav_platform.approval_cli import main as approval_main
        return approval_main(args[1:])
    if first == "proof":
        if __package__:
            from .proof_cli import main as proof_main
        else:
            from cieav_platform.proof_cli import main as proof_main
        return proof_main(args[1:])
    
    # Check if this is a legacy command (e.g. gateway, doctor, audit)
    legacy_cmds = {"gateway", "cloud", "model", "audit", "doctor", "dashboard", "test-lab"}
    if first in legacy_cmds:
        if __package__:
            from .cli import main as cli_main
        else:
            from cieav_platform.cli import main as cli_main
        return cli_main(args)

    # Any other prompt or natural language instruction routes directly to chat_main
    return _get_chat_main()(args)


if __name__=="__main__":
    raise SystemExit(entrypoint())
