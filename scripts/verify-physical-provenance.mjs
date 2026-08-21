#!/usr/bin/env node
import crypto from "node:crypto";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyPhysicalQualificationEvidence} from "./physical-qualification-evidence.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),REPORTS=path.join(ROOT,"release","reports");
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v)??"undefined";
const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
const load=p=>JSON.parse(readFileSync(p,"utf8"));
const git=(...args)=>{const r=spawnSync("git",args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.status!==0)throw new Error(`git ${args.join(" ")} failed`);return r.stdout.trim()};
const packageVersion=()=>load(path.join(ROOT,"package.json")).version;
const repoFromRemote=()=>{const raw=git("config","--get","remote.origin.url");const m=raw.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);if(!m)throw new Error("unable to resolve GitHub repository from origin");return`${m[1]}/${m[2]}`};
const ghExecutable=()=>process.platform==="win32"?"gh.exe":"gh";

export function verifyGhAttestation({file,repo,commit,gh=ghExecutable()}){
  const signer=`${repo}/.github/workflows/physical-hardware-qualification.yml`;
  const args=["attestation","verify",file,"--repo",repo,"--signer-workflow",signer,"--source-digest",commit,"--format","json"];
  const r=spawnSync(gh,args,{cwd:ROOT,encoding:"utf8",shell:false,env:process.env});
  if(r.error)throw new Error(`GitHub CLI unavailable: ${r.error.message}`);
  if(r.status!==0)throw new Error(`physical evidence provenance verification failed for ${path.basename(file)}: ${(r.stderr||r.stdout||"").trim().slice(0,2000)}`);
  let value;try{value=JSON.parse(r.stdout)}catch{throw new Error(`GitHub attestation verification returned invalid JSON for ${path.basename(file)}`)}
  if(!Array.isArray(value)||value.length<1)throw new Error(`GitHub attestation verification returned no verified attestations for ${path.basename(file)}`);
  return{signerWorkflow:signer,verifiedAttestations:value.length};
}

export function verifyPhysicalProvenanceSet({physicalSet,repo,commit,version,gh=ghExecutable()}){
  if(!physicalSet||physicalSet.kind!=="PHYSICAL_QUALIFICATION_SET"||physicalSet.verdict!=="PASS")throw new Error("physical qualification set is not a valid PASS");
  if(physicalSet.commit!==commit)throw new Error("physical qualification set commit mismatch");
  if(physicalSet.version!==version)throw new Error("physical qualification set version mismatch");
  const selected={};
  for(const platform of ["windows","macos","linux"]){
    const ref=physicalSet.selected?.[platform];if(!ref?.file||!ref?.digest)throw new Error(`physical ${platform} evidence is not selected`);
    const file=path.resolve(ROOT,ref.file),physicalRoot=path.resolve(ROOT,"release","reports","physical")+path.sep;
    if(!file.startsWith(physicalRoot)||!existsSync(file))throw new Error(`physical ${platform} evidence path is invalid or missing`);
    const evidence=load(file),check=verifyPhysicalQualificationEvidence(evidence,{commit,productVersion:version});
    if(!check.ok)throw new Error(`physical ${platform} evidence failed internal verification: ${check.reasons.join(",")}`);
    if(evidence.digest!==ref.digest)throw new Error(`physical ${platform} selected digest mismatch`);
    const attestation=verifyGhAttestation({file,repo,commit,gh});
    selected[platform]={file:ref.file,digest:ref.digest,mechanism:evidence.mechanism,target:evidence.target,...attestation};
  }
  return{schemaVersion:1,product:"CIEAV",kind:"PHYSICAL_PROVENANCE_SET",verdict:"PASS",authority:false,repository:repo,commit,version,signerWorkflow:`${repo}/.github/workflows/physical-hardware-qualification.yml`,selected};
}

function main(){
  const physicalPath=path.join(REPORTS,"latest-physical-qualification.json");if(!existsSync(physicalPath))throw new Error("latest physical qualification report is missing");
  const commit=git("rev-parse","HEAD"),version=packageVersion(),repo=String(process.env.CIEAV_GITHUB_REPOSITORY||repoFromRemote()).trim();
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error("invalid CIEAV_GITHUB_REPOSITORY");
  const evidence=verifyPhysicalProvenanceSet({physicalSet:load(physicalPath),repo,commit,version});
  const base={...evidence,createdAt:new Date().toISOString()},out={...base,digestAlgorithm:"SHA-256",digest:sha256(canonical(base))};
  writeFileSync(path.join(REPORTS,"latest-physical-provenance.json"),JSON.stringify(out,null,2)+"\n","utf8");
  console.log(`CIEAV physical provenance verification PASS · repository=${repo} · commit=${commit.slice(0,12)} · platforms=windows,macos,linux`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main()}catch(err){console.error(`CIEAV physical provenance verification FAIL: ${err?.message??err}`);process.exit(2)}}
