"""Serverless entrypoint for Vercel deployment."""
from __future__ import annotations
import sys
import os

# Add repo root to sys.path so commit_layer is importable
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from commit_layer.app import app
