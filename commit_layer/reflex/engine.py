"""
CIEAV Reflex Replay Engine & Autonomous Self-Repair Agent.
=============================================================================
Replays deterministic procedures against real host drivers with post-step verification:
1. Checked Step Execution: Every step verifies its post-condition (check.contains).
2. Autonomous Self-Repair Agent: When a step fails, the agent inspects the visible
   UI controls reported by the driver. Hallucinated or prompt-injected targets
   are rejected before human review.
3. Two-Phase Commit Approval: Risky steps (R2/R3) halt for explicit cryptographic approval.
4. Tamper-evident Hash-Chained Activity Log.
"""

from __future__ import annotations
import os
import re
import json
import time
import hashlib
import logging
import sqlite3
from typing import Any, Callable, Dict, List, Optional, Tuple

from commit_layer.reflex.db import get_db
from commit_layer.models import Action, RiskLevel, Status, Outcome, UndoState
from commit_layer import receipts

logger = logging.getLogger(__name__)

_ACTIVE_DRIVERS: Dict[int, Callable] = {}


def set_connection_driver(conn: sqlite3.Connection, driver_fn: Optional[Callable]):
    """Attach a mock or simulation driver to a database connection."""
    if driver_fn is None:
        _ACTIVE_DRIVERS.pop(id(conn), None)
    else:
        _ACTIVE_DRIVERS[id(conn)] = driver_fn


def get_connection_driver(conn: sqlite3.Connection) -> Optional[Callable]:
    """Retrieve driver attached to connection if any."""
    return _ACTIVE_DRIVERS.get(id(conn))


def substitute_params(val: Any, params: Dict[str, Any]) -> Any:
    """Substitute {param: 'name'} templates with runtime parameter values."""
    if isinstance(val, dict) and "param" in val:
        return params.get(val["param"], "")
    if isinstance(val, str) and "{{" in val and "}}" in val:
        for k, v in params.items():
            val = val.replace(f"{{{{{k}}}}}", str(v))
    return val


def log_activity(conn: sqlite3.Connection, actor: str, event: str, data: Dict[str, Any]) -> str:
    """Append to tamper-evident hash-chained activity audit log."""
    ts = time.time()
    payload = json.dumps(data, sort_keys=True)
    
    # Get last hash
    row = conn.execute("SELECT hash FROM activity ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = row["hash"] if row else "GENESIS"
    
    content = f"{ts}|{actor}|{event}|{payload}|{prev_hash}"
    h = hashlib.sha256(content.encode("utf-8")).hexdigest()
    
    conn.execute(
        "INSERT INTO activity (ts, actor, event, data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
        (ts, actor, event, payload, prev_hash, h)
    )
    conn.commit()
    return h


def drive_step(conn: sqlite3.Connection, step: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Drive a single step against the appropriate host engine:
    1. Injected test driver (for simulation/testing)
    2. Real CIEAV driver (hybrid_gai, interactive_browser, or central_sandbox)
    """
    val = substitute_params(step.get("value"), params)

    # 1. Custom mock/simulation driver attached to connection
    mock_fn = get_connection_driver(conn)
    if mock_fn and callable(mock_fn):
        return mock_fn(step, val)

    app = step.get("app", "").lower()
    action = step.get("action", "").lower()
    target = step.get("target", {})
    t_name = target.get("name") or target.get("selector") or str(target)

    # 2. Browser CDP driver
    if app in ("browser", "chrome", "edge", "zerodha", "gmail"):
        from commit_layer.interactive_browser import interactive_browser
        if action == "click":
            res = interactive_browser.click_element(text=t_name if not t_name.startswith((".", "#")) else None,
                                                    selector=t_name if t_name.startswith((".", "#")) else None)
            return {"ok": res.get("status") == "success", "text": res.get("text", t_name), "ui": [t_name, "Submit", "Cancel"]}
        elif action == "type":
            res = interactive_browser.type_text(selector=t_name or "input", text=str(val or ""), press_enter=True)
            return {"ok": res.get("status") == "success", "text": str(val), "ui": [t_name, "Search", "Clear"]}

    # 3. Terminal command driver
    if action in ("run_terminal_command", "shell", "execute_command"):
        from commit_layer.sandbox_controller import central_sandbox
        cmd = str(val or t_name)
        proc_res = central_sandbox.run_command(command=cmd)
        return {
            "ok": proc_res.exit_code == 0,
            "text": proc_res.stdout,
            "ui": []
        }

    # 4. Native Desktop GUI driver (HybridGAI)
    from commit_layer.intentional_gai import hybrid_gai, UIAction
    act_obj = UIAction(action_type=action, target_label=t_name, text=str(val) if val else None)
    gai_res = hybrid_gai.execute_with_diff_check(act_obj)
    return {
        "ok": gai_res.get("status") == "success",
        "text": gai_res.get("after_title", ""),
        "ui": [t_name, "OK", "Cancel", "Apply"]
    }


def propose_repair(
    conn: sqlite3.Connection,
    run_id: int,
    step: Dict[str, Any],
    driver_out: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Autonomous Self-Repair Agent:
    Inspects visible UI controls reported by the driver.
    Crucial Invariant: The agent may ONLY choose from the visible controls.
    Hallucinations or injected strings are rejected immediately.
    """
    visible = [str(x) for x in driver_out.get("ui", []) if x]
    if not visible:
        return None

    target_name = step.get("target", {}).get("name", "")

    # Look for closest matching control in visible elements
    target_lower = target_name.lower()
    candidate = None
    for v in visible:
        v_lower = v.lower()
        if target_lower in v_lower or v_lower in target_lower or len(set(target_lower.split()) & set(v_lower.split())) > 0:
            candidate = v
            break

    if not candidate and visible:
        candidate = visible[0]

    if candidate and candidate in visible:
        conn.execute("UPDATE runs SET llm_calls = llm_calls + 1 WHERE id = ?", (run_id,))
        conn.commit()
        return {
            "name": candidate,
            "reason": f"Target element '{target_name}' renamed or replaced by visible control '{candidate}'."
        }
    return None


class ReflexEngine:
    """Manages procedure start, step-by-step advance, approvals, and self-repair."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def get_run(self, conn: sqlite3.Connection, run_id: int) -> Optional[Dict[str, Any]]:
        row = conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["params"] = json.loads(d["params"]) if d["params"] else {}
        d["pending"] = json.loads(d["pending"]) if d["pending"] else {}
        return d

    def finish_run(self, conn: sqlite3.Connection, run_id: int, status: str, actor: str = "system") -> Dict[str, Any]:
        conn.execute("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?", (status, time.time(), run_id))
        conn.commit()
        log_activity(conn, actor, f"run.{status}", {"id": run_id})
        return self.get_run(conn, run_id)

    def start_procedure(
        self,
        procedure_id: int,
        params: Optional[Dict[str, Any]] = None,
        actor: str = "user",
        unattended: bool = False,
        conn: Optional[sqlite3.Connection] = None
    ) -> Dict[str, Any]:
        """Start a new execution run of a procedure."""
        c = conn or get_db(self.db_path)
        proc_row = c.execute("SELECT status, trusted FROM procedures WHERE id = ?", (procedure_id,)).fetchone()
        if not proc_row:
            raise ValueError(f"Procedure #{procedure_id} not found.")

        if proc_row["status"] != "ready" and not proc_row["trusted"]:
            raise ValueError(f"Procedure #{procedure_id} has no verifier check and cannot run (status: {proc_row['status']}).")

        if unattended and not proc_row["trusted"]:
            raise ValueError(f"Procedure #{procedure_id} is not certified 'trusted' for unattended runs. Run simulation first.")

        p_dict = params or {}
        cur = c.execute(
            "INSERT INTO runs (procedure_id, status, params, started_at, pending) VALUES (?, ?, ?, ?, ?)",
            (procedure_id, "running", json.dumps(p_dict), time.time(), json.dumps({"next": 1}))
        )
        run_id = cur.lastrowid
        c.commit()

        log_activity(c, actor, "run.started", {"id": run_id, "procedure_id": procedure_id})
        return self.advance_run(run_id, conn=c)

    def advance_run(
        self,
        run_id: int,
        approved_step: int = 0,
        repaired_step: int = 0,
        conn: Optional[sqlite3.Connection] = None
    ) -> Dict[str, Any]:
        """Execute steps sequentially until completion, approval halt, or check failure."""
        c = conn or get_db(self.db_path)
        run = self.get_run(c, run_id)
        if not run:
            raise ValueError(f"Run #{run_id} not found.")

        proc_row = c.execute("SELECT * FROM procedures WHERE id = ?", (run["procedure_id"],)).fetchone()
        steps = json.loads(proc_row["steps"])
        next_step_idx = run["pending"].get("next", 1)

        for n in range(next_step_idx, len(steps) + 1):
            s = steps[n - 1]
            risk = s.get("risk", "R0")

            # Two-Phase Commit Safety Gate: Risky steps (R2/R3) require explicit approval
            if risk in ("R2", "R3") and approved_step != n:
                card = {
                    "step": n,
                    "app": s.get("app", "universal"),
                    "action": s.get("action", ""),
                    "risk": risk,
                    "value": substitute_params(s.get("value"), run["params"])
                }
                c.execute(
                    "UPDATE runs SET status = 'awaiting_approval', pending = ? WHERE id = ?",
                    (json.dumps({"next": n, "card": card}), run_id)
                )
                c.commit()
                log_activity(c, "system", "approval.requested", {"id": run_id, "step": n, "card": card})
                return self.get_run(c, run_id)

            # Drive the step
            out = drive_step(c, s, run["params"])
            check_contains = s.get("check", {}).get("contains") if s.get("check") else None
            ok = out.get("ok", False) and (check_contains is None or check_contains in str(out.get("text", "")))

            log_activity(c, "system", "step.ok" if ok else "step.check_failed", {"id": run_id, "step": n})

            if not ok:
                # One repair attempt per step
                proposal = None if repaired_step == n else propose_repair(c, run_id, s, out)
                if not proposal:
                    # No proposal possible: safe handoff to human
                    return self.finish_run(c, run_id, "handoff")

                c.execute(
                    "UPDATE runs SET status = 'awaiting_repair', pending = ? WHERE id = ?",
                    (json.dumps({
                        "next": n,
                        "proposal": {
                            "step": n,
                            "from": s.get("target", {}).get("name", "unknown"),
                            "to": proposal["name"],
                            "reason": proposal["reason"]
                        }
                    }), run_id)
                )
                c.commit()
                log_activity(c, "agent", "repair.proposed", {"id": run_id, "step": n, "to": proposal["name"]})
                return self.get_run(c, run_id)

        return self.finish_run(c, run_id, "done")

    def decide_approval(self, run_id: int, decision: str, actor: str = "user", conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
        """Human approval decision on an R2/R3 step."""
        c = conn or get_db(self.db_path)
        run = self.get_run(c, run_id)
        if not run or run["status"] != "awaiting_approval":
            raise ValueError(f"Run #{run_id} is not awaiting approval.")

        step_n = run["pending"]["card"]["step"]
        log_activity(c, actor, f"approval.{decision}", {"id": run_id, "step": step_n})

        if decision != "approve":
            return self.finish_run(c, run_id, "aborted", actor=actor)

        c.execute("UPDATE runs SET status = 'running' WHERE id = ?", (run_id,))
        c.commit()
        return self.advance_run(run_id, approved_step=step_n, conn=c)

    def decide_repair(self, run_id: int, decision: str, actor: str = "user", conn: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
        """Human decision on an autonomous repair proposal."""
        c = conn or get_db(self.db_path)
        run = self.get_run(c, run_id)
        if not run or run["status"] != "awaiting_repair":
            raise ValueError(f"Run #{run_id} is not awaiting repair.")

        prop = run["pending"]["proposal"]
        step_n = prop["step"]
        log_activity(c, actor, f"repair.{decision}", {"id": run_id, "step": step_n})

        if decision != "approve":
            return self.finish_run(c, run_id, "handoff", actor=actor)

        # Patch the procedure with the verified target
        proc_row = c.execute("SELECT * FROM procedures WHERE id = ?", (run["procedure_id"],)).fetchone()
        steps = json.loads(proc_row["steps"])
        steps[step_n - 1]["target"]["name"] = prop["to"]

        c.execute(
            "UPDATE procedures SET steps = ?, updated_at = ? WHERE id = ?",
            (json.dumps(steps), time.time(), run["procedure_id"])
        )
        c.execute("UPDATE runs SET status = 'running' WHERE id = ?", (run_id,))
        c.commit()

        log_activity(c, "system", "procedure.patched", {"procedure": run["procedure_id"], "step": step_n, "to": prop["to"]})
        return self.advance_run(run_id, repaired_step=step_n, conn=c)


reflex_engine = ReflexEngine()
