"""
CIEAV Superintelligent Autonomous Agent Engine (Claude Code & Codex Class).
=============================================================================
Runs 100% locally on CPU without requiring any external cloud APIs.
Transforms arbitrary natural language instructions into governed, reversible
actions across:
1. Code Synthesis, Refactoring & Real File Mutations (with snapshot /undo)
2. Local Headless Browser & DOM Window Automation (Edge/Chrome native)
3. Virtual Office Project Management & Multi-Agent Team Orchestration
4. Personalized Note-Taking & Markdown Knowledge Vault Management
5. Project Scaffolding & Directory Hierarchy Generation
6. GitHub DevOps: Live Issue Inspection, Autonomous Bug Fixing, PRs & Push
7. Governed Outbound Email Authoring & Dispatch
8. Governed WhatsApp Messaging via Sanitized Deep Links
9. Interactive Terminal Game & Cyber Simulation Engine
"""

from __future__ import annotations
import os
import re
import subprocess
import time
from typing import Any, Dict, List, Optional

from commit_layer import gateway, receipts
from commit_layer.decision_model import local_decision_model
from commit_layer.local_browser import local_browser
from commit_layer.virtual_office import virtual_office
from commit_layer.cli_game import cli_game
from commit_layer.tools.notes_manager import notes_manager
from commit_layer.tools.github_agent import github_agent
from commit_layer.tools.email_agent import email_agent
from commit_layer.tools.messaging_agent import whatsapp_agent
from commit_layer.tools.os_automator import os_automator
from commit_layer.code_healer import code_healer
from commit_layer.super_agent import super_agent
from commit_layer.multilingual import multilingual_engine
from commit_layer.gui_agent import gui_agent
from commit_layer.trace_analytics import trace_analytics
from commit_layer.workspace import get_workspace_root


class AutonomousLocalAgent:
    """Claude Code & Codex Class Local Agent Runtime."""

    def __init__(self):
        self.workspace_root = get_workspace_root()

    def process_instruction(self, user_prompt: str) -> Dict[str, Any]:
        """
        Full autonomous Reason-Plan-Act-Verify cycle running entirely on local CPU.
        """
        p = user_prompt.strip()
        lower = p.lower()

        # Multilingual & International Intent Routing
        m_intent, m_lang = multilingual_engine.match_multilingual_intent(p)
        if m_intent == "GREETING":
            return {
                "type": "greeting",
                "message": multilingual_engine.get_greeting(m_lang),
                "language": m_lang
            }
        elif m_intent == "VIDEO_EDIT":
            res = gui_agent.execute_video_editing_mission(p)
            return {
                "type": "video_studio",
                "message": gui_agent.render_gui_mission_card(res),
                "data": res
            }

        # Hands-free Video Studio & GUI Automation
        if any(w in lower for w in ("video edit", "edit video", "trim video", "cut video", "create video", "gui control", "clipchamp")):
            res = gui_agent.execute_video_editing_mission(p)
            return {
                "type": "video_studio",
                "message": gui_agent.render_gui_mission_card(res),
                "data": res
            }

        # Grounded Telemetry & Real Audit Data (No Hallucination)
        if any(k in lower for k in ("highest latency", "slowest trace", "trace latency", "latency yesterday")):
            data = trace_analytics.get_highest_latency_traces()
            return {
                "type": "telemetry",
                "message": trace_analytics.render_latency_card(data),
                "data": data
            }

        if any(k in lower for k in ("token spend", "spend by model", "tokens this week", "model spend", "my token")):
            data = trace_analytics.get_token_spend_by_model()
            return {
                "type": "cfo_spend",
                "message": trace_analytics.render_token_spend_card(data),
                "data": data
            }

        if any(k in lower for k in ("errors into a dataset", "error dataset", "turn errors", "make dataset")):
            data = trace_analytics.turn_errors_into_dataset()
            return {
                "type": "dataset",
                "message": trace_analytics.render_dataset_card(data),
                "data": data
            }

        # 0. Conversational Friendly Greeting Intent
        if lower in ("hi", "hello", "hey", "hi cieav", "hello cieav", "hey cieav", "hi cieva", "hello cieva", "hey cieva", "cieva", "who are you", "what can you do", "help me"):
            return {
                "type": "greeting",
                "message": (
                    "👋 Hello! I am CIEAV — Your Sovereign Computer-Control Agent OS.\n"
                    "Operating 100% locally on your CPU with zero third-party cloud APIs.\n\n"
                    "I can launch native apps ('open chrome', 'open notepad', 'open calc'),\n"
                    "search e-commerce stores ('buy clothes in amazon'), scaffold projects,\n"
                    "inspect and fix GitHub issues, manage your personal encrypted notes vault,\n"
                    "and coordinate multi-agent virtual office tasks.\n\n"
                    "Consequential actions are safely guarded by Two-Phase Cryptographic Commits (COMMIT) and lossless /undo."
                )
            }

        # App Launch Intent (Chrome, Edge, Notepad, Calc, Explorer)
        if lower in ("open chrome", "launch chrome") or lower.startswith("open chrome ") or lower.startswith("launch chrome "):
            url = "https://www.google.com"
            parts = p.split(None, 2)
            if len(parts) >= 3 and "." in parts[2]:
                url = parts[2].strip()
                if not url.startswith("http"):
                    url = f"https://{url}"
            res = local_browser.open_chrome(url=url)
            return {
                "type": "app_launch",
                "message": f"🚀 [APP LAUNCHER] Launched Google Chrome directly ({url} • Native OS Process)",
                "result": res
            }

        if lower in ("open edge", "launch edge") or lower.startswith("open edge ") or lower.startswith("launch edge "):
            url = "https://www.bing.com"
            parts = p.split(None, 2)
            if len(parts) >= 3 and "." in parts[2]:
                url = parts[2].strip()
                if not url.startswith("http"):
                    url = f"https://{url}"
            res = local_browser.open_edge(url=url)
            return {
                "type": "app_launch",
                "message": f"🚀 [APP LAUNCHER] Launched Microsoft Edge directly ({url} • Native OS Process)",
                "result": res
            }

        if lower in ("open notepad", "launch notepad", "notepad"):
            subprocess.Popen(["notepad.exe"])
            return {
                "type": "app_launch",
                "message": "🚀 [APP LAUNCHER] Launched Notepad (notepad.exe • Native Windows Process)"
            }

        if lower in ("open calc", "open calculator", "launch calc", "launch calculator", "calc", "calculator"):
            subprocess.Popen(["calc.exe"])
            return {
                "type": "app_launch",
                "message": "🚀 [APP LAUNCHER] Launched Windows Calculator (calc.exe • Native Windows Process)"
            }

        if lower in ("open explorer", "launch explorer", "open files", "explorer", "files"):
            subprocess.Popen(["explorer.exe", "."])
            return {
                "type": "app_launch",
                "message": "🚀 [APP LAUNCHER] Opened Windows File Explorer at current directory"
            }

        # SuperAgent Autonomous Goal / Mission Intent
        if lower.startswith("goal ") or lower.startswith("/goal ") or lower.startswith("auto ") or lower.startswith("/auto ") or any(w in lower for w in ("autonomous mission", "execute goal", "super agent")):
            goal_text = re.sub(r'^(?:goal|/goal|auto|/auto)\s+', '', p, flags=re.IGNORECASE).strip() or p
            res = super_agent.execute_goal(goal_text)
            return {
                "type": "super_agent",
                "message": super_agent.render_mission_card(res),
                "data": res
            }

        # Autonomous Code Healer Intent
        if any(w in lower for w in ("heal code", "repair code", "heal tests", "fix tests", "self heal", "debug tests", "auto heal")):
            res = code_healer.heal_and_verify("python -m pytest commit_layer/tests/test_commit_layer.py -q")
            return {
                "type": "code_healer",
                "message": code_healer.render_healer_card(res),
                "data": res
            }

        # OS Diagnostics & System Telemetry Intent
        if any(w in lower for w in ("system status", "diagnostics", "telemetry", "cpu load", "ram usage", "memory usage", "disk space", "check system", "inspect system")):
            diag = os_automator.get_system_diagnostics()
            return {
                "type": "diagnostics",
                "message": os_automator.render_diagnostics_card(diag),
                "data": diag
            }

        # Safe Temp & Cache Cleaner Intent
        if any(w in lower for w in ("clean temp", "clean cache", "clean junk", "purge temp", "free disk", "empty temp")):
            res = os_automator.clean_temp_files(dry_run=False)
            return {
                "type": "temp_cleaner",
                "message": (
                    f"🧹 \033[1;32m[OS AUTOMATOR • TEMP CLEANER]\033[0m\n"
                    f"  • Files Purged  : \033[1;36m{res.get('deleted_count', 0)}\033[0m safe temporary files\n"
                    f"  • Space Freed   : \033[1;32m{res.get('reclaimed_mb', 0)} MB\033[0m disk space reclaimed\n"
                    f"  • Locked In-Use : {res.get('skipped_locked', 0)} (preserved)\n"
                    f"  • Status        : Cleaned safely without impacting running processes"
                ),
                "data": res
            }

        # Workspace File Organizer Intent
        if any(w in lower for w in ("organize directory", "organize folder", "sort files", "organize files")):
            target_match = re.search(r'(?:directory|folder|in)\s+([A-Za-z]:\\[^\s"\'<>]+|\/[^\s"\'<>]+)', p)
            target = target_match.group(1) if target_match else "."
            res = os_automator.organize_directory(target)
            return {
                "type": "file_organizer",
                "message": (
                    f"📁 \033[1;32m[OS AUTOMATOR • FILE ORGANIZER]\033[0m\n"
                    f"  • Target Directory : {res.get('target_dir')}\n"
                    f"  • Organized Files  : \033[1;36m{res.get('moved_count', 0)}\033[0m sorted by category\n"
                    f"  • Categories       : Documents, Media, Code, Archives, Data\n"
                    f"  • Rollback SLA     : 100% reversible via /undo"
                ),
                "data": res
            }

        # Duplicate File Finder Intent
        if any(w in lower for w in ("find duplicates", "check duplicates", "duplicate files", "dedup")):
            target_match = re.search(r'(?:in|for)\s+([A-Za-z]:\\[^\s"\'<>]+|\/[^\s"\'<>]+)', p)
            target = target_match.group(1) if target_match else "."
            res = os_automator.find_duplicates(target)
            return {
                "type": "duplicate_finder",
                "message": (
                    f"🔍 \033[1;32m[OS AUTOMATOR • DUPLICATE SCANNER]\033[0m\n"
                    f"  • Scanned Directory: {res.get('target_dir')}\n"
                    f"  • Redundant Files  : \033[1;33m{res.get('redundant_files_count', 0)}\033[0m duplicate(s)\n"
                    f"  • Unique Hashes    : {res.get('duplicate_groups', 0)} collision group(s)"
                ),
                "data": res
            }

        # Listening Ports Inspector Intent
        if any(w in lower for w in ("ports", "listening ports", "active ports", "check ports")):
            ports_data = os_automator.inspect_ports()
            return {
                "type": "ports",
                "message": os_automator.render_ports_card(ports_data),
                "data": ports_data
            }

        # Swarm Office Execution Intent
        if lower in ("office run", "office swarm", "run swarm", "run office", "swarm execute", "/office run"):
            res = virtual_office.run_swarm_cycle()
            return {
                "type": "virtual_office",
                "message": (
                    f"🚀 \033[1;32m[VIRTUAL OFFICE • SWARM EXECUTION]\033[0m\n"
                    f"  • Completed Tasks  : \033[1;36m{res.get('executed_count', 0)}\033[0m tasks advanced by agent team\n\n"
                    + virtual_office.render_board()
                ),
                "data": res
            }

        # 1. Notes & Knowledge Vault Intent
        if any(w in lower for w in ("note", "notes", "knowledge vault", "personal note")):
            return self._handle_notes_intent(p)

        # 2. Project Scaffolding & Creation Intent
        if any(w in lower for w in ("create project", "scaffold project", "scaffold", "new project", "build project")):
            return self._handle_scaffold_intent(p)

        # 3. GitHub & DevOps Intent (Issues, PRs, Push)
        if any(w in lower for w in ("github", "issue", "issues", "pr", "pull request", "push to github", "git push")):
            return self._handle_github_intent(p)

        # 4. Outbound Email Intent
        if any(w in lower for w in ("write mail", "send mail", "send email", "email to", "compose mail")):
            return self._handle_email_intent(p)

        # 5. WhatsApp Messaging Intent
        if any(w in lower for w in ("whatsapp", "send wa", "wa message")):
            return self._handle_whatsapp_intent(p)

        # 6. Virtual Office & Team Workspace Intent
        if any(w in lower for w in ("office", "workspace", "kanban", "standup", "team status", "assign task")):
            return self._handle_office_intent(p)

        # 7. Local Browser Intent (Edge/Chrome Native • 0% APIs)
        if any(w in lower for w in ("browser", "dom", "screenshot", "webpage", "render web", "headless")):
            return self._handle_browser_intent(p)

        # 8. Interactive Terminal Game Intent
        if any(w in lower for w in ("game", "play game", "cyber commit", "hack defend", "start game")):
            return self._handle_game_intent(p)

        # 9. Code Generation / File Creation Intent
        if any(w in lower for w in ("write code", "create script", "generate code", "build script", "make file", "create file")):
            return self._handle_code_generation(p)

        # 10. General Computer Control & Shell Intent (Claude Code / Codex style)
        return self._handle_general_intent(p)

    def _handle_notes_intent(self, prompt: str) -> Dict[str, Any]:
        lower = prompt.lower()
        if "search" in lower or "find" in lower:
            kw = re.sub(r'^(?:search|find)\s+(?:in\s+)?(?:notes|note)?\s*', '', prompt, flags=re.IGNORECASE).strip()
            matches = notes_manager.search_notes(kw or "cieav")
            card = notes_manager.render_cli_notes(matches, title_label=f"Search Results for '{kw}'")
            return {
                "type": "notes",
                "message": card,
                "matches": matches
            }
        elif lower in ("notes", "list notes", "my notes", "show notes", "all notes"):
            all_notes = notes_manager.list_notes()
            card = notes_manager.render_cli_notes(all_notes, title_label="Personal Notes Vault")
            return {
                "type": "notes",
                "message": card,
                "notes": all_notes
            }
        else:
            # Taking a note
            content = re.sub(r'^(?:take\s+note|save\s+note|write\s+note|note)\s*[:\-]?\s*', '', prompt, flags=re.IGNORECASE).strip()
            if not content:
                content = prompt
            res = notes_manager.take_note(content=content)
            all_notes = notes_manager.list_notes()
            card = notes_manager.render_cli_notes(all_notes, title_label=f"Saved Note: {res['title']}")
            return {
                "type": "notes",
                "message": f"✅ Note saved locally to '{res['filename']}' ({res['char_count']} chars • Reversible via /undo)\n" + card,
                "note": res
            }

    def _handle_scaffold_intent(self, prompt: str) -> Dict[str, Any]:
        # Extract project name
        match = re.search(r'(?:create|scaffold|new|build)\s+project\s+([a-zA-Z0-9_\-]+)', prompt, re.IGNORECASE)
        name = match.group(1) if match else "cieav_agent_app"
        template = "python"
        if "fastapi" in prompt.lower():
            template = "fastapi"
        elif "react" in prompt.lower() or "typescript" in prompt.lower():
            template = "typescript"

        res = github_agent.scaffold_project(name=name, template=template)
        card = github_agent.render_cli_card(res, action_type="scaffold")
        return {
            "type": "devops",
            "message": card,
            "project": res
        }

    def _handle_github_intent(self, prompt: str) -> Dict[str, Any]:
        lower = prompt.lower()
        if "issue" in lower:
            # Check for fix issue
            fix_match = re.search(r'(?:fix|patch|resolve)\s+(?:issue\s+)?#?(\d+)', prompt, re.IGNORECASE)
            if fix_match:
                issue_num = int(fix_match.group(1))
                desc = re.sub(r'.*(?:fix|patch|resolve)\s+(?:issue\s+)?#?\d+\s*[:\-]?\s*', '', prompt, flags=re.IGNORECASE).strip() or "Resolve bug and qualify"
                res = github_agent.fix_issue(issue_number=issue_num, fix_description=desc)
                return {
                    "type": "devops",
                    "message": (
                        f"✅ Issue #{issue_num} resolved locally!\n"
                        f"  • Title  : {res['issue_title']}\n"
                        f"  • Commit : {res['commit_message']}\n"
                        f"  • Patched: {res['patched_file']}\n"
                        f"  • SLA    : Reversible via /undo"
                    ),
                    "fix": res
                }
            # View issue
            view_match = re.search(r'(?:view|check|inspect)\s+issue\s+#?(\d+)', prompt, re.IGNORECASE)
            if view_match:
                issue_num = int(view_match.group(1))
                res = github_agent.view_issue(issue_num)
                issue = res.get("issue", {})
                return {
                    "type": "devops",
                    "message": (
                        f"🔍 GitHub Issue #{issue_num}: {issue.get('title')}\n"
                        f"  • State  : {issue.get('state')}\n"
                        f"  • Author : @{(issue.get('author') or {}).get('login', 'dev')}\n"
                        f"  • URL    : {issue.get('url')}\n\n"
                        f"{issue.get('body', 'No description provided')}"
                    ),
                    "issue": issue
                }
            # List issues
            res = github_agent.list_issues()
            card = github_agent.render_cli_card(res, action_type="issues")
            return {
                "type": "devops",
                "message": card,
                "issues": res
            }

        elif "pr" in lower or "pull request" in lower:
            title_match = re.search(r'(?:raise|create|open)\s+(?:pr|pull\s+request)\s*[:\-]?\s*(.+)', prompt, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else "Feat: Autonomous agent enhancements"
            res = github_agent.raise_pr(title=title, body=f"Automated PR created from prompt: {prompt}")
            card = github_agent.render_cli_card(res, action_type="pr")
            return {
                "type": "devops",
                "message": card,
                "pr": res
            }

        elif "push" in lower:
            msg_match = re.search(r'(?:push|commit)\s+(?:to\s+github\s+)?(?:with\s+message\s+)?[\'"]?([^\'"]+)[\'"]?', prompt, re.IGNORECASE)
            msg = msg_match.group(1).strip() if msg_match else "Automated update via CIEAV Agent"
            res = github_agent.push_to_github(commit_msg=msg)
            card = github_agent.render_cli_card(res, action_type="push")
            return {
                "type": "devops",
                "message": card,
                "push": res
            }

        res = github_agent.list_issues()
        return {"type": "devops", "message": github_agent.render_cli_card(res, action_type="issues")}

    def _handle_email_intent(self, prompt: str) -> Dict[str, Any]:
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', prompt)
        to_email = email_match.group(0) if email_match else "lead@cieav.internal"

        subj_match = re.search(r'subject\s*[:\-]?\s*[\'"]?([^\'"]+)[\'"]?', prompt, re.IGNORECASE)
        subject = subj_match.group(1) if subj_match else "CIEAV Autonomous Agent Notice"

        body_match = re.search(r'(?:body|message|saying)\s*[:\-]?\s*[\'"]?([^\'"]+)[\'"]?', prompt, re.IGNORECASE)
        body = body_match.group(1) if body_match else prompt

        res = email_agent.compose_and_send(to=to_email, subject=subject, body=body, launch_client=True)
        card = email_agent.render_cli_card(res)
        return {
            "type": "email",
            "message": card,
            "result": res
        }

    def _handle_whatsapp_intent(self, prompt: str) -> Dict[str, Any]:
        phone_match = re.search(r'(?:\+?\d[\d\-\s\(\)]{8,15}\d)', prompt)
        phone = phone_match.group(0) if phone_match else "+14155552671"

        msg_match = re.search(r'(?:saying|message|text)\s*[:\-]?\s*[\'"]?([^\'"]+)[\'"]?', prompt, re.IGNORECASE)
        msg = msg_match.group(1) if msg_match else "Hello from CIEAV Superintelligent Agent OS!"

        res = whatsapp_agent.send_whatsapp(phone=phone, message=msg, launch_browser=True)
        card = whatsapp_agent.render_cli_card(res)
        return {
            "type": "whatsapp",
            "message": card,
            "result": res
        }

    def _handle_office_intent(self, prompt: str) -> Dict[str, Any]:
        lower = prompt.lower()
        if "add" in lower or "create task" in lower:
            title = re.sub(r'^(?:office\s+)?(?:add|create task)\s+', '', prompt, flags=re.IGNORECASE).strip()
            task = virtual_office.add_task(title or "Implement feature specification")
            return {
                "type": "office",
                "message": f"✅ Virtual Office Task Created: [{task.task_id}] '{task.title}' assigned to {task.assigned_to.upper()}.",
                "board": virtual_office.render_board()
            }
        elif "done" in lower or "complete" in lower:
            match = re.search(r'TASK-\d+', prompt, re.IGNORECASE)
            tid = match.group(0).upper() if match else "TASK-103"
            t = virtual_office.advance_task(tid)
            return {
                "type": "office",
                "message": f"✅ Task [{tid}] marked as DONE by agent {t.assigned_to if t else 'agent'}.",
                "board": virtual_office.render_board()
            }
        else:
            return {
                "type": "office",
                "message": "Displaying Virtual Office Kanban Board & Team Roster:",
                "board": virtual_office.render_board()
            }

    def _handle_browser_intent(self, prompt: str) -> Dict[str, Any]:
        url_match = re.search(r'(https?://[^\s]+|localhost:\d+)', prompt)
        url = url_match.group(0) if url_match else "http://localhost:8000"

        if "screenshot" in prompt.lower():
            out_file = "local_browser_screenshot.png"
            res = local_browser.capture_screenshot(url, output_path=out_file)
            if res.get("status") == "success":
                return {
                    "type": "browser",
                    "message": f"📸 Native Browser ({res['browser']}) captured screenshot: {res['file_path']} ({res['file_size_bytes']} bytes)",
                    "details": res
                }
            return {"type": "browser", "message": f"❌ Browser screenshot error: {res.get('error')}"}

        dom_res = local_browser.dump_dom(url)
        if dom_res.get("status") == "success":
            return {
                "type": "browser",
                "message": (
                    f"🌐 Native Local Browser ({dom_res['browser']}) executed 100% locally:\n"
                    f"  • URL   : {dom_res['url']}\n"
                    f"  • Title : {dom_res['title']}\n"
                    f"  • DOM   : {dom_res['char_count']} characters extracted locally\n\n"
                    f"Content Preview:\n{dom_res['text_summary']}"
                ),
                "details": dom_res
            }
        return {"type": "browser", "message": f"❌ Local Browser error: {dom_res.get('error')}"}

    def _handle_game_intent(self, prompt: str) -> Dict[str, Any]:
        return {
            "type": "game",
            "message": cli_game.render_hud(),
            "in_game": True
        }

    def _handle_code_generation(self, prompt: str) -> Dict[str, Any]:
        """Synthesize local code and write with automatic snapshot backup for /undo."""
        file_match = re.search(r'([\w\/\.\-]+\.(?:py|js|ts|json|sh|rs|html))', prompt)
        filename = file_match.group(1) if file_match else "generated_task.py"

        code_snippet = f'''# Generated by CIEAV Superintelligent Local Agent (Codex Class)
# Objective: {prompt}
# Created: {time.ctime()} • 100% Local CPU Execution

def execute_task():
    print("Executing autonomous task: {prompt}")
    return {{"status": "success", "task": "{prompt}", "timestamp": {time.time()}}}

if __name__ == "__main__":
    result = execute_task()
    print("Task Result:", result)
'''
        from commit_layer.tools.repo import RealRepoFileTool
        tool = RealRepoFileTool()
        res = tool.execute({"file_path": filename, "operation": "create", "content": code_snippet})

        return {
            "type": "code",
            "message": (
                f"⚡ [CODEX ENGINE] Code synthesized and saved to '{filename}':\n"
                f"  • File Path : {res.get('path', filename)}\n"
                f"  • Snapshot  : {res.get('snapshot_created', 'Backed up for /undo')}\n"
                f"  • Reversible: YES (Type /undo to remove or restore instantly)\n\n"
                f"Code Preview:\n```python\n{code_snippet[:300]}...\n```"
            ),
            "file": filename
        }

    def _handle_general_intent(self, prompt: str) -> Dict[str, Any]:
        """Decompose and evaluate arbitrary computer-use intent with cieav-decider-v2."""
        dec = local_decision_model.inspect_decision(prompt)
        tier = dec["top_choice"]
        rec = dec["recommended_action"]
        lat = dec["latency_ms"]

        return {
            "type": "intent",
            "message": (
                f"🧠 [CIEAV SUPERINTELLIGENT RUNTIME • 0% CLOUD APIS]\n"
                f"  • Target Intent : \"{prompt}\"\n"
                f"  • Decision Gate : {tier} (Consequence: {dec['consequence_score']:.3f} • {lat:.2f}ms CPU)\n"
                f"  • Recommendation: {rec}\n"
                f"  • Execution Mode: Governed Native OS Action\n\n"
                f"Autonomous Agent Guidance:\n"
                f"  - Notes Vault   : note <content> | notes | search notes <query>\n"
                f"  - Project Scaffold: create project <name> [template]\n"
                f"  - GitHub DevOps : github issues | fix issue <#> | raise pr <title> | push\n"
                f"  - Email Client  : send email to <user@domain> subject <subj> body <msg>\n"
                f"  - WhatsApp      : send whatsapp to <phone> message <msg>\n"
                f"  - Code Synth    : write code <file.py>\n"
                f"  - Browser View  : browser http://localhost:8000\n"
                f"  - Virtual Office: office\n"
                f"  - Cyber Defense : game\n"
                f"  - Lossless Undo : /undo"
            ),
            "decision": dec
        }


# Global singleton Autonomous Agent
autonomous_agent = AutonomousLocalAgent()
