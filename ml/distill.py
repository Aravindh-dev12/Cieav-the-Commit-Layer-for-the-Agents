#!/usr/bin/env python3
"""Sequence-distill a qualified teacher corpus into a smaller CIEAV semantic model.

The input JSONL must contain teacher-approved text/completion records created from a
separately qualified teacher. Distillation never transfers execution authority; the
student must pass the same held-out CIEAV promotion gate before use.
"""
from __future__ import annotations
import argparse
from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer


def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--student",required=True)
    p.add_argument("--teacher-corpus",required=True)
    p.add_argument("--output",required=True)
    p.add_argument("--learning-rate",type=float,default=1e-5)
    p.add_argument("--epochs",type=float,default=1.0)
    p.add_argument("--batch-size",type=int,default=1)
    p.add_argument("--lora-r",type=int,default=16)
    a=p.parse_args()
    ds=load_dataset("json",data_files=a.teacher_corpus,split="train")
    if "text" not in ds.column_names and "completion" not in ds.column_names:
        raise SystemExit("teacher corpus must contain text or completion records")
    peft=LoraConfig(r=a.lora_r,lora_alpha=max(16,a.lora_r*2),lora_dropout=.05,bias="none",task_type="CAUSAL_LM")
    cfg=SFTConfig(output_dir=a.output,learning_rate=a.learning_rate,num_train_epochs=a.epochs,per_device_train_batch_size=a.batch_size,report_to=[])
    trainer=SFTTrainer(model=a.student,args=cfg,train_dataset=ds,peft_config=peft)
    trainer.train();trainer.save_model(a.output)
    print("Distillation complete. Student remains UNQUALIFIED until the independent CIEAV promotion gate passes.")

if __name__=="__main__": main()
