#!/usr/bin/env python3
"""Create and advance provenance manifests for CIEAV ML training rounds.

A trained checkpoint is never considered qualified by this module alone. Promotion is
fail-closed and requires a qualified exact ML environment, a matching exact-head GPU
determinism probe, a CIEAV rollout-evaluation report with passing promotion, explicit
hidden evidence, and a passing hidden verifier bank.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = "CIEAV_ML_VERIFIER_V1"
ALLOWED_CUBLAS = {":4096:8", ":16:8"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_tree(path: Path, *, exclude: set[Path] | None = None) -> str:
    path = path.resolve()
    excluded = {p.resolve() for p in (exclude or set())}
    if path.is_file():
        if path in excluded:
            raise ValueError("checkpoint file cannot be the excluded training-round manifest")
        return sha256_file(path)
    if not path.is_dir():
        raise ValueError(f"checkpoint path does not exist: {path}")
    h = hashlib.sha256()
    files = sorted(p for p in path.rglob("*") if p.is_file() and p.resolve() not in excluded)
    if not files:
        raise ValueError(f"checkpoint directory is empty after exclusions: {path}")
    for file in files:
        rel = file.relative_to(path).as_posix().encode("utf-8")
        h.update(len(rel).to_bytes(8, "big")); h.update(rel)
        digest = bytes.fromhex(sha256_file(file))
        h.update(len(digest).to_bytes(8, "big")); h.update(digest)
    return h.hexdigest()


def git_head() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(value, indent=2, ensure_ascii=True) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(raw)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def file_ref(path: Path) -> dict[str, Any]:
    return {"path": str(path.resolve()), "sha256": sha256_file(path.resolve())}


def validate_verifier_health(health: dict[str, Any] | None) -> dict[str, Any] | None:
    if health is None:
        return None
    if health.get("protocol") != PROTOCOL or health.get("authority") is not False:
        raise ValueError("training round verifier health contract mismatch")
    capabilities = health.get("capabilities", [])
    if not isinstance(capabilities, list):
        raise ValueError("training round verifier capabilities must be a list")
    return {"protocol": PROTOCOL, "authority": False, "capabilities": [str(x) for x in capabilities]}


def validate_environment_report(path: Path, expected_git_head: str | None) -> dict[str, Any]:
    path = path.resolve(); report = load_object(path)
    if report.get("architecture") != "CIEAV_ML_ENVIRONMENT_QUALIFICATION_V1" or report.get("authority") is not False or report.get("qualification") != "QUALIFIED":
        raise ValueError("ML environment qualification report contract mismatch")
    report_head = report.get("gitHead")
    if expected_git_head and report_head != expected_git_head:
        raise ValueError("ML environment qualification must match the training git head")
    constraints = report.get("constraints"); torch_info = report.get("torch")
    if not isinstance(constraints, dict) or not isinstance(constraints.get("sha256"), str):
        raise ValueError("ML environment qualification is missing constraints identity")
    if not isinstance(torch_info, dict) or torch_info.get("deterministicAlgorithms") is not True or torch_info.get("cudnnBenchmark") not in (False, None):
        raise ValueError("ML environment qualification is missing deterministic runtime evidence")
    return {**file_ref(path),"gitHead": report_head,"constraintsSha256": constraints.get("sha256"),"packages": report.get("packages"),"torch": torch_info,"requireCuda": report.get("requireCuda"),"requireScale": report.get("requireScale"),"seed": report.get("seed")}


def validate_gpu_probe_report(path: Path, expected_git_head: str | None, environment: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(environment, dict): raise ValueError("GPU determinism probe requires a qualified environment report")
    path = path.resolve(); report = load_object(path)
    if report.get("architecture") != "CIEAV_ML_GPU_DETERMINISM_PROBE_V1" or report.get("authority") is not False or report.get("qualification") != "QUALIFIED": raise ValueError("ML GPU determinism probe report contract mismatch")
    if expected_git_head and report.get("gitHead") != expected_git_head: raise ValueError("ML GPU determinism probe must match the training git head")
    environment_manifest = report.get("environmentManifest")
    if not isinstance(environment_manifest, dict) or environment_manifest.get("sha256") != environment.get("sha256"): raise ValueError("ML GPU determinism probe must bind the exact environment qualification")
    if report.get("cublasWorkspaceConfig") not in ALLOWED_CUBLAS or report.get("deterministicAlgorithms") is not True or report.get("cudnnBenchmark") is not False: raise ValueError("ML GPU determinism probe is missing deterministic CUDA runtime evidence")
    device = report.get("device"); probes = report.get("probes")
    if not isinstance(device, dict) or not isinstance(device.get("name"), str) or not device.get("name"): raise ValueError("ML GPU determinism probe is missing GPU identity")
    if not isinstance(probes, dict) or any(not isinstance(probes.get(name), str) or len(probes.get(name)) != 64 for name in ("torch.mm", "torch.nn.functional.conv2d")): raise ValueError("ML GPU determinism probe is missing deterministic probe digests")
    return {**file_ref(path),"gitHead": report.get("gitHead"),"environmentSha256": environment.get("sha256"),"cublasWorkspaceConfig": report.get("cublasWorkspaceConfig"),"device": device,"probes": probes,"seed": report.get("seed")}


def create_round(*,stage:str,model:str,dataset:Path,output_dir:Path,hyperparameters:dict[str,Any],verifier_health:dict[str,Any]|None=None,curriculum_report:Path|None=None,environment_report:Path|None=None,gpu_probe_report:Path|None=None,previous_manifest:Path|None=None)->dict[str,Any]:
    dataset=dataset.resolve()
    if not dataset.is_file(): raise ValueError(f"training dataset does not exist: {dataset}")
    current_head=git_head();environment=validate_environment_report(environment_report,current_head) if environment_report is not None else None;gpu_determinism=validate_gpu_probe_report(gpu_probe_report,current_head,environment) if gpu_probe_report is not None else None
    curriculum=None
    if curriculum_report is not None:
        curriculum_report=curriculum_report.resolve();report=load_object(curriculum_report)
        if report.get("architecture")!="CIEAV_RLVR_CURRICULUM_V1" or report.get("authority") is not False: raise ValueError("curriculum report contract mismatch")
        curriculum={**file_ref(curriculum_report),"seed":report.get("seed"),"total":report.get("total"),"quotas":report.get("quotas"),"sourceCounts":report.get("sourceCounts"),"curriculumBandCounts":report.get("curriculumBandCounts"),"inputs":report.get("inputs")}
    previous=file_ref(previous_manifest.resolve()) if previous_manifest is not None else None;created=utc_now();seed={"stage":stage,"model":model,"datasetSha256":sha256_file(dataset),"gitHead":current_head,"createdAt":created};round_id=hashlib.sha256(json.dumps(seed,sort_keys=True,separators=(",",":")).encode("utf-8")).hexdigest()[:24]
    return {"schemaVersion":1,"architecture":"CIEAV_ML_TRAINING_ROUND_V1","authority":False,"roundId":round_id,"createdAt":created,"updatedAt":created,"stage":stage,"status":"TRAINING","qualification":"UNQUALIFIED","gitHead":current_head,"model":{"input":model,"outputPath":str(output_dir.resolve())},"dataset":file_ref(dataset),"curriculum":curriculum,"environment":environment,"gpuDeterminism":gpu_determinism,"previousRound":previous,"verifier":validate_verifier_health(verifier_health),"hyperparameters":hyperparameters,"checkpoint":None,"promotion":None}


def record_checkpoint(manifest:dict[str,Any],checkpoint:Path,manifest_path:Path|None=None)->dict[str,Any]:
    if manifest.get("architecture")!="CIEAV_ML_TRAINING_ROUND_V1" or manifest.get("authority") is not False: raise ValueError("training round manifest contract mismatch")
    checkpoint=checkpoint.resolve();excluded={manifest_path.resolve()} if manifest_path is not None and manifest_path.resolve().is_relative_to(checkpoint) else set();updated=dict(manifest);updated["checkpoint"]={"path":str(checkpoint),"sha256":sha256_tree(checkpoint,exclude=excluded),"excludedPaths":[str(p) for p in sorted(excluded)]};updated["status"]="TRAINED_UNQUALIFIED";updated["qualification"]="UNQUALIFIED";updated["updatedAt"]=utc_now();return updated


def apply_promotion(manifest:dict[str,Any],report_path:Path)->dict[str,Any]:
    if not isinstance(manifest.get("checkpoint"),dict): raise ValueError("cannot promote a round without a recorded checkpoint")
    report_path=report_path.resolve();report=load_object(report_path)
    if report.get("architecture")!="CIEAV_PYTHON_NODE_RLVR_EVAL_V1" or report.get("authority") is not False: raise ValueError("promotion input must be a CIEAV rollout-evaluation report")
    promotion=report.get("promotion");verifier_bank=report.get("verifierBank");hidden_present=report.get("hiddenEvidencePresent") is True;promotion_passed=isinstance(promotion,dict) and promotion.get("passed") is True;verifier_bank_passed=isinstance(verifier_bank,dict) and verifier_bank.get("passed") is True;environment_qualified=isinstance(manifest.get("environment"),dict);gpu_determinism_qualified=isinstance(manifest.get("gpuDeterminism"),dict);qualified=promotion_passed and hidden_present and verifier_bank_passed and environment_qualified and gpu_determinism_qualified;updated=dict(manifest);updated["promotion"]={**file_ref(report_path),"promotionPassed":promotion_passed,"hiddenEvidencePresent":hidden_present,"verifierBankPassed":verifier_bank_passed,"environmentQualified":environment_qualified,"gpuDeterminismQualified":gpu_determinism_qualified,"qualified":qualified,"metrics":promotion.get("metrics") if isinstance(promotion,dict) else None,"violations":promotion.get("violations") if isinstance(promotion,dict) else ["promotion_report_missing"],"verifierBankViolations":verifier_bank.get("violations") if isinstance(verifier_bank,dict) else ["hidden_verifier_bank_missing"]};updated["qualification"]="QUALIFIED" if qualified else "UNQUALIFIED";updated["status"]="PROMOTION_PASSED" if qualified else "PROMOTION_FAILED";updated["updatedAt"]=utc_now();return updated


def verify_round(manifest:dict[str,Any],manifest_path:Path|None=None)->list[str]:
    violations:list[str]=[]
    if manifest.get("architecture")!="CIEAV_ML_TRAINING_ROUND_V1" or manifest.get("authority") is not False: return ["manifest_contract"]
    for label in ("dataset","checkpoint"):
        ref=manifest.get(label)
        if ref is None: continue
        try:
            p=Path(str(ref["path"]));excluded=set()
            if label=="checkpoint":
                listed=ref.get("excludedPaths",[]);excluded={Path(str(x)).resolve() for x in listed if isinstance(x,str)}
                if manifest_path is not None and manifest_path.resolve().is_relative_to(p.resolve()): excluded.add(manifest_path.resolve())
                actual=sha256_tree(p,exclude=excluded)
            else: actual=sha256_file(p)
            if actual!=ref.get("sha256"): violations.append(f"{label}_digest_mismatch")
        except Exception: violations.append(f"{label}_unavailable")
    for label in ("curriculum","environment","gpuDeterminism","promotion"):
        ref=manifest.get(label)
        if isinstance(ref,dict):
            try:
                if sha256_file(Path(str(ref["path"])))!=ref.get("sha256"): violations.append(f"{label}_digest_mismatch")
            except Exception: violations.append(f"{label}_unavailable")
    if manifest.get("qualification")=="QUALIFIED":
        promotion=manifest.get("promotion")
        if not isinstance(manifest.get("environment"),dict): violations.append("qualified_without_environment_qualification")
        if not isinstance(manifest.get("gpuDeterminism"),dict): violations.append("qualified_without_gpu_determinism_probe")
        if not isinstance(promotion,dict) or promotion.get("qualified") is not True or promotion.get("environmentQualified") is not True or promotion.get("gpuDeterminismQualified") is not True: violations.append("qualified_without_passing_promotion")
    return violations


def main()->int:
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest="command",required=True);checkpoint=sub.add_parser("checkpoint");checkpoint.add_argument("--manifest",required=True);checkpoint.add_argument("--checkpoint",required=True);promote=sub.add_parser("promote");promote.add_argument("--manifest",required=True);promote.add_argument("--promotion-report",required=True);verify=sub.add_parser("verify");verify.add_argument("--manifest",required=True);a=p.parse_args();manifest_path=Path(a.manifest).resolve();manifest=load_object(manifest_path)
    if a.command=="checkpoint": atomic_write(manifest_path,record_checkpoint(manifest,Path(a.checkpoint),manifest_path));print("CIEAV training round checkpoint recorded - qualification=UNQUALIFIED");return 0
    if a.command=="promote": updated=apply_promotion(manifest,Path(a.promotion_report));atomic_write(manifest_path,updated);print(f"CIEAV training round promotion recorded - qualification={updated['qualification']}");return 0
    violations=verify_round(manifest,manifest_path)
    if violations: print("CIEAV training round verification FAIL - "+",".join(violations));return 2
    print(f"CIEAV training round verification PASS - qualification={manifest.get('qualification')}");return 0


if __name__=="__main__": raise SystemExit(main())
