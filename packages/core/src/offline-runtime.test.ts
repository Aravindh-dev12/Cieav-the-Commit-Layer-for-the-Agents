import {describe,expect,it} from "vitest";
import {
  cognitiveRouteRequirement,
  deferredNetworkProposal,
  evaluateOfflineAction,
  offlineActionRequirement,
  offlineRuntimeSnapshot,
  offlineSyncEnvelope,
  reconnectPlan,
  selectCognitiveRoute
} from "./offline-runtime.js";

const ZERO="0".repeat(64);

function makeSnapshot(options:{connectivity?:"OFFLINE"|"LAN_ONLY"|"ONLINE_DEGRADED"|"ONLINE";localInferenceReady?:boolean;cloudInferenceReady?:boolean;localAuthorityReady?:boolean}={}){
  return offlineRuntimeSnapshot({
    nodeId:"device:local-1",
    connectivity:options.connectivity??"OFFLINE",
    localAuthorityReady:options.localAuthorityReady??true,
    localStateReady:true,
    localPolicyReady:true,
    localJournalReady:true,
    localConsequenceGraphReady:true,
    localInferenceReady:options.localInferenceReady??true,
    lanInferenceReady:false,
    cloudInferenceReady:options.cloudInferenceReady??false,
    localProofProviderRefs:["proof:filesystem"],
    remoteProofProviderRefs:["proof:bank-ledger"],
    localAdapterRefs:["adapter:filesystem"],
    syncBacklogCount:3,
    observedAt:"2026-08-29T15:00:00.000Z"
  });
}

describe("offline runtime",()=>{
  it("prefers a local model while offline",()=>{
    const snapshot=makeSnapshot();
    const requirement=cognitiveRouteRequirement({taskRef:"task:1",modelRequired:true});
    const decision=selectCognitiveRoute(snapshot,requirement,"2026-08-29T15:00:01.000Z");
    expect(decision.decision).toBe("AVAILABLE");
    expect(decision.route).toBe("LOCAL_MODEL");
    expect(decision.authority).toBe(false);
    expect(decision.mayMintExecutionAuthority).toBe(false);
  });

  it("waits instead of weakening policy when cloud-only cognition is unavailable",()=>{
    const snapshot=makeSnapshot({localInferenceReady:false});
    const requirement=cognitiveRouteRequirement({
      taskRef:"task:2",
      modelRequired:true,
      networkRequirement:"INTERNET",
      allowLan:false,
      allowCloud:true
    });
    const decision=selectCognitiveRoute(snapshot,requirement,"2026-08-29T15:00:02.000Z");
    expect(decision.decision).toBe("WAIT_FOR_NETWORK");
    expect(decision.route).toBe("NO_MODEL");
  });

  it("allows a fully local consequence to proceed to authorization while offline",()=>{
    const snapshot=makeSnapshot();
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:file-write",
      effectClass:"UPDATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"NONE",
      requiredProofProviderRefs:["proof:filesystem"]
    });
    const admission=evaluateOfflineAction(snapshot,requirement,"2026-08-29T15:00:03.000Z");
    expect(admission.mode).toBe("OFFLINE_LOCAL");
    expect(admission.decision).toBe("ALLOW_FOR_AUTHORIZATION");
    expect(admission.executionAuthorityIssued).toBe(false);
  });

  it("waits for network before an internet consequence",()=>{
    const snapshot=makeSnapshot();
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:payment",
      effectClass:"TRANSFER_VALUE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"INTERNET",
      requiredProofProviderRefs:["proof:bank-ledger"],
      requiresFreshRemoteReality:true,
      requiresRemoteCredentialLease:true
    });
    const admission=evaluateOfflineAction(snapshot,requirement,"2026-08-29T15:00:04.000Z");
    expect(admission.decision).toBe("WAIT_NETWORK");
    expect(admission.reasonCodes).toContain("EXECUTION_ROUTE_REQUIRES_NETWORK");
  });

  it("requires a durable local reservation before proof can be deferred",()=>{
    expect(()=>offlineActionRequirement({
      proposalRef:"proposal:deferred-proof",
      effectClass:"UPDATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"NONE",
      requiredProofProviderRefs:["proof:bank-ledger"],
      proofMayBeDeferred:true,
      durableLocalProofReservationReady:false
    })).toThrow();
  });

  it("fails closed when local authority state is unavailable",()=>{
    const snapshot=makeSnapshot({localAuthorityReady:false});
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:file-write-2",
      effectClass:"UPDATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"NONE",
      requiredProofProviderRefs:["proof:filesystem"]
    });
    expect(evaluateOfflineAction(snapshot,requirement).decision).toBe("BLOCK");
  });

  it("queues proposals without authority when network is unavailable",()=>{
    const snapshot=makeSnapshot();
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:remote-action",
      effectClass:"COMMUNICATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"INTERNET"
    });
    const admission=evaluateOfflineAction(snapshot,requirement,"2026-08-29T15:00:05.000Z");
    const deferred=deferredNetworkProposal({requirement,admission,queuedAt:"2026-08-29T15:00:06.000Z"});
    expect(deferred.executionAuthorityCarried).toBe(false);
    expect(deferred.executableCredentialCarried).toBe(false);
  });

  it("sync envelopes never carry authority or executable credentials",()=>{
    const envelope=offlineSyncEnvelope({
      nodeId:"device:local-1",
      sequence:7,
      previousEnvelopeDigest:ZERO,
      eventRefs:["event:1","event:2"],
      eventDigests:[ZERO,"1".repeat(64)],
      createdAt:"2026-08-29T15:00:07.000Z"
    });
    expect(envelope.authorityStateIncluded).toBe(false);
    expect(envelope.executableCredentialIncluded).toBe(false);
    expect(envelope.authority).toBe(false);
    expect(envelope.mayMintExecutionAuthority).toBe(false);
  });

  it("reconnect reconciles unknown reality before issuing fresh authority",()=>{
    const previous=makeSnapshot();
    const current=makeSnapshot({connectivity:"ONLINE",cloudInferenceReady:true});
    const plan=reconnectPlan(previous,current,{
      unknownConsequenceRefs:["consequence:unknown-1"],
      deferredProposalRefs:["proposal:remote-action"],
      createdAt:"2026-08-29T15:00:08.000Z"
    });
    expect(plan.steps.indexOf("RECONCILE_UNKNOWN_CONSEQUENCES")).toBeLessThan(plan.steps.indexOf("ISSUE_FRESH_LOCAL_AUTHORITY_IF_ALLOWED"));
    expect(plan.outstandingAuthorityMayResume).toBe(false);
  });
});
