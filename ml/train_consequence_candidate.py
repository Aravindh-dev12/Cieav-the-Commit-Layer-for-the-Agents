#!/usr/bin/env python3
"""Train an offline TRAINED_UNQUALIFIED candidate from verified CIEAV consequence data.

This is a local qualification/research path. It cannot promote a checkpoint and does
not require or receive CIEAV execution authority.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

import torch
from datasets import Dataset
from peft import LoraConfig
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.trainers import WordLevelTrainer
from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast
from trl import SFTConfig, SFTTrainer

from build_consequence_dataset import completion_for, prompt_for
from cieav_learning import load_jsonl
from cieav_learning.provenance import verify_provenance_boundary
from training_round import atomic_write, create_round, record_checkpoint, verify_round


def build_tokenizer(texts: list[str]) -> PreTrainedTokenizerFast:
    raw = Tokenizer(WordLevel(unk_token="[UNK]"))
    raw.pre_tokenizer = Whitespace()
    trainer = WordLevelTrainer(
        special_tokens=["[PAD]", "[UNK]", "[BOS]", "[EOS]"],
        min_frequency=1,
    )
    raw.train_from_iterator(texts, trainer=trainer)
    return PreTrainedTokenizerFast(
        tokenizer_object=raw,
        unk_token="[UNK]",
        pad_token="[PAD]",
        bos_token="[BOS]",
        eos_token="[EOS]",
    )


def training_text(row: dict) -> str:
    scope = str((row.get("learning") or {}).get("trainingScope") or "OUTCOME_PROOF")
    return (
        "User:\n" + prompt_for(row) + "\n"
        "System-constraint:\nauthority=false; trainingScope=" + scope +
        "; model output cannot mint permits, commit actions, or authorize undo.\n"
        "Assistant:\n" + completion_for(row)
    )


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--trajectories", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("ml/runs/consequence-candidate"))
    p.add_argument("--steps", type=int, default=4)
    p.add_argument("--seed", type=int, default=1729)
    p.add_argument("--learning-rate", type=float, default=1e-3)
    a = p.parse_args()
    if a.steps < 1 or a.steps > 1000:
        raise SystemExit("--steps must be between 1 and 1000")

    rows = load_jsonl(str(a.trajectories))
    if not rows:
        raise SystemExit("no verified consequence trajectories available for training")
    for row in rows:
        if "provenance" not in row:
            raise SystemExit("consequence candidate training requires provenance-aware trajectories")
        verify_provenance_boundary(row)
        if row.get("authority") is not False or (row.get("learning") or {}).get("authority") is not False:
            raise SystemExit("authority boundary violated in training input")

    output = a.output.resolve()
    checkpoint = output / "checkpoint"
    dataset_file = output / "candidate-sft.jsonl"
    manifest_file = output / "training-round.json"
    output.mkdir(parents=True, exist_ok=True)
    texts = [training_text(row) for row in rows]
    with dataset_file.open("w", encoding="utf-8", newline="\n") as handle:
        for row, text in zip(rows, texts):
            handle.write(json.dumps({
                "id": row["trajectoryId"],
                "trajectoryDigest": row["digest"],
                "trainingScope": row["learning"]["trainingScope"],
                "authority": False,
                "text": text,
            }, separators=(",", ":"), ensure_ascii=False) + "\n")

    tokenizer = build_tokenizer(texts + [
        "UNKNOWN must never be converted into SUCCESS",
        "TRAINED_UNQUALIFIED authority false",
    ])
    torch.manual_seed(a.seed)
    config = GPT2Config(
        vocab_size=len(tokenizer),
        n_positions=192,
        n_ctx=192,
        n_embd=48,
        n_layer=2,
        n_head=4,
        bos_token_id=tokenizer.bos_token_id,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.pad_token_id,
        use_cache=False,
    )
    model = GPT2LMHeadModel(config)
    peft = LoraConfig(
        task_type="CAUSAL_LM",
        r=4,
        lora_alpha=8,
        lora_dropout=0.0,
        target_modules=["c_attn", "c_proj"],
        bias="none",
    )
    dataset = Dataset.from_dict({"text": texts})
    hyperparameters = {
        "learningRate": a.learning_rate,
        "maxSteps": a.steps,
        "batchSize": 1,
        "seed": a.seed,
        "offline": True,
        "peft": "LoRA",
        "trainingScopeCounts": {
            scope: sum(1 for row in rows if row["learning"]["trainingScope"] == scope)
            for scope in sorted({row["learning"]["trainingScope"] for row in rows})
        },
    }
    manifest = create_round(
        stage="sft-consequence",
        model="cieav-offline-tiny-gpt2-lora",
        dataset=dataset_file,
        output_dir=checkpoint,
        hyperparameters=hyperparameters,
    )
    manifest["sourceTrajectories"] = {
        "path": str(a.trajectories.resolve()),
        "count": len(rows),
        "authority": False,
        "allProvenanceVerified": True,
        "agenticRlEligible": sum(1 for row in rows if row["learning"].get("eligibleAgenticRl") is True),
    }
    atomic_write(manifest_file, manifest)

    args = SFTConfig(
        output_dir=str(checkpoint),
        dataset_text_field="text",
        max_length=192,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=1,
        max_steps=a.steps,
        learning_rate=a.learning_rate,
        logging_strategy="no",
        save_strategy="no",
        report_to="none",
        use_cpu=True,
        dataloader_pin_memory=False,
        gradient_checkpointing=False,
        seed=a.seed,
        data_seed=a.seed,
    )
    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=dataset,
        processing_class=tokenizer,
        peft_config=peft,
    )
    result = trainer.train()
    loss = float(result.training_loss)
    if not math.isfinite(loss):
        raise SystemExit(f"non-finite consequence candidate training loss: {loss}")
    checkpoint.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(checkpoint))
    tokenizer.save_pretrained(str(checkpoint))

    trained = record_checkpoint(manifest, checkpoint)
    trained["trainingResult"] = {
        "loss": loss,
        "authority": False,
        "productionAuthority": False,
        "candidateRemainsUnqualified": True,
        "promotionExecuted": False,
    }
    atomic_write(manifest_file, trained)
    violations = verify_round(trained)
    if violations:
        raise SystemExit("training-round verification failed: " + ",".join(violations))
    if trained.get("status") != "TRAINED_UNQUALIFIED" or trained.get("qualification") != "UNQUALIFIED":
        raise SystemExit("candidate unexpectedly escaped UNQUALIFIED state")

    print(json.dumps({
        "schemaVersion": 1,
        "kind": "CIEAV_CONSEQUENCE_CANDIDATE_TRAINING_V1",
        "authority": False,
        "productionAuthority": False,
        "trajectoryCount": len(rows),
        "trainingLoss": loss,
        "checkpoint": str(checkpoint),
        "manifest": str(manifest_file),
        "status": trained["status"],
        "qualification": trained["qualification"],
        "agenticRlEligibleInputs": trained["sourceTrajectories"]["agenticRlEligible"],
    }, indent=2))
    print("CIEAV consequence candidate PASS - verified consequence data -> real local training -> TRAINED_UNQUALIFIED")


if __name__ == "__main__":
    main()
