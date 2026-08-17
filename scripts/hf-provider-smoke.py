#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

from latch_platform.config import Settings
from latch_platform.gateway import Gateway
from latch_platform.hf_provider import HFConfig, HuggingFaceSemanticProvider, PROVIDER_STATUS_BUDGET_SECONDS


class _Message:
    content = json.dumps({
        "actionType":"financial.commit",
        "risk":"CRITICAL",
        "reversibility":"IRREVERSIBLE",
        "confidence":0.96,
        "needsDeepReview":True,
        "promptInjectionSuspected":False,
        "reasons":["Immediate high-value payment with no credible inverse."],
    })

class _Choice:
    message = _Message()

class _Response:
    choices = [_Choice()]

class FakeClient:
    last_kwargs = None
    def __init__(self, **kwargs):
        assert kwargs.get("api_key") == "hf_test_secret_never_log"
    def chat_completion(self, **kwargs):
        FakeClient.last_kwargs = kwargs
        return _Response()


class SlowCloud:
    configured = True
    config = SimpleNamespace(base_url="https://example.invalid")
    last_success_at = None
    last_latency_ms = None
    last_error = None
    def status(self):
        time.sleep(PROVIDER_STATUS_BUDGET_SECONDS + 1.0)
        return {"configured":True,"healthy":False,"baseUrl":self.config.base_url}


def main() -> None:
    cfg=HFConfig("hf_test_secret_never_log","Qwen/Qwen3-32B","auto",None,5)
    provider=HuggingFaceSemanticProvider(cfg,client_factory=FakeClient)
    result=provider.probe()
    assert result["ok"] and result["probePassed"]
    assert FakeClient.last_kwargs["model"] == "Qwen/Qwen3-32B"
    fmt=FakeClient.last_kwargs["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    prompt=json.dumps(FakeClient.last_kwargs["messages"])
    assert "untrusted" in prompt.lower() and "deterministic baseline" in prompt.lower()

    # A remote model/cloud provider is diagnostic context, never part of local
    # Gateway availability. Slow external status must return a bounded UNKNOWN
    # view rather than blocking the local authority/control plane.
    slow=HuggingFaceSemanticProvider(cfg,client_factory=FakeClient)
    slow.cloud=SlowCloud()
    started=time.monotonic();status=slow.status();elapsed=time.monotonic()-started
    assert elapsed < PROVIDER_STATUS_BUDGET_SECONDS + 0.6, elapsed
    assert status["cloud"]["configured"] is True
    assert status["cloud"]["healthy"] is False
    assert status["cloud"]["healthTimedOut"] is True
    assert status["providerStatusBudgetMs"] == int(PROVIDER_STATUS_BUDGET_SECONDS*1000)

    with tempfile.TemporaryDirectory() as td:
        root=Path.cwd().resolve(); state=Path(td)
        s=Settings(
            root=root,
            state_dir=state,
            gateway_port=8791,
            control_port=8790,
            api_port=8787,
            token_file=state/"gateway-token",
            local_api_secret_file=state/"local-api-signing-secret",
            receipt_signing_secret_file=state/"receipt-signing-secret",
            hf_token_file=state/"hf-token",
            runtime_file=state/"runtime.json",
            log_file=state/"gateway.log",
        )
        s.write_hf_token("hf_test_abcdefghijklmnopqrstuvwxyz")
        assert s.read_hf_token()=="hf_test_abcdefghijklmnopqrstuvwxyz"
        old=os.environ.get("HF_TOKEN")
        os.environ["HF_TOKEN"]="hf_test_secret_never_log"
        try:
            g=Gateway(s)
            semantic_env=g._semantic_env()
            surface_env=g._surface_env()
            assert "HF_TOKEN" not in semantic_env
            assert "HF_TOKEN" not in surface_env
            assert "CIEAV_GATEWAY_TOKEN" in semantic_env
            assert "CIEAV_GATEWAY_TOKEN" not in surface_env
            assert "LATCH_GATEWAY_TOKEN" not in semantic_env
            assert "LATCH_GATEWAY_TOKEN" not in surface_env
        finally:
            if old is None: os.environ.pop("HF_TOKEN",None)
            else: os.environ["HF_TOKEN"]=old

    print("CIEAV Hugging Face provider smoke passed")
    print("CIEAV provider status latency boundary passed")

if __name__ == "__main__":
    main()
