from __future__ import annotations

try:
    from importlib.metadata import version
    __version__ = version("cieav-platform")
except Exception:
    __version__ = "0.8.0"

__all__ = ["__version__"]
