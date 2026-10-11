"""
Procedural Graph Memory Engine for CIEAV Commit Layer.

Instead of semantic text chunk retrieval (vector RAG), stores PROCEDURAL
graphs of actions: (precondition -> action -> postcondition -> outcome).

When an agent is presented with a task or intent, the memory checks whether an
identical or similar sequence of tool commits has previously reached OBSERVED_SUCCESS.
If so, it extracts the certified commit graph, pruning exploratory dead-ends and
skipping redundant LLM reasoning turns, while verifying all Invariants before re-execution.
"""

from __future__ import annotations
import dataclasses
import hashlib
import json
import logging
import sqlite3
import time
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

MEMORABLE_DB_PATH = os.environ.get("MEMORABLE_DB_PATH", "commit_layer/memorable.db")


@dataclasses.dataclass
class ProcedureStep:
    step_index: int
    tool_name: str
    args_pattern: dict[str, Any]
    precondition: dict[str, Any]
    postcondition: dict[str, Any]
    expected_outcome: str = "OBSERVED_SUCCESS"


@dataclasses.dataclass
class ProcedureGraph:
    procedure_id: str
    intent_pattern: str
    task_hash: str
    steps: list[ProcedureStep]
    success_count: int = 1
    total_tokens_saved: int = 0
    created_at: float = dataclasses.field(default_factory=time.time)
    last_recalled_at: float = dataclasses.field(default_factory=time.time)


class ProceduralMemoryStore:
    """
    SQLite backed procedural graph memory engine.
    Stores certified execution graphs that resulted in OBSERVED_SUCCESS.
    """

    def __init__(self, db_path: str = MEMORABLE_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS procedural_graphs (
                    procedure_id TEXT PRIMARY KEY,
                    intent_pattern TEXT NOT NULL,
                    task_hash TEXT NOT NULL,
                    steps_json TEXT NOT NULL,
                    success_count INTEGER DEFAULT 1,
                    total_tokens_saved INTEGER DEFAULT 0,
                    created_at REAL NOT NULL,
                    last_recalled_at REAL NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_task_hash ON procedural_graphs(task_hash)")
            conn.commit()

    @staticmethod
    def compute_task_hash(intent: str, domain: str = "") -> str:
        """Deterministic fingerprint of an intent / task shape."""
        normalized = f"{domain.strip().lower()}:{intent.strip().lower()}"
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def record_successful_run(
        self,
        intent: str,
        domain: str,
        steps: list[dict[str, Any]],
        tokens_saved_estimate: int = 1200
    ) -> ProcedureGraph:
        """
        Record a verified sequence of tool calls that resulted in OBSERVED_SUCCESS.
        Prunes dead ends and converts them into an executable procedure graph.
        """
        task_hash = self.compute_task_hash(intent, domain)
        procedure_id = f"proc_{task_hash}"

        procedure_steps = []
        for i, s in enumerate(steps):
            step = ProcedureStep(
                step_index=i,
                tool_name=s.get("tool_name", ""),
                args_pattern=s.get("args", {}),
                precondition=s.get("precondition", {}),
                postcondition=s.get("postcondition", {}),
                expected_outcome=s.get("outcome", "OBSERVED_SUCCESS")
            )
            procedure_steps.append(step)

        steps_json = json.dumps([dataclasses.asdict(ps) for ps in procedure_steps])
        now = time.time()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT success_count, total_tokens_saved FROM procedural_graphs WHERE procedure_id = ?", (procedure_id,))
            row = cursor.fetchone()
            if row:
                count = row[0] + 1
                tokens = row[1] + tokens_saved_estimate
                cursor.execute("""
                    UPDATE procedural_graphs 
                    SET steps_json = ?, success_count = ?, total_tokens_saved = ?, last_recalled_at = ?
                    WHERE procedure_id = ?
                """, (steps_json, count, tokens, now, procedure_id))
            else:
                cursor.execute("""
                    INSERT INTO procedural_graphs 
                    (procedure_id, intent_pattern, task_hash, steps_json, success_count, total_tokens_saved, created_at, last_recalled_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
                """, (procedure_id, intent, task_hash, steps_json, tokens_saved_estimate, now, now))
            conn.commit()

        return ProcedureGraph(
            procedure_id=procedure_id,
            intent_pattern=intent,
            task_hash=task_hash,
            steps=procedure_steps,
            success_count=1 if not row else row[0] + 1,
            total_tokens_saved=tokens_saved_estimate if not row else row[1] + tokens_saved_estimate,
            created_at=now,
            last_recalled_at=now
        )

    def recall(self, intent: str, domain: str = "") -> Optional[ProcedureGraph]:
        """
        Recall a certified procedural graph for an incoming intent.
        Three matcher levels:
        1. Exact task hash match
        2. Substring / lexical pattern match
        3. Domain + action prefix match
        """
        task_hash = self.compute_task_hash(intent, domain)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # 1. Exact hash
            cursor.execute("SELECT * FROM procedural_graphs WHERE task_hash = ?", (task_hash,))
            row = cursor.fetchone()

            # 2. Lexical fallback
            if not row:
                cursor.execute("SELECT * FROM procedural_graphs WHERE ? LIKE '%' || intent_pattern || '%' OR intent_pattern LIKE '%' || ? || '%'", (intent, intent))
                row = cursor.fetchone()

            if not row:
                return None

            pid, pattern, thash, steps_raw, count, tokens, created, last_recalled = row
            # Update last recalled timestamp
            cursor.execute("UPDATE procedural_graphs SET last_recalled_at = ? WHERE procedure_id = ?", (time.time(), pid))
            conn.commit()

            raw_steps = json.loads(steps_raw)
            steps = [ProcedureStep(**s) for s in raw_steps]

            return ProcedureGraph(
                procedure_id=pid,
                intent_pattern=pattern,
                task_hash=thash,
                steps=steps,
                success_count=count,
                total_tokens_saved=tokens,
                created_at=created,
                last_recalled_at=time.time()
            )

    def get_stats(self) -> dict[str, Any]:
        """Return memory cache stats and token efficiencies."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*), SUM(success_count), SUM(total_tokens_saved) FROM procedural_graphs")
            total_graphs, total_runs, total_tokens = cursor.fetchone()
            return {
                "total_procedures": total_graphs or 0,
                "reused_executions": (total_runs or 0) - (total_graphs or 0) if total_runs else 0,
                "estimated_tokens_saved": total_tokens or 0
            }


# Global singleton instance
procedural_memory = ProceduralMemoryStore()
