from __future__ import annotations

import sys

if __package__:
    from .a2a_launcher import main as a2a_main
    from .approval_cli import main as approval_main
    from .cli import main as cli_main
    from .companion_cli import main as companion_main
    from .lab_cli import main as lab_main
    from .mcp_launcher import main as mcp_main
    from .openclaw_cli import main as openclaw_main
    from .proof_cli import main as proof_main
    from .chat_cli import main as chat_main
else:
    # PyInstaller executes the configured source file as a top-level script.
    # Import through the package namespace so relative imports inside the
    # platform modules retain their package context in the frozen executable.
    from cieav_platform.a2a_launcher import main as a2a_main
    from cieav_platform.approval_cli import main as approval_main
    from cieav_platform.cli import main as cli_main
    from cieav_platform.companion_cli import main as companion_main
    from cieav_platform.lab_cli import main as lab_main
    from cieav_platform.mcp_launcher import main as mcp_main
    from cieav_platform.openclaw_cli import main as openclaw_main
    from cieav_platform.proof_cli import main as proof_main
    from cieav_platform.chat_cli import main as chat_main


def entrypoint() -> int:
    args = sys.argv[1:]
    if not args:
        return chat_main([])
    
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
        return chat_main(args[1:])
    if first in {"/status", "status", "/receipts", "receipts", "/undo", "undo", "/help", "help", "/reset", "reset", "/jobs", "jobs", "/report", "report", "recyclebin", "/recyclebin", "/decide", "decide", "/model", "model"}:
        return chat_main(args)
    if first == "mcp":
        return mcp_main(args[1:])
    if first == "a2a":
        return a2a_main(args[1:])
    if first == "companion":
        return companion_main(args[1:])
    if first == "openclaw":
        return openclaw_main(args[1:])
    if first in {"lab", "action-lab"}:
        return lab_main(args[1:])
    if first == "approval":
        return approval_main(args[1:])
    if first == "proof":
        return proof_main(args[1:])
    
    # Check if this is a legacy command (e.g. gateway, doctor, audit)
    legacy_cmds = {"gateway", "cloud", "model", "audit", "doctor", "dashboard", "test-lab"}
    if first in legacy_cmds:
        return cli_main(args)

    # Any other prompt or natural language instruction routes directly to chat_main
    return chat_main(args)


if __name__=="__main__":
    raise SystemExit(entrypoint())
