import {CausalRecallEventSchema,ConsequenceRecoveryCapabilitySchema,type CausalRecallEvent,type ConsequenceRecoveryCapability} from "@cieav/contracts";
import {settlementPatchForCausalRecall} from "@cieav/core/causal-recall";
import {CieavCausalRecallStore} from "./causal-recall-store.js";
import {CieavConsequenceSettlementStore} from "./consequence-settlement-store.js";

export type ApplyCausalRecallResult={
  event:CausalRecallEvent;
  initialClosureDigest:string;
  closureDigest:string;
  affectedConsequenceRefs:string[];
  settlementUpdates:string[];
  futureConsequencesToBlock:string[];
  proposedRecoveryProgramRefs:string[];
};

export async function applyCausalRecall(
  recallStore:CieavCausalRecallStore,
  settlementStore:CieavConsequenceSettlementStore,
  rawEvent:unknown,
  rawCapabilities:unknown[]=[],
  at=new Date()
):Promise<ApplyCausalRecallResult>{
  const event=CausalRecallEventSchema.parse(rawEvent),capabilities:ConsequenceRecoveryCapability[]=rawCapabilities.map(value=>ConsequenceRecoveryCapabilitySchema.parse(value)),before=await settlementStore.list(),recorded=await recallStore.recordRecall(event,before,capabilities,at),affected=[...new Set([...recorded.closure.directlyAffectedConsequenceRefs,...recorded.closure.transitivelyAffectedConsequenceRefs])].sort(),settlementUpdates:string[]=[];
  for(const consequenceRef of affected){
    const current=await settlementStore.get(consequenceRef);if(!current)continue;
    const patch=settlementPatchForCausalRecall(event,current);
    try{
      await settlementStore.update(consequenceRef,patch,`Causal recall ${event.id}: ${event.reason}`,{at});settlementUpdates.push(consequenceRef);
    }catch(error:any){
      if(String(error?.message??error).includes("consequence_settlement_transition_no_change"))continue;
      throw error;
    }
  }
  const after=await settlementStore.list(),closure=await recallStore.recomputeClosure(event.id,after,capabilities,at);
  return{
    event,
    initialClosureDigest:recorded.closure.closureDigest,
    closureDigest:closure.closureDigest,
    affectedConsequenceRefs:affected,
    settlementUpdates:settlementUpdates.sort(),
    futureConsequencesToBlock:closure.futureConsequencesToBlock,
    proposedRecoveryProgramRefs:closure.proposedRecoveryPrograms.map(program=>program.id).sort()
  };
}
