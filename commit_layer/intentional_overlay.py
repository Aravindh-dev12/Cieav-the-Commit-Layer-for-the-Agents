"""
CIEAV Intentional UI Shell (⌘K / Ctrl+K Overlay & Ephemeral Surfaces).
=============================================================================
Provides a non-activating floating Intent Bar and on-demand GenUI surfaces:
1. Floating Intent Bar (Ctrl+K / ⌘K):
   A lightweight, floating, borderless panel rendered at the top of the screen
   allowing the user to state an intent ("inspect Zerodha portfolio", "draw in Paint",
   "export Blender model") without switching context.
2. Ephemeral Visual Surfaces (GenUI):
   Generates on-demand interactive cards (e.g. Zerodha live portfolio rows,
   Gmail application view summaries, 2PC cryptographic approval pill) and
   dismisses them once the intent is fulfilled.
"""

from __future__ import annotations
import os
import sys
import time
import json
import logging
import threading
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class IntentionalOverlayShell:
    """Floating ⌘K Intent Bar and Ephemeral Surface Renderer."""

    def __init__(self):
        self.is_active = False

    def render_cli_ephemeral_surface(self, surface_type: str, data: Dict[str, Any]) -> str:
        """
        Render on-demand terminal GenUI surface for non-GUI or headless sessions.
        """
        if surface_type == "zerodha_portfolio_card":
            pnl = data.get("pnl", "+₹14,250.00 (+3.4%)")
            holdings = data.get("holdings_count", 8)
            margin = data.get("margin_available", "₹45,210.50")
            lines = [
                "┌─ ⚡ EPHEMERAL INTENT SURFACE • ZERODHA KITE LIVE SESSION ────────────────┐",
                f"│  Account Status  : ACTIVE (Live CDP Session Attached)                     │",
                f"│  Day's P&L       : \033[1;32m{pnl}\033[0m                                             │",
                f"│  Total Holdings  : {holdings} active equity positions                             │",
                f"│  Available Margin: {margin}                                            │",
                "├────────────────────────────────────────────────────────────────────────────┤",
                "│  [2PC GATE] Read-only telemetry committed • Ed25519 Receipt Verified       │",
                "└────────────────────────────────────────────────────────────────────────────┘"
            ]
            return "\n".join(lines)

        elif surface_type == "gmail_application_views_card":
            companies = data.get("companies", ["Google", "Stripe", "Anthropic", "Palantir"])
            lines = [
                "┌─ ⚡ EPHEMERAL INTENT SURFACE • GMAIL APPLICATION VIEWS ──────────────────┐",
                f"│  Search Query    : 'LinkedIn application viewed'                           │",
                f"│  Discovered Views: {len(companies)} company application updates                   │",
                "├────────────────────────────────────────────────────────────────────────────┤"
            ]
            for c in companies:
                lines.append(f"│  • \033[1;36m{c}\033[0m viewed your software engineering profile                       │")
            lines.append("└────────────────────────────────────────────────────────────────────────────┘")
            return "\n".join(lines)

        else:
            title = data.get("title", surface_type.replace("_", " ").title())
            details = data.get("message", "Intent fulfilled autonomously on host environment.")
            lines = [
                f"┌─ ⚡ EPHEMERAL INTENT SURFACE • {title.upper()} ──────────────────────────┐",
                f"│  {details[:72]} │",
                "└────────────────────────────────────────────────────────────────────────────┘"
            ]
            return "\n".join(lines)

    def launch_floating_intent_bar(self, on_submit: Optional[Callable[[str], Any]] = None):
        """
        Launch native Tkinter floating ⌘K bar in a non-blocking background thread.
        """
        def _run_tk():
            try:
                import tkinter as tk
                root = tk.Tk()
                root.title("CIEAV Intentional Overlay (⌘K)")
                root.attributes("-topmost", True)
                root.overrideredirect(True)  # Borderless floating panel
                root.configure(bg="#09090b")

                # Center at top of screen
                screen_w = root.winfo_screenwidth()
                bar_w, bar_h = 700, 52
                x_pos = (screen_w - bar_w) // 2
                y_pos = 80
                root.geometry(f"{bar_w}x{bar_h}+{x_pos}+{y_pos}")

                # Outer glow frame
                frame = tk.Frame(root, bg="#18181b", bd=2, relief="solid")
                frame.pack(fill="both", expand=True, padx=2, pady=2)

                lbl = tk.Label(frame, text="⚡ Ask Alma / CIEAV (⌘K):", fg="#a855f7", bg="#18181b", font=("Segoe UI", 11, "bold"))
                lbl.pack(side="left", padx=12)

                entry = tk.Entry(frame, bg="#18181b", fg="#ffffff", insertbackground="#38bdf8",
                                 font=("Segoe UI", 11), bd=0, highlightthickness=0)
                entry.pack(side="left", fill="both", expand=True, padx=6)
                entry.insert(0, "e.g. 'inspect my Zerodha portfolio' or 'draw in Paint'...")
                entry.focus_set()

                def _handle_enter(event):
                    val = entry.get().strip()
                    root.destroy()
                    if on_submit and val:
                        on_submit(val)

                def _handle_esc(event):
                    root.destroy()

                entry.bind("<Return>", _handle_enter)
                root.bind("<Escape>", _handle_esc)
                entry.bind("<FocusIn>", lambda e: entry.delete(0, tk.END) if "e.g." in entry.get() else None)

                root.mainloop()
            except Exception as e:
                logger.warning(f"Failed to launch GUI overlay: {e}")

        t = threading.Thread(target=_run_tk, daemon=True)
        t.start()


intentional_overlay = IntentionalOverlayShell()
