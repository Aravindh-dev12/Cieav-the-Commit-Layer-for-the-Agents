"""Headroom MCP (Model Context Protocol) Server for Commit Layer.

Exposes context optimization, compression, and CCR retrieval as standard
MCP tools compatible with Claude Code, Cursor, Copilot, and custom agents.
"""
from __future__ import annotations
from typing import Any
from commit_layer.headroom.router import compress, retrieve
from commit_layer.headroom.ccr import vault

HEADROOM_MCP_TOOLS = [
    {
        "name": "headroom_compress",
        "description": "Compress large tool outputs, code files, or logs by 60-95% before adding to agent context. Stores full original in CCR vault.",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "Raw uncompressed text or JSON content to optimize"},
                "modality": {"type": "string", "enum": ["auto", "JSON", "CODE", "LOG", "PROSE"], "default": "auto"}
            },
            "required": ["content"]
        }
    },
    {
        "name": "headroom_retrieve",
        "description": "Retrieve 100% of the raw, uncompressed text for a previously compressed Headroom CCR chunk ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "chunk_id": {"type": "string", "description": "The CCR chunk ID (e.g., 'ccr_9fa3b1c2')"}
            },
            "required": ["chunk_id"]
        }
    },
    {
        "name": "headroom_stats",
        "description": "Get real-time token reduction analytics and byte savings across all compressed sessions.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]


def handle_mcp_call(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute an MCP tool call against Headroom engine."""
    if tool_name == "headroom_compress":
        content = arguments.get("content", "")
        compressed_text, chunk_id, savings = compress(content)
        return {
            "compressed_content": compressed_text,
            "chunk_id": chunk_id,
            "token_savings_pct": savings,
            "retrievable": True
        }

    elif tool_name == "headroom_retrieve":
        chunk_id = arguments.get("chunk_id", "")
        raw = retrieve(chunk_id)
        if raw is None:
            return {"error": f"Chunk '{chunk_id}' not found in Headroom CCR vault"}
        return {
            "chunk_id": chunk_id,
            "raw_content": raw,
            "status": "RESTORED"
        }

    elif tool_name == "headroom_stats":
        return vault.get_stats()

    return {"error": f"Unknown Headroom tool: {tool_name}"}
