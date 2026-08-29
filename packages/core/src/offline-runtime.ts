import {
  CognitiveRouteDecisionSchema,
  CognitiveRouteRequirementSchema,
  OfflineActionAdmissionSchema,
  OfflineActionRequirementSchema,
  OfflineRuntimeSnapshotSchema,
  OfflineSyncEnvelopeSchema,
  type CognitiveRouteDecision,
  type CognitiveRouteRequirement,
  type OfflineActionAdmission,
  type OfflineActionRequirement,
  type OfflineRuntimeSnapshot,
  type OfflineSyncEnvelope
} from "@cieav/contracts/offline-runtime";
import {digest} from "./execution-fabric.js";

export function offlineRuntimeSnapshot(input:Omit<OfflineRuntimeSnapshot,"version"|"snapshotDigest"|"authority"|"mayMintExecutionAuthority">):OfflineRuntimeSnapshot{
  const base={
    version:"CIEAV_OFFLINE_RUNTIME_SNAPSHOT_V1" as const,
    ...input,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return OfflineRuntimeSnapshotSchema.parse({...base,snapshotDigest:digest(base)});
}

export function cognitiveRouteRequirement(input:Omit<CognitiveRouteRequirement,"version"|"requirementDigest"|"authority">):CognitiveRouteRequirement{
  const base={version:"CIEAV_COGNITIVE_ROUTE_REQUIREMENT_V1" as const,...input,authority:false as const};
  return CognitiveRouteRequirementSchema.parse({...base,requirementDigest:digest(base)});
}

function connectivitySatisfies(current:OfflineRuntimeSnapshot["connectivity"],required:CognitiveRouteRequirement["networkRequirement"]|OfflineActionRequirement["networkRequirement"]):boolean{
  if(required==="NONE")return true;
  if(required==="LAN")return current==="LAN_ONLY"||current==="ONLINE_DEGRADED"||current==="ONLINE";
  return current==="ONLINE_DEGRADED"||current==="ONLINE";
}

export function selectCognitiveRoute(snapshot:OfflineRuntimeSnapshot,requirement:CognitiveRouteRequirement,createdAt=new Date().toISOString()):CognitiveRouteDecision{
  const reasonCodes:string[]=[];
  let route:CognitiveRouteDecision["route"]="NO_MODEL";
  let decision:CognitiveRouteDecision["decision"]="AVAILABLE";

  if(!requirement.modelRequired){
    reasonCodes.push("MODEL_NOT_REQUIRED");
  }else if(requirement.localOnly){
    if(snapshot.localInferenceReady){route="LOCAL_MODEL";reasonCodes.push("LOCAL_ONLY_ROUTE_AVAILABLE");}
    else {decision="UNAVAILABLE";reasonCodes.push("LOCAL_MODEL_UNAVAILABLE");}
  }else if(requirement.networkRequirement==="NONE"&&snapshot.localInferenceReady){
    route="LOCAL_MODEL";
    reasonCodes.push("LOCAL_MODEL_PREFERRED");
  }else if(requirement.allowLan&&snapshot.lanInferenceReady&&connectivitySatisfies(snapshot.connectivity,"LAN")){
    route="LAN_MODEL";
    reasonCodes.push("LAN_MODEL_AVAILABLE");
  }else if(requirement.allowCloud&&snapshot.cloudInferenceReady&&connectivitySatisfies(snapshot.connectivity,"INTERNET")){
    route="CLOUD_MODEL";
    reasonCodes.push("CLOUD_MODEL_AVAILABLE");
  }else if(snapshot.connectivity==="OFFLINE"||snapshot.connectivity==="LAN_ONLY"){
    decision="WAIT_FOR_NETWORK";
    reasonCodes.push("REQUIRED_INFERENCE_ROUTE_NEEDS_NETWORK");
  }else{
    decision="UNAVAILABLE";
    reasonCodes.push("NO_QUALIFIED_INFERENCE_ROUTE_AVAILABLE");
  }

  const base={
    version:"CIEAV_COGNITIVE_ROUTE_DECISION_V1" as const,
    taskRef:requirement.taskRef,
    route,
    decision,
    reasonCodes,
    runtimeSnapshotDigest:snapshot.snapshotDigest,
    requirementDigest:requirement.requirementDigest,
    createdAt,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return CognitiveRouteDecisionSchema.parse({...base,decisionDigest:digest(base)});
}

export function offlineActionRequirement(input:Omit<OfflineActionRequirement,"version"|"requirementDigest"|"authority">):OfflineActionRequirement{
  const base={version:"CIEAV_OFFLINE_ACTION_REQUIREMENT_V1" as const,...input,authority:false as const};
  return OfflineActionRequirementSchema.parse({...base,requirementDigest:digest(base)});
}

export function evaluateOfflineAction(snapshot:OfflineRuntimeSnapshot,requirement:OfflineActionRequirement,createdAt=new Date().toISOString()):OfflineActionAdmission{
  const reasonCodes:string[]=[];
  let decision:OfflineActionAdmission["decision"]="ALLOW_FOR_AUTHORIZATION";

  if(!snapshot.localAuthorityReady){
    decision="BLOCK";
    reasonCodes.push("LOCAL_AUTHORITY_NOT_READY");
  }
  if(!snapshot.localStateReady||!snapshot.localJournalReady||!snapshot.localConsequenceGraphReady){
    decision="BLOCK";
    reasonCodes.push("LOCAL_AUTHORITATIVE_STATE_NOT_READY");
  }
  if(!snapshot.localPolicyReady){
    decision="BLOCK";
    reasonCodes.push("LOCAL_POLICY_NOT_READY");
  }
  if(!snapshot.localAdapterRefs.includes(requirement.adapterRef)){
    decision="BLOCK";
    reasonCodes.push("QUALIFIED_LOCAL_ADAPTER_UNAVAILABLE");
  }

  if(decision!=="BLOCK"&&!connectivitySatisfies(snapshot.connectivity,requirement.networkRequirement)){
    decision="WAIT_NETWORK";
    reasonCodes.push("EXECUTION_ROUTE_REQUIRES_NETWORK");
  }
  if(decision!=="BLOCK"&&requirement.requiresRemoteCredentialLease&&!connectivitySatisfies(snapshot.connectivity,"INTERNET")){
    decision="WAIT_NETWORK";
    reasonCodes.push("REMOTE_CREDENTIAL_LEASE_UNAVAILABLE");
  }
  if(decision!=="BLOCK"&&requirement.requiresFreshRemoteReality&&!connectivitySatisfies(snapshot.connectivity,"INTERNET")){
    decision="WAIT_NETWORK";
    reasonCodes.push("FRESH_REMOTE_REALITY_REQUIRED");
  }

  const localProof=new Set(snapshot.localProofProviderRefs);
  const remoteProof=new Set(snapshot.remoteProofProviderRefs);
  const missingProof=requirement.requiredProofProviderRefs.filter(ref=>!localProof.has(ref)&&!(connectivitySatisfies(snapshot.connectivity,"INTERNET")&&remoteProof.has(ref)));
  if(decision!=="BLOCK"&&missingProof.length>0){
    if(requirement.proofMayBeDeferred){
      reasonCodes.push("PROOF_DEFERRED_UNTIL_CONNECTIVITY_RETURNS");
    }else{
      decision="WAIT_NETWORK";
      reasonCodes.push("REQUIRED_PROOF_PROVIDER_UNAVAILABLE");
    }
  }

  if(reasonCodes.length===0)reasonCodes.push(snapshot.connectivity==="OFFLINE"?"OFFLINE_LOCAL_EXECUTION_READY":"LOCAL_AUTHORITY_EXECUTION_READY");

  const mode:OfflineActionAdmission["mode"]=snapshot.connectivity==="OFFLINE"?"OFFLINE_LOCAL":snapshot.connectivity==="LAN_ONLY"?"LAN_LOCAL":"ONLINE_LOCAL_AUTHORITY";
  const base={
    version:"CIEAV_OFFLINE_ACTION_ADMISSION_V1" as const,
    proposalRef:requirement.proposalRef,
    mode,
    decision,
    reasonCodes,
    runtimeSnapshotDigest:snapshot.snapshotDigest,
    requirementDigest:requirement.requirementDigest,
    createdAt,
    executionAuthorityIssued:false as const,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return OfflineActionAdmissionSchema.parse({...base,admissionDigest:digest(base)});
}

export function offlineSyncEnvelope(input:{
  nodeId:string;
  sequence:number;
  previousEnvelopeDigest?:string;
  eventRefs:string[];
  eventDigests:string[];
  createdAt?:string;
}):OfflineSyncEnvelope{
  if(input.eventRefs.length!==input.eventDigests.length)throw new Error("offline_sync_event_digest_count_mismatch");
  const eventSetDigest=digest(input.eventRefs.map((ref,index)=>({ref,digest:input.eventDigests[index]})));
  const base={
    version:"CIEAV_OFFLINE_SYNC_ENVELOPE_V1" as const,
    nodeId:input.nodeId,
    sequence:input.sequence,
    ...(input.previousEnvelopeDigest?{previousEnvelopeDigest:input.previousEnvelopeDigest}:{}),
    eventRefs:input.eventRefs,
    eventSetDigest,
    authorityStateIncluded:false as const,
    executableCredentialIncluded:false as const,
    createdAt:input.createdAt??new Date().toISOString(),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return OfflineSyncEnvelopeSchema.parse({...base,envelopeDigest:digest(base)});
}
