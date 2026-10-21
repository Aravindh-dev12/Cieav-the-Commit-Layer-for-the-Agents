"""
CIEAV Reflex Storage & SQLite Schema.
=============================================================================
Provides durable local persistence for deterministic procedures, runs,
activity audit log, versioned documents (RAG), and DAG pipelines.
"""

from __future__ import annotations
import os
import sqlite3
import logging
from typing import Optional

from commit_layer.workspace import get_data_dir

logger = logging.getLogger(__name__)

REFLEX_DIR = get_data_dir("reflex")
os.makedirs(REFLEX_DIR, exist_ok=True)
DEFAULT_DB_PATH = os.path.join(REFLEX_DIR, "reflex.db")


def get_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Connect to SQLite database and ensure schema is initialized."""
    target_path = db_path or os.environ.get("REFLEX_DB", DEFAULT_DB_PATH)
    conn = sqlite3.connect(target_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS procedures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        title TEXT,
        text TEXT,
        status TEXT,           -- 'draft', 'ready', 'trusted'
        trusted INTEGER DEFAULT 0,
        trace_hash TEXT,
        verifier INTEGER,
        manifest TEXT,         -- JSON: {apps: [...]}
        steps TEXT,            -- JSON array of step objects
        created_at REAL,
        updated_at REAL
    );

    CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        procedure_id INTEGER,
        status TEXT,           -- 'running', 'awaiting_approval', 'awaiting_repair', 'done', 'failed', 'aborted', 'handoff'
        params TEXT,           -- JSON dict of runtime parameters
        started_at REAL,
        ended_at REAL,
        pending TEXT,          -- JSON: {next: int, card: {...}, proposal: {...}}
        llm_calls INTEGER DEFAULT 0,
        FOREIGN KEY(procedure_id) REFERENCES procedures(id)
    );

    CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts REAL,
        actor TEXT,
        event TEXT,            -- 'step.ok', 'step.check_failed', 'approval.requested', etc.
        data TEXT,             -- JSON
        prev_hash TEXT,
        hash TEXT
    );

    CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_key TEXT,
        version INTEGER,
        title TEXT,
        level TEXT,            -- 'public', 'internal', 'restricted'
        roles TEXT,            -- JSON array of roles
        source TEXT,
        hash TEXT,
        status TEXT,           -- 'pending', 'active', 'superseded'
        created_at REAL
    );
    CREATE INDEX IF NOT EXISTS idx_docs_key ON docs(doc_key);

    CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER,
        n INTEGER,
        text TEXT,
        emb BLOB,              -- 256-dim float32 binary
        FOREIGN KEY(doc_id) REFERENCES docs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

    CREATE TABLE IF NOT EXISTS pipeline_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT,           -- 'running', 'paused', 'done', 'failed'
        ctx TEXT,              -- JSON dict of variable context
        trace TEXT,            -- JSON array of node statuses
        started_at REAL,
        updated_at REAL
    );
    """)
    conn.commit()
    return conn
