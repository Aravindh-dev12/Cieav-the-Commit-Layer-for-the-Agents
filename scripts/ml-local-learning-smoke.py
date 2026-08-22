#!/usr/bin/env python3
"""Offline single-node CIEAV learning smoke using Datasets + Transformers + TRL + PEFT.

No model download, external API, GPU, proof provider, or execution authority is used.
"""
from __future__ import annotations

import importlib
import json
import math
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED = ("torch", "transformers", "datasets", "trl", "peft", "accelerate", "tokenizers")
missing = []
for name in REQUIRED:
    try:
        importlib.import_module(name)
    except Exception:
        missing.append(name)
if missing:
    raise SystemExit(
        "CIEAV local learning smoke missing packages: " + ", ".join(missing) +
        "\nRun: python scripts/ml-local-learning-bootstrap.py"
    )

import torch
from datasets import Dataset
from peft import LoraConfig
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.trainers import WordLevelTrainer
from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast
from trl import SFTConfig, SFTTrainer


def build_tokenizer(texts: list[str]) -> PreTrainedTokenizerFast:
    raw = Tokenizer(WordLevel(unk_token="[UNK]"))
    raw.pre_tokenizer = Whitespace()
    trainer = WordLevelTrainer(
        special_tokens=["[PAD]", "[UNK]", "[BOS]", "[EOS]"],
        min_frequency=1,
    )
    raw.train_from_iterator(texts, trainer=trainer)
    tok = PreTrainedTokenizerFast(
        tokenizer_object=raw,
        unk_token="[UNK]",
        pad_token="[PAD]",
        bos_token="[BOS]",
        eos_token="[EOS]",
    )
    return tok


def parameter_snapshot(model) -> dict[str, torch.Tensor]:
    return {
        name: param.detach().cpu().clone()
        for name, param in model.named_parameters()
        if param.requires_grad
    }


def total_delta(before: dict[str, torch.Tensor], model) -> float:
    after = dict(model.named_parameters())
    total = 0.0
    for name, old in before.items():
        current = after[name].detach().cpu()
        total += float(torch.sum(torch.abs(current - old)).item())
    return total


def main() -> None:
    torch.manual_seed(1729)
    texts = [
        "authorized outcome SUCCESS proof verified no recovery required",
        "authorized outcome FAILURE proof verified recovery required",
        "authorized outcome UNKNOWN more evidence required never claim success",
        "authority false model may learn but cannot mint permit commit action or authorize undo",
    ]
    tokenizer = build_tokenizer(texts)
    dataset = Dataset.from_dict({"text": texts})

    config = GPT2Config(
        vocab_size=len(tokenizer),
        n_positions=64,
        n_ctx=64,
        n_embd=32,
        n_layer=1,
        n_head=2,
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

    with tempfile.TemporaryDirectory(prefix="cieav-local-learning-") as td:
        args = SFTConfig(
            output_dir=td,
            dataset_text_field="text",
            max_length=64,
            per_device_train_batch_size=2,
            gradient_accumulation_steps=1,
            max_steps=2,
            learning_rate=1e-3,
            logging_strategy="no",
            save_strategy="no",
            report_to="none",
            use_cpu=True,
            dataloader_pin_memory=False,
            gradient_checkpointing=False,
            seed=1729,
            data_seed=1729,
        )
        trainer = SFTTrainer(
            model=model,
            args=args,
            train_dataset=dataset,
            processing_class=tokenizer,
            peft_config=peft,
        )
        before = parameter_snapshot(trainer.model)
        if not before:
            raise SystemExit("CIEAV local learning smoke found no trainable PEFT parameters")
        result = trainer.train()
        loss = float(result.training_loss)
        delta = total_delta(before, trainer.model)

    if not math.isfinite(loss):
        raise SystemExit(f"CIEAV local learning smoke produced non-finite loss: {loss}")
    if delta <= 0.0:
        raise SystemExit("CIEAV local learning smoke trainable weights did not change")

    report = {
        "schemaVersion": 1,
        "kind": "CIEAV_LOCAL_LEARNING_SMOKE_V1",
        "authority": False,
        "productionAuthority": False,
        "offline": True,
        "gpuRequired": False,
        "examples": len(texts),
        "steps": 2,
        "trainingLoss": loss,
        "trainableParameterDelta": delta,
        "frameworks": {
            "torch": torch.__version__,
            "transformers": importlib.metadata.version("transformers"),
            "datasets": importlib.metadata.version("datasets"),
            "trl": importlib.metadata.version("trl"),
            "peft": importlib.metadata.version("peft"),
            "accelerate": importlib.metadata.version("accelerate"),
        },
        "invariants": {
            "noModelDownload": True,
            "noExternalApi": True,
            "noPermitMinting": True,
            "noCommitAuthority": True,
            "noUndoAuthority": True,
            "candidateRemainsUnqualified": True,
        },
    }
    print(json.dumps(report, indent=2))
    print("CIEAV local learning smoke PASS - offline tiny causal LM + TRL SFT + PEFT LoRA changed trainable weights with authority=false")


if __name__ == "__main__":
    main()
