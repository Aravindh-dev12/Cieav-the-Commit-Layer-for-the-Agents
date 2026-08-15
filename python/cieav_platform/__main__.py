from __future__ import annotations

import sys

if __package__:
    from .a2a_launcher import main as a2a_main
    from .approval_cli import main as approval_main
    from .cli import main as cli_main
    from .companion_cli import main as companion_main
    from .lab_cli import main as lab_main
    from .mcp_launcher import main as mcp_main
    from .proof_cli import main as proof_main
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
    from cieav_platform.proof_cli import main as proof_main


def entrypoint() -> int:
    args=sys.argv[1:]
    if args and args[0]=="mcp": return mcp_main(args[1:])
    if args and args[0]=="a2a": return a2a_main(args[1:])
    if args and args[0]=="companion": return companion_main(args[1:])
    if args and args[0] in {"lab","action-lab"}: return lab_main(args[1:])
    if args and args[0]=="approval": return approval_main(args[1:])
    if args and args[0]=="proof": return proof_main(args[1:])
    return cli_main(args)


if __name__=="__main__":
    raise SystemExit(entrypoint())
