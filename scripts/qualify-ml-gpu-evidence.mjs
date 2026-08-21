#!/usr/bin/env node
import crypto from "node:crypto";
import {readFileSync,writeFileSync,statSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),DIR=path.join(ROOT,"release","reports"),ML=path.join(DIR,"ml");
const envPath=path.join(ML,"environment-qualification.json"),probePath=path.join(ML,"gpu-determinism-probe.json");
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);
const shaFile=f=>crypto.createHash("sha256").update(readFileSync(f)).digest("hex");
const head=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",shell:false});if(head.status!==0)throw new Error("cannot resolve current Git commit");
const commit=head.stdout.trim(),pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8")),reasons=[];
for(const f of [envPath,probePath]){try{if(!statSync(f).isFile())reasons.push(`missing_ml_gpu_evidence:${path.basename(f)}`)}catch{reasons.push(`missing_ml_gpu_evidence:${path.basename(f)}`)}}
let env={},probe={};if(!reasons.length){env=JSON.parse(readFileSync(envPath,"utf8"));probe=JSON.parse(readFileSync(probePath,"utf8"));
 if(env.architecture!=="CIEAV_ML_ENVIRONMENT_QUALIFICATION_V1"||env.qualification!=="QUALIFIED"||env.authority!==false)reasons.push("ml_environment_not_qualified");
 if(env.gitHead!==commit||env.requireCuda!==true||env?.torch?.cudaAvailable!==true||!Array.isArray(env?.torch?.devices)||env.torch.devices.length<1)reasons.push("ml_environment_not_exact_head_real_cuda");
 if(env?.torch?.deterministicAlgorithms!==true||env?.torch?.cudnnBenchmark!==false||![":4096:8",":16:8"].includes(env?.torch?.cublasWorkspaceConfig))reasons.push("ml_environment_not_deterministic");
 if(probe.architecture!=="CIEAV_ML_GPU_DETERMINISM_PROBE_V1"||probe.qualification!=="QUALIFIED"||probe.authority!==false)reasons.push("ml_gpu_probe_not_qualified");
 if(probe.gitHead!==commit||probe.deterministicAlgorithms!==true||probe.cudnnBenchmark!==false||!probe?.device?.name)reasons.push("ml_gpu_probe_not_exact_head_real_gpu");
 if(probe.seed!==env.seed||probe.cublasWorkspaceConfig!==env?.torch?.cublasWorkspaceConfig)reasons.push("ml_gpu_probe_environment_mismatch");
 if(probe?.environmentManifest?.sha256!==shaFile(envPath))reasons.push("ml_gpu_probe_not_bound_to_environment_manifest");
 for(const name of ["torch.mm","torch.nn.functional.conv2d"])if(!/^[a-f0-9]{64}$/.test(String(probe?.probes?.[name]??"")))reasons.push(`ml_gpu_probe_digest_missing:${name}`);
}
const verdict=reasons.length?"FAIL":"PASS",evidence={schemaVersion:1,product:"CIEAV",kind:"ML_GPU_QUALIFICATION_SET",authority:false,verdict,reasons,createdAt:new Date().toISOString(),version:pkg.version,commit,environment:{file:"ml/environment-qualification.json",sha256:reasons.length?null:shaFile(envPath),gpuCount:Number(env?.torch?.devices?.length??0),torchVersion:env?.torch?.torchVersion??null,cudaRuntime:env?.torch?.cudaRuntime??null},determinismProbe:{file:"ml/gpu-determinism-probe.json",sha256:reasons.length?null:shaFile(probePath),device:probe?.device?.name??null,capability:probe?.device?.capability??null},reproducibilityScope:"exact-qualified-software-and-hardware-environment"};
const out={...evidence,digestAlgorithm:"SHA-256",digest:crypto.createHash("sha256").update(canonical(evidence)).digest("hex")};writeFileSync(path.join(DIR,"latest-ml-gpu-qualification.json"),JSON.stringify(out,null,2)+"\n","utf8");
console.log(`CIEAV ML GPU qualification set: ${verdict} · gpu=${out.determinismProbe.device??"unknown"} · authority=false`);if(verdict!=="PASS"){console.error(reasons.join("\n"));process.exitCode=1;}
