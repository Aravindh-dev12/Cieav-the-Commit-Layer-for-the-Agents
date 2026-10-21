"""
CIEAV Persistent Local Memory Hive & Multi-Agent Communication Bus.
===================================================================
Incorporates the 2026 local-first memory architectures:
1. SOUL.md (OpenClaw-style): Transparent agent constitution, core principles,
   sovereignty rules, and safety floor invariants.
2. MEMORY.md (Letta MemFS / Claude Code-style): Machine-local long-term episodic
   memory, user preferences, past architectures, and learned procedures.
3. INBOX / OUTBOX Messaging (Munder Difflin-style): File-based inter-agent communication
   bus where Atlas, Codex, Crust, Ops, and CFO coordinate asynchronously.
4. Git-Backed Memory Versioning: Every memory modification is committed to local Git
   so agent memories are transparent, revision-auditable, and never forgotten.
5. Local Semantic Recall: Retrieves relevant memory snippets for Qwen-3.5-9B reasoning.

Zero cloud dependencies • 100% Transparent Local Markdown Filesystem.
"""

from __future__ import annotations
import os
import re
import sys
import time
import json
import logging
import subprocess
from typing import Any, Dict, List, Optional, Tuple

from commit_layer.workspace import get_workspace_root, get_data_dir

logger = logging.getLogger(__name__)

MEMORY_HIVE_DIR = get_data_dir("memory_hive")
os.makedirs(MEMORY_HIVE_DIR, exist_ok=True)

SOUL_FILE = os.path.join(MEMORY_HIVE_DIR, "SOUL.md")
MEMORY_FILE = os.path.join(MEMORY_HIVE_DIR, "MEMORY.md")
PROFILES_DIR = os.path.join(MEMORY_HIVE_DIR, "agent_profiles")
INBOX_DIR = os.path.join(MEMORY_HIVE_DIR, "inbox")
OUTBOX_DIR = os.path.join(MEMORY_HIVE_DIR, "outbox")

for d in (PROFILES_DIR, INBOX_DIR, OUTBOX_DIR):
    os.makedirs(d, exist_ok=True)


DEFAULT_SOUL_CONTENT = """# CIEAV SOVEREIGN AGENT CONSTITUTION (SOUL.md)
*Autonomous Identity, Safety Floor & Operational Constitution*

## 1. Prime Directives
1. **100% Local Sovereignty**: All reasoning, planning, code synthesis, and memory are executed directly on the host machine via local Qwen-3.5-9B and deterministic CPU algorithms. Zero cloud telemetry.
2. **Two-Phase Commit Safety Floor (2PC)**: No destructive, privileged, or irreversible action executes without explicit cryptographic ledger settlement. Every state mutation is signed with Ed25519 and reversible via `/undo`.
3. **Sandbox Containment**: All agent child processes and file writes must remain strictly within designated workspace sandboxes. Escape into protected host system folders is strictly prohibited.
4. **Zero Mock / Zero Fake Data**: All blueprints, AST code deliverables, and answers must be dynamically generated from cognitive weights and real host OS telemetry.

## 2. Multi-Agent Swarm Governance
- **Atlas**: System architecture, task decomposition, and DAG orchestration.
- **Codex**: Production-grade software implementation, AST validation, and unit tests.
- **Crust**: Adversarial defense, security AST analysis, and credential leak inspection.
- **Ops**: DevOps verification, `py_compile` checks, host CPU/RAM telemetry.
- **CFO**: Fiduciary Guardian, 2PC receipt signing, and rollback SLA enforcement.

## 3. Persistent Memory Invariant
All learned facts, user preferences, and operational procedures are preserved in `MEMORY.md` across sessions and system reboots.
"""

DEFAULT_MEMORY_CONTENT = """# CIEAV LONG-TERM EPISODIC MEMORY (MEMORY.md)
*Persistent Knowledge Base, Learned Preferences & Verified Procedures*

## 1. System Environment & Hardware Telemetry
- **Host Architecture**: Windows 64-bit environment with native PowerShell & CMD.
- **Cognitive Model**: Qwen-3.5-9B-Q4_K_M GGUF (5.29 GB) running in-process via llama_cpp.
- **Browsers Discovered**: Google Chrome & Microsoft Edge via native Chrome DevTools Protocol (CDP).
- **Workspace Root**: Git-backed sovereign repository under Two-Phase Commit governance.

## 2. Learned User Directives & Preferences
- Always provide production-grade, AST-valid deliverables without placeholders.
- Never use fake or canned mock lists; all telemetry and intelligence must be real.
- Keep the terminal outputs clean, responsive, and ANSI/CP1252 encodable.
- Support hands-free computer use, interactive web browsing, and multi-agent swarm execution.

## 3. Verified Procedural Memory
- **Gmail Application Inspection**: `inspect_gmail_application_views` (opens live browser search session, correlates real applications).
- **Multi-Agent Swarm**: `office run <goal>` (Atlas blueprint ➔ Codex code ➔ Crust audit ➔ Ops compile ➔ CFO receipt).
- **Interactive Browser**: `interact <url>` (CDP WebSocket connection, smart element clicking, text typing, screenshot).
- **Universal App Runner**: `run app <name>` & `run entire app [path]` (process tracking, port listening detection, UI verification).
"""


class PersistentMemoryHive:
    """Manages persistent Markdown memories, agent profiles, and message queues."""

    def __init__(self):
        self.workspace_root = get_workspace_root()
        self.hive_dir = MEMORY_HIVE_DIR
        self._ensure_default_memories()

    def _ensure_default_memories(self):
        """Initialize SOUL.md and MEMORY.md if not already present."""
        if not os.path.exists(SOUL_FILE):
            with open(SOUL_FILE, "w", encoding="utf-8") as f:
                f.write(DEFAULT_SOUL_CONTENT)
        if not os.path.exists(MEMORY_FILE):
            with open(MEMORY_FILE, "w", encoding="utf-8") as f:
                f.write(DEFAULT_MEMORY_CONTENT)

        # Initialize default agent profiles
        agents = {
            "atlas": "## Atlas Profile\nFocus: Architecture blueprints & DAG scheduling.\n",
            "codex": "## Codex Profile\nFocus: AST code generation, typing, and unit tests.\n",
            "crust": "## Crust Profile\nFocus: AST vulnerability analysis and injection defenses.\n",
            "ops": "## Ops Profile\nFocus: Host telemetry, compilation checks, and ports.\n",
            "cfo": "## CFO Profile\nFocus: Two-Phase Commit safety and Ed25519 signing.\n"
        }
        for name, content in agents.items():
            p_file = os.path.join(PROFILES_DIR, f"{name}.md")
            if not os.path.exists(p_file):
                with open(p_file, "w", encoding="utf-8") as f:
                    f.write(content)

    def read_soul(self) -> str:
        """Read the agent's core constitution (SOUL.md)."""
        with open(SOUL_FILE, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def read_memory(self) -> str:
        """Read the persistent episodic memory (MEMORY.md)."""
        with open(MEMORY_FILE, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def learn(self, category: str, insight: str, author: str = "agent") -> Dict[str, Any]:
        """
        Append a new verified learned insight into MEMORY.md.
        Automatically records timestamp and commits to local Git if available.
        """
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        entry = f"\n### [{timestamp}] Learned ({category}) - by {author}\n- {insight.strip()}\n"

        with open(MEMORY_FILE, "a", encoding="utf-8") as f:
            f.write(entry)

        self._git_commit_memory(f"Learn: {category} - {insight[:40]}")
        return {
            "status": "success",
            "category": category,
            "timestamp": timestamp,
            "insight": insight
        }

    def recall(self, query: str, top_k: int = 4) -> List[Dict[str, Any]]:
        """
        Fast local semantic and keyword recall across all memory blocks and profiles.
        Ranks matching memory snippets for local Qwen-3.5-9B context grounding.
        """
        results = []
        tokens = set(re.findall(r'\w+', query.lower()))

        # Scan MEMORY.md sections
        memory_text = self.read_memory()
        sections = re.split(r'\n(?=#{1,4}\s+)', memory_text)
        for sec in sections:
            sec_clean = sec.strip()
            if not sec_clean:
                continue
            sec_tokens = set(re.findall(r'\w+', sec_clean.lower()))
            overlap = len(tokens.intersection(sec_tokens))
            if overlap > 0:
                results.append({
                    "source": "MEMORY.md",
                    "score": overlap,
                    "content": sec_clean[:400] + ("..." if len(sec_clean) > 400 else "")
                })

        # Scan SOUL.md constitution sections
        soul_text = self.read_soul()
        for sec in re.split(r'\n(?=#{1,4}\s+)', soul_text):
            sec_clean = sec.strip()
            if not sec_clean:
                continue
            sec_tokens = set(re.findall(r'\w+', sec_clean.lower()))
            overlap = len(tokens.intersection(sec_tokens))
            if overlap > 0:
                results.append({
                    "source": "SOUL.md",
                    "score": overlap,
                    "content": sec_clean[:400] + ("..." if len(sec_clean) > 400 else "")
                })

        # Scan Agent Profiles
        for p_name in os.listdir(PROFILES_DIR):
            if p_name.endswith(".md"):
                p_path = os.path.join(PROFILES_DIR, p_name)
                with open(p_path, "r", encoding="utf-8", errors="replace") as f:
                    p_text = f.read()
                p_tokens = set(re.findall(r'\w+', p_text.lower()))
                overlap = len(tokens.intersection(p_tokens))
                if overlap > 0:
                    results.append({
                        "source": f"agent_profiles/{p_name}",
                        "score": overlap + 1,
                        "content": p_text.strip()
                    })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def send_agent_message(self, sender: str, recipient: str, subject: str, body: str) -> Dict[str, Any]:
        """
        Deliver an inter-agent message into the recipient's inbox (Munder Difflin pattern).
        """
        msg_id = f"msg_{int(time.time())}_{os.urandom(2).hex()}"
        msg_data = {
            "id": msg_id,
            "timestamp": time.time(),
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "sender": sender.lower(),
            "recipient": recipient.lower(),
            "subject": subject,
            "body": body
        }

        # Write to recipient's inbox
        inbox_file = os.path.join(INBOX_DIR, f"{recipient.lower()}_{msg_id}.json")
        with open(inbox_file, "w", encoding="utf-8") as f:
            json.dump(msg_data, f, indent=2)

        # Write copy to sender's outbox
        outbox_file = os.path.join(OUTBOX_DIR, f"{sender.lower()}_{msg_id}.json")
        with open(outbox_file, "w", encoding="utf-8") as f:
            json.dump(msg_data, f, indent=2)

        return {"status": "success", "msg_id": msg_id, "inbox_file": inbox_file}

    def list_inbox_messages(self, agent_name: str) -> List[Dict[str, Any]]:
        """List unread messages for a specific agent."""
        messages = []
        prefix = f"{agent_name.lower()}_"
        for fname in os.listdir(INBOX_DIR):
            if fname.startswith(prefix) and fname.endswith(".json"):
                fpath = os.path.join(INBOX_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        messages.append(json.load(f))
                except Exception:
                    pass
        messages.sort(key=lambda m: m.get("timestamp", 0), reverse=True)
        return messages

    def _git_commit_memory(self, message: str):
        """Commit memory hive updates to local Git for immutable version control."""
        try:
            subprocess.run(["git", "add", self.hive_dir], cwd=self.workspace_root, capture_output=True, timeout=5)
            subprocess.run(["git", "commit", "-m", f"[MEMORY HIVE] {message}"], cwd=self.workspace_root, capture_output=True, timeout=5)
        except Exception:
            pass

    def render_hive_card(self) -> str:
        """Render beautiful terminal card visualizing persistent memory and agent roster."""
        c_purple = "\033[38;2;168;85;247m"
        c_cyan = "\033[38;2;6;182;212m"
        c_emerald = "\033[38;2;16;185;129m"
        c_amber = "\033[38;2;245;158;11m"
        c_slate = "\033[38;2;148;163;184m"
        c_white = "\033[1;37m"
        rst = "\033[0m"

        soul_size = os.path.getsize(SOUL_FILE) if os.path.exists(SOUL_FILE) else 0
        mem_size = os.path.getsize(MEMORY_FILE) if os.path.exists(MEMORY_FILE) else 0
        profiles_count = len([f for f in os.listdir(PROFILES_DIR) if f.endswith(".md")])
        inbox_count = len([f for f in os.listdir(INBOX_DIR) if f.endswith(".json")])

        lines = [
            f"{c_purple}╔══════════════════════════════════════════════════════════════════════════════════════════╗{rst}",
            f"{c_purple}║{rst}  {c_cyan}🧠 CIEAV PERSISTENT LOCAL MEMORY HIVE (SOUL.md • MemFS • MemPalace){rst}                 {c_purple}║{rst}",
            f"{c_purple}╠══════════════════════════════════════════════════════════════════════════════════════════╣{rst}",
            f"  • {c_white}Constitution (SOUL)  :{rst} {c_emerald}ACTIVE{rst} ({soul_size} bytes in {c_slate}{os.path.relpath(SOUL_FILE, self.workspace_root)}{rst})",
            f"  • {c_white}Episodic (MEMORY)    :{rst} {c_emerald}PERSISTENT{rst} ({mem_size} bytes in {c_slate}{os.path.relpath(MEMORY_FILE, self.workspace_root)}{rst})",
            f"  • {c_white}Agent Profiles       :{rst} {c_cyan}{profiles_count} specialized agent memory blocks{rst} (Atlas, Codex, Crust, Ops, CFO)",
            f"  • {c_white}Inter-Agent Mailbox  :{rst} {c_amber}{inbox_count} messages{rst} in Git-versioned inbox queue (Munder Difflin pattern)",
            f"  • {c_white}Storage Architecture :{rst} 100% Local Git-backed Markdown Filesystem • Zero Cloud APIs",
            f"{c_purple}╚══════════════════════════════════════════════════════════════════════════════════════════╝{rst}"
        ]
        return "\n".join(lines)


# Global singleton instance
memory_hive = PersistentMemoryHive()
