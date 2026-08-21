from __future__ import annotations

from pathlib import Path

try:
    source_root = Path(__file__).resolve().parents[2]
    pyproject = source_root / "pyproject.toml"
    if pyproject.is_file():
        import tomllib
        __version__ = tomllib.loads(pyproject.read_text("utf-8"))["project"]["version"]
    else:
        from importlib.metadata import version
        __version__ = version("cieav-platform")
except Exception:
    __version__ = "0.8.0"

__all__ = ["__version__"]
