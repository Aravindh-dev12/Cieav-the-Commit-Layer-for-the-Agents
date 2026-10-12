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

from commit_layer import gateway, receipts, sandbox
from commit_layer.tools.repo import RealRepoFileTool


BANNER = r"""
==============================================================================
   C I E A V   C H A T  --  Governed AI Terminal Agent
   The Commit Layer for Computer Control & Autonomous Agents (like Alma & Claude Code)
==============================================================================
Type your instruction or use commands:
  /help       - Show available commands & examples
  /status     - Show Commit Layer health, keys & cognitive debt
  /receipts   - View recent Ed25519-signed receipts
  /undo       - Undo the last committed action
  exit / quit - Exit session
------------------------------------------------------------------------------
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


def execute_governed_action(tool_name: str, args: dict, agent_id: str = "cieav-chat-agent"):
    global last_committed_receipt_id
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


def process_user_input(text: str):
    cmd = text.strip()
    if not cmd:
        return

    lower = cmd.lower()
    if lower in ("exit", "quit", "/quit", "/exit"):
        print("Goodbye!")
        sys.exit(0)
    elif lower in ("/help", "help"):
        print("""
Available Commands:
  /status     - Inspect Commit Layer state and Ed25519 signing key
  /receipts   - View recent cryptographic receipts
  /undo       - Rollback the last committed action
  /reset      - Clean the receipts ledger
  exit / quit - Close session

Natural Language Task Examples:
  * 'read <path>'             - Inspect a file losslessly
  * 'list <path>'             - List files in a directory
  * 'delete <path>'           - Governed file deletion with rollback
  * 'modify <path> <text>'    - Governed file modification with snapshot
  * 'undo'                    - Revert last action
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
        if len(parts) >= 3:
            try:
                amt = float(parts[1].replace("$", ""))
                recipient = parts[2]
                execute_governed_action("send_payment", {"amount": amt, "to": recipient})
                return
            except ValueError:
                pass
        print("Usage: pay <amount> <recipient> (e.g. pay 50 merchant_a)")
        return

    # Fallback to smart intent matching
    words = lower.split()
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

    print(f"\n[AI AGENT INTERPRETER] Instruction received: '{cmd}'")
    print("Tip: To control your computer safely via CIEAV (like Alma / Claude Code):")
    print("  exec <shell_cmd>              -> Governed command execution (filtered for harm)")
    print("  create <file> <content>       -> Governed file creation with snapshot")
    print("  modify <file> <content>       -> Governed file modification with snapshot")
    print("  delete <filepath>             -> Intercepted as CRITICAL with 2-Phase Undo")
    print("  read <filepath>               -> Safe lossless inspection")
    print("  list <dirpath>                -> Safe directory listing")
    print("  pay <amount> <recipient>      -> Governed financial transfer with spend bounds")
    print("  /undo                         -> Instant cryptographic rollback of last action\n")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    
    # If one-shot command passed: e.g. cieav chat "delete myfile.txt"
    if args:
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
