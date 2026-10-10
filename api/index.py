"""Serverless entrypoint for Vercel deployment."""
from __future__ import annotations
import sys
import os

# Add root directory to sys.path so commit_layer is importable
root_dir = os.path.dirname(os.path.abspath(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from commit_layer.app import app
