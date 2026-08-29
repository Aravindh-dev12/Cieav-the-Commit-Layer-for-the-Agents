import {describe,expect,it} from "vitest";
import {
  cognitiveRouteRequirement,
  evaluateOfflineAction,
  offlineActionRequirement,
  offlineRuntimeSnapshot,
  offlineSyncEnvelope,
  selectCognitiveRoute
} from "./offline-runtime.js";

const ZERO="0".repeat(64);

function offlineSnapshot(){
  return offlineRuntimeSnapshot({
    nodeId:"device:local-1",
    connectivity:"OFFLINE",
    localAuthorityReady:true,
    localStateReady:true,
    localPolicyReady:true,
    localJournalReady:true,
    localConsequenceGraphReady:true,
    localInferenceReady:true,
    lanInferenceReady:false,
    cloudInferenceReady:false,
    localProofProviderRefs:["proof:filesystem"],
    remoteProofProviderRefs:["proof:bank-ledger"],
    localAdapterRefs:["adapter:filesystem"],
    syncBacklogCount:3,
    observedAt:"2026-08-29T15:00:00.000Z"
  });
}

describe("offline runtime",()=>{
  it("prefers a local model while offline",()=>{
    const snapshot=offlineSnapshot();
    const requirement=cognitiveRouteRequirement({
      taskRef:"task:1",
      modelRequired:true,
      networkRequirement:"NONE",
      localOnly:false,
      allowLan:true,
      allowCloud:true,
      dataClassRefs:[]
    });
    const decision=selectCognitiveRoute(snapshot,requirement,"2026-08-29T15:00:01.000Z");
    expect(decision.decision).toBe("AVAILABLE");
    expect(decision.route).toBe("LOCAL_MODEL");
    expect(decision.authority).toBe(false);
    expect(decision.mayMintExecutionAuthority).toBe(false);
  });

  it("waits instead of using cloud when an offline task has no local route",()=>{
    const snapshot=offlineRuntimeSnapshot({
      ...offlineSnapshot(),
      localInferenceReady:false,
      snapshotDigest:undefined as never
    } as never);
    const requirement=cognitiveRouteRequirement({
      taskRef:"task:2",
      modelRequired:true,
      networkRequirement:"INTERNET",
      localOnly:false,
      allowLan:false,
      allowCloud:true,
      dataClassRefs:[]
    });
    const decision=selectCognitiveRoute(snapshot,requirement,"2026-08-29T15:00:02.000Z");
    expect(decision.decision).toBe("WAIT_FOR_NETWORK");
    expect(decision.route).toBe("NO_MODEL");
  });

  it("allows a fully local consequence to proceed to authorization while offline",()=>{
    const snapshot=offlineSnapshot();
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:file-write",
      effectClass:"UPDATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"NONE",
      requiredProofProviderRefs:["proof:filesystem"],
      proofMayBeDeferred:false,
      requiresFreshRemoteReality:false,
      requiresRemoteCredentialLease:false
    });
    const admission=evaluateOfflineAction(snapshot,requirement,"2026-08-29T15:00:03.000Z");
    expect(admission.mode).toBe("OFFLINE_LOCAL");
    expect(admission.decision).toBe("ALLOW_FOR_AUTHORIZATION");
    expect(admission.executionAuthorityIssued).toBe(false);
  });

  it("waits for network before an internet consequence",()=>{
    const snapshot=offlineSnapshot();
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:payment",
      effectClass:"TRANSFER_VALUE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"INTERNET",
      requiredProofProviderRefs:["proof:bank-ledger"],
      proofMayBeDeferred:false,
      requiresFreshRemoteReality:true,
      requiresRemoteCredentialLease:true
    });
    const admission=evaluateOfflineAction(snapshot,requirement,"2026-08-29T15:00:04.000Z");
    expect(admission.decision).toBe("WAIT_NETWORK");
    expect(admission.reasonCodes).toContain("EXECUTION_ROUTE_REQUIRES_NETWORK");
  });

  it("fails closed when local authority state is unavailable",()=>{
    const base=offlineSnapshot();
    const snapshot=offlineRuntimeSnapshot({
      nodeId:base.nodeId,
      connectivity:base.connectivity,
      localAuthorityReady:false,
      localStateReady:base.localStateReady,
      localPolicyReady:base.localPolicyReady,
      localJournalReady:base.localJournalReady,
      localConsequenceGraphReady:base.localConsequenceGraphReady,
      localInferenceReady:base.localInferenceReady,
      lanInferenceReady:base.lanInferenceReady,
      cloudInferenceReady:base.cloudInferenceReady,
      localProofProviderRefs:base.localProofProviderRefs,
      remoteProofProviderRefs:base.remoteProofProviderRefs,
      localAdapterRefs:base.localAdapterRefs,
      syncBacklogCount:base.syncBacklogCount,
      observedAt:"2026-08-29T15:00:05.000Z"
    });
    const requirement=offlineActionRequirement({
      proposalRef:"proposal:file-write-2",
      effectClass:"UPDATE",
      adapterRef:"adapter:filesystem",
      networkRequirement:"NONE",
      requiredProofProviderRefs:["proof:filesystem"],
      proofMayBeDeferred:false,
      requiresFreshRemoteReality:false,
      requiresRemoteCredentialLease:false
    });
    expect(evaluateOfflineAction(snapshot,requirement).decision).toBe("BLOCK");
  });

  it("sync envelopes never carry authority or executable credentials",()=>{
    const envelope=offlineSyncEnvelope({
      nodeId:"device:local-1",
      sequence:7,
      previousEnvelopeDigest:ZERO,
      eventRefs:["event:1","event:2"],
      eventDigests:[ZERO,"1".repeat(64)],
      createdAt:"2026-08-29T15:00:06.000Z"
    });
    expect(envelope.authorityStateIncluded).toBe(false);
    expect(envelope.executableCredentialIncluded).toBe(false);
    expect(envelope.authority).toBe(false);
    expect(envelope.mayMintExecutionAuthority).toBe(false);
  });
});
