"""Headroom Context Optimization tools for Commit Layer TOOL_REGISTRY."""
from __future__ import annotations
from typing import Any, Optional, Callable
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer.headroom import compress, retrieve, vault


class HeadroomCompressTool(BaseTool):
    name = "headroom_compress"
    description = "Compress large tool output, code, log, or JSON into compact CCR format"
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        content = str(args.get("content", ""))
        comp_text, chunk_id, savings = compress(content)
        return {
            "compressed_content": comp_text,
            "chunk_id": chunk_id,
            "token_savings_pct": savings,
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None


class HeadroomRetrieveTool(BaseTool):
    name = "headroom_retrieve"
    description = "Retrieve 100% full raw uncompressed content by CCR chunk ID"
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        chunk_id = str(args.get("chunk_id", ""))
        raw = retrieve(chunk_id)
        if raw is None:
            raise ValueError(f"Chunk '{chunk_id}' not found in Headroom CCR vault")
        return {"chunk_id": chunk_id, "raw_content": raw}

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None


class HeadroomStatsTool(BaseTool):
    name = "headroom_stats"
    description = "Get token reduction and byte savings metrics from Headroom"
    has_inverse = False

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        return vault.get_stats()

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None
