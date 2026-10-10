"""Headroom Context Optimization and Compression Layer for CIEAV Commit Layer.

Token-reducing, context-optimizing middleware for AI agents operating across
all consequential domains (Software, Code, Hardware TPM, Finance, Permissions).
"""
from __future__ import annotations

from commit_layer.headroom.ccr import vault, CCRVault
from commit_layer.headroom.crusher import crusher, SmartCrusher
from commit_layer.headroom.code import code_compressor, CodeCompressor
from commit_layer.headroom.log import log_compressor, LogCompressor
from commit_layer.headroom.router import router, ContentRouter, compress, retrieve
from commit_layer.headroom.mcp import HEADROOM_MCP_TOOLS, handle_mcp_call
from commit_layer.headroom.proxy import optimize_messages

__all__ = [
    "vault",
    "CCRVault",
    "crusher",
    "SmartCrusher",
    "code_compressor",
    "CodeCompressor",
    "log_compressor",
    "LogCompressor",
    "router",
    "ContentRouter",
    "compress",
    "retrieve",
    "HEADROOM_MCP_TOOLS",
    "handle_mcp_call",
    "optimize_messages",
]
