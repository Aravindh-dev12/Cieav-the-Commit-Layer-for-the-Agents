"""
CIEAV Personalized Notes & Knowledge Base Manager.
===================================================
Allows users to create, search, summarize, and manage markdown notes
locally on disk under the CIEAV Commit Layer.
All note mutations are tracked, snapshotted, and reversible via /undo.
"""

from __future__ import annotations
import os
import re
import time
import uuid
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

NOTES_DIR = os.path.join(os.getcwd(), "personal_notes")


def _ensure_notes_dir():
    os.makedirs(NOTES_DIR, exist_ok=True)


class NotesManager:
    """Personalized markdown notes and knowledge vault controller."""

    def __init__(self):
        _ensure_notes_dir()

    def take_note(self, content: str, title: Optional[str] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """Create and save a new personalized note."""
        _ensure_notes_dir()
        timestamp = time.time()
        date_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))
        slug_date = time.strftime("%Y%m%d_%H%M%S", time.localtime(timestamp))
        
        # Derive title if not provided
        if not title:
            first_line = content.strip().split("\n")[0][:40]
            clean_title = re.sub(r'[^a-zA-Z0-9_\-\s]', '', first_line).strip()
            title = clean_title or f"Note_{slug_date}"

        safe_slug = re.sub(r'[\s_]+', '_', title.lower())[:30]
        filename = f"{slug_date}_{safe_slug}.md"
        filepath = os.path.join(NOTES_DIR, filename)

        tags_str = ", ".join(tags) if tags else "personal, cieav"
        note_body = f"""# {title}
> Created: {date_str} • Tags: [{tags_str}]

{content}
"""

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(note_body)

        return {
            "status": "success",
            "title": title,
            "filename": filename,
            "filepath": filepath,
            "char_count": len(note_body),
            "date": date_str,
            "preview": content[:120] + ("..." if len(content) > 120 else "")
        }

    def list_notes(self) -> List[Dict[str, Any]]:
        """List all saved personal notes with metadata."""
        _ensure_notes_dir()
        notes = []
        for fname in sorted(os.listdir(NOTES_DIR), reverse=True):
            if fname.endswith(".md"):
                fpath = os.path.join(NOTES_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        txt = f.read()
                    lines = txt.split("\n")
                    title = lines[0].replace("#", "").strip() if lines else fname
                    preview = ""
                    for line in lines[2:]:
                        if line.strip() and not line.startswith(">"):
                            preview = line.strip()[:90]
                            break
                    mtime = os.path.getmtime(fpath)
                    notes.append({
                        "filename": fname,
                        "filepath": fpath,
                        "title": title,
                        "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime)),
                        "preview": preview or "No content preview"
                    })
                except Exception as e:
                    logger.warning(f"Error reading note {fname}: {e}")
        return notes

    def search_notes(self, keyword: str) -> List[Dict[str, Any]]:
        """Search across all personal notes for a keyword or regex."""
        all_notes = self.list_notes()
        matches = []
        kw = keyword.lower()
        for n in all_notes:
            fpath = n["filepath"]
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                if kw in content.lower() or kw in n["title"].lower():
                    matches.append(n)
            except Exception:
                pass
        return matches

    def render_cli_notes(self, notes: List[Dict[str, Any]], title_label: str = "Personal Notes Vault") -> str:
        """Format notes into an ANSI terminal card view."""
        c_purple = "\033[38;2;168;85;247m"
        c_cyan = "\033[38;2;6;182;212m"
        c_amber = "\033[38;2;245;158;11m"
        c_green = "\033[38;2;16;185;129m"
        c_white = "\033[1;37m"
        c_slate = "\033[38;2;148;163;184m"
        rst = "\033[0m"

        lines = []
        lines.append(f"\n{c_purple}╔══════════════════════════════════════════════════════════════════════════════╗{rst}")
        lines.append(f"{c_purple}║{rst}  {c_cyan}📝 {title_label.upper()} ({len(notes)} saved notes){rst}                          {c_purple}║{rst}")
        lines.append(f"{c_purple}╠══════════════════════════════════════════════════════════════════════════════╣{rst}")
        lines.append(f"  Storage Location: {c_slate}{NOTES_DIR}{rst}")
        lines.append(f"  Format          : Local Markdown (.md) • 100% Offline • Reversible /undo")
        lines.append(f"{c_purple}╚══════════════════════════════════════════════════════════════════════════════╝{rst}")

        if not notes:
            lines.append(f"\n  {c_slate}No notes found. Create one with: 'note <your thoughts here>'{rst}\n")
            return "\n".join(lines)

        lines.append("")
        for idx, n in enumerate(notes[:8], 1):
            lines.append(f"  {c_amber}[{idx}]{rst} {c_white}{n['title']}{rst} {c_slate}({n['date']}){rst}")
            lines.append(f"      File: {c_slate}{n['filename']}{rst}")
            lines.append(f"      Text: {n['preview']}")
            lines.append("")

        lines.append(f"  {c_slate}Commands: note <text> | search notes <query> | read personal_notes/<filename>{rst}\n")
        return "\n".join(lines)


# Global singleton Notes Manager
notes_manager = NotesManager()


from commit_layer.tools.base import BaseTool, TOOL_REGISTRY
from commit_layer.models import Outcome


class NotesManagerTool(BaseTool):
    """BaseTool registration for governed note taking."""
    name = "take_note"
    description = "Create and store personal markdown notes with rollback backup"
    has_inverse = True

    def execute(self, args: Dict[str, Any]) -> Dict[str, Any]:
        return notes_manager.take_note(
            content=args.get("content", ""),
            title=args.get("title"),
            tags=args.get("tags")
        )

    def observe(self, before: Dict[str, Any], after: Dict[str, Any]) -> Outcome:
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: Dict[str, Any], result: Dict[str, Any]) -> Optional[Any]:
        filepath = result.get("filepath")
        if filepath and os.path.exists(filepath):
            def _rollback():
                try:
                    os.remove(filepath)
                    return {"undone": True, "removed": filepath}
                except Exception as e:
                    return {"undone": False, "error": str(e)}
            return _rollback
        return None

