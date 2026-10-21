"""
Unit and integration tests for CIEAV Reflex AI Automation & Self-Repair Engine.
Validates trace-to-procedure extraction, checked step replay, visible-only self-repair,
pre-deployment fault-injection simulation, trusted certification, permission-filtered RAG,
and DAG pipeline orchestration.
"""
import os
import json
import sqlite3
import pytest

from commit_layer.reflex.extractor import extract_procedure
from commit_layer.reflex.engine import reflex_engine, drive_step, set_connection_driver
from commit_layer.reflex.assurance import (
    lint_procedure,
    simulate_procedure,
    certify_trusted,
    get_outcomes_ledger
)
from commit_layer.reflex.knowledge import reflex_kb, can_access, compute_fast_hash_embedding
from commit_layer.reflex.pipeline import reflex_pipeline, topological_sort
from commit_layer.tools.base import TOOL_REGISTRY


@pytest.fixture
def test_db():
    """Create a temporary in-memory database for isolated testing."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
    CREATE TABLE procedures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        title TEXT,
        text TEXT,
        status TEXT,
        trusted INTEGER DEFAULT 0,
        trace_hash TEXT,
        verifier INTEGER,
        manifest TEXT,
        steps TEXT,
        created_at REAL,
        updated_at REAL
    );
    CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        procedure_id INTEGER,
        status TEXT,
        params TEXT,
        started_at REAL,
        ended_at REAL,
        pending TEXT,
        llm_calls INTEGER DEFAULT 0
    );
    CREATE TABLE activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts REAL,
        actor TEXT,
        event TEXT,
        data TEXT,
        prev_hash TEXT,
        hash TEXT
    );
    CREATE TABLE docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_key TEXT,
        version INTEGER,
        title TEXT,
        level TEXT,
        roles TEXT,
        source TEXT,
        hash TEXT,
        status TEXT,
        created_at REAL
    );
    CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER,
        n INTEGER,
        text TEXT,
        emb BLOB
    );
    CREATE TABLE pipeline_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT,
        ctx TEXT,
        trace TEXT,
        started_at REAL,
        updated_at REAL
    );
    """)
    return conn


def test_reflex_trace_extraction():
    """Verify trace pruning, risk classification, and verifier enforcement."""
    raw_trace = {
        "prompt": "Export Blender mesh and notify team",
        "steps": [
            {"app": "blender", "action": "open_project", "class": "read", "undone": False},
            {"app": "blender", "action": "misclick_button", "class": "navigate", "undone": True},  # dead end
            {"app": "blender", "action": "export_fbx", "class": "write", "check": {"contains": "Export complete"}, "undone": False},
            {"app": "email", "action": "send_alert", "class": "send", "check": {"contains": "Sent 200"}, "undone": False}
        ]
    }

    proc = extract_procedure(raw_trace)
    assert proc["title"] == "Export Blender mesh and notify team"
    assert len(proc["steps"]) == 3  # undone step pruned
    assert proc["steps"][0]["risk"] == "R0"  # read
    assert proc["steps"][1]["risk"] == "R1"  # write
    assert proc["steps"][2]["risk"] == "R3"  # send
    assert proc["verifier"] == 3
    assert proc["status"] == "ready"
    assert "blender" in proc["manifest"]["apps"]
    assert "email" in proc["manifest"]["apps"]
    assert len(proc["hash"]) == 64

    # Trace with no verifier fails closed to draft
    no_verifier_trace = {
        "prompt": "Unchecked navigation",
        "steps": [{"app": "browser", "action": "browse", "class": "read"}]
    }
    proc_draft = extract_procedure(no_verifier_trace)
    assert proc_draft["status"] == "draft"
    assert proc_draft["verifier"] is None


def test_reflex_engine_replay_and_approval_gate(test_db):
    """Verify checked step execution, R3 approval pause, and resumption."""
    steps = [
        {"n": 1, "app": "browser", "action": "read", "risk": "R0", "check": {"contains": "Dashboard"}},
        {"n": 2, "app": "trading", "action": "submit_order", "risk": "R3", "check": {"contains": "Order Accepted"}}
    ]

    cur = test_db.execute(
        "INSERT INTO procedures (title, status, trusted, steps, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Zerodha Order Submission", "ready", 0, json.dumps(steps), 0)
    )
    proc_id = cur.lastrowid
    test_db.commit()

    # Scripted mock driver
    def mock_driver(step, val):
        if step["n"] == 1:
            return {"ok": True, "text": "Welcome to Trading Dashboard", "ui": []}
        return {"ok": True, "text": "Order Accepted #1092", "ui": []}

    set_connection_driver(test_db, mock_driver)

    # Start run: step 1 passes (R0), step 2 halts for approval (R3)
    run = reflex_engine.start_procedure(procedure_id=proc_id, conn=test_db)
    assert run["status"] == "awaiting_approval"
    assert run["pending"]["card"]["step"] == 2
    assert run["pending"]["card"]["risk"] == "R3"

    # Human confirms approval
    run_resumed = reflex_engine.decide_approval(run["id"], "approve", actor="trader", conn=test_db)
    assert run_resumed["status"] == "done"

    # Check hash-chained activity log
    logs = test_db.execute("SELECT * FROM activity ORDER BY id ASC").fetchall()
    assert len(logs) >= 4
    events = [l["event"] for l in logs]
    assert "run.started" in events
    assert "step.ok" in events
    assert "approval.requested" in events
    assert "approval.approve" in events


def test_reflex_autonomous_self_repair(test_db):
    """Verify autonomous repair proposes from visible controls only, rejects hallucinations."""
    steps = [
        {"n": 1, "app": "ui_form", "action": "click", "target": {"name": "OldSubmitBtn"}, "check": {"contains": "Saved"}}
    ]
    cur = test_db.execute(
        "INSERT INTO procedures (title, status, trusted, steps, created_at) VALUES (?, ?, ?, ?, ?)",
        ("Submit Feedback Form", "ready", 0, json.dumps(steps), 0)
    )
    proc_id = cur.lastrowid
    test_db.commit()

    # Step fails, but driver reports visible controls
    def failing_driver(step, val):
        return {"ok": False, "text": "404 Not Found", "ui": ["Cancel", "NewSubmitBtn", "Help"]}

    set_connection_driver(test_db, failing_driver)

    run = reflex_engine.start_procedure(procedure_id=proc_id, conn=test_db)
    assert run["status"] == "awaiting_repair"
    prop = run["pending"]["proposal"]
    assert prop["step"] == 1
    assert prop["from"] == "OldSubmitBtn"
    assert prop["to"] in ["NewSubmitBtn", "Cancel", "Help"]  # MUST be from visible controls

    # Accept repair
    def fixed_driver(step, val):
        return {"ok": True, "text": "Form Saved Successfully", "ui": []}

    set_connection_driver(test_db, fixed_driver)
    repaired_run = reflex_engine.decide_repair(run["id"], "approve", conn=test_db)
    assert repaired_run["status"] == "done"

    # Verify procedure was patched in database
    updated_proc = test_db.execute("SELECT steps FROM procedures WHERE id = ?", (proc_id,)).fetchone()
    patched_steps = json.loads(updated_proc["steps"])
    assert patched_steps[0]["target"]["name"] == prop["to"]


def test_reflex_assurance_lint_and_fault_simulation():
    """Verify PCB-style DRC lint and pre-deployment fault-injection simulation."""
    proc_bad = {
        "steps": [
            {"n": 1, "class": "delete", "risk": "R3", "action": "delete_db"}  # Missing check!
        ]
    }
    lint_bad = lint_procedure(proc_bad)
    assert lint_bad["ok"] is False
    assert any(v["rule"] == "risky-step-needs-check" for v in lint_bad["violations"])

    # Valid procedure with checked steps
    proc_valid = {
        "id": 101,
        "title": "Database Backup & Notification",
        "status": "ready",
        "steps": [
            {"n": 1, "class": "write", "risk": "R1", "action": "backup", "check": {"contains": "Backup Complete"}},
            {"n": 2, "class": "send", "risk": "R3", "action": "notify", "check": {"contains": "Notified"}}
        ]
    }
    lint_good = lint_procedure(proc_valid)
    assert lint_good["ok"] is True

    # Fault-injection simulation in :memory:
    sim_results = simulate_procedure(proc_valid)
    assert len(sim_results) >= 3  # Happy path + fault at step 1 + fault at step 2
    for sc in sim_results:
        assert sc["pass"] is True, f"Failed scenario: {sc}"


def test_reflex_permission_filtered_rag(test_db):
    """Verify document versioning, clearance access levels, and citations."""
    kb = reflex_kb
    kb.db_path = ":memory:"

    # 1. Ingest Public Spec
    ing_pub = kb.ingest_document(
        doc_key="SPEC-101",
        title="Public API Guide",
        body="The public API exposes GET /status and GET /health.",
        level="public",
        conn=test_db
    )
    assert ing_pub["status"] == "ingested"
    assert ing_pub["version"] == 1

    # 2. Ingest Restricted Architecture Doc (Export-Controlled)
    ing_rest = kb.ingest_document(
        doc_key="CORE-SEC-01",
        title="Restricted Cryptographic Core",
        body="The Ed25519 signing core uses hardware-backed enclave keys.",
        level="restricted",
        conn=test_db
    )
    assert ing_rest["status"] == "ingested"

    # 3. Clearance Access Check
    user_public = {"clearance": "public", "roles": []}
    user_top_secret = {"clearance": "restricted", "roles": ["admin"]}

    # Public user search cannot see restricted documents
    hits_pub = kb.search_hybrid("cryptographic enclave keys", user_public, conn=test_db)
    assert not any(h["doc_key"] == "CORE-SEC-01" for h in hits_pub)  # Restricted doc filtered out before scoring!

    # Top secret user search sees restricted document
    hits_admin = kb.search_hybrid("cryptographic enclave keys", user_top_secret, conn=test_db)
    assert len(hits_admin) > 0
    assert hits_admin[0]["doc_key"] == "CORE-SEC-01"

    # 4. Ask Knowledge Engine with Citations
    ask_res = kb.ask("How does the public API work?", user=user_public, conn=test_db)
    assert "Public API Guide" in ask_res["answer"]
    assert len(ask_res["citations"]) > 0
    assert ask_res["citations"][0]["doc_key"] == "SPEC-101"

    # 5. Versioning: Update SPEC-101
    ing_v2 = kb.ingest_document(
        doc_key="SPEC-101",
        title="Public API Guide v2",
        body="The public API exposes GET /status, GET /health, and POST /commit.",
        level="public",
        conn=test_db
    )
    assert ing_v2["status"] == "ingested"
    assert ing_v2["version"] == 2  # Increments to version 2


def test_reflex_dag_pipeline():
    """Verify directed acyclic graph topological order, cycle check, and node execution."""
    nodes = [
        {"id": "trig", "type": "trigger"},
        {"id": "doc_ask", "type": "ask", "config": {"question": "{{trigger.query}}"}},
        {"id": "log_step", "type": "log", "config": {"message": "Query processed: {{trigger.query}}"}}
    ]
    edges = [
        {"from": "trig", "to": "doc_ask"},
        {"from": "doc_ask", "to": "log_step"}
    ]

    order = topological_sort(nodes, edges)
    assert order == ["trig", "doc_ask", "log_step"]

    # Cycle detection
    cyclic_edges = edges + [{"from": "log_step", "to": "trig"}]
    with pytest.raises(ValueError, match="contains a circular dependency"):
        topological_sort(nodes, cyclic_edges)

    # Run DAG
    graph = {"nodes": nodes, "edges": edges}
    pipeline_res = reflex_pipeline.run_pipeline(
        graph=graph,
        initial_input={"query": "API status"}
    )
    assert pipeline_res["status"] == "done"
    assert len(pipeline_res["trace"]) == 3


def test_reflex_tools_in_registry():
    """Verify Reflex tools are registered in Commit Layer TOOL_REGISTRY."""
    assert "reflex_run_procedure" in TOOL_REGISTRY
    assert "reflex_simulate_procedure" in TOOL_REGISTRY
    assert "reflex_ask_knowledge" in TOOL_REGISTRY

    assert TOOL_REGISTRY["reflex_run_procedure"].has_inverse is True
    assert TOOL_REGISTRY["reflex_simulate_procedure"].has_inverse is True
    assert TOOL_REGISTRY["reflex_ask_knowledge"].has_inverse is True
