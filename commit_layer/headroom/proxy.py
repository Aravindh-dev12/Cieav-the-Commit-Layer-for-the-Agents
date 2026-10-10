"""Headroom Local Proxy for Zero-Code-Change Agent Integration.

Intercepts LLM requests (OpenAI / Anthropic format) and automatically compresses
large tool outputs, stack traces, and document blocks before passing to the model.
"""
from __future__ import annotations
import logging
from typing import Any, Dict
from commit_layer.headroom.router import compress

logger = logging.getLogger(__name__)


def optimize_messages(messages: list[Dict[str, Any]]) -> tuple[list[Dict[str, Any]], dict[str, Any]]:
    """
    Scan message history and compress any oversized tool results or assistant dumps.
    Returns: (optimized_messages, summary_stats)
    """
    optimized = []
    total_saved = 0
    compressed_items = 0

    for msg in messages:
        new_msg = dict(msg)
        content = msg.get("content")

        # String content
        if isinstance(content, str) and len(content) > 200:
            comp_text, chunk_id, savings = compress(content)
            if savings > 10.0:
                new_msg["content"] = comp_text
                compressed_items += 1
                total_saved += len(content) - len(comp_text)

        # Anthropic-style content blocks array
        elif isinstance(content, list):
            new_blocks = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    res_content = block.get("content", "")
                    if isinstance(res_content, str) and len(res_content) > 150:
                        comp_res, cid, sav = compress(res_content)
                        new_block = dict(block)
                        new_block["content"] = comp_res
                        new_blocks.append(new_block)
                        compressed_items += 1
                        total_saved += len(res_content) - len(comp_res)
                    else:
                        new_blocks.append(block)
                else:
                    new_blocks.append(block)
            new_msg["content"] = new_blocks

        optimized.append(new_msg)

    return optimized, {
        "compressed_items": compressed_items,
        "bytes_saved": max(0, total_saved),
        "status": "OPTIMIZED"
    }
