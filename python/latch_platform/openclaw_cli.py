from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import Settings
from .mcp_launcher import _install_id

_RISK = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
_DEFAULT