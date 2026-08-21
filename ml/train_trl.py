#!/usr/bin/env python3
"""CIEAV post-training entrypoint for SFT/DPO/KTO/GRPO.

GPU dependencies are research-only. GRPO rewards are delegated to the canonical
Node verifier; this script never implements independent safety semantics.
"""
from __future__ import annotations
import argparse, json, os, urllib.request
from datasets import load_dataset


def verifier_reward(base: str, token: str, expectation: dict, candidate: dict, process=None) -> float:
    payload=json.dumps({"expectation":expectation,"candidate":candidate,"process":process}).encode()
    req=urllib.request.Request(base.rstrip("/")+"/v1/reward/decision",data=payload,headers={"content-type":"application/json","authorization":f"Bearer {token}"},method="POST")
    with urllib.request.urlopen(req,timeout=10) as r:
        result=json.loads(r.read())
    return float(result["score"])


def parse_candidate(text: str) -> dict:
    try:
        value=json.loads(text)
    except Exception:
        return {"actionType":"invalid","risk":"LOW","reversibility":"REVERSIBLE","confidence":1.0,"explanation":text[:2000]}
    return value if isinstance(value,dict) else {"actionType":"invalid","risk":"LOW","reversibility":"REVERSIBLE","confidence":1.0}


def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--stage",choices=["sft","dpo","kto","grpo"],required=True)
    p.add_argument("--model",required=True);p.add_argument("--dataset",required=True);p.add_argument("--output",required=True)
    p.add_argument("--learning-rate",type=float,default=2e-5);p.add_argument("--epochs",type=float,default=1.0);p.add_argument("--batch-size",type=int,default=1)
    p.add_argument("--num-generations",type=int,default=8);p.add_argument("--beta",type=float,default=0.1)
    a=p.parse_args();ds=load_dataset("json",data_files=a.dataset,split="train")
    common={"output_dir":a.output,"learning_rate":a.learning_rate,"num_train_epochs":a.epochs,"per_device_train_batch_size":a.batch_size,"report_to":[]}
    if a.stage=="sft":
        from trl import SFTConfig,SFTTrainer
        trainer=SFTTrainer(model=a.model,args=SFTConfig(**common),train_dataset=ds)
    elif a.stage=="dpo":
        from trl import DPOConfig,DPOTrainer
        trainer=DPOTrainer(model=a.model,args=DPOConfig(beta=a.beta,**common),train_dataset=ds)
    elif a.stage=="kto":
        from trl import KTOConfig,KTOTrainer
        trainer=KTOTrainer(model=a.model,args=KTOConfig(beta=a.beta,**common),train_dataset=ds)
    else:
        from trl import GRPOConfig,GRPOTrainer
        base=os.environ.get("CIEAV_ML_VERIFIER_URL","http://127.0.0.1:8765");token=os.environ.get("CIEAV_ML_VERIFIER_TOKEN","")
        if len(token)<32: raise SystemExit("GRPO requires CIEAV_ML_VERIFIER_TOKEN and the canonical verifier service")
        def reward_fn(completions,**kwargs):
            expectations=kwargs.get("expectation") or [{} for _ in completions]
            rewards=[]
            for completion,expectation in zip(completions,expectations):
                text=completion if isinstance(completion,str) else json.dumps(completion)
                rewards.append(verifier_reward(base,token,expectation,parse_candidate(text)))
            return rewards
        trainer=GRPOTrainer(model=a.model,reward_funcs=[reward_fn],args=GRPOConfig(beta=a.beta,num_generations=a.num_generations,**common),train_dataset=ds)
    trainer.train();trainer.save_model(a.output)

if __name__=="__main__": main()
