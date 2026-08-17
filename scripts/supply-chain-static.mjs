#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),reasons=[];
const lock=path.join(ROOT,"package-lock.json");if(!fs.existsSync(lock))reasons.push("package_lock_missing");
else{try{const parsed=JSON.parse(fs.readFileSync(lock,"utf8"));if(parsed.lockfileVersion<3)reasons.push("package_lock_version_must_be_3_or_newer");if(parsed.packages?.[""]?.name!=="cieav")reasons.push("package_lock_root_identity_mismatch")}catch{reasons.push("package_lock_invalid_json")}}
const workflowDir=path.join(ROOT,".github/workflows");for(const name of fs.readdirSync(workflowDir).filter(x=>/\.ya?ml$/i.test(x))){const file=path.join(workflowDir,name),text=fs.readFileSync(file,"utf8");
  for(const match of text.matchAll(/\buses:\s*['"]?([^\s'"#]+)['"]?/g)){const ref=match[1];if(ref.startsWith("./")||ref.startsWith("docker://"))continue;const at=ref.lastIndexOf("@");const revision=at>=0?ref.slice(at+1):"";if(!/^[a-f0-9]{40}$/i.test(revision))reasons.push(`workflow_action_not_sha_pinned:${name}:${ref}`)}
  if(/\bnpm\s+install\b/i.test(text))reasons.push(`workflow_uses_npm_install:${name}`);
  if(/--package-lock=false/.test(text))reasons.push(`workflow_disables_lockfile:${name}`);
  if(/\bnpx\s+[^\s]+/.test(text)&&!fs.existsSync(lock))reasons.push(`workflow_npx_without_lockfile:${name}`);
}
const unique=[...new Set(reasons)],passed=unique.length===0;console.log(JSON.stringify({product:"CIEAV",kind:"SUPPLY_CHAIN_STATIC",passed,reasons:unique},null,2));if(!passed){console.error("CIEAV supply-chain release gate failed. Generate a real workspace lockfile, use npm ci, and SHA-pin third-party Actions.");process.exitCode=2}else console.log("CIEAV supply-chain release gate passed.");
