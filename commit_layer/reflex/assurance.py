"""
CIEAV Reflex Assurance, Linting, Simulation & Trust Engine.
=============================================================================
1. Linting (Design Rule Checks / DRC):
   Deterministic structural verification ensuring risky steps have verifiable checks.
2. Pre-Deployment Simulation:
   Replays procedures in throwaway in-memory databases with intentional fault
   injection at every checked step, proving that procedures stop safely, never
   execute subsequent steps after a failure, and gate every risky step.
3. Trust Certification:
   Passing linting and all fault-injection simulations marks a procedure as 'trusted'.
4. Outcomes Ledger:
   Tracks model-free execution rates, codified corrections, and minutes saved.
"""

from __future__ import annotations
import os
import json
import sqlite3
from typing import Any, Dict, List, Optional

from commit_layer.reflex.db import get_db
from commit_layer.reflex.engine import reflex_engine, set_connection_driver

ALLOWED_CLASSES = {"read", "navigate", "write", "execute", "draft", "send", "delete", "pay"}


def is_risky_step(step: Dict[str, Any]) -> bool:
    return step.get("risk") in ("R2", "R3")


def lint_procedure(procedure: Dict[str, Any]) -> Dict[str, Any]:
    """
    Design-Rule Check (DRC) for procedures: 100% deterministic, zero LLM calls.
    Ensures safe constraints before execution.
    """
    steps = procedure.get("steps", [])
    violations = []

    for s in steps:
        n = s.get("n", 0)
        s_class = s.get("class", "")
        risk = s.get("risk", "R0")

        # Check 1: Risky steps need a verifier check
        if is_risky_step(s) and not s.get("check"):
            violations.append({
                "step": n,
                "rule": "risky-step-needs-check",
                "message": f"{risk} step #{n} ({s.get('action')}) has no post-step check, so success cannot be verified."
            })

        # Check 2: Known action class
        if s_class not in ALLOWED_CLASSES:
            violations.append({
                "step": n,
                "rule": "unknown-class",
                "message": f"Step #{n} has an unknown class '{s_class}' and must fail closed as R3."
            })

    # Check 3: At least one step must have a verifier check
    if not any(s.get("check") for s in steps):
        violations.append({
            "step": 0,
            "rule": "no-verifier",
            "message": "Procedure contains no step with a verifier check."
        })

    return {
        "ok": len(violations) == 0,
        "violations": violations
    }


def simulate_procedure(
    procedure_row: Dict[str, Any],
    extra_scenarios: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Pre-deployment fault-injection simulation in throwaway in-memory database (:memory:).
    Nothing touches the real host tools or the real audit log.
    Simulates failure at every checked step and verifies:
    1. The procedure halts safely.
    2. No step runs after a failure.
    3. Every risky step was properly gated for approval.
    """
    steps = json.loads(procedure_row["steps"]) if isinstance(procedure_row["steps"], str) else procedure_row["steps"]
    risky_count = len([s for s in steps if is_risky_step(s)])

    scenarios = [
        {"name": "happy path", "script": {}, "expect": "done"}
    ]

    # Fault injection at every checked step
    for s in steps:
        if s.get("check"):
            scenarios.append({
                "name": f"fault injection at step #{s['n']}",
                "script": {s["n"]: {"ok": False, "text": "", "ui": []}},
                "expect": "handoff",
                "fail_at": s["n"]
            })

    if extra_scenarios:
        scenarios.extend(extra_scenarios)

    results = []
    for sc in scenarios:
        # Create throwaway in-memory database
        mem_conn = sqlite3.connect(":memory:")
        mem_conn.row_factory = sqlite3.Row
        mem_conn.executescript("""
        CREATE TABLE procedures (id INTEGER PRIMARY KEY, title TEXT, text TEXT, status TEXT, trusted INTEGER, trace_hash TEXT, verifier INTEGER, manifest TEXT, steps TEXT, created_at REAL, updated_at REAL);
        CREATE TABLE runs (id INTEGER PRIMARY KEY AUTOINCREMENT, procedure_id INTEGER, status TEXT, params TEXT, started_at REAL, ended_at REAL, pending TEXT, llm_calls INTEGER DEFAULT 0);
        CREATE TABLE activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, actor TEXT, event TEXT, data TEXT, prev_hash TEXT, hash TEXT);
        """)

        # Insert procedure
        mem_conn.execute(
            "INSERT INTO procedures (id, title, text, status, trusted, trace_hash, verifier, manifest, steps, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (procedure_row["id"], procedure_row.get("title", ""), procedure_row.get("text", ""),
             procedure_row.get("status", "ready"), procedure_row.get("trusted", 0),
             procedure_row.get("trace_hash", ""), procedure_row.get("verifier", 1),
             json.dumps(procedure_row.get("manifest", {})), json.dumps(steps), 0)
        )
        mem_conn.commit()

        # Injected script driver
        def make_mock_driver(script_map):
            def _driver(step, val):
                n = step["n"]
                if n in script_map:
                    return script_map[n]
                c_text = step.get("check", {}).get("contains", "") if step.get("check") else ""
                return {"ok": True, "text": c_text, "ui": []}
            return _driver

        set_connection_driver(mem_conn, make_mock_driver(sc.get("script", {})))

        # Run simulation
        run = reflex_engine.start_procedure(
            procedure_id=procedure_row["id"],
            params=sc.get("params", {}),
            actor="sim",
            conn=mem_conn
        )
        gated_count = 0
        while run["status"] == "awaiting_approval":
            gated_count += 1
            run = reflex_engine.decide_approval(run["id"], "approve", actor="sim", conn=mem_conn)

        # Audit activity
        ev_rows = mem_conn.execute("SELECT event, data FROM activity").fetchall()
        ok_steps = []
        for r in ev_rows:
            if r["event"] == "step.ok":
                d = json.loads(r["data"]) if r["data"] else {}
                if "step" in d:
                    ok_steps.append(d["step"])

        problems = []
        if run["status"] != sc["expect"]:
            problems.append(f"Expected final status '{sc['expect']}', got '{run['status']}'.")

        fail_at = sc.get("fail_at")
        if fail_at and any(step_idx >= fail_at for step_idx in ok_steps):
            problems.append(f"Safety violation: a step ran after failure at step #{fail_at}.")

        if sc["expect"] == "done" and gated_count != risky_count:
            problems.append(f"Gating violation: only {gated_count} of {risky_count} risky steps were gated.")

        results.append({
            "name": sc["name"],
            "pass": len(problems) == 0,
            "problems": problems
        })

    return results


def certify_trusted(procedure_id: int, db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Certify a procedure as 'trusted' for unattended local execution.
    Requires passing 100% of DRC lint rules and all fault-injection simulation scenarios.
    """
    conn = get_db(db_path)
    row = conn.execute("SELECT * FROM procedures WHERE id = ?", (procedure_id,)).fetchone()
    if not row:
        return {"status": "error", "message": f"Procedure #{procedure_id} not found."}

    proc_data = dict(row)
    proc_data["steps"] = json.loads(proc_data["steps"])

    # 1. Lint DRC
    lint_res = lint_procedure(proc_data)
    if not lint_res["ok"]:
        return {
            "status": "failed_lint",
            "procedure_id": procedure_id,
            "violations": lint_res["violations"]
        }

    # 2. Fault-Injection Simulation
    sim_res = simulate_procedure(proc_data)
    failures = [s for s in sim_res if not s["pass"]]
    if failures:
        return {
            "status": "failed_simulation",
            "procedure_id": procedure_id,
            "failed_scenarios": failures
        }

    # 3. Mark as Trusted in SQLite
    conn.execute("UPDATE procedures SET trusted = 1 WHERE id = ?", (procedure_id,))
    conn.commit()

    return {
        "status": "trusted_certified",
        "procedure_id": procedure_id,
        "scenarios_passed": len(sim_res),
        "message": f"Procedure #{procedure_id} verified against {len(sim_res)} fault scenarios. Certified TRUSTED."
    }


def get_outcomes_ledger(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Outcome ledger: tracks what the system delivered, operator corrections codified,
    minutes saved, and the model-free deterministic execution rate.
    """
    conn = get_db(db_path)
    procs = conn.execute("SELECT id, title, trusted FROM procedures").fetchall()
    outcomes = []

    target_rate = 0.6  # Target 60%+ model-free execution
    min_per_run = 5.0  # Estimated 5 mins saved per automated run

    for p in procs:
        runs = conn.execute("SELECT status, llm_calls FROM runs WHERE procedure_id = ?", (p["id"],)).fetchall()
        total_runs = len(runs)
        completed = [r for r in runs if r["status"] == "done"]
        model_free = [r for r in completed if (r["llm_calls"] or 0) == 0]
        handoffs = [r for r in runs if r["status"] == "handoff"]

        rate = (len(model_free) / len(completed)) if completed else None
        
        # Count corrections codified
        patched_rows = conn.execute(
            "SELECT COUNT(*) as cnt FROM activity WHERE event = 'procedure.patched' AND data LIKE ?",
            (f'%\"procedure\": {p["id"]}%',)
        ).fetchone()
        corrections = patched_rows["cnt"] if patched_rows else 0

        outcomes.append({
            "procedure_id": p["id"],
            "title": p["title"],
            "trusted": bool(p["trusted"]),
            "total_runs": total_runs,
            "completed": len(completed),
            "handoffs": len(handoffs),
            "model_free_rate": round(rate, 2) if rate is not None else None,
            "target_met": rate >= target_rate if rate is not None else False,
            "corrections_codified": corrections,
            "minutes_saved": round(len(completed) * min_per_run, 1)
        })

    return outcomes
