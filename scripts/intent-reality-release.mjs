#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const fail=m=>{console.error(`CIEAV Intent-to-Reality release gate FAIL: ${m}`);process.exit(2)};
const expectTokens=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)};

expectTokens("packages/contracts/src/intent-reality.ts",[
  "RealityWitnessSchema","SemanticEffectSchema","IntentAttenuationWitnessSchema","RealityBoundCommitSchema","EffectQuarantineSchema","AutonomyCandidateSchema","ReversibilityEscrowSchema"
]);
expectTokens("packages/contracts/src/agent-task.ts",[
  "REALITY_COMMIT_BOUND","REALITY_COMMIT_CONSUMED","EFFECT_QUARANTINED","realityCommitConsumedAt","effectQuarantined","EFFECT_QUARANTINED"
]);
expectTokens("packages/core/src/agent-task.ts",[
  "reality-bound commit is consumed","semantic effect is quarantined","markTaskEffectQuarantined","agent task retry prohibited while semantic effect is quarantined"
]);
expectTokens("apps/api/src/intent-reality-engine.ts",[
  "timingSafeEqual","durableReplace","reality_witness_digest_mismatch","reality_changed_since_authorization","consequence_drift_budget_exceeded","semantic_effect_quarantined","autonomy_expansion_requires_clean_verified_outcomes","reserveReversibilityEscrow","reversibility_escrow_required"
]);
expectTokens("apps/api/src/agent-kernel.ts",[
  "cieav-intent-reality-state-v1","intent-reality-state.json","bindRealityCommitTrusted","consumeRealityCommitTrusted","quarantineEffectTrusted","assertRetryAllowed"
]);
expectTokens("apps/api/src/agent-kernel-api.ts",[
  "agent_execution_requires_reality_bound_commit","/reality-commit","/consume-reality-commit","/quarantines/","/attenuation","/drift","autonomy-candidates","reversibility-escrow","reversibilityEscrow"
]);
expectTokens("apps/api/src/intent-reality-engine.test.ts",[
  "observation time does not invalidate unchanged reality","invalidates on changed reality","blocks semantic retries across independent execution channels","cumulative consequence drift","non-self-authorizing"
]);
expectTokens("apps/api/src/reversibility-escrow.test.ts",[
  "refuses an undoable consequential commit without a reserved inverse","reserved inverse","different effect"
]);

const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){
  const executable=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm;
  const finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args;
  const result=spawnSync(executable,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)fail(`${npm} ${args.join(" ")} exited ${result.status}`);
}

run(["run","test","-w","@cieav/api","--","intent-reality-engine.test.ts","reversibility-escrow.test.ts","agent-kernel.test.ts","agent-kernel-api.test.ts"]);
run(["run","typecheck","-w","@cieav/contracts"]);
run(["run","typecheck","-w","@cieav/core"]);
run(["run","typecheck","-w","@cieav/api"]);
console.log(`CIEAV Intent-to-Reality release gate PASS · platform=${process.platform} · commit/quarantine/attenuation/drift/autonomy/reversibility verified`);
