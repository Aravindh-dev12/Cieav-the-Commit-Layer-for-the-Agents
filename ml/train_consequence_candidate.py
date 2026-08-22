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
    if not a.trajectories.is_file():
        raise SystemExit(f"trajectory JSONL not found: {a.trajectories}. Export and normalize finalized receipt evidence first.")

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
            }, separators=(",", ":")) + "\n")

    torch.manual_seed(a.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(a.seed)
    tokenizer = build_tokenizer(texts)
    config = GPT2Config(
        vocab_size=len(tokenizer),
        n_positions=256,
        n_ctx=256,
        n_embd=96,
        n_layer=2,
        n_head=2,
        bos_token_id=tokenizer.bos_token_id,
        eos_token_id=tokenizer.eos_token_id,
        pad_token_id=tokenizer.pad_token_id,
    )
    model = GPT2LMHeadModel(config)
    before = {name: value.detach().cpu().clone() for name, value in model.named_parameters()}
    dataset = Dataset.from_dict({"text": texts})
    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=LoraConfig(r=4, lora_alpha=8, lora_dropout=0.0, bias="none", task_type="CAUSAL_LM", target_modules=["c_attn"]),
        args=SFTConfig(
            output_dir=str(output / "trainer"),
            max_steps=a.steps,
            learning_rate=a.learning_rate,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=1,
            logging_steps=1,
            save_strategy="no",
            report_to="none",
            seed=a.seed,
            data_seed=a.seed,
            max_length=256,
        ),
        processing_class=tokenizer,
    )
    trainer.train()
    model = trainer.model
    changed = 0
    for name, value in model.named_parameters():
        prior = before.get(name)
        if prior is not None and prior.shape == value.shape and not torch.equal(prior, value.detach().cpu()):
            changed += 1
    if changed == 0:
        raise SystemExit("training completed but no trainable weights changed")

    checkpoint.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(checkpoint)
    tokenizer.save_pretrained(checkpoint)
    authority_grade = sum(1 for row in rows if (row.get("provenance") or {}).get("authorityGrade") is True)
    agentic = sum(1 for row in rows if (row.get("learning") or {}).get("eligibleAgenticRl") is True)
    manifest = create_round(
        stage="CONSEQUENCE_SFT",
        model="cieav-local-tiny-candidate",
        dataset=dataset_file,
        output_dir=checkpoint,
        hyperparameters={
            "steps": a.steps,
            "seed": a.seed,
            "learningRate": a.learning_rate,
            "trajectoryCount": len(rows),
            "authorityGradeInputs": authority_grade,
            "agenticRlEligibleInputs": agentic,
            "authority": False,
        },
    )
    manifest = record_checkpoint(manifest, checkpoint)
    candidateRemainsUnqualified = manifest.get("status") == "TRAINED_UNQUALIFIED" and manifest.get("qualification") == "UNQUALIFIED"
    promotionExecuted = False
    if not candidateRemainsUnqualified:
        raise SystemExit("candidate training must remain TRAINED_UNQUALIFIED")
    atomic_write(manifest_file, manifest)
    violations = verify_round(manifest)
    if violations:
        raise SystemExit("training round verification failed: " + ",".join(violations))

    finite_loss = math.isfinite(float(trainer.state.log_history[-1].get("train_loss", trainer.state.log_history[-1].get("loss", 0.0))))
    if not finite_loss:
        raise SystemExit("training loss is not finite")
    print(json.dumps({
        "schemaVersion": 1,
        "kind": "CIEAV_CONSEQUENCE_CANDIDATE_TRAINING_V1",
        "authority": False,
        "productionAuthority": False,
        "status": manifest["status"],
        "qualification": manifest["qualification"],
        "candidateRemainsUnqualified": candidateRemainsUnqualified,
        "promotionExecuted": promotionExecuted,
        "trajectoryCount": len(rows),
        "authorityGradeInputs": authority_grade,
        "agenticRlEligibleInputs": agentic,
        "checkpoint": str(checkpoint),
        "manifest": str(manifest_file),
        "changedParameters": changed,
    }, indent=2))
    print("CIEAV consequence candidate PASS")


if __name__ == "__main__":
    main()
