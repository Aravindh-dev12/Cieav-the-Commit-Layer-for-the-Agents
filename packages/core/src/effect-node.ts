import crypto from "node:crypto";
import type {EffectNodeAdvertisement,EffectNodeCapability,EffectNodeHeartbeat,EffectNodeRecord,EffectNodeState,SignedEffectNodeAdvertisement} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
export function digestEffectNodeValue(value:unknown){return crypto.createHash("sha256").update(canonical(value)).digest("hex")}
export function effectNodeAdvertisementDigest(advertisement:EffectNodeAdvertisement){return digestEffectNodeValue(advertisement)}
export function effectNodeCapabilityDigest(capabilities:readonly EffectNodeCapability[]){return digestEffectNodeValue([...capabilities].sort((a,b)=>a.id.localeCompare(b.id)))}

export function verifyEffectNodeAdvertisement(signed:SignedEffectNodeAdvertisement){
  const payload=Buffer.from(canonical(signed.advertisement));
  try{return crypto.verify(null,payload,signed.advertisement.publicKey,Buffer.from(signed.signature,"base64url"))}catch{return false}
}

export function verifyEffectNodeHeartbeat(heartbeat:EffectNodeHeartbeat,record:Pick<EffectNodeRecord,"nodeId"|"publicKey">){
  if(heartbeat.nodeId!==record.nodeId)return false;
  const payload={nodeId:heartbeat.nodeId,observedAt:heartbeat.observedAt,runtimeVersion:heartbeat.runtimeVersion,capabilityDigest:heartbeat.capabilityDigest,load:heartbeat.load,nonce:heartbeat.nonce};
  try{return crypto.verify(null,Buffer.from(canonical(payload)),record.publicKey,Buffer.from(heartbeat.signature,"base64url"))}catch{return false}
}

export function deriveEffectNodeState(record:Pick<EffectNodeRecord,"state"|"lastSeenAt">,now=new Date(),degradedAfterMs=30_000,offlineAfterMs=90_000):EffectNodeState{
  if(record.state==="QUARANTINED")return"QUARANTINED";
  const age=Math.max(0,now.getTime()-Date.parse(record.lastSeenAt));
  if(age>=offlineAfterMs)return"OFFLINE";
  if(age>=degradedAfterMs)return"DEGRADED";
  return"ONLINE";
}

export function filterEffectNodeCapabilities(capabilities:readonly EffectNodeCapability[],policy:{allowedKinds?:readonly EffectNodeCapability["kind"][];allowedOperations?:readonly string[];allowedCapabilityIds?:readonly string[]}):EffectNodeCapability[]{
  const kinds=policy.allowedKinds?new Set(policy.allowedKinds):null,ops=policy.allowedOperations?new Set(policy.allowedOperations):null,ids=policy.allowedCapabilityIds?new Set(policy.allowedCapabilityIds):null;
  return capabilities.flatMap(capability=>{
    if(kinds&&!kinds.has(capability.kind))return[];
    if(ids&&!ids.has(capability.id))return[];
    const operations=ops?capability.operations.filter(op=>ops.has(op)):capability.operations;
    if(!operations.length)return[];
    return[{...capability,operations:[...operations]}];
  });
}
