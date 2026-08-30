from __future__ import annotations

import sys

from latch_platform.cli import *  # noqa: F401,F403
from latch_platform.cli import main as _legacy_main

from .kernel_cli import main as _kernel_main


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] == "kernel":
        return _kernel_main(args[1:])
    return _legacy_main(args)
