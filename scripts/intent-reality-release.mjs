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
expectTokens("packages/contracts/src/execution-fabric.ts",[
  "AgentIdentityAttestationSchema","ScopedCredentialLeaseSchema","FormalPermissionGraphSchema","ExecutionProposalSchema","ExecutionTicketSchema","ExecutionAuditEventSchema","CLOUD_API"
]);
expectTokens("packages/contracts/src/control-plane.ts",[
  "InterpositionModeSchema","MANDATORY","InterpositionRouteSchema","OperationMandateSchema","AuthorizationWitnessSchema","ExecutionAttemptReceiptSchema","interpositionPostureDigest","maxUses:z.literal(1)"
]);
expectTokens("packages/contracts/src/agent-task.ts",[
  "REALITY_COMMIT_BOUND","REALITY_COMMIT_CONSUMED","EFFECT_QUARANTINED","realityCommitConsumedAt","effectQuarantined"
]);
expectTokens("packages/core/src/agent-task.ts",[
  "reality-bound commit is consumed","semantic effect is quarantined","markTaskEffectQuarantined","agent task retry prohibited while semantic effect is quarantined"
]);
expectTokens("packages/core/src/execution-fabric.ts",[
  "defaultDecision","DENY","verifyPermissionGraph","evaluateFormalAuthorization","executionBindingDigest","proposal.risk"
]);
expectTokens("packages/core/src/control-plane.ts",[
  "evaluateInterpositionPosture","direct bypass path","AGENT_VISIBLE","issueOperationMandate","verifyOperationMandate","cieav-operation-mandate-v1","operationRouteDigest"
]);
expectTokens("apps/api/src/intent-reality-engine.ts",[
  "timingSafeEqual","durableReplace","reality_witness_digest_mismatch","reality_changed_since_authorization","consequence_drift_budget_exceeded","semantic_effect_quarantined","autonomy_expansion_requires_clean_verified_outcomes","reserveReversibilityEscrow","reversibility_escrow_required"
]);
expectTokens("apps/api/src/execution-fabric.ts",[
  "cieav-agent-attestation-v1","verifyAttestation","verifyAuditChain","credential_lease_scope_violation","consumed_reality_bound_commit_required","formal_authorization_changed_before_execution","execution_proposal_reality_commit_binding_mismatch","execution_arguments_changed_after_authorization","execution_ticket_already_issued","recordExecutionAttempt","quarantineUnknown","previousHash","eventHash","credentialRefDigest"
]);
expectTokens("apps/api/src/control-plane.ts",[
  "control-plane-state","mandatory_interposition_not_ready","proposal_route_not_mandatorily_interposed","operation_mandate_requires_formal_allow","operation_mandate_reality_binding_mismatch","interposition_posture_changed_after_mandate","execution_attempt_mandate_binding_mismatch"
]);
expectTokens("apps/api/src/execution-router.ts",[
  "inspectTicket(ticketId)","consumeTicket(ticketId,normalizedArguments)","execution_adapter_unavailable","recordExecutionAttempt","execution_adapter_outcome_unknown"
]);
expectTokens("apps/api/src/agent-kernel.ts",[
  "cieav-intent-reality-state-v1","intent-reality-state.json","cieav-execution-fabric-state-v1","execution-fabric-state.json","cieav-control-plane-state-v1","control-plane-state.json","executionFabric","controlPlane","bindRealityCommitTrusted","consumeRealityCommitTrusted","quarantineEffectTrusted","assertRetryAllowed"
]);
expectTokens("apps/api/src/agent-kernel-api.ts",[
  "agent_execution_requires_reality_bound_commit","issueRealityBoundCommit","consumeRealityBoundCommit","resolveQuarantine","createAttenuationWitness","recordConsequenceDrift","autonomy-candidates","reversibility-escrow","activateReversibilityEscrow","intent-reality-v3","formalPermissionGraph","mandatoryExecutionTicket","tamperEvidentExecutionAudit","argumentBindingAtRoute","operationMandate","interpositionPosture","mandatoryBypassDeclarationCheck","execution-fabric/permission-graphs","execution-fabric/tickets","control-plane/interposition","control-plane/mandates","normalized_arguments_required"
]);
expectTokens("apps/mcp/src/index.ts",[
  "create_agent_task","authorize_execution","ALLOW is not execution authority","Agents cannot mint identity attestations","Operation Mandates","Execution Tickets"
]);
expectTokens("apps/api/src/intent-reality-engine.test.ts",[
  "observation time does not invalidate unchanged reality","invalidates on changed reality","blocks semantic retries across independent execution channels","cumulative consequence drift","non-self-authorizing"
]);
expectTokens("apps/api/src/reversibility-escrow.test.ts",[
  "refuses an undoable consequential commit without a reserved inverse","reserved inverse","different effect"
]);
expectTokens("packages/core/src/execution-fabric.test.ts",[
  "denies by default","DENY dominate ASK and ALLOW","permission graph is tampered","device or root-intent substitution"
]);
expectTokens("packages/core/src/control-plane.test.ts",[
  "fully mediated consequence route mandatory-ready","direct bypass route exists","credentials are agent-visible","single-use scoped and cryptographically verifiable"
]);
expectTokens("apps/api/src/execution-fabric.test.ts",[
  "consumed reality commit","second ticket","argument swapping","identity substitution","credential lease tool and risk escape","mismatched semantic effect","rechecks formal authorization","hash-linked execution audit trail"
]);
expectTokens("apps/api/src/execution-router.test.ts",[
  "adapter availability before consuming","consumes exact arguments before invoking","records UNKNOWN when an adapter throws"
]);

const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){
  const executable=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm;
  const finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args;
  const result=spawnSync(executable,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)fail(`${npm} ${args.join(" ")} exited ${result.status}`);
}

run(["run","test","-w","@cieav/core","--","execution-fabric.test.ts","control-plane.test.ts"]);
run(["run","test","-w","@cieav/api","--","intent-reality-engine.test.ts","reversibility-escrow.test.ts","agent-kernel.test.ts","agent-kernel-api.test.ts","execution-fabric.test.ts","execution-router.test.ts"]);
run(["run","typecheck","-w","@cieav/contracts"]);
run(["run","typecheck","-w","@cieav/core"]);
run(["run","typecheck","-w","@cieav/api"]);
console.log(`CIEAV Intent-to-Reality release gate PASS · platform=${process.platform} · identity/formal-auth/reality-commit/mandatory-interposition/operation-mandate/argument-bound-ticket/router/quarantine/attenuation/drift/autonomy/reversibility verified`);
