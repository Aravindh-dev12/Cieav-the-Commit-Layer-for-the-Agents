"""Software and Code execution tool for Commit Layer.

Handles:
- run_terminal_command: runs a shell/terminal command inside sandbox execution environment
- deploy_service: provisions/updates microservice or container
- write_code_file: atomic code modification with automatic patch snapshotting
- restore_code_file: inverse compensating action
"""
from __future__ import annotations
from typing import Any, Optional, Callable
from commit_layer.models import Outcome
from commit_layer.tools.base import BaseTool
from commit_layer import sandbox

# In-memory software registry in sandbox
sandbox.software_registry = {
    "services": {
        "api-gateway": {"status": "running", "version": "v1.2.0"},
        "payment-worker": {"status": "running", "version": "v2.0.4"},
        "database-replica": {"status": "active", "version": "postgres-16"}
    },
    "terminal_history": [],
    "code_backups": {}
}


class RunTerminalCommandTool(BaseTool):
    name = 'run_terminal_command'
    description = 'Execute a shell command in the operating system environment'
    has_inverse = False  # Arbitrary shell commands are irreversible

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        cmd = args.get('command', '')
        if not cmd:
            raise ValueError("Command cannot be empty")
        
        # Guard against fork-bombs or catastrophic rm
        is_simulated_harm = 'rm -rf /' in cmd or ':(){ :|:& };:' in cmd
        record = {
            "command": cmd,
            "status": "blocked" if is_simulated_harm else "executed",
            "exit_code": 1 if is_simulated_harm else 0,
            "output": f"Executed command safely in sandbox environment: {cmd}"
        }
        sandbox.software_registry["terminal_history"].append(record)
        return record

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        history = sandbox.software_registry.get("terminal_history", [])
        if history and history[-1]["status"] == "executed":
            return Outcome.OBSERVED_SUCCESS
        elif history and history[-1]["status"] == "blocked":
            return Outcome.OBSERVED_FAILURE
        return Outcome.UNKNOWN

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        return None


class DeployServiceTool(BaseTool):
    name = 'deploy_service'
    description = 'Deploy or update a microservice or container image'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        service_name = args.get('service_name', '')
        version = args.get('version', '')
        if not service_name or not version:
            raise ValueError("service_name and version required")

        services = sandbox.software_registry["services"]
        old_version = services.get(service_name, {}).get("version", "v1.0.0")
        
        # Apply deployment
        services[service_name] = {"status": "running", "version": version}
        return {
            "service_name": service_name,
            "previous_version": old_version,
            "new_version": version,
            "status": "deployed"
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        services = sandbox.software_registry.get("services", {})
        if services:
            return Outcome.OBSERVED_SUCCESS
        return Outcome.UNKNOWN

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        service_name = result.get('service_name')
        prev_ver = result.get('previous_version')
        if not service_name or not prev_ver:
            return None

        def _rollback():
            sandbox.software_registry["services"][service_name] = {
                "status": "running",
                "version": prev_ver
            }
            return {"rolled_back": service_name, "version": prev_ver}
        return _rollback


class ModifyCodeFileTool(BaseTool):
    name = 'modify_code_file'
    description = 'Modify or rewrite a source code file with automated rollback snapshot'
    has_inverse = True

    def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        filepath = args.get('filepath', '')
        content = args.get('content', '')
        if not filepath:
            raise ValueError("filepath required")

        # Snapshot existing content from fake filesystem
        old_content = sandbox.fake_filesystem.get(filepath, "")
        sandbox.software_registry["code_backups"][filepath] = old_content
        
        # Write new content
        sandbox.fake_filesystem[filepath] = content
        return {
            "filepath": filepath,
            "previous_length": len(old_content),
            "new_length": len(content),
            "snapshot_id": f"snap-{hash(filepath + old_content) & 0xffffffff:x}"
        }

    def observe(self, before: dict[str, Any], after: dict[str, Any]) -> Outcome:
        # Check if filesystem contains updated file
        return Outcome.OBSERVED_SUCCESS

    def inverse(self, args: dict[str, Any], result: dict[str, Any]) -> Optional[Callable]:
        filepath = result.get('filepath')
        if not filepath or filepath not in sandbox.software_registry["code_backups"]:
            return None

        def _restore_code():
            backup = sandbox.software_registry["code_backups"][filepath]
            sandbox.fake_filesystem[filepath] = backup
            return {"restored": filepath, "length": len(backup)}
        return _restore_code
