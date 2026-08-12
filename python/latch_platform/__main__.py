from __future__ import annotations

import sys

from .approval_cli import main as approval_main
from .cli import main as cli_main
from .mcp_launcher import main as mcp_main


def entrypoint() -> int:
    args=sys.argv[1:]
    if args and args[0]=="mcp": return mcp_main(args[1:])
    if args and args[0]=="approval": return approval_main(args[1:])
    return cli_main(args)


if __name__=="__main__":
    raise SystemExit(entrypoint())
