"""Canonical CIEAV Python package surface.

The 0.7 compatibility layer delegates to the proven latch_platform implementation so
existing state, imports, and installed upgrades remain stable while all new entrypoints
use the CIEAV product identity.
"""

from latch_platform import __version__

__all__ = ["__version__"]
