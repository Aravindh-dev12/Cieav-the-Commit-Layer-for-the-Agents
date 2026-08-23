#!/usr/bin/env python3
"""Sequence-distill a qualified teacher corpus into a smaller CIEAV semantic model.

The input JSONL must contain independently qualified teacher provenance and verified
consequence targets. Distillation never transfers execution authority; every student
checkpoint is sealed TRAINED_UNQUALIFIED and must pass the same independent CIEAV
promotion gate before use.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

from training_round import atomic_write, create_round, record_checkpoint

REQUIRED_PROVENANCE={"teacherModelDigest","teacherQualificationRef","teacherQualified","cryptographicallyVerified","authorityGrade","realityBound","redactionProfile"}


def validate_teacher_corpus(ds)->None:
    if "text" not in ds.column_names and "completion" not in ds.column_names:
        raise ValueError("teacher corpus must contain text or completion records")
    missing=sorted(REQUIRED_PROVENANCE-set(ds.column_names))
    if missing: raise ValueError("teacher corpus missing qualified provenance columns: "+", ".join(missing))
    teacher_digest=None;qualification_ref=None
    for index,row in enumerate(ds):
        digest=str(row.get("teacherModelDigest") or "").lower();ref=str(row.get("teacherQualificationRef") or "")
        if len(digest)!=64 or any(c not in "0123456789abcdef" for c in digest): raise ValueError(f"teacher digest invalid at row {index}")
        if not ref: raise ValueError(f"teacher qualification reference missing at row {index}")
        if teacher_digest is None: teacher_digest=digest
        if qualification_ref is None: qualification_ref=ref
        if digest!=teacher_digest or ref!=qualification_ref: raise ValueError("distillation corpus mixes teacher identities or qualification references")
        if row.get("teacherQualified") is not True or row.get("cryptographicallyVerified") is not True or row.get("authorityGrade") is not True or row.get("realityBound") is not True:
            raise ValueError(f"distillation row lacks qualified verified consequence provenance at row {index}")
        if not str(row.get("redactionProfile") or "").strip(): raise ValueError(f"distillation row missing redaction profile at row {index}")
        if row.get("authority") is True or row.get("productionAuthority") is True: raise ValueError(f"distillation corpus row claimed authority at row {index}")
        expected=row.get("expectedOutcome");target=row.get("targetOutcome")
        if expected=="UNKNOWN" and target=="SUCCESS": raise ValueError(f"distillation corpus maps UNKNOWN to success at row {index}")
    return None


def main() -> None:
    p=argparse.ArgumentParser();p.add_argument("--student",required=True);p.add_argument("--teacher-corpus",required=True);p.add_argument("--output",required=True);p.add_argument("--learning-rate",type=float,default=1e-5);p.add_argument("--epochs",type=float,default=1.0);p.add_argument("--batch-size",type=int,default=1);p.add_argument("--lora-r",type=int,default=16);p.add_argument("--seed",type=int,default=1729);p.add_argument("--data-seed",type=int);p.add_argument("--full-determinism",action="store_true");p.add_argument("--round-manifest");a=p.parse_args()
    if a.seed<0 or (a.data_seed is not None and a.data_seed<0): raise SystemExit("distillation seeds must be non-negative")
    data_seed=a.seed if a.data_seed is None else a.data_seed;ds=load_dataset("json",data_files=a.teacher_corpus,split="train");validate_teacher_corpus(ds)
    manifest_path=Path(a.round_manifest).resolve() if a.round_manifest else Path(a.output).resolve()/"training-round.json";hyperparameters={"algorithm":"SEQUENCE_DISTILLATION_LORA","learningRate":a.learning_rate,"epochs":a.epochs,"batchSize":a.batch_size,"loraR":a.lora_r,"seed":a.seed,"dataSeed":data_seed,"fullDeterminism":a.full_determinism,"authority":False};manifest=create_round(stage="distillation",model=a.student,dataset=Path(a.teacher_corpus),output_dir=Path(a.output),hyperparameters=hyperparameters);atomic_write(manifest_path,manifest)
    peft=LoraConfig(r=a.lora_r,lora_alpha=max(16,a.lora_r*2),lora_dropout=.05,bias="none",task_type="CAUSAL_LM")
    cfg=SFTConfig(output_dir=a.output,learning_rate=a.learning_rate,num_train_epochs=a.epochs,per_device_train_batch_size=a.batch_size,report_to=[],seed=a.seed,data_seed=data_seed,full_determinism=a.full_determinism)
    trainer=SFTTrainer(model=a.student,args=cfg,train_dataset=ds,peft_config=peft);trainer.train();trainer.save_model(a.output)
    atomic_write(manifest_path,record_checkpoint(manifest,Path(a.output),manifest_path));print("Sequence-distill complete. Student remains UNQUALIFIED; status=TRAINED_UNQUALIFIED authority=false productionAuthority=false promotionExecuted=false until the independent promotion gate passes.")


if __name__=="__main__": main()
