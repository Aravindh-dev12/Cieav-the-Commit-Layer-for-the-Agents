#!/usr/bin/env python3
"""CIEAV Python-first post-training entrypoint for SFT/DPO/KTO/GRPO.

Python owns ML training and rollout orchestration. Canonical safety/reward semantics
remain in the local Node verifier, which explicitly has authority=false. Every training
run emits a provenance manifest and records the saved checkpoint as UNQUALIFIED until
an explicit held-out promotion report advances it.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
from contextlib import nullcontext
from pathlib import Path

from datasets import load_dataset

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))
from cieav_rlvr import CieavVerifierClient, NodeVerifierProcess
from training_round import atomic_write, create_round, record_checkpoint


def parse_candidate(text: str) -> dict:
    try:
        value = json.loads(text)
    except Exception:
        return {"actionType": "invalid", "risk": "LOW", "reversibility": "REVERSIBLE", "confidence": 1.0, "explanation": text[:2000]}
    return value if isinstance(value, dict) else {"actionType": "invalid", "risk": "LOW", "reversibility": "REVERSIBLE", "confidence": 1.0}


def verifier_context(mode: str):
    if mode == "external":
        base = os.environ.get("CIEAV_ML_VERIFIER_URL", "http://127.0.0.1:8765")
        token = os.environ.get("CIEAV_ML_VERIFIER_TOKEN", "")
        return nullcontext(CieavVerifierClient(base, token))
    token = os.environ.get("CIEAV_ML_VERIFIER_TOKEN") or secrets.token_urlsafe(48)
    port = int(os.environ["CIEAV_ML_VERIFIER_PORT"]) if os.environ.get("CIEAV_ML_VERIFIER_PORT") else None
    return NodeVerifierProcess(ROOT, port=port, token=token)


def validate_grpo_dataset(ds) -> None:
    columns = set(ds.column_names)
    required = {"prompt", "expectation"}
    missing = sorted(required - columns)
    if missing:
        raise ValueError(f"GRPO dataset missing required fresh-rollout columns: {', '.join(missing)}; build it with ml/build_curriculum.py")
    if "candidate" in columns and "requiresFreshModelRollout" in columns:
        bad = [row["id"] for row in ds if row.get("candidate") is not None and row.get("requiresFreshModelRollout") is not True]
        if bad:
            raise ValueError(f"GRPO replay rows must require fresh model rollouts: {bad[:5]}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--stage", choices=["sft", "dpo", "kto", "grpo"], required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--dataset", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--learning-rate", type=float, default=2e-5)
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--num-generations", type=int, default=8)
    p.add_argument("--beta", type=float, default=0.1)
    p.add_argument("--verifier-mode", choices=["auto", "external"], default="auto", help="GRPO: Python auto-launches the local Node verifier unless an external loopback verifier is explicitly selected")
    p.add_argument("--round-manifest", help="Training-round manifest path; defaults to <output>/training-round.json")
    p.add_argument("--curriculum-report", help="Optional CIEAV_RLVR_CURRICULUM_V1 report bound into this round")
    p.add_argument("--previous-round", help="Optional previous training-round manifest for lineage")
    a = p.parse_args()
    ds = load_dataset("json", data_files=a.dataset, split="train")
    common = {"output_dir": a.output, "learning_rate": a.learning_rate, "num_train_epochs": a.epochs, "per_device_train_batch_size": a.batch_size, "report_to": []}
    manifest_path = Path(a.round_manifest).resolve() if a.round_manifest else (Path(a.output).resolve() / "training-round.json")
    hyperparameters = {
        "learningRate": a.learning_rate,
        "epochs": a.epochs,
        "batchSize": a.batch_size,
        "beta": a.beta,
        "numGenerations": a.num_generations if a.stage == "grpo" else None,
    }

    def begin_round(verifier_health=None):
        manifest = create_round(
            stage=a.stage,
            model=a.model,
            dataset=Path(a.dataset),
            output_dir=Path(a.output),
            hyperparameters=hyperparameters,
            verifier_health=verifier_health,
            curriculum_report=Path(a.curriculum_report) if a.curriculum_report else None,
            previous_manifest=Path(a.previous_round) if a.previous_round else None,
        )
        atomic_write(manifest_path, manifest)
        return manifest

    def seal_checkpoint(manifest) -> None:
        atomic_write(manifest_path, record_checkpoint(manifest, Path(a.output)))

    if a.stage == "sft":
        from trl import SFTConfig, SFTTrainer
        manifest = begin_round()
        trainer = SFTTrainer(model=a.model, args=SFTConfig(**common), train_dataset=ds)
        trainer.train(); trainer.save_model(a.output); seal_checkpoint(manifest); return
    if a.stage == "dpo":
        from trl import DPOConfig, DPOTrainer
        manifest = begin_round()
        trainer = DPOTrainer(model=a.model, args=DPOConfig(beta=a.beta, **common), train_dataset=ds)
        trainer.train(); trainer.save_model(a.output); seal_checkpoint(manifest); return
    if a.stage == "kto":
        from trl import KTOConfig, KTOTrainer
        manifest = begin_round()
        trainer = KTOTrainer(model=a.model, args=KTOConfig(beta=a.beta, **common), train_dataset=ds)
        trainer.train(); trainer.save_model(a.output); seal_checkpoint(manifest); return

    validate_grpo_dataset(ds)
    from trl import GRPOConfig, GRPOTrainer
    with verifier_context(a.verifier_mode) as verifier:
        health = verifier.health()
        manifest = begin_round(health)
        def reward_fn(completions, **kwargs):
            expectations = kwargs.get("expectation") or [{} for _ in completions]
            rewards = []
            for completion, expectation in zip(completions, expectations):
                text = completion if isinstance(completion, str) else json.dumps(completion)
                result = verifier.score_decision(expectation, parse_candidate(text))
                rewards.append(float(result["score"]))
            return rewards
        trainer = GRPOTrainer(model=a.model, reward_funcs=[reward_fn], args=GRPOConfig(beta=a.beta, num_generations=a.num_generations, **common), train_dataset=ds)
        trainer.train(); trainer.save_model(a.output); seal_checkpoint(manifest)


if __name__ == "__main__":
    main()
