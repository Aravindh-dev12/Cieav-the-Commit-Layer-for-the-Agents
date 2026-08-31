from __future__ import annotations

import sys
from pathlib import Path


def bootstrap_repo_pythonpath() -> Path:
    root = Path(__file__).resolve().parents[1]
    python_dir = root / "python"
    for entry in (str(root), str(python_dir)):
        if entry not in sys.path:
            sys.path.insert(0, entry)
    return root
