import crypto from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import type {EffectObservation,ProofRequirement} from "@cieav/contracts";
import {resolveUnderAllowedRoot} from "@cieav/core";
import type {EffectObserver} from "./effect-dispatch.js";

const requestPath=(input:unknown)=>input&&typeof input==="object"&&!Array.isArray(input)&&typeof (input as Record<string,unknown>).path==="string"?(input as Record<string,unknown>).path as string:null;
const observation=(base:{requestId:string;commitmentId:string},requirement:ProofRequirement,patch:Pick<EffectObservation,"kind"|"signal"|"summary"|"source"|"confidence"|"actorIndependent">&Partial<Pick<EffectObservation,"digest">>):EffectObservation=>({...base,requirementId:requirement.id,observedAt:new Date().toISOString(),...patch});

export class CieavLocalRealityObserver implements EffectObserver{
  async observe({proposal,tool,receipt,commitment}:Parameters<EffectObserver["observe"]>[0]):Promise<EffectObservation[]>{
    const out:EffectObservation[]=[],base={requestId:proposal.requestId,commitmentId:commitment.id};
    for(const requirement of commitment.proofObligation.requirements){
      if(requirement.kind==="TOOL_RESULT"&&receipt.resultDigest){out.push(observation(base,requirement,{kind:"TOOL_RESULT",signal:receipt.status==="CLAIMED_COMPLETE"?"SUPPORTS":"CONTRADICTS",summary:`CIEAV effect dispatcher recorded ${receipt.status.toLowerCase().replaceAll("_"," ")} for the exact bound tool invocation.`,source:"cieav-effect-dispatcher",confidence:1,actorIndependent:true,digest:receipt.resultDigest}));continue}
      if(requirement.kind!=="FILESYSTEM"||tool.provider!=="EFFECT_NODE"||String(tool.metadata.capabilityKind??"")!=="FILESYSTEM")continue;
      const raw=requestPath(proposal.input);if(!raw)continue;
      try{const file=resolveUnderAllowedRoot(raw,tool.constraints.roots),info=await stat(file);let digest:string|undefined;if(info.isFile()&&info.size<=2_000_000)digest=crypto.createHash("sha256").update(await readFile(file)).digest("hex");out.push(observation(base,requirement,{kind:"FILESYSTEM",signal:"SUPPORTS",summary:`Independent filesystem readback observed ${info.isFile()?"file":"path"} ${file} after the effect.`,source:"cieav-filesystem-readback",confidence:1,actorIndependent:true,...(digest?{digest}:{})}))}catch(error){out.push(observation(base,requirement,{kind:"FILESYSTEM",signal:"CONTRADICTS",summary:`Independent filesystem readback could not observe the expected path: ${error instanceof Error?error.message:String(error)}`.slice(0,1200),source:"cieav-filesystem-readback",confidence:1,actorIndependent:true}))}
    }
    return out;
  }
}
