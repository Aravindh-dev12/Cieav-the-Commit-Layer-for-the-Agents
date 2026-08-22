"""Provider registry for CIEAV perception and learning planes.

Providers are capabilities, never authorities. External services may observe, train,
sample, or serve models, but they cannot mint CIEAV execution permits, consume
reality-bound commits, or authorize undo.
"""
from __future__ import annotations

import importlib.util
import os
from dataclasses import asdict, dataclass
from typing import Iterable


@dataclass(frozen=True)
class Provider:
    id: str
    plane: str
    mode: str
    capabilities: tuple[str, ...]
    python_packages: tuple[str, ...] = ()
    environment: tuple[str, ...] = ()
    authority: bool = False
    notes: str = ""

    def status(self) -> dict:
        packages = {name: importlib.util.find_spec(name) is not None for name in self.python_packages}
        env = {name: bool(os.environ.get(name)) for name in self.environment}
        ready = all(packages.values()) and all(env.values())
        if self.mode == "builtin" and not self.python_packages and not self.environment:
            ready = True
        return {**asdict(self), "packages": packages, "environmentReady": env, "ready": ready}


PROVIDERS: tuple[Provider, ...] = (
    Provider(
        id="cieav-browser-proof",
        plane="proof",
        mode="builtin",
        capabilities=("browser-observation", "network-evidence", "outcome", "undo-verification"),
        notes="Native private-CDP/browser outcome provider.",
    ),
    Provider(
        id="reticle-mcp-proof",
        plane="proof",
        mode="optional-external",
        capabilities=("application-runtime-proof", "deterministic-replay", "agent-perception"),
        environment=("CIEAV_RETICLE_MCP_COMMAND",),
        notes="Optional Reticle-compatible MCP proof provider; CIEAV still decides authority.",
    ),
    Provider(
        id="trl-peft",
        plane="learning",
        mode="local-python",
        capabilities=("sft", "dpo", "kto", "grpo", "lora"),
        python_packages=("torch", "transformers", "datasets", "trl", "peft", "accelerate"),
        notes="Single-node/post-training backend already supported by CIEAV.",
    ),
    Provider(
        id="verl-ray",
        plane="learning",
        mode="scale-python",
        capabilities=("grpo", "agentic-rl", "distributed-rollouts"),
        python_packages=("torch", "verl", "ray"),
        notes="Scale-out training plane; rollout engines remain replaceable.",
    ),
    Provider(
        id="vllm-rollout",
        plane="learning",
        mode="rollout-engine",
        capabilities=("sampling", "rollout-serving"),
        python_packages=("vllm",),
    ),
    Provider(
        id="sglang-rollout",
        plane="learning",
        mode="rollout-engine",
        capabilities=("sampling", "rollout-serving"),
        python_packages=("sglang",),
    ),
    Provider(
        id="river-learning",
        plane="learning",
        mode="optional-external",
        capabilities=("training", "sampling", "checkpoint-serving"),
        environment=("CIEAV_RIVER_API_KEY",),
        notes="Optional hosted learning provider. No provider response carries CIEAV authority.",
    ),
)


def list_providers(*, plane: str | None = None) -> list[dict]:
    rows = [p.status() for p in PROVIDERS if plane is None or p.plane == plane]
    if any(row["authority"] for row in rows):
        raise RuntimeError("provider registry violated authority=false invariant")
    return rows


def provider_ids(plane: str | None = None) -> set[str]:
    return {row["id"] for row in list_providers(plane=plane)}


def assert_authority_boundary(providers: Iterable[Provider] = PROVIDERS) -> None:
    for provider in providers:
        if provider.authority:
            raise RuntimeError(f"provider {provider.id} must not have CIEAV authority")
        forbidden = {"mint-permit", "commit-action", "authorize-undo", "consume-reality-commit"}
        if forbidden.intersection(provider.capabilities):
            raise RuntimeError(f"provider {provider.id} exposes an authority capability")
