from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping

_FRAMEWORKS = {
    "MCP", "A2A", "LANGCHAIN", "LANGGRAPH", "AGNO", "OPENAI_AGENTS",
    "AUTOGEN", "CREWAI", "SEMANTIC_KERNEL", "LLAMAINDEX", "PYDANTIC_AI",
    "GOOGLE_ADK", "CLAUDE_AGENT_SDK", "DSPY", "LANGFUSE", "TEMPORAL",
    "N8N", "CUSTOM",
}


def canonical_digest(value: Any) -> str:
    """Return the SHA-256 digest CIEAV adapters use for canonical JSON arguments."""
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def framework_tool_call(
    *,
    framework: str,
    call_id: str,
    run_id: str,
    agent_id: str,
    tool_name: str,
    operation: str,
    arguments: Any,
    semantic_effect: Mapping[str, Any],
    framework_task_id: str | None = None,
    conversation_id: str | None = None,
    parent_call_id: str | None = None,
    target: str | None = None,
    retry_ordinal: int = 0,
    concurrency_group: str | None = None,
    occurred_at: str | None = None,
) -> dict[str, Any]:
    """Build a framework-neutral CIEAV tool-call binding without importing the framework itself."""
    framework = framework.upper()
    if framework not in _FRAMEWORKS:
        raise ValueError(f"unsupported CIEAV framework: {framework}")
    if not call_id or not run_id or not agent_id or not tool_name or not operation:
        raise ValueError("call_id, run_id, agent_id, tool_name and operation are required")
    call: dict[str, Any] = {
        "id": call_id,
        "version": 1,
        "framework": framework,
        "frameworkRunId": run_id,
        "agentId": agent_id,
        "toolName": tool_name,
        "operation": operation,
        "normalizedArgumentsDigest": canonical_digest(arguments),
        "semanticEffect": dict(semantic_effect),
        "retryOrdinal": retry_ordinal,
        "occurredAt": occurred_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    optional = {
        "frameworkTaskId": framework_task_id,
        "conversationId": conversation_id,
        "parentCallId": parent_call_id,
        "target": target,
        "concurrencyGroup": concurrency_group,
    }
    call.update({key: value for key, value in optional.items() if value is not None})
    return call


def langgraph_tool_call(**kwargs: Any) -> dict[str, Any]:
    """Build a LANGGRAPH call. Keep call_id stable across interrupt/resume replay."""
    return framework_tool_call(framework="LANGGRAPH", **kwargs)


def agno_tool_call(**kwargs: Any) -> dict[str, Any]:
    """Build an AGNO call for use from a pre/post tool hook."""
    return framework_tool_call(framework="AGNO", **kwargs)


@dataclass(slots=True)
class CieavFrameworkClient:
    """
    Framework-neutral client using a short-lived CIEAV agent-session token.

    It intentionally exposes only agent-scoped proposal/binding operations.
    Trusted Gateway authority (identity attestations, credential leases, permission
    graphs, Reality-Bound Commit consumption, Operation Mandates, Execution Tickets,
    trusted dispatch and settlement) is not available from this client.
    """

    api_base: str
    agent_token: str
    timeout_seconds: float = 12.0

    def __post_init__(self) -> None:
        self.api_base = self.api_base.rstrip("/")
        if not self.agent_token.strip():
            raise ValueError("CIEAV agent-session token is required")
        parsed = urllib.parse.urlparse(self.api_base)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("CIEAV api_base must be an http(s) URL")

    def _request(self, path: str, *, method: str = "GET", body: Any | None = None) -> Any:
        payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            f"{self.api_base}{path}",
            data=payload,
            method=method,
            headers={
                "authorization": f"Bearer {self.agent_token}",
                "content-type": "application/json",
                "accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:1000]
            raise RuntimeError(f"CIEAV API {exc.code}: {detail}") from exc
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def create_task(
        self,
        *,
        intent_id: str,
        agent_id: str,
        goal: str,
        deadline_at: str | None = None,
        max_retries: int = 2,
        metadata: Mapping[str, str | int | float | bool | None] | None = None,
    ) -> Any:
        body: dict[str, Any] = {
            "intentId": intent_id,
            "actor": {"id": agent_id, "kind": "AGENT"},
            "goal": goal,
            "maxRetries": max_retries,
        }
        if deadline_at:
            body["deadlineAt"] = deadline_at
        if metadata:
            body["metadata"] = dict(metadata)
        return self._request("/v1/agent/tasks", method="POST", body=body)

    def bind_tool_call(self, *, task_id: str, adapter_manifest_id: str, call: Mapping[str, Any]) -> Any:
        return self._request(
            f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/framework-calls",
            method="POST",
            body={"adapterManifestId": adapter_manifest_id, "call": dict(call)},
        )

    def list_bindings(self, task_id: str) -> Any:
        return self._request(f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/framework-bindings")

    def authorize(self, *, task_id: str, proposal: Mapping[str, Any]) -> Any:
        return self._request(
            f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/execution/authorize",
            method="POST",
            body={"proposal": dict(proposal)},
        )

    def require_commitment(self, task_id: str, reason: str = "consequential framework tool call requires authority") -> Any:
        return self._request(
            f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/require-commitment",
            method="POST",
            body={"reason": reason},
        )

    def transition(self, task_id: str, to: str, reason: str = "framework lifecycle transition") -> Any:
        return self._request(
            f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/transition",
            method="POST",
            body={"to": to, "reason": reason},
        )

    def retry(self, task_id: str, next_run_at: str, reason: str = "framework retry") -> Any:
        return self._request(
            f"/v1/agent/tasks/{urllib.parse.quote(task_id, safe='')}/retry",
            method="POST",
            body={"nextRunAt": next_run_at, "reason": reason},
        )
