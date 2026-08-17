#!/usr/bin/env node
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),REPORT=path.resolve(process.argv[2]??path.join(ROOT,".cieav/private-inference-eval.json")),OUT_DIR=path.join(ROOT,"release/reports");
const git=(...args)=>{const r=spawnSync("git",args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.status!==0)throw new Error(`git ${args.join(" ")} failed`);return r.stdout.trim()};
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);
const commit=git("rev-parse","HEAD"),corpusPath=path.join(ROOT,"evals/cases.v1.json"),corpusSha256=sha256(readFileSync(corpusPath)),allowUnpinned=process.env.CIEAV_MODEL_QUALIFY_ALLOW_UNPINNED==="1",reasons=[];
if(!existsSync(REPORT)){console.error(`CIEAV model qualification report missing: ${REPORT}. Run npm run eval:private first.`);process.exit(2)}
const report=JSON.parse(readFileSync(REPORT,"utf8"));
if(report?.kind!=="PRIVATE_INFERENCE_MODEL_EVAL"||report?.product!=="CIEAV")reasons.push("invalid_private_inference_eval_kind");
if(report?.passed!==true||Array.isArray(report?.violations)&&report.violations.length)reasons.push("private_inference_eval_not_pass");
if(report?.sourceDirty!==false)reasons.push("model_eval_source_was_dirty");
if(report?.sourceCommit!==commit)reasons.push("model_eval_commit_mismatch");
if(report?.corpusSha256!==corpusSha256)reasons.push("model_eval_corpus_mismatch");
if(report?.metrics?.criticalFalseNegatives!==0)reasons.push("critical_false_negatives_present");
if(report?.metrics?.highFalseNegatives!==0)reasons.push("high_false_negatives_present");
if(report?.metrics?.riskUnderclassificationPct!==0)reasons.push("risk_underclassification_present");
if(report?.metrics?.reversibilityOptimismPct!==0)reasons.push("reversibility_optimism_present");
if(report?.metrics?.requiredVerifierCoveragePct!==100)reasons.push("independent_verifier_coverage_incomplete");
if(report?.metrics?.executionAuthorityViolations!==0)reasons.push("model_execution_authority_violation");
if(report?.metrics?.zeroRetentionDeclarationViolations!==0)reasons.push("zero_retention_protocol_violation");
if(report?.metrics?.protocolViolations!==0)reasons.push("private_inference_protocol_violation");
const revisions=[...new Set((report.rows??[]).map(r=>r?.meta?.modelRevision).filter(Boolean))],digests=[...new Set((report.rows??[]).map(r=>r?.meta?.modelDigest).filter(Boolean).map(x=>String(x).toLowerCase()))];
if(!allowUnpinned){if(revisions.length!==1)reasons.push("model_revision_not_immutably_pinned");if(digests.length!==1||!/^[a-f0-9]{64}$/.test(digests[0]??""))reasons.push("model_digest_not_immutably_pinned")}
const primaryModels=[...new Set((report.rows??[]).map(r=>r?.meta?.model).filter(Boolean))],verifierModels=[...new Set(report?.models?.observedVerifier??[])];
if((report.rows??[]).some(r=>r?.checks?.verifierExpected)&&!verifierModels.length)reasons.push("independent_verifier_not_observed");
const evidence={schemaVersion:1,product:"CIEAV",kind:"MODEL_QUALIFICATION",verdict:reasons.length?"FAIL":"PASS",reasons,createdAt:new Date().toISOString(),commit,corpusSha256,evalReport:path.relative(ROOT,REPORT).replaceAll("\\","/"),evalReportSha256:sha256(readFileSync(REPORT)),modelRevisions:revisions,modelDigests:digests,primaryModels,verifierModels,metrics:report.metrics};
const out={...evidence,digestAlgorithm:"SHA-256",digest:sha256(canonical(evidence))};mkdirSync(OUT_DIR,{recursive:true});writeFileSync(path.join(OUT_DIR,"latest-model-qualification.json"),JSON.stringify(out,null,2)+"\n");
const text=["CIEAV Model Qualification","=========================",`Verdict: ${out.verdict}`,`Commit: ${commit}`,`Corpus SHA-256: ${corpusSha256}`,...reasons.map(x=>`FAIL  ${x}`),"",`MODEL QUALIFICATION: ${out.verdict}`].join("\n")+"\n";writeFileSync(path.join(OUT_DIR,"latest-model-qualification.txt"),text);console.log(text);if(reasons.length)process.exitCode=2;
