"""
CIEAV Web Intelligence & Live Grounding Subsystem (0% Cloud LLM APIs).
=====================================================================
Provides real-time grounding, encyclopedia lookups, and native web retrieval
so local agents (like Qwen-3.5-9B) stay up-to-date with live ground truth.
"""
from __future__ import annotations
import os
import re
import json
import urllib.request
import urllib.parse
from typing import Any, Dict, List, Optional

from commit_layer.local_browser import local_browser


class WebIntelligenceEngine:
    """Live web lookup and grounding engine for autonomous agents."""

    USER_AGENT = "CIEAV-Autonomous-Agent/2.0 (Local In-Process AI Runtime)"

    @classmethod
    def lookup_encyclopedia(cls, topic: str) -> Optional[Dict[str, str]]:
        """Fetch verified encyclopedia summary via open Wikipedia REST API."""
        clean_topic = re.sub(r'^(?:what\s+is|who\s+is|define|explain|tell\s+me\s+about)\s+', '', topic, flags=re.IGNORECASE).rstrip('?').strip()
        encoded = urllib.parse.quote(clean_topic.replace(' ', '_'))
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
        req = urllib.request.Request(url, headers={"User-Agent": cls.USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "extract" in data and data.get("type") != "disambiguation":
                    return {
                        "title": data.get("title", clean_topic),
                        "extract": data.get("extract", ""),
                        "url": data.get("content_urls", {}).get("desktop", {}).get("page", url),
                        "source": "Wikipedia Verified Knowledge Base"
                    }
        except Exception:
            pass

        # Fallback to search endpoint
        try:
            search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(clean_topic)}&format=json"
            req2 = urllib.request.Request(search_url, headers={"User-Agent": cls.USER_AGENT})
            with urllib.request.urlopen(req2, timeout=5) as resp2:
                sdata = json.loads(resp2.read().decode("utf-8"))
                search_results = sdata.get("query", {}).get("search", [])
                if search_results:
                    top = search_results[0]
                    clean_snippet = re.sub(r'<.*?>', '', top.get("snippet", ""))
                    return {
                        "title": top.get("title", clean_topic),
                        "extract": clean_snippet,
                        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(top.get('title', ''))}",
                        "source": "Wikipedia Search API"
                    }
        except Exception:
            pass

        return None

    @classmethod
    def browse_live_url(cls, url: str) -> Dict[str, Any]:
        """Fetch live DOM text using native host browser (Microsoft Edge / Google Chrome)."""
        if not local_browser.is_available():
            return {"status": "error", "message": "Native browser not found on host"}
        return local_browser.dump_dom(url)

    @classmethod
    def ground_query(cls, query: str) -> Optional[str]:
        """Attempt to ground an informational query with live encyclopedia facts."""
        result = cls.lookup_encyclopedia(query)
        if result and result.get("extract"):
            return (
                f"[LIVE ENCYCLOPEDIA GROUNDING: {result['title']}]\n"
                f"Source: {result['source']} ({result['url']})\n"
                f"Fact: {result['extract']}"
            )
        return None


# Global singleton instance
web_intel = WebIntelligenceEngine()
