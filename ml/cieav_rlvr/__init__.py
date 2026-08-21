"""Python-first CIEAV RLVR orchestration.

The Python package owns ML training/orchestration only. Canonical safety and reward
semantics remain in the local Node verifier and this package has no execution authority.
"""

from .verifier import CieavVerifierClient, VerifierError
from .node_runtime import NodeVerifierProcess

__all__ = ["CieavVerifierClient", "VerifierError", "NodeVerifierProcess"]
