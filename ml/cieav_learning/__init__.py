"""CIEAV consequence-learning plane (authority=false)."""

from .providers import PROVIDERS, assert_authority_boundary, list_providers, provider_ids
from .trajectory import KIND, TrajectoryError, build_trajectory, dump_jsonl, load_jsonl, verify_trajectory

__all__ = [
    "KIND",
    "TrajectoryError",
    "build_trajectory",
    "dump_jsonl",
    "load_jsonl",
    "verify_trajectory",
    "PROVIDERS",
    "assert_authority_boundary",
    "list_providers",
    "provider_ids",
]
