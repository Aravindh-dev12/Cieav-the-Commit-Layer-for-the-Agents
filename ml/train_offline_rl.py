#!/usr/bin/env python3
"""CIEAV offline policy optimization over verified consequence preferences.

This runner performs deterministic DPO over logged, authority-grade, reality-bound,
cryptographically verified preference trajectories. It never executes tools and every
checkpoint is sealed TRAINED_UNQUALIFIED for separate held-out qualification.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from datasets import load_dataset
from trl import DPOConfig, DPOTrainer

from training_round import atomic_write, create_round, record_checkpoint

REQUIRED_COLUMNS={"prompt","chosen","rejected","trajectoryId","cryptographicallyVerified","authorityGrade","realityBound","redactionProfile","chosenReward","rejectedReward"}


def validate_offline_dataset(ds)->None:
    missing=sorted(REQUIRED_COLUMNS-set(ds.column_names))
    if missing: raise ValueError("offline RL dataset missing required verified-trajectory columns: "+", ".join(missing))
    seen=set()
    for index,row in enumerate(ds):
        trajectory=str(row.get("trajectoryId") or "")
        if not trajectory or trajectory in seen: raise ValueError(f"offline RL trajectory identity missing/duplicated at row {index}")
        seen.add(trajectory)
        if row.get("cryptographicallyVerified") is not True or row.get("authorityGrade") is not True or row.get("realityBound") is not True:
            raise ValueError(f"offline RL row is not authority-grade/reality-bound/verified: {trajectory}")
        if not str(row.get("redactionProfile") or "").strip(): raise ValueError(f"offline RL row missing redaction profile: {trajectory}")
        chosen=str(row.get("chosen") or "");rejected=str(row.get("rejected") or "")
        if not chosen or not rejected or chosen==rejected: raise ValueError(f"offline RL preference pair invalid: {trajectory}")
        try: chosen_reward=float(row.get("chosenReward"));rejected_reward=float(row.get("rejectedReward"))
        except Exception as exc: raise ValueError(f"offline RL rewards invalid: {trajectory}") from exc
        if not math.isfinite(chosen_reward) or not math.isfinite(rejected_reward) or chosen_reward<=rejected_reward:
            raise ValueError(f"offline RL preference reward ordering invalid: {trajectory}")
        if row.get("authority") is True or row.get("productionAuthority") is True:
            raise ValueError(f"offline RL dataset row claimed authority: {trajectory}")
        expected=row.get("expectedOutcome");claimed=row.get("chosenOutcome")
        if expected=="UNKNOWN" and claimed=="SUCCESS": raise ValueError(f"offline RL row maps UNKNOWN to success: {trajectory}")


def main()->None:
    p=argparse.ArgumentParser();p.add_argument("--model",required=True);p.add_argument("--dataset",required=True);p.add_argument("--output",required=True);p.add_argument("--learning-rate",type=float,default=1e-6);p.add_argument("--epochs",type=float,default=1.0);p.add_argument("--batch-size",type=int,default=1);p.add_argument("--beta",type=float,default=.1);p.add_argument("--seed",type=int,default=1729);p.add_argument("--data-seed",type=int);p.add_argument("--full-determinism",action="store_true");p.add_argument("--round-manifest");a=p.parse_args()
    if a.seed<0 or (a.data_seed is not None and a.data_seed<0): raise SystemExit("offline RL seeds must be non-negative")
    data_seed=a.seed if a.data_seed is None else a.data_seed;ds=load_dataset("json",data_files=a.dataset,split="train");validate_offline_dataset(ds)
    manifest_path=Path(a.round_manifest).resolve() if a.round_manifest else Path(a.output).resolve()/"training-round.json";hyperparameters={"algorithm":"DPO_OFFLINE_POLICY_OPTIMIZATION","learningRate":a.learning_rate,"epochs":a.epochs,"batchSize":a.batch_size,"beta":a.beta,"seed":a.seed,"dataSeed":data_seed,"fullDeterminism":a.full_determinism,"authority":False};manifest=create_round(stage="offline_rl",model=a.model,dataset=Path(a.dataset),output_dir=Path(a.output),hyperparameters=hyperparameters);atomic_write(manifest_path,manifest)
    config=DPOConfig(output_dir=a.output,learning_rate=a.learning_rate,num_train_epochs=a.epochs,per_device_train_batch_size=a.batch_size,beta=a.beta,report_to=[],seed=a.seed,data_seed=data_seed,full_determinism=a.full_determinism)
    trainer=DPOTrainer(model=a.model,args=config,train_dataset=ds);trainer.train();trainer.save_model(a.output)
    atomic_write(manifest_path,record_checkpoint(manifest,Path(a.output),manifest_path));print("CIEAV offline RL complete - status=TRAINED_UNQUALIFIED authority=false productionAuthority=false promotionExecuted=false")


if __name__=="__main__": main()
