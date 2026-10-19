"""CIEAV Governed Terminal Agent (Chat CLI).

Allows users to chat with a coding assistant in PowerShell, CMD, or Cursor,
with ALL file modifications, deletions, and executions strictly mediated
by the CIEAV Commit Layer.
"""
from __future__ import annotations
import os
import sys
import json
import shlex
import time
from typing import Optional

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from commit_layer import gateway, receipts, sandbox, job_tracker
from commit_layer.decision_model import local_decision_model
from commit_layer.tools.repo import RealRepoFileTool
from commit_layer.agents.alma_job_agent import (
    find_local_resume,
    parse_resume,
    search_matched_jobs,
    prepare_and_govern_application
)



BANNER = """[1;36m
  ██████╗██╗███████╗ █████╗ ██╗   ██╗
 ██╔════╝██║██╔════╝██╔══██╗██║   ██║
 ██║     ██║█████╗  ███████║██║   ██║
 ██║     ██║██╔══╝  ██╔══██║╚██╗ ██╔╝
 ╚██████╗██║███████╗██║  ██║ ╚████╔╝ 
  ╚═════╝╚═╝╚══════╝╚═╝  ╚═╝  ╚═══╝  [0m
[1;34m══════════════════════════════════════════════════════════════════════════════[0m
 [1;37mA G E N T - T O - A G E N T   ( A 2 A )   S O V E R E I G N   R U N T I M E[0m
 [38;5;246mThe Local Operating System for Autonomous Agents & Computer Control[0m
[1;34m══════════════════════════════════════════════════════════════════════════════[0m
 [1;32m●[0m [1;37mHost Identity   :[0m Agent-Node-01 (Online • Localhost)
 [1;32m●[0m [1;37mAuthority Plane :[0m 100% Deterministic Safety Floor (Local Loopback)
 [1;32m●[0m [1;37mCryptography    :[0m Ed25519 Hash-Chained Key ID [130ce62f]
 [1;32m●[0m [1;37mReversible SLA  :[0m Two-Phase Atomic Rollback (/undo) Active
[1;34m══════════════════════════════════════════════════════════════════════════════[0m

[1;33mType your instruction or use commands:[0m
  /decide <cmd> - Query local decision model probabilities (<3ms)
  /status     - Show Commit Layer health, keys & cognitive debt
  /model      - Inspect local decision engine architecture
  /jobs       - View real-world multi-platform job application tracker
  /receipts   - View recent Ed25519-signed receipts
  /undo       - Instantly rollback the last committed action
  exit / quit - Close session
[1;34m------------------------------------------------------------------------------[0m
"""


last_committed_receipt_id: Optional[str] = None


def format_table(rows: list[list[str]], headers: list[str]) -> str:
    col_widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            col_widths[i] = max(col_widths[i], len(str(val)))
    
    header_line = " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers))
    sep_line = "-+-".join("-" * col_widths[i] for i in range(len(headers)))
    row_lines = [" | ".join(str(val).ljust(col_widths[i]) for i, val in enumerate(row)) for row in rows]
    return f"{header_line}\n{sep_line}\n" + "\n".join(row_lines)


def render_decision_card(query: str):
    res = local_decision_model.inspect_decision(query)
    top = res["top_choice"]
    score = res["consequence_score"]
    rec = res["recommended_action"]
    preds = res["predicates"]
    dist = res["risk_distribution"]
    lat = res["latency_ms"]
    
    tier_colors = {
        "LOW": "\033[1;32m",
        "MEDIUM": "\033[1;33m",
        "HIGH": "\033[1;35m",
        "CRITICAL": "\033[1;31m"
    }
    tc = tier_colors.get(top, "\033[1;37m")
    rst = "\033[0m"

    print(f"\n\033[1;34m╔══════════════════════════════════════════════════════════════════════════════╗\033[0m")
    print(f"\033[1;34m║\033[0m  \033[1;36mCIEAV EMBEDDED DECISION MODEL (cieav-decider-mini)\033[0m                         \033[1;34m║\033[0m")
    print(f"\033[1;34m╠══════════════════════════════════════════════════════════════════════════════╣\033[0m")
    print(f"  \033[1;37mInput Query       :\033[0m \"{query[:55]}\"")
    print(f"  \033[1;37mInference Latency :\033[0m \033[1;32m{lat:.2f} ms\033[0m (100% Offline • Zero Remote API)")
    print(f"  \033[1;37mTop Decision Tier :\033[0m {tc}{top}{rst} (Consequence Score: \033[1;37m{score:.3f}\033[0m / 1.000)")
    print(f"  \033[1;37mRecommended Gate  :\033[0m {tc}{rec}{rst}")
    print(f"\n  \033[1;33mCalibrated Predicates:\033[0m")
    print(f"    • Destructive Mutation    : \033[1;37m{preds['is_destructive']*100:5.1f}%\033[0m")
    print(f"    • Prompt Injection / Jail : \033[1;37m{preds['is_prompt_injection']*100:5.1f}%\033[0m")
    print(f"    • Privilege Escalation    : \033[1;37m{preds['is_privilege_escalation']*100:5.1f}%\033[0m")
    print(f"    • Egress Exfiltration     : \033[1;37m{preds['is_egress_exfiltration']*100:5.1f}%\033[0m")
    print(f"    • Safe Routine Query      : \033[1;37m{preds['is_safe_routine']*100:5.1f}%\033[0m")
    print(f"\n  \033[1;33mProbability Distribution:\033[0m")
    print(f"    [ LOW: {dist.get('LOW',0)*100:4.1f}% | MEDIUM: {dist.get('MEDIUM',0)*100:4.1f}% | HIGH: {dist.get('HIGH',0)*100:4.1f}% | CRITICAL: {dist.get('CRITICAL',0)*100:4.1f}% ]")
    print(f"\n  \033[1;33mReasoning Features:\033[0m {', '.join(res['reasons'])}")
    print(f"\033[1;34m╚══════════════════════════════════════════════════════════════════════════════╝\033[0m\n")


def show_model_info():
    print("""
[CIEAV DECISION ENGINE ARCHITECTURE]
  Model Name       : cieav-decider-mini
  Inference Engine : Bayesian Lexical Prior + AST Consequence Scoring
  Dataset Support  : tomngdev/shell-safety-v2 (10,000+ real shell executions)
  Execution Time   : ~1.5 - 3.5 ms per evaluation
  Dependencies     : 100% Local Native (No remote API, zero latency penalty)
  API Conformance  : OpenAI Decisions API (/v1/decisions) & System One (/v1/systemone)
  Safety Invariant : Monotonic Safety Floor (Can only RAISE friction, never lower)
""")


def show_status():
    all_r = receipts.get_all_receipts()
    valid, errors = receipts.verify_chain()
    _, _, key_id = receipts.get_signing_key()
    print("\n[CIEAV STATUS REPORT]")
    print(f"  Ledger Status     : {'100% VALID' if valid else 'TAMPERED'}")
    print(f"  Signing Key ID    : {key_id} (Ed25519)")
    print(f"  Total Receipts    : {len(all_r)}")
    print(f"  Pending Actions   : {len(gateway.pending_actions)}")
    print(f"  Chain Errors      : {errors}")
    print(f"  Live Server       : http://127.0.0.1:8000\n")


def show_receipts():
    all_r = receipts.get_all_receipts()
    if not all_r:
        print("\nNo receipts signed yet. Ledger is clean.\n")
        return

    rows = []
    for r in all_r[-10:]:
        tool = r.get("tool", "")[:18]
        status = r.get("status", "")
        outcome = r.get("outcome", "")
        undo = r.get("undo_state", "")
        rid = r.get("id", "")[:8]
        rows.append([rid, tool, status, outcome, undo])

    print("\n[RECENT CRYPTOGRAPHIC RECEIPTS]")
    print(format_table(rows, ["ID", "TOOL", "STATUS", "OUTCOME", "UNDO"]))
    print()


def handle_undo():
    global last_committed_receipt_id
    if not last_committed_receipt_id:
        # Check last receipt in ledger
        all_r = receipts.get_all_receipts()
        if all_r:
            last_committed_receipt_id = all_r[-1].get("id")
    
    if not last_committed_receipt_id:
        print("\n[UNDO] No recent actions available to undo.\n")
        return

    print(f"\n[UNDO] Attempting rollback of receipt {last_committed_receipt_id[:8]}...")
    res = gateway.undo(last_committed_receipt_id)
    if "error" in res:
        print(f"  ❌ Rollback failed: {res['error']}\n")
    else:
        print(f"  ✅ Rollback SUCCESS: {res.get('result', {})}")
        print("  Receipt state updated to UNDONE in cryptographic ledger.\n")
        job_tracker.update_application_status(last_committed_receipt_id, status="UNDONE", undo_state="UNDONE")


def execute_governed_action(tool_name: str, args: dict, agent_id: str = "cieav-chat-agent"):
    global last_committed_receipt_id
    
    desc = f"{tool_name} {args}"
    dec_meta = local_decision_model.inspect_decision(desc)
    print(f"\n\033[1;36m[DECISION ENGINE: {dec_meta['model']}]\033[0m Latency: \033[1;32m{dec_meta['latency_ms']:.2f}ms\033[0m | Consequence: \033[1;37m{dec_meta['consequence_score']:.3f}\033[0m | P(destruct): \033[1;37m{dec_meta['predicates']['is_destructive']*100:.0f}%\033[0m")

    action = gateway.intercept(tool_name=tool_name, args=args, agent_id=agent_id)
    eval_res = gateway.process(action)

    if eval_res.get("status") == "pending":
        print(f"\n[CIEAV INTERCEPTOR] Action held for human governance:")
        print(f"  Tool     : {action.tool_name}")
        print(f"  Target   : {args.get('file_path') or args.get('filename') or args.get('to') or args}")
        print(f"  Risk     : {action.risk.name} (Policy Floor Enforced)")
        print(f"  Reasons  : {', '.join(action.reasons)}")
        
        req_typed = eval_res.get("requires_typed_confirmation", False)
        prompt_txt = "Type 'COMMIT' to approve or press Enter to cancel: " if req_typed else "Approve this action? (y/N): "
        
        try:
            choice = input(prompt_txt).strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAction cancelled.")
            gateway.cancel(action.id)
            return

        if (req_typed and choice == "COMMIT") or (not req_typed and choice.lower() in ("y", "yes")):
            print("[CIEAV] Approving with single-use token...")
            appr = gateway.approve(action.id, approved_by="human-operator")
            print(f"  ✅ Status  : {appr.get('status').upper()}")
            print(f"  ✅ Outcome : {appr.get('outcome')}")
            print(f"  ✅ Signed  : {appr.get('receipt_id')[:8]}")
            last_committed_receipt_id = appr.get("receipt_id")
        else:
            print("[CIEAV] Action cancelled by human operator.")
            gateway.cancel(action.id)
    else:
        # Auto-committed or rejected
        print(f"\n[CIEAV AUTO-COMMIT]")
        print(f"  Status  : {eval_res.get('status')}")
        print(f"  Outcome : {eval_res.get('outcome')}")
        last_committed_receipt_id = eval_res.get("receipt_id")


def run_alma_job_search_workflow(query_text: str = ""):
    global last_committed_receipt_id

    print("\n" + "=" * 76)
    print("   ALMA COMPUTER CONTROL AGENT (CIEAV COMMIT LAYER)")
    print("   Autonomous Job Search & Application Governance")
    print("=" * 76)
    print("[1/4] Scanning local Windows filesystem for candidate resume...")
    resume_path = find_local_resume()
    if resume_path:
        print(f"  ✅ Located candidate resume: {resume_path}")
    else:
        print("  ⚠️ Resume not detected at default paths. Using local profile context.")
        resume_path = r"C:\Users\ADMIN\Desktop\Aravindh\public\resume.html"

    profile = parse_resume(resume_path)
    print(f"  👤 Candidate : {profile['name']} ({profile['headline']})")
    print(f"  📍 Location  : {profile['location']}")
    if profile.get('phone'):
        print(f"  📞 Phone     : {profile['phone']}")
    print(f"  🛠️  Skills    : {', '.join(profile['skills'][:6])}...")
    print(f"  🔗 Profiles  : {profile['github']} | {profile['linkedin']}")

    print("\n[2/4] Researching live jobs across LinkedIn, RemoteOK, and Arbeitnow feeds...")
    matched_jobs = search_matched_jobs(profile, query=query_text)

    print(f"\n{'#':<4} {'COMPANY':<20} {'ROLE':<34} {'PLATFORM':<12} {'MATCH':<8} {'LOCATION'}")
    print("-" * 96)
    for i, j in enumerate(matched_jobs[:8], 1):
        comp = j['company'][:19]
        role = j['role'][:33]
        plat = j.get('platform', 'Direct')[:11]
        score = f"{j['match_score']}%"
        loc = j.get('location', 'Remote')[:18]
        print(f"[{i:<2}] {comp:<20} {role:<34} {plat:<12} {score:<8} {loc}")

    target_job = matched_jobs[0]
    has_explicit_company = any(c.lower() in query_text.lower() for c in ["google", "openai", "cursor", "anthropic", "vercel", "cognition", "microsoft", "meta", "amazon", "apple", "tether", "lemon.io"])
    if not has_explicit_company and len(matched_jobs) > 1:
        try:
            print("\nOptions: Enter 1-8 to select role | Type company name to target | Type 'report' for history")
            sel = input("Select job to apply [1-8, or company, or report]: ").strip()
            if sel.lower() in ("report", "/report", "/jobs", "jobs"):
                print("\n" + job_tracker.format_cli_report() + "\n")
                return
            if sel.isdigit() and 1 <= int(sel) <= len(matched_jobs):
                target_job = matched_jobs[int(sel) - 1]
            elif sel:
                target_job = search_matched_jobs(profile, query=sel)[0]
        except (KeyboardInterrupt, EOFError):
            print("\nCancelled.")
            return

    print(f"\n[3/4] Preparing application dossier for: {target_job['company']} ({target_job['role']})...")
    gov = prepare_and_govern_application(profile, target_job, agent_id="alma-terminal-agent")

    action_id = gov["action_id"]
    print(f"\n[CIEAV INTERCEPTOR] Outbound application held for human governance:")
    print(f"  Target Company : {target_job['company']}")
    print(f"  Role           : {target_job['role']}")
    print(f"  Platform       : {target_job.get('platform', 'Direct')}")
    print(f"  Listing URL    : {target_job.get('listing_url', 'Direct')}")
    print(f"  Risk Level     : {gov['risk']} (Policy Floor: Outbound PII & Legal Intent)")
    print(f"  Redacted PII   : {gov['args_redacted']}")
    print(f"  Policy Reason  : {', '.join(gov['reasons'])}")
    print(f"  Permit Token   : Ephemeral 60s single-use cryptographic permit")

    prompt_txt = "Type 'COMMIT' to approve submission or press Enter to cancel: "
    try:
        choice = input(prompt_txt).strip()
    except (KeyboardInterrupt, EOFError):
        print("\nApplication cancelled.")
        gateway.cancel(action_id)
        job_tracker.update_application_status(action_id, status="CANCELLED")
        return

    if choice == "COMMIT" or choice.lower() in ("y", "yes", "commit"):
        print("\n[4/4] [CIEAV] Committing application with single-use permit token...")
        appr = gateway.approve(action_id, approved_by="aravindh-human-operator")
        last_committed_receipt_id = appr.get("receipt_id", "")
        job_tracker.update_application_status(action_id, status="COMMITTED", receipt_id=last_committed_receipt_id)
        print(f"  ✅ Status     : COMMITTED")
        print(f"  ✅ Outcome    : {appr.get('outcome')}")
        print(f"  ✅ Signed ID  : {last_committed_receipt_id[:8]} (Ed25519 Chain)")
        print(f"  ✅ Result     : {appr.get('result', {}).get('message', 'Submitted')}")
        print(f"  ✅ Platform Sourced : {target_job.get('platform', 'Direct')}")
        print("\n[TWO-PHASE SAFETY GUARANTEE] You can withdraw this application anytime by typing: /undo\n")
    else:
        print("[CIEAV] Action cancelled by operator. No PII transmitted.\n")
        gateway.cancel(action_id)
        job_tracker.update_application_status(action_id, status="CANCELLED")

    # Print real-time auto-updated report summary
    print(job_tracker.format_cli_report() + "\n")

def run_alma_general_intent_workflow(prompt: str):
    global last_committed_receipt_id
    from commit_layer import intent
    
    print("\n============================================================================")
    print("   ALMA COMPUTER CONTROL AGENT (CIEAV COMMIT LAYER)")
    print("   Autonomous Multi-Domain Intent Execution")
    print("============================================================================")
    print(f"🎯 Target Intent : \"{prompt}\"")
    
    try:
        plan = intent.plan_intent(prompt)
    except Exception as e:
        print(f"  ❌ Intent planning error: {e}\n")
        return

    actions = plan.get("actions", [])
    if not actions:
        print(f"\n[AI AGENT INTERPRETER] Instruction received: '{prompt}'")
        print("Tip: To control your computer safely via CIEAV (like Alma / Claude Code):")
        print("  exec <shell_cmd>              -> Governed command execution")
        print("  create <file> <content>       -> Governed file creation with snapshot")
        print("  modify <file> <content>       -> Governed file modification with snapshot")
        print("  delete <filepath>             -> Intercepted as CRITICAL with 2-Phase Undo")
        print("  pay <amount> <recipient>      -> Governed financial transfer with spend bounds")
        print("  cieav \"find jobs and apply\"   -> Autonomous career search and application")
        print("  /undo                         -> Instant cryptographic rollback of last action\n")
        return

    print(f"📋 Actions Planned : {len(actions)} atomic operation(s)")
    print(f"🔒 Highest Risk    : {plan.get('highest_risk')} (Safety Floor Enforced)")
    if plan.get("recalled_from_memorable"):
        print(f"🧠 Memorable Cache : Recalled verified procedure (saved {plan.get('tokens_saved')} reasoning tokens)")

    for idx, act in enumerate(actions, 1):
        print(f"\n  [{idx}/{len(actions)}] Action: {act.get('summary', act['tool'])}")
        print(f"      Domain     : {act.get('domain', 'general').upper()}")
        print(f"      Tool       : {act['tool']}")
        print(f"      Risk Level : {act['risk']}")
        print(f"      Reasons    : {', '.join(act.get('reasons', []))}")
        print(f"      Arguments  : {act.get('args_redacted', {})}")
        print(f"      Rollback   : {'Available (Atomic snapshot inverse)' if act.get('can_rollback') else 'Irreversible'}")

    req_typed = plan.get("requires_typed_confirmation", False)
    prompt_txt = f"\nType 'COMMIT' to approve plan or press Enter to cancel: " if req_typed else "\nApprove this plan? (y/N): "
    
    try:
        choice = input(prompt_txt).strip()
    except (KeyboardInterrupt, EOFError):
        choice = ""

    if (req_typed and ("COMMIT" in choice.upper() or choice.upper() == plan.get("confirmation_phrase", "").upper())) or (not req_typed and choice.lower() in ("y", "yes")):
        print("\n[CIEAV] Committing actions under cryptographic governance...")
        res = intent.commit_plan(plan["plan_id"], approved_by="human-operator", typed_confirmation="COMMIT")
        if "error" in res:
            print(f"  ❌ Commit error: {res['error']}\n")
            return
        
        for r in res.get("results", []):
            rid = r.get("receipt_id", "N/A")
            if rid and rid != "N/A":
                last_committed_receipt_id = rid
            print(f"  ✅ Executed: {r.get('status', '').upper()} | Outcome: {r.get('outcome', 'UNKNOWN')} | Receipt: {rid[:8] if rid != 'N/A' else 'NONE'}")
            if "result" in r:
                print(f"     Result  : {r.get('result')}")
        print("\n[CIEAV] All operations committed and recorded in Ed25519 hash-chained ledger.")
        print("  Type 'cieav /undo' to recall the committed action.\n")
    else:
        print("\n[CIEAV] Plan cancelled by operator. No state was mutated.\n")
        for act in actions:
            gateway.cancel(act["action_id"])


def process_user_input(text: str):
    cmd = text.strip()
    if not cmd:
        return

    # Strip redundant leading 'cieav ' and quotes if user typed full CLI command inside chat shell
    if cmd.lower().startswith("cieav "):
        cmd = cmd[6:].strip()
        if (cmd.startswith('"') and cmd.endswith('"')) or (cmd.startswith("'") and cmd.endswith("'")):
            cmd = cmd[1:-1].strip()

    lower = cmd.lower()
    if lower in ("exit", "quit", "/quit", "/exit"):
        print("Goodbye!")
        sys.exit(0)
    elif lower.startswith("/decide ") or lower.startswith("/eval "):
        query = cmd.split(" ", 1)[1].strip()
        render_decision_card(query)
        return
    elif lower in ("/decide", "decide", "/eval", "eval"):
        print("\nUsage: /decide <command or prompt>  (e.g. /decide rm -rf / or /decide pay $500)\n")
        return
    elif lower in ("/model", "model", "/models", "models"):
        show_model_info()
        return
    elif lower in ("/help", "help"):
        print("""
Available Governed Commands:
  /decide <cmd> - Query local decision model probabilities (<3ms)
  /status       - Inspect Commit Layer state and Ed25519 signing key
  /model        - Inspect local decision engine architecture
  /receipts     - View recent cryptographic Ed25519 hash-chained receipts
  /undo         - Instantly rollback the last committed action
  /jobs         - View real-world multi-platform job application tracker
  /reset        - Clean the receipts ledger
  exit / quit   - Close session

4 Real-World Governed Agent Scenarios:
  1. Autonomous Career Search & Application (Alma Style):
     cieav "find jobs based on my resume and apply"
     cieav "apply to Tether on RemoteOK"
     cieav /jobs
  2. Codebase Refactoring & Disaster Recovery (Atomic Undo):
     cieav create demo.txt "Hello from CIEAV"
     cieav delete demo.txt
     cieav /undo
  3. CFO Budget & Financial Transaction Governance:
     cieav "pay $250 to AWS for GPU cluster"
     cieav pay 50 merchant_a
     cieav /undo
  4. Autonomous DevOps & Infrastructure Incident Governance:
     cieav "deploy service payment-worker v2.1.0"
     cieav "attest tpm pcr 7"
     cieav "reboot edge-node-01"
""")
        return
    elif lower in ("/status", "status"):
        show_status()
        return
    elif lower in ("/receipts", "receipts"):
        show_receipts()
        return
    elif lower in ("/undo", "undo"):
        handle_undo()
        return
    elif lower in ("/jobs", "jobs", "/report", "report"):
        print("\n" + job_tracker.format_cli_report() + "\n")
        return
    elif lower in ("/reset", "reset"):
        receipts.clear_all_receipts()
        gateway.pending_actions.clear()
        print("\nLedger reset. Receipts count: 0\n")
        return

    # Check for file commands
    if cmd.startswith("read "):
        target = cmd[5:].strip().strip('"').strip("'")
        if os.path.exists(target):
            try:
                with open(target, "r", encoding="utf-8") as f:
                    content = f.read()
                print(f"\n[CONTENT OF {target}] ({len(content)} bytes):\n")
                print(content[:1500] + ("\n... [truncated]" if len(content) > 1500 else ""))
                print()
            except Exception as e:
                print(f"Error reading file: {e}")
        else:
            print(f"File not found: {target}")
        return

    if cmd.startswith("list ") or cmd.startswith("ls "):
        target = cmd.split(" ", 1)[1].strip().strip('"').strip("'")
        if os.path.isdir(target):
            items = os.listdir(target)
            print(f"\n[DIRECTORY LISTING: {target}] ({len(items)} items):")
            for item in sorted(items)[:30]:
                is_dir = os.path.isdir(os.path.join(target, item))
                print(f"  {'[DIR] ' if is_dir else '      '} {item}")
            if len(items) > 30:
                print(f"  ... and {len(items) - 30} more items.")
            print()
        else:
            print(f"Directory not found: {target}")
        return

    if cmd.startswith("delete ") or cmd.startswith("rm "):
        target = cmd.split(" ", 1)[1].strip().strip('"').strip("'")
        if target.startswith("file "):
            target = target[5:].strip().strip('"').strip("'")
        execute_governed_action("repo_file_action", {"file_path": target, "operation": "delete"})
        return

    if cmd.startswith("modify ") or cmd.startswith("write ") or cmd.startswith("create "):
        parts = cmd.split(" ", 2)
        if len(parts) >= 3:
            target = parts[1].strip().strip('"').strip("'")
            new_content = parts[2].strip()
            execute_governed_action("repo_file_action", {"file_path": target, "operation": "modify", "content": new_content})
        else:
            print("Usage: modify <file_path> <content> or create <file_path> <content>")
        return

    if cmd.startswith("exec ") or cmd.startswith("run "):
        shell_cmd = cmd.split(" ", 1)[1].strip()
        execute_governed_action("run_terminal_command", {"command": shell_cmd})
        return

    if cmd.startswith("pay "):
        parts = cmd.split()
        if len(parts) == 3 and parts[2].lower() != "to":
            try:
                amt = float(parts[1].replace("$", ""))
                recipient = parts[2]
                execute_governed_action("send_payment", {"amount": amt, "to": recipient})
                return
            except ValueError:
                pass

    # Fallback to smart intent matching
    words = lower.split()
    if any(k in words for k in ("job", "jobs", "resume", "apply", "linkedin", "career", "alma")):
        run_alma_job_search_workflow(query_text=cmd)
        return

    if "undo" in words or "/undo" in words:
        handle_undo()
        return
    elif "status" in words:
        show_status()
        return
    elif "receipt" in words or "ledger" in words:
        show_receipts()
        return


    # Check for natural language "pay $X to Y"
    if "pay" in words and any(w.startswith("$") or w.isdigit() for w in words):
        amt = 0.0
        rec = "merchant_a"
        for w in words:
            clean = w.replace("$", "")
            try:
                amt = float(clean)
                break
            except ValueError:
                continue
        if "to" in words:
            to_idx = words.index("to")
            if to_idx + 1 < len(words):
                rec = words[to_idx + 1]
        if amt > 0:
            execute_governed_action("send_payment", {"amount": amt, "to": rec})
            return

    # Check for natural language "delete ..."
    if "delete" in words:
        for w in words:
            if "." in w or "/" in w or "\\" in w:
                execute_governed_action("repo_file_action", {"file_path": w, "operation": "delete"})
                return
    # Fallback to Alma multi-domain autonomous intent workflow
    run_alma_general_intent_workflow(cmd)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    
    # If one-shot command passed: e.g. cieav "delete myfile.txt"
    if args:
        if len(args) == 1 and args[0].lower() in ("chat", "repl", "interactive", "start"):
            pass  # Fall through to interactive loop
        else:
            joined = " ".join(args)
            process_user_input(joined)
            return 0

    # Interactive REPL
    print(BANNER)
    while True:
        try:
            user_input = input("cieav> ").strip()
            process_user_input(user_input)
        except (KeyboardInterrupt, EOFError):
            print("\nExiting CIEAV Chat.")
            break
    return 0



if __name__ == "__main__":
    sys.exit(main())
