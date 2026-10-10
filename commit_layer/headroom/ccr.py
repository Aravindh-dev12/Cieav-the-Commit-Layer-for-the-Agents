"""Compress-Cache-Retrieve (CCR) Vault for Headroom in Commit Layer.

Stores original full-fidelity payloads in content-addressable storage,
providing a unique chunk ID. Allows the agent or auditor to retrieve
100% of the raw uncompressed text on-demand while giving LLMs ultra-lean context.
"""
from __future__ import annotations
import os
import hashlib
import time
from typing import Any, Optional


class CCRVault:
    def __init__(self, cache_dir: Optional[str] = None):
        self.cache_dir = cache_dir or os.path.join(os.path.dirname(__file__), ".ccr_cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self._memory_store: dict[str, dict[str, Any]] = {}
        self.stats = {
            "total_raw_bytes": 0,
            "total_compressed_bytes": 0,
            "chunks_stored": 0,
            "chunks_retrieved": 0,
        }

    def store(self, raw_content: str, content_type: str = "auto") -> str:
        """Store raw content in the CCR vault and return a unique chunk ID."""
        if not isinstance(raw_content, str):
            raw_content = str(raw_content)

        digest = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()[:12]
        chunk_id = f"ccr_{digest}"
        raw_bytes = len(raw_content.encode("utf-8"))

        entry = {
            "chunk_id": chunk_id,
            "content_type": content_type,
            "timestamp": time.time(),
            "raw_bytes": raw_bytes,
            "content": raw_content,
        }

        self._memory_store[chunk_id] = entry
        self.stats["total_raw_bytes"] += raw_bytes
        self.stats["chunks_stored"] += 1

        # Optionally persist to disk
        try:
            file_path = os.path.join(self.cache_dir, f"{chunk_id}.txt")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(raw_content)
        except Exception:
            pass

        return chunk_id

    def record_compressed_size(self, compressed_bytes: int):
        """Record compressed size for token reduction analytics."""
        self.stats["total_compressed_bytes"] += compressed_bytes

    def retrieve(self, chunk_id: str) -> Optional[str]:
        """Retrieve original raw uncompressed content by chunk ID."""
        self.stats["chunks_retrieved"] += 1

        # Check memory
        if chunk_id in self._memory_store:
            return self._memory_store[chunk_id]["content"]

        # Check disk
        file_path = os.path.join(self.cache_dir, f"{chunk_id}.txt")
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    self._memory_store[chunk_id] = {
                        "chunk_id": chunk_id,
                        "content_type": "auto",
                        "timestamp": time.time(),
                        "raw_bytes": len(content.encode("utf-8")),
                        "content": content,
                    }
                    return content
            except Exception:
                pass

        return None

    def get_stats(self) -> dict[str, Any]:
        """Calculate overall token and byte savings metrics."""
        raw = self.stats["total_raw_bytes"]
        comp = self.stats["total_compressed_bytes"]
        saved_bytes = max(0, raw - comp)
        savings_pct = (saved_bytes / raw * 100.0) if raw > 0 else 0.0

        # Rough token approximation (~4 chars/token)
        raw_tokens = raw // 4
        comp_tokens = comp // 4
        saved_tokens = max(0, raw_tokens - comp_tokens)

        return {
            "total_raw_bytes": raw,
            "total_compressed_bytes": comp,
            "saved_bytes": saved_bytes,
            "savings_pct": round(savings_pct, 1),
            "approx_raw_tokens": raw_tokens,
            "approx_compressed_tokens": comp_tokens,
            "approx_saved_tokens": saved_tokens,
            "chunks_stored": self.stats["chunks_stored"],
            "chunks_retrieved": self.stats["chunks_retrieved"],
        }

    def reset(self):
        """Reset vault memory and stats for hermetic testing."""
        self._memory_store.clear()
        self.stats = {
            "total_raw_bytes": 0,
            "total_compressed_bytes": 0,
            "chunks_stored": 0,
            "chunks_retrieved": 0,
        }


# Global singleton instance
vault = CCRVault()
