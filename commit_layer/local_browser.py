"""
CIEAV Local Browser & OS Window Controller (100% Offline • No Cloud APIs).
==========================================================================
Operates directly on the host machine using native local browser binaries
(Microsoft Edge / Google Chrome) via headless process execution, DOM dumping,
local screenshots, and window control - exactly like Claude Code and Codex.

Zero external APIs, zero cloud keys.
"""

from __future__ import annotations
import os
import re
import subprocess
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Discovered local browser executable candidates on Windows
LOCAL_BROWSER_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]


def get_local_browser_path() -> Optional[str]:
    """Find the native local browser executable on the host machine."""
    for path in LOCAL_BROWSER_PATHS:
        if os.path.exists(path):
            return path
    return None


class LocalBrowserController:
    """Controls the local host browser directly without any cloud APIs."""

    def __init__(self):
        self.browser_path = get_local_browser_path()
        self.browser_name = "Microsoft Edge" if self.browser_path and "msedge" in self.browser_path.lower() else "Google Chrome"

    def is_available(self) -> bool:
        return self.browser_path is not None and os.path.exists(self.browser_path)

    def dump_dom(self, url: str, timeout_sec: int = 8) -> Dict[str, Any]:
        """
        Headlessly execute the local browser to render the page and dump the full DOM.
        100% offline and local, zero API keys.
        """
        if not self.is_available():
            return {"status": "error", "error": "No native browser binary detected on host"}

        if not url.startswith("http://") and not url.startswith("https://") and not url.startswith("file:///"):
            url = f"http://{url}"

        cmd = [
            self.browser_path,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--dump-dom",
            url
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                encoding="utf-8",
                errors="replace"
            )
            raw_html = proc.stdout or ""

            # Extract title and headings locally
            title_match = re.search(r'<title>(.*?)</title>', raw_html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else url

            # Strip script and style tags locally
            clean_text = re.sub(r'<script.*?</script>', '', raw_html, flags=re.DOTALL | re.IGNORECASE)
            clean_text = re.sub(r'<style.*?</style>', '', clean_text, flags=re.DOTALL | re.IGNORECASE)
            clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            return {
                "status": "success",
                "browser": self.browser_name,
                "url": url,
                "title": title,
                "char_count": len(clean_text),
                "text_summary": clean_text[:1200] + ("..." if len(clean_text) > 1200 else "")
            }
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": f"Local browser timed out after {timeout_sec}s"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def capture_screenshot(self, url: str, output_path: str = "screenshot.png", timeout_sec: int = 10) -> Dict[str, Any]:
        """Capture a visual screenshot using the local headless browser."""
        if not self.is_available():
            return {"status": "error", "error": "No native browser binary detected on host"}

        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"http://{url}"

        cmd = [
            self.browser_path,
            "--headless=new",
            "--disable-gpu",
            f"--screenshot={output_path}",
            "--window-size=1280,800",
            url
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=timeout_sec)
            if os.path.exists(output_path):
                size = os.path.getsize(output_path)
                return {
                    "status": "success",
                    "file_path": output_path,
                    "file_size_bytes": size,
                    "browser": self.browser_name
                }
            return {"status": "error", "error": "Screenshot file was not produced"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def open_window(self, url: str) -> Dict[str, Any]:
        """Launch an interactive window of the local browser at the target URL."""
        if not self.is_available():
            import webbrowser
            webbrowser.open(url)
            return {"status": "success", "mode": "system_default", "url": url}

        try:
            subprocess.Popen([self.browser_path, url])
            return {
                "status": "success",
                "browser": self.browser_name,
                "mode": "native_window",
                "url": url
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}


# Global singleton Local Browser Controller
local_browser = LocalBrowserController()
