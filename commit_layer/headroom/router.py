"""ContentRouter & CacheAligner Pipeline for Headroom in Commit Layer.

Inspects incoming content, classifies the modality (JSON, Code, Log, Prose),
applies specialized compression, aligns provider KV cache, and registers with CCR vault.
"""
from __future__ import annotations
import json
import re
from typing import Any, Tuple

from commit_layer.headroom.ccr import vault
from commit_layer.headroom.crusher import crusher
from commit_layer.headroom.code import code_compressor
from commit_layer.headroom.log import log_compressor


class ContentRouter:
    """Modality-aware router that applies targeted compression and cache alignment."""

    def detect_modality(self, content: Any) -> str:
        """Classify payload as JSON, CODE, LOG, or PROSE."""
        if isinstance(content, (dict, list)):
            return "JSON"

        text = str(content).strip()
        if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
            try:
                json.loads(text)
                return "JSON"
            except Exception:
                pass

        if re.search(r'\b(def\s+\w+|class\s+\w+|import\s+\w+|from\s+\w+\s+import|function\s+\w+|interface\s+\w+)\b', text):
            return "CODE"

        if (
            "\x1b[" in text
            or "Traceback (most recent call last)" in text
            or re.search(r'\b(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL|LOG)\b', text)
            or (text.count("\n") > 5 and len(text.splitlines()) > 4)
        ):
            return "LOG"

        return "PROSE"

    def align_cache(self, text: str) -> str:
        """Stabilize volatile dynamic tokens (timestamps, request IDs) to increase KV cache hits."""
        # Replace variable microsecond timestamps with normalized token
        stabilized = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?', '<TIMESTAMP>', text)
        return stabilized

    def transform(self, raw: Any, min_bytes_to_compress: int = 40) -> Tuple[str, str, float]:
        """
        Compress raw content through specialized pipeline and register in CCR vault.
        Returns: (compressed_text, chunk_id, savings_percentage)
        """
        raw_str = raw if isinstance(raw, str) else json.dumps(raw, indent=2)
        raw_len = len(raw_str.encode('utf-8'))

        modality = self.detect_modality(raw)
        chunk_id = vault.store(raw_str, content_type=modality)

        # Skip compression if already tiny
        if raw_len < min_bytes_to_compress:
            vault.record_compressed_size(raw_len)
            return raw_str, chunk_id, 0.0

        if modality == "JSON":
            compressed_body = crusher.compress(raw)
        elif modality == "CODE":
            compressed_body = code_compressor.compress(raw_str)
        elif modality == "LOG":
            compressed_body = log_compressor.compress(raw_str)
        else:
            aligned = self.align_cache(raw_str)
            compressed_body = re.sub(r'\n{3,}', '\n\n', aligned)

        comp_len = len(compressed_body.encode('utf-8'))

        # Only apply compressed format if it actually reduced byte count
        if comp_len < raw_len:
            savings_pct = max(0.0, round(((raw_len - comp_len) / raw_len) * 100.0, 1))
            footer = f"\n[Headroom CCR: {chunk_id} | {savings_pct}% tokens saved | Call headroom_retrieve('{chunk_id}') if full text needed]"
            final_text = compressed_body + footer
            final_len = len(final_text.encode('utf-8'))
            vault.record_compressed_size(final_len)
            return final_text, chunk_id, savings_pct
        else:
            vault.record_compressed_size(raw_len)
            return raw_str, chunk_id, 0.0



# Singleton instance
router = ContentRouter()


def compress(content: Any) -> Tuple[str, str, float]:
    """Convenience functional export for Headroom compression."""
    return router.transform(content)


def retrieve(chunk_id: str) -> str | None:
    """Convenience functional export for Headroom retrieval."""
    return vault.retrieve(chunk_id)
