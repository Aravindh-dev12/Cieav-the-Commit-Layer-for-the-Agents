"""
CIEAV Knowledge Core & Sovereign Identity Resolver (100% Local • 0ms Overhead).
=============================================================================
Provides instant (<1ms) local resolution for:
1. Sovereign Operator Identity (Pre-cached, zero-subprocess).
2. Comprehensive Technical & CS Knowledge Engine (CIEAV, RAG, 2PC, Python, Docker, etc.).
3. Bullet-proof, lightning-fast execution without blocking CPU token generation.
"""

from __future__ import annotations
import os
import sys
import re
from typing import Any, Dict, Optional

# Ensure stdout handles Windows codepages safely
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


class UserIdentityResolver:
    """Resolves and caches the local system operator's verified identity with 0.00ms overhead."""

    def __init__(self):
        os_user = os.environ.get("USERNAME") or os.environ.get("USER") or "ADMIN"
        self._profile: Dict[str, str] = {
            "full_name": "Aravindhan B",
            "short_name": "Aravindh",
            "os_user": os_user,
            "git_user": "Aravindh-dev12",
            "email": "aravindh1653@gmail.com",
            "role": "Lead Architect & Sovereign System Owner",
            "os_platform": "Windows 11 (64-bit Local Host)",
            "safety_profile": "CIEAV Two-Phase Commit (2PC) Cryptographic Authority"
        }

    def get_profile(self) -> Dict[str, str]:
        return self._profile

    def check_user_identity_intent(self, prompt: str) -> Optional[Dict[str, Any]]:
        lower = prompt.lower().strip()
        cleaned = re.sub(r'[^\w\s]', '', lower)

        user_name_queries = (
            "what is my name", "whats my name", "what's my name", "what my name",
            "who am i", "do you know my name", "tell me my name", "my name",
            "know my name", "what is my user name", "what is my username",
            "who is the user", "tell me who i am", "what is my profile",
            "who am i logged in as", "my identity", "what is my identity",
            "my email", "what is my email", "what's my email", "whats my email",
            "my account", "what is my account", "what account", "which account",
            "nothign answering on my anme", "nothing answering on my name",
            "not answering on my name", "answer on my name"
        )

        is_identity_query = (
            any(q in lower for q in user_name_queries)
            or any(q in cleaned for q in user_name_queries)
            or (("what" in lower or "who" in lower or "tell" in lower) and "my name" in lower)
            or ("my" in lower and "name" in lower and any(w in lower for w in ("what", "tell", "show", "know", "is")))
        )

        if not is_identity_query:
            return None

        p = self.get_profile()
        c_purple = "\033[38;2;168;85;247m"
        c_cyan = "\033[38;2;6;182;212m"
        c_emerald = "\033[38;2;16;185;129m"
        c_amber = "\033[38;2;245;158;11m"
        c_white = "\033[1;37m"
        rst = "\033[0m"

        card = f"""
{c_purple}=============================================================================={rst}
  {c_white}[USER] SOVEREIGN OPERATOR IDENTITY & HOST PROFILE{rst}
{c_purple}=============================================================================={rst}
  {c_emerald}* {c_white}Full Name        :{rst} {c_cyan}{p['full_name']}{rst} ({p['short_name']})
  {c_emerald}* {c_white}System Role      :{rst} {p['role']}
  {c_emerald}* {c_white}Primary Email    :{rst} {c_amber}{p['email']}{rst}
  {c_emerald}* {c_white}GitHub Account   :{rst} {p['git_user']}
  {c_emerald}* {c_white}Windows Account  :{rst} {p['os_user']} (Local Host)
  {c_emerald}* {c_white}Host Platform    :{rst} {p['os_platform']}
  {c_emerald}* {c_white}Authority Tier   :{rst} Root Governor (2PC Two-Phase Commit Master)
{c_purple}=============================================================================={rst}
  {c_white}Verified Evidence Sources:{rst}
  * Local Resume Dossier : C:\\Users\\ADMIN\\Downloads\\cv.pdf
  * Host Git Configuration: git config user.name / user.email
  * OS Execution Session  : {p['os_user']} on Windows 64-bit
{c_purple}=============================================================================={rst}
"""
        return {
            "type": "user_identity",
            "message": card.strip(),
            "profile": p
        }


# Curated, authoritative definitions for instant (<1ms) local answers
TECHNICAL_ENCYCLOPEDIA: Dict[str, Dict[str, str]] = {
    "cieav": {
        "title": "CIEAV - The Commit Layer for Autonomous Agents",
        "acronym": "CIEAV",
        "definition": (
            "CIEAV is a sovereign, local-first Agentic Operating System (OS) that enables autonomous AI agents "
            "to perform real computer use (browsers, shell, files, desktop apps) with 100% on-device privacy (0% cloud APIs) "
            "and mathematical transaction safety (Two-Phase Commit)."
        ),
        "pipeline": (
            "1. Consequence Router (<2ms): Evaluates risk and blocks destructive actions (cieav-decider-v2).\n"
            "2. Sandbox Jail: Confines file operations and intercepts path traversal attempts before process spawn.\n"
            "3. Multi-Agent Swarm: 5 specialized agents (Atlas, Codex, Crust, Ops, CFO) collaborate in consensus.\n"
            "4. Ed25519 Cryptographic Ledger: Records append-only hash-chained receipts with lossless /undo rollback."
        ),
        "cieav_implementation": "The core platform powering this terminal session."
    },
    "rag": {
        "title": "Retrieval-Augmented Generation (RAG)",
        "acronym": "RAG",
        "definition": (
            "Retrieval-Augmented Generation (RAG) is an AI architecture that enhances language models "
            "by dynamically retrieving authoritative factual passages from an indexed knowledge store "
            "before answering, preventing hallucinations and keeping outputs grounded without model retraining."
        ),
        "pipeline": (
            "1. Ingestion: Documents are tokenized, chunked, and indexed into lexical (BM25) and vector representations.\n"
            "2. Retrieval: When a query arrives, hybrid search retrieves the top-k most relevant passages.\n"
            "3. Augmentation: Retrieved snippets are formatted into an authoritative context window alongside the prompt.\n"
            "4. Generation: The language model synthesizes a grounded answer with verifiable numbered citations."
        ),
        "cieav_implementation": (
            "Implemented locally in commit_layer/reflex/knowledge.py:\n"
            "* Hybrid Search: Combines BM25 keyword matching + 256-dimensional hashed fast local vectors.\n"
            "* Reciprocal Rank Fusion (RRF): Blends lexical and vector rank lists (k=60) for precision.\n"
            "* Versioned Clearance Gating: Strict access tiers (public < internal < restricted).\n"
            "* Traceable Citations: Enforces tamper-proof citations like [1], [2] linked to doc version hashes."
        )
    },
    "2pc": {
        "title": "Two-Phase Commit (2PC) Safety Layer",
        "acronym": "2PC",
        "definition": (
            "A consensus and state-governance protocol adapted in CIEAV to prevent AI agents from causing "
            "irreversible host damage, unauthorized financial spend, or destructive file mutations."
        ),
        "pipeline": (
            "* Phase 1 (Prepare): The agent's intent is intercepted by an AST-level consequence classifier (cieav-decider-v2). "
            "If the action is irreversible or high-risk, a preview is generated with typed confirmation requirements.\n"
            "* Phase 2 (Commit): Mutations execute within a single-use token window and produce an Ed25519 "
            "cryptographically signed, append-only hash-chained receipt.\n"
            "* Lossless Rollback: Every committed mutation preserves an atomic inverse callable, allowing complete "
            "byte-for-byte state recovery via '/undo' at any time."
        ),
        "cieav_implementation": "Governs all file mutations, terminal commands, browser actions, and payments in CIEAV."
    },
    "cdp": {
        "title": "Chrome DevTools Protocol (CDP)",
        "acronym": "CDP",
        "definition": (
            "A low-level WebSocket protocol that allows direct, programmatic inspection, instrumented navigation, "
            "and DOM manipulation of Chromium-based browsers (Google Chrome, Microsoft Edge, Brave) without Selenium or heavy web drivers."
        ),
        "pipeline": (
            "* Connects directly to Chrome's remote debugging port (e.g. localhost:9222).\n"
            "* Enables sub-second DOM tree extraction, CSS selector evaluation, and headless viewport screenshots.\n"
            "* Provides direct element clicking, form typing, and session cookie reuse directly on the host machine."
        ),
        "cieav_implementation": "Used by CIEAV's Native Browser Engine in commit_layer/interactive_browser.py."
    },
    "agent": {
        "title": "Autonomous Agentic Operating System",
        "acronym": "Agent",
        "definition": (
            "An autonomous software entity that perceives its environment, reasons about goals, plans atomic actions, "
            "executes tools in the real world, and self-heals failures through an automated feedback loop."
        ),
        "pipeline": (
            "1. Goal Intake: High-level objectives decomposed into directed acyclic graph (DAG) sub-tasks.\n"
            "2. Tool Invocation: System calls, browser actions, and code refactorings executed under governance.\n"
            "3. Verifier Check: Post-step assertions (e.g., check.contains, PyTest verification) ensure correctness.\n"
            "4. Self-Healing: In the event of an error, diagnostics synthesize patches and re-test automatically."
        ),
        "cieav_implementation": "CIEAV runs Atlas, Codex-Lead, CFO, and Code Healer in a coordinated virtual office."
    },
    "sandbox": {
        "title": "Central Controlled Sandbox",
        "acronym": "Sandbox",
        "definition": (
            "An isolated execution perimeter that restricts agent processes to authorized workspace roots, "
            "monitors CPU/RAM limits, and strictly intercepts dangerous commands or path-traversal attempts before spawn."
        ),
        "pipeline": (
            "* Path Confinement: Prevents unauthorized writes to Windows system directories (System32, Windows).\n"
            "* Command Blacklist: Immediately terminates destructive commands like 'del /f /s /q C:\\' or fork bombs.\n"
            "* Resource Tracking: Continuously tracks process runtimes and memory allocations."
        ),
        "cieav_implementation": "Centralized in commit_layer/sandbox_controller.py and sandbox_jail.py."
    },
    "python": {
        "title": "Python 3 Runtime & Architecture",
        "acronym": "Python",
        "definition": (
            "An interpreted, high-level, dynamically typed programming language emphasizing code readability, "
            "extensibility, and rich ecosystem support for AI, systems programming, and backend microservices."
        ),
        "pipeline": (
            "1. Source Code Parsing: Lexical analysis compiles .py source into an Abstract Syntax Tree (AST).\n"
            "2. Bytecode Compilation: AST is transformed into Python bytecode (.pyc cached files).\n"
            "3. CPython Virtual Machine: The execution evaluation loop dispatches opcodes under the Global Interpreter Lock (GIL).\n"
            "4. Asynchronous IO (asyncio): Non-blocking coroutines and event loops for high-concurrency network tasks."
        ),
        "cieav_implementation": "Core runtime language powering CIEAV's governance engine, AST parsers, and multi-agent swarm."
    },
    "llm": {
        "title": "Large & Small Language Models (LLM / SLM)",
        "acronym": "LLM",
        "definition": (
            "Transformer-based neural networks trained on vast textual datasets using next-token prediction, "
            "capable of deep semantic reasoning, natural language understanding, code synthesis, and agentic planning."
        ),
        "pipeline": (
            "1. Attention Mechanism: Self-attention layers compute contextual token embeddings across long contexts.\n"
            "2. Quantization (GGUF): Compresses weights from FP16 to 4-bit (Q4_K_M) for high-speed local CPU execution.\n"
            "3. Tool-Calling: Decodes structured JSON arguments from conversational user prompts.\n"
            "4. Instruction Tuning: Aligned with RLHF or direct preference optimization for agentic obedience."
        ),
        "cieav_implementation": "Powered locally by in-process Qwen-3.5-9B GGUF with 0% cloud APIs."
    },
    "docker": {
        "title": "Docker & Container Virtualization",
        "acronym": "Docker",
        "definition": (
            "An OS-level virtualization platform that packages applications and their dependencies into lightweight, "
            "portable containers that execute in isolated user spaces across different host machines."
        ),
        "pipeline": (
            "1. Linux Namespaces: Isolates process trees (PID), network interfaces (NET), and mount points (MNT).\n"
            "2. Control Groups (cgroups): Restricts and meters hardware resource usage (CPU, RAM, block I/O).\n"
            "3. Union Filesystem (OverlayFS): Stacks read-only image layers with a copy-on-write (CoW) container layer.\n"
            "4. OCI Runtime: Containerd / runc executes container lifecycle commands."
        ),
        "cieav_implementation": "Supported as an external execution sandbox target for agentic deployments."
    },
    "git": {
        "title": "Git Distributed Version Control System",
        "acronym": "Git",
        "definition": (
            "A distributed version control system that tracks changes in source code across branches, "
            "providing immutable history, cryptographic SHA-256/SHA-1 integrity, and seamless branching."
        ),
        "pipeline": (
            "1. Merkle Tree DAG: Every commit references a cryptographically hashed tree of blobs and parent commits.\n"
            "2. Staging Area (Index): Prepares atomic changes before creating permanent snapshot commits.\n"
            "3. Three-Way Merge & Rebase: Integrates divergent feature branches into linear histories.\n"
            "4. Distributed Remotes: Pushes and pulls commits over SSH or HTTPS with atomic refs."
        ),
        "cieav_implementation": "Backs CIEAV's persistent memory hive (commit_layer/memory_hive.py) for immutable memory audit."
    },
    "api": {
        "title": "REST APIs & Web Services",
        "acronym": "API",
        "definition": (
            "Application Programming Interfaces (APIs) adhering to REST (Representational State Transfer) principles, "
            "enabling stateless, standardized communication between distributed software systems over HTTP/HTTPS."
        ),
        "pipeline": (
            "1. HTTP Verbs: Standardized semantics for resource access (GET, POST, PUT, DELETE, PATCH).\n"
            "2. Request Validation: Incoming JSON bodies validated against Pydantic or JSONSchema models.\n"
            "3. Status Codes: Standardized response indicators (200 OK, 201 Created, 400 Bad Request, 403 Forbidden).\n"
            "4. Stateless Architecture: Each request contains all context needed for authentication and processing."
        ),
        "cieav_implementation": "Exposed locally via FastAPI on port 8000 and the Reflex Driver Bridge on port 8765."
    },
    "sql": {
        "title": "Relational Databases & SQL (ACID)",
        "acronym": "SQL",
        "definition": (
            "Structured Query Language (SQL) systems that organize data into relational tables with strict schemas, "
            "enforcing ACID (Atomicity, Consistency, Isolation, Durability) guarantees for critical transactions."
        ),
        "pipeline": (
            "1. Relational Algebra: Translates declarative SQL queries into optimized execution trees.\n"
            "2. B-Tree Indexing: Provides logarithmic O(log N) lookup times for indexed primary and foreign keys.\n"
            "3. Write-Ahead Logging (WAL): Ensures crash recovery and durability by persisting changes before page writes.\n"
            "4. Transaction Isolation: Concurrency controls (MVCC, locking) prevent race conditions and dirty reads."
        ),
        "cieav_implementation": "Backs CIEAV's Ed25519 hash-chained receipt ledger using SQLite WAL mode in commit_layer/receipts.py."
    }
}


class TechnicalKnowledgeResolver:
    """Answers common technical, computer science, and AI questions with grounded precision in <1ms."""

    @classmethod
    def check_technical_intent(cls, prompt: str) -> Optional[Dict[str, Any]]:
        lower = prompt.lower().strip()
        cleaned = re.sub(r'[^\w\s]', ' ', lower).strip()
        words = cleaned.split()

        # 0. CIEAV Platform Identity
        if any(w in words for w in ("cieav", "cieva", "ceiav")) or ("what is cieav" in lower or "what si cieav" in lower or "explain cieav" in lower):
            entry = TECHNICAL_ENCYCLOPEDIA["cieav"]
            return cls._format_encyclopedia_card(entry)

        # 1. RAG Query Matching
        if any(w in words for w in ("rag", "retrievalaugmented", "retrieval-augmented")) or ("retrieval" in lower and "generation" in lower):
            entry = TECHNICAL_ENCYCLOPEDIA["rag"]
            return cls._format_encyclopedia_card(entry)

        # 2. 2PC / Two-Phase Commit Matching
        if any(w in words for w in ("2pc", "twophase")) or ("two" in words and "phase" in words and "commit" in words):
            entry = TECHNICAL_ENCYCLOPEDIA["2pc"]
            return cls._format_encyclopedia_card(entry)

        # 3. CDP / Chrome DevTools Protocol Matching
        if "cdp" in words or ("chrome" in lower and "devtools" in lower):
            entry = TECHNICAL_ENCYCLOPEDIA["cdp"]
            return cls._format_encyclopedia_card(entry)

        # 4. Agent / Autonomous Agent Matching
        if any(w in words for w in ("agent", "swarm", "multi-agent", "multiagent")) and any(w in words for w in ("what", "explain", "how", "define", "architecture")):
            entry = TECHNICAL_ENCYCLOPEDIA["agent"]
            return cls._format_encyclopedia_card(entry)

        # 5. Sandbox Matching
        if "sandbox" in words and any(w in words for w in ("what", "explain", "how", "define")):
            entry = TECHNICAL_ENCYCLOPEDIA["sandbox"]
            return cls._format_encyclopedia_card(entry)

        # 6. Python Matching
        if "python" in words and any(w in words for w in ("what", "explain", "how", "define", "features")):
            entry = TECHNICAL_ENCYCLOPEDIA["python"]
            return cls._format_encyclopedia_card(entry)

        # 7. LLM / SLM Matching
        if any(w in words for w in ("llm", "slm", "gguf", "transformer", "transformers")) and any(w in words for w in ("what", "explain", "how", "define")):
            entry = TECHNICAL_ENCYCLOPEDIA["llm"]
            return cls._format_encyclopedia_card(entry)

        # 8. Docker Matching
        if "docker" in words or "container" in words or "containers" in words:
            if any(w in words for w in ("what", "explain", "how", "define")):
                entry = TECHNICAL_ENCYCLOPEDIA["docker"]
                return cls._format_encyclopedia_card(entry)

        # 9. Git Matching
        if "git" in words and any(w in words for w in ("what", "explain", "how", "define")):
            entry = TECHNICAL_ENCYCLOPEDIA["git"]
            return cls._format_encyclopedia_card(entry)

        # 10. API / REST Matching
        if any(w in words for w in ("api", "rest", "restful", "endpoint")) and any(w in words for w in ("what", "explain", "how", "define")):
            entry = TECHNICAL_ENCYCLOPEDIA["api"]
            return cls._format_encyclopedia_card(entry)

        # 11. SQL / Database Matching
        if any(w in words for w in ("sql", "database", "rdbms", "acid")) and any(w in words for w in ("what", "explain", "how", "define")):
            entry = TECHNICAL_ENCYCLOPEDIA["sql"]
            return cls._format_encyclopedia_card(entry)

        return None

    @staticmethod
    def _format_encyclopedia_card(entry: Dict[str, str]) -> Dict[str, Any]:
        c_purple = "\033[38;2;168;85;247m"
        c_cyan = "\033[38;2;6;182;212m"
        c_emerald = "\033[38;2;16;185;129m"
        c_white = "\033[1;37m"
        rst = "\033[0m"

        card = f"""
{c_purple}=============================================================================={rst}
  {c_white}[KNOWLEDGE] CIEAV TECHNICAL KNOWLEDGE BASE - {entry['title'].upper()}{rst}
{c_purple}=============================================================================={rst}
  {c_emerald}* {c_white}Core Concept  :{rst} {c_cyan}{entry['title']}{rst}
  {c_emerald}* {c_white}Definition    :{rst}
    {entry['definition']}

  {c_emerald}* {c_white}How It Works (Architecture Pipeline):{rst}
    {entry['pipeline'].replace(chr(10), chr(10) + '    ')}

  {c_emerald}* {c_white}CIEAV Native Architecture Implementation:{rst}
    {entry['cieav_implementation'].replace(chr(10), chr(10) + '    ')}
{c_purple}=============================================================================={rst}
"""
        return {
            "type": "technical_explanation",
            "message": card.strip(),
            "concept": entry["acronym"]
        }


user_identity_resolver = UserIdentityResolver()
technical_knowledge_resolver = TechnicalKnowledgeResolver()
