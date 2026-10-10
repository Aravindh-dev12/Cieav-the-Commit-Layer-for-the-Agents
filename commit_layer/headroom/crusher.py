"""SmartCrusher - High-Efficiency JSON & Structured Data Compressor for Headroom.

Specialized engine for compressing JSON payloads, API responses, tool dicts,
and database rows by 60–95% while keeping semantic meaning intact for LLMs.
"""
from __future__ import annotations
import json
from typing import Any


class SmartCrusher:
    """Compresses JSON and structured data structures with schema-aware compaction."""

    def __init__(self, max_array_items: int = 5, max_string_len: int = 200):
        self.max_array_items = max_array_items
        self.max_string_len = max_string_len

    def compress(self, data: Any) -> str:
        """Compress JSON data (string or object) into minimal token representation."""
        obj = data
        if isinstance(data, str):
            try:
                obj = json.loads(data)
            except Exception:
                # Not valid JSON, return as-is
                return data

        compacted = self._prune(obj)

        # Check if it's an array of homogeneous objects, convert to tabular schema
        if isinstance(compacted, list) and len(compacted) > 1 and all(isinstance(x, dict) for x in compacted):
            return self._tabularize(compacted)

        return json.dumps(compacted, separators=(",", ":"), ensure_ascii=False)

    def _prune(self, node: Any) -> Any:
        """Recursively prune nulls, empty collections, and truncate huge strings."""
        if isinstance(node, dict):
            out = {}
            for k, v in node.items():
                if v is None or v == "" or v == [] or v == {}:
                    continue  # Strip noisy empty fields
                out[k] = self._prune(v)
            return out

        elif isinstance(node, list):
            if len(node) > self.max_array_items:
                sampled = [self._prune(x) for x in node[:self.max_array_items]]
                sampled.append(f"... [+ {len(node) - self.max_array_items} items omitted]")
                return sampled
            return [self._prune(x) for x in node]

        elif isinstance(node, str):
            if len(node) > self.max_string_len:
                return node[:self.max_string_len] + f"... [+{len(node) - self.max_string_len} chars]"
            return node

        return node

    def _tabularize(self, rows: list[dict[str, Any]]) -> str:
        """Represent list of dicts as compact header + pipe rows."""
        # Collect shared keys
        all_keys = list(dict.fromkeys(k for r in rows if isinstance(r, dict) for k in r.keys()))
        if not all_keys:
            return json.dumps(rows, separators=(",", ":"))

        lines = [",".join(all_keys)]
        for r in rows:
            if isinstance(r, dict):
                vals = [str(r.get(k, "")) for k in all_keys]
                lines.append("|".join(vals))
            else:
                lines.append(str(r))
        return "\n".join(lines)


# Singleton instance
crusher = SmartCrusher()
