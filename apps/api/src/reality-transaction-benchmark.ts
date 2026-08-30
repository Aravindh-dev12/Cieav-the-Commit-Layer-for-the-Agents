import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import type {ExecutionProposal,EvidenceProviderBinding,EvidenceQuorumRequirement,RealityTransactionBenchmarkScenarioResult} from "@cieav/contracts";
import {
  assertEvidenceQuorumPlanValid,
  buildRealityTransactionBenchmarkReport,
  consequenceAlgebraDigest,
  createConsequenceSettlement,
  defaultCanonicalRealityResolverRegistry,
  deferredNetworkProposal,
  evaluateOfflineAction,
  materializeExecutionProposal,
  materializeResolvedExecutionProposal,
  offlineActionRequirement,
  offlineRuntimeSnapshot,
  planEvidenceQuorum,
  realityTransactionBenchmarkDigest,
  realityTransactionBenchmarkScenario,
  reconnectPlan,
  relationBetween,
  transitionConsequenceSettlement,
  verifyConsequenceSettlement,
  verifyRealityTransactionBenchmarkReport
} from "@cieav/core";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

const h=(value:unknown)=>consequenceAlgebraDigest(value);
const now=()=>new Date().toISOString();
const liveRoute=(input:{routeRef:string;protocol:string;adapterRef:string;artifact:string;evidenceRefs:string[]})=>({
  routeRef:input.routeRef,
  protocol:input.protocol,
  adapterRef:input.adapterRef,
  adapterManifestDigest:realityTransactionBenchmarkDigest({adapter:input.adapterRef,protocol:input.protocol,version:1}),
  runtimeArtifactDigest:realityTransactionBenchmarkDigest({artifact:input.artifact,node:process.version,platform:process.platform,arch:process.arch}),
  runtimeClass:"LOCAL_LIVE" as const,
  liveSideEffectObserved:true,
  evidenceRefs:input.evidenceRefs,
  authority:false as const
});

function proposal(input:{id?:string;taskId?:string;intentId?:string;protocol:"HTTP"|"CLI"|"MCP"|"BROWSER"|"SDK"|"GIT";toolId:string;operation:string;target:string;kind:"UPDATE"|"DELETE"|"TRANSFER_VALUE"|"READ";amount?:number;rootIntent?:string}):ExecutionProposal{
  const at=now(),intentId=input.rootIntent??input.intentId??crypto.randomUUID();
  return{
    id:input.id??crypto.randomUUID(),version:1,taskId:input.taskId??crypto.randomUUID(),intentId,scopeDeviceId:"benchmark-device-0001",subjectId:"benchmark-agent",identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:input.toolId,protocol:input.protocol,operation:input.operation,target:input.target,risk:"HIGH",normalizedArgumentsDigest:h({target:input.target,operation:input.operation,amount:input.amount??null}),semanticEffect:{kind:input.kind,target:input.target,objectRef:input.target,...(input.amount!==undefined?{amount:{currency:"USD",value:input.amount}}:{}),attributes:{benchmark:"m14"}},realityWitness:{version:1,observedAt:at,facts:[{key:"benchmark.before",valueDigest:h({target:input.target,state:"before"}),source:"benchmark-local-readback",observedAt:at}],digest:h({target:input.target,observedAt:at,state:"before"})},expectedPostStateDigest:h({target:input.target,state:"after"}),proofObligationDigest:h({proof:"benchmark-local-readback",target:input.target}),attenuationWitnessIds:[],createdAt:at
  };
}

function canonicalResolution(routeNativeIdentity:string,namespace:string,canonicalIdentity:string){
  return defaultCanonicalRealityResolverRegistry().resolve("cieav.message.customer.v1","1",{
    version:"CIEAV_CANONICAL_REALITY_RESOLUTION_REQUEST_V1",
    routeNativeIdentity,
    namespace,
    authorityDomain:"device:benchmark-device-0001",
    resourceKind:"RESOURCE",
    aliases:[],
    parentRefs:[],
    identityEvidenceRefs:["benchmark:local-live-route"],
    context:{canonicalIdentity},
    authority:false
  });
}

async function startLoopbackServer(){
  let state={status:"INITIAL",revision:0};
  const server=http.createServer(async(req,res)=>{
    if(req.url!=="/customer/42"){res.statusCode=404;res.end("not found");return}
    if(req.method==="GET"){res.setHeader("content-type","application/json");res.end(JSON.stringify(state));return}
    if(req.method==="PATCH"){
      let body="";for await(const chunk of req)body+=String(chunk);
      const next=JSON.parse(body) as {status:string};state={status:next.status,revision:state.revision+1};
      res.setHeader("content-type","application/json");res.end(JSON.stringify(state));return;
    }
    res.statusCode=405;res.end("method not allowed");
  });
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve())});
  const address=server.address();if(!address||typeof address==="string")throw new Error("benchmark_loopback_address_unavailable");
  return{server,url:`http://127.0.0.1:${address.port}/customer/42`};
}

export async function runLocalRealityTransactionBenchmark(options:{gitCommitSha?:string;runnerRef?:string;stateDir?:string}={}){
  const root=options.stateDir??await mkdtemp(path.join(os.tmpdir(),"cieav-m14-benchmark-")),ownsRoot=!options.stateDir,startedAt=now(),scenarios:RealityTransactionBenchmarkScenarioResult[]=[];
  const {server,url}=await startLoopbackServer();
  const filePath=path.join(root,"customer-42.json"),canonicalIdentity="message://customer/42";
  try{
    await writeFile(filePath,JSON.stringify({status:"INITIAL",revision:0}),"utf8");

    {
      const began=now(),httpWrite=await fetch(url,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"HTTP_UPDATED"})});if(!httpWrite.ok)throw new Error(`benchmark_http_write_failed:${httpWrite.status}`);
      const httpRead=await fetch(url);const httpState=await httpRead.json() as {status:string;revision:number};
      await writeFile(filePath,JSON.stringify({status:"FILE_UPDATED",revision:1}),"utf8");const fileState=JSON.parse(await readFile(filePath,"utf8")) as {status:string;revision:number};
      const httpResolution=canonicalResolution(url,"http",canonicalIdentity),fileResolution=canonicalResolution(`file://${filePath}`,"cli",canonicalIdentity);
      const passed=httpState.status==="HTTP_UPDATED"&&fileState.status==="FILE_UPDATED"&&httpResolution.canonicalRealityRef===fileResolution.canonicalRealityRef;
      scenarios.push(realityTransactionBenchmarkScenario({kind:"HETEROGENEOUS_EQUIVALENCE",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[liveRoute({routeRef:url,protocol:"HTTP",adapterRef:"benchmark.loopback-http.v1",artifact:"node:http",evidenceRefs:[`http-readback:${h(httpState)}`]}),liveRoute({routeRef:`file://${filePath}`,protocol:"FILESYSTEM",adapterRef:"benchmark.filesystem.v1",artifact:"node:fs",evidenceRefs:[`file-readback:${h(fileState)}`]})],canonicalRealityRefs:[httpResolution.canonicalRealityRef,fileResolution.canonicalRealityRef],consequenceRefs:[],settlementStates:[],evidenceRefs:[`canonical-http:${httpResolution.resolutionDigest}`,`canonical-file:${fileResolution.resolutionDigest}`],unresolvedBlockers:passed?[]:["heterogeneous routes did not converge on one canonical reality"],startedAt:began,completedAt:now()}));
    }

    let updateMaterialization:ReturnType<typeof materializeResolvedExecutionProposal>;
    {
      const began=now(),httpProposal=proposal({protocol:"HTTP",toolId:"benchmark.http",operation:"PATCH",target:url,kind:"UPDATE"}),cliProposal=proposal({protocol:"CLI",toolId:"benchmark.fs",operation:"DELETE",target:`file://${filePath}`,kind:"DELETE",intentId:httpProposal.intentId,taskId:httpProposal.taskId});
      const httpResolution=canonicalResolution(url,"http",canonicalIdentity),fileResolution=canonicalResolution(`file://${filePath}`,"cli",canonicalIdentity);
      updateMaterialization=materializeResolvedExecutionProposal(httpProposal,httpResolution);const deleteMaterialization=materializeResolvedExecutionProposal(cliProposal,fileResolution),relation=relationBetween(updateMaterialization,deleteMaterialization);
      const passed=relation.relation==="CONFLICTS"&&updateMaterialization.semanticIdentity.targetRealityRefs[0]===deleteMaterialization.semanticIdentity.targetRealityRefs[0];
      scenarios.push(realityTransactionBenchmarkScenario({kind:"CROSS_ROUTE_CONFLICT",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[httpResolution.canonicalRealityRef],consequenceRefs:[updateMaterialization.id,deleteMaterialization.id],settlementStates:[],evidenceRefs:[`relation:${relation.basisDigest}`],unresolvedBlockers:passed?[]:["cross-route conflicting mutations were not classified as CONFLICTS"],startedAt:began,completedAt:now()}));
    }

    {
      const began=now(),store=new CieavConsequenceAlgebraStore(path.join(root,"quarantine.json"),"q".repeat(64));
      const first=await store.admit(updateMaterialization);if(first.admission.decision!=="ADMIT")throw new Error(`benchmark_unknown_source_not_admitted:${first.admission.decision}`);await store.mark(updateMaterialization.id,"QUARANTINED");
      const retryProposal=proposal({protocol:"CLI",toolId:"benchmark.fs",operation:"WRITE",target:`file://${filePath}`,kind:"UPDATE",intentId:updateMaterialization.intentId,taskId:updateMaterialization.taskId}),retryResolution=canonicalResolution(`file://${filePath}`,"cli",canonicalIdentity),retry=materializeResolvedExecutionProposal(retryProposal,retryResolution),waiting=await store.admit(retry),closure=await store.getQuarantineClosure(updateMaterialization.id);
      const passed=waiting.admission.decision==="RECONCILE"&&waiting.node.state==="MATERIALIZED"&&closure?.status==="OPEN"&&closure.reconcileCandidateRefs.includes(retry.id);
      scenarios.push(realityTransactionBenchmarkScenario({kind:"UNKNOWN_QUARANTINE",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[retryResolution.canonicalRealityRef],consequenceRefs:[updateMaterialization.id,retry.id],settlementStates:["UNKNOWN"],evidenceRefs:[`quarantine:${closure?.closureDigest??"missing"}`],unresolvedBlockers:passed?[]:["UNKNOWN did not quarantine/reconcile the equivalent alternate route"],startedAt:began,completedAt:now()}));
      await store.close();
    }

    let aggregateStorePath="";
    {
      const began=now(),rootIntent=crypto.randomUUID();aggregateStorePath=path.join(root,"aggregate.json");const store=new CieavConsequenceAlgebraStore(aggregateStorePath,"a".repeat(64));const current=await store.getPolicy();await store.putPolicy({...current,defaultAggregationLimits:{"money:USD":15}});
      const source=materializeExecutionProposal(proposal({protocol:"HTTP",toolId:"benchmark.pay.http",operation:"TRANSFER",target:"acct:one",kind:"TRANSFER_VALUE",amount:10,rootIntent})),candidate=materializeExecutionProposal(proposal({protocol:"CLI",toolId:"benchmark.pay.cli",operation:"TRANSFER",target:"acct:two",kind:"TRANSFER_VALUE",amount:6,rootIntent}));
      const admitted=await store.admit(source);if(admitted.admission.decision!=="ADMIT")throw new Error("benchmark_aggregate_source_not_admitted");await store.mark(source.id,"QUARANTINED");const waiting=await store.admit(candidate),before=waiting.admission.decision==="COORDINATE"&&waiting.node.state==="MATERIALIZED";await store.reconcileUnknown(source.id,"FAILURE",["benchmark:ledger-negative-readback"],h({source:source.id,outcome:"FAILURE"}));const reconsidered=await store.reconsiderWaiting(candidate.id),passed=before&&reconsidered.admission.decision==="ADMIT"&&reconsidered.node.state==="RESERVED";
      scenarios.push(realityTransactionBenchmarkScenario({kind:"AGGREGATE_ANTI_FRAGMENTATION",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[],consequenceRefs:[source.id,candidate.id],settlementStates:["UNKNOWN","FAILURE"],evidenceRefs:["benchmark:ledger-negative-readback",`reservation:${reconsidered.node.reservationId??"missing"}`],unresolvedBlockers:passed?[]:["aggregate budget did not coordinate UNKNOWN contribution and reopen after proven failure"],startedAt:began,completedAt:now()}));await store.close();
    }

    {
      const began=now(),materialization=materializeExecutionProposal(proposal({protocol:"HTTP",toolId:"benchmark.quorum",operation:"UPDATE",target:"resource:quorum",kind:"UPDATE"}));
      const providers:EvidenceProviderBinding[]=[{version:"CIEAV_EVIDENCE_PROVIDER_BINDING_V1",ref:"benchmark:local-readback",enabled:true,versionDigest:h("readback-v1"),independenceDomain:"local-store",evidenceClasses:["STATE_READBACK"],sourceClass:"LOCAL_READBACK",health:"AVAILABLE",evidenceRefs:["benchmark:readback"],authority:false,mayMintExecutionAuthority:false},{version:"CIEAV_EVIDENCE_PROVIDER_BINDING_V1",ref:"benchmark:signed-receipt",enabled:true,versionDigest:h("receipt-v1"),independenceDomain:"signed-adapter",evidenceClasses:["SIGNED_RECEIPT"],sourceClass:"SIGNED_RECEIPT",health:"AVAILABLE",evidenceRefs:["benchmark:receipt"],authority:false,mayMintExecutionAuthority:false}];
      const requirement:EvidenceQuorumRequirement={id:crypto.randomUUID(),version:"CIEAV_EVIDENCE_QUORUM_REQUIREMENT_V1",enabled:true,priority:100,toolIds:[materialization.toolId],effectClasses:["UPDATE"],minRisk:"HIGH",minimumProviders:2,minimumIndependenceDomains:2,requiredEvidenceClasses:["STATE_READBACK","SIGNED_RECEIPT"],maxEvidenceAgeMs:300000,timeoutOutcome:"UNKNOWN",evidenceRefs:["benchmark:quorum-policy"],reason:"M14 independent proof quorum",authority:false,mayMintExecutionAuthority:false};
      const plan=planEvidenceQuorum(materialization,providers,requirement,60);let driftRejected=false;assertEvidenceQuorumPlanValid(plan,providers);try{assertEvidenceQuorumPlanValid(plan,[providers[0]!,{...providers[1]!,health:"UNAVAILABLE"}])}catch{driftRejected=true}
      const passed=plan.availabilityState==="SATISFIABLE"&&plan.selectedIndependenceDomains.length===2&&driftRejected;
      scenarios.push(realityTransactionBenchmarkScenario({kind:"EVIDENCE_QUORUM",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:materialization.semanticIdentity.targetRealityRefs,consequenceRefs:[materialization.id],settlementStates:[],evidenceRefs:[`quorum:${plan.quorumDigest}`],unresolvedBlockers:passed?[]:["independent evidence quorum was not satisfiable or did not fail closed on provider loss"],startedAt:began,completedAt:now()}));
    }

    {
      const began=now(),consequenceRef=crypto.randomUUID(),unknown=createConsequenceSettlement({consequenceRef,executionState:"DISPATCHED",realityState:"UNKNOWN",legitimacyState:"VALID",evidenceState:"UNAVAILABLE",recoveryState:"UNKNOWN",evidenceRefs:["benchmark:dispatch-timeout"]}),transitioned=transitionConsequenceSettlement(unknown,{executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["benchmark:independent-readback"]},"Independent local readback resolved UNKNOWN.",{trustedRealityReconciliation:true}).settlement,passed=verifyConsequenceSettlement(unknown)&&verifyConsequenceSettlement(transitioned)&&transitioned.realityState==="OBSERVED_SUCCESS";
      scenarios.push(realityTransactionBenchmarkScenario({kind:"MULTI_AXIS_SETTLEMENT",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[],consequenceRefs:[consequenceRef],settlementStates:["UNKNOWN","SUCCESS"],evidenceRefs:[`settlement:${unknown.settlementDigest}`,`settlement:${transitioned.settlementDigest}`],unresolvedBlockers:passed?[]:["trusted reconciliation did not transition UNKNOWN to observed success"],startedAt:began,completedAt:now()}));
    }

    {
      const began=now(),reopened=new CieavConsequenceAlgebraStore(aggregateStorePath,"a".repeat(64)),recovery=await reopened.recoverOnStartup(),nodes=await reopened.listNodes(),passed=recovery.recovered&&nodes.length>=2&&nodes.some(node=>node.state==="SETTLED_FAILURE")&&nodes.some(node=>node.state==="RESERVED");
      scenarios.push(realityTransactionBenchmarkScenario({kind:"DURABLE_RESTART",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[],consequenceRefs:nodes.map(node=>node.materialization.id),settlementStates:["FAILURE"],evidenceRefs:[`durable-store:${h(nodes.map(node=>({id:node.materialization.id,state:node.state})))}`],unresolvedBlockers:passed?[]:["HMAC durable store did not preserve settled and reserved consequence state across restart"],startedAt:began,completedAt:now()}));await reopened.close();
    }

    {
      const began=now(),offline=offlineRuntimeSnapshot({nodeId:"benchmark-local-node",connectivity:"OFFLINE",localAuthorityReady:true,localStateReady:true,localJournalReady:true,localConsequenceGraphReady:true,localPolicyReady:true,localInferenceReady:true,lanInferenceReady:false,cloudInferenceReady:false,localAdapterRefs:["benchmark.filesystem.v1","benchmark.remote-api.v1"],localProofProviderRefs:["benchmark:file-readback"],remoteProofProviderRefs:["benchmark:remote-readback"],observedAt:now()}),localReq=offlineActionRequirement({proposalRef:crypto.randomUUID(),adapterRef:"benchmark.filesystem.v1",networkRequirement:"NONE",requiredProofProviderRefs:["benchmark:file-readback"]}),localAdmission=evaluateOfflineAction(offline,localReq),remoteReq=offlineActionRequirement({proposalRef:crypto.randomUUID(),adapterRef:"benchmark.remote-api.v1",networkRequirement:"INTERNET",requiredProofProviderRefs:["benchmark:remote-readback"],requiresFreshRemoteReality:true}),remoteAdmission=evaluateOfflineAction(offline,remoteReq),deferred=deferredNetworkProposal({requirement:remoteReq,admission:remoteAdmission}),online=offlineRuntimeSnapshot({...offline,connectivity:"ONLINE",cloudInferenceReady:true,remoteProofProviderRefs:["benchmark:remote-readback"],observedAt:now()}),plan=reconnectPlan(offline,online,{unknownConsequenceRefs:[crypto.randomUUID()],deferredProposalRefs:[remoteReq.proposalRef]}),passed=localAdmission.decision==="ALLOW_FOR_AUTHORIZATION"&&remoteAdmission.decision==="WAIT_NETWORK"&&!deferred.executionAuthorityCarried&&!deferred.executableCredentialCarried&&!plan.outstandingAuthorityMayResume&&plan.steps.includes("RECONCILE_UNKNOWN_CONSEQUENCES")&&plan.steps.includes("REVALIDATE_DEFERRED_PROPOSALS")&&plan.steps.includes("ISSUE_FRESH_LOCAL_AUTHORITY_IF_ALLOWED");
      scenarios.push(realityTransactionBenchmarkScenario({kind:"OFFLINE_RECONNECT",passed,runtimeClass:"LOCAL_LIVE",routeEvidence:[],canonicalRealityRefs:[],consequenceRefs:plan.unknownConsequenceRefs,settlementStates:["UNKNOWN"],evidenceRefs:[`offline:${offline.snapshotDigest}`,`deferred:${deferred.deferredDigest}`,`reconnect:${plan.planDigest}`],unresolvedBlockers:passed?[]:["offline/reconnect path weakened local authority or carried stale authority across reconnect"],startedAt:began,completedAt:now()}));
    }

    const report=buildRealityTransactionBenchmarkReport({...(options.gitCommitSha?{gitCommitSha:options.gitCommitSha}:{}),platform:process.platform,arch:process.arch,runtimeVersion:process.version,runnerRef:options.runnerRef??process.env.RUNNER_NAME??"local-self-hosted",scenarios,startedAt,completedAt:now()});
    verifyRealityTransactionBenchmarkReport(report);
    return report;
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(ownsRoot)await rm(root,{recursive:true,force:true});
  }
}
