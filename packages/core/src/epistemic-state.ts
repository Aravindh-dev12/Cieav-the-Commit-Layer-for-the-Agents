import type {EpistemicClaim,EpistemicEvidence,EpistemicStatus} from "@cieav/contracts";

const timestamp=(value:string)=>{const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error("invalid_epistemic_timestamp");return parsed};
const clamp=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

export type EpistemicSnapshot={
  version:"CIEAV_EPISTEMIC_STATE_V1";
  claims:EpistemicClaim[];
  supported:number;
  contradicted:number;
  stale:number;
  unknown:number;
  authority:false;
  mayMintExecutionAuthority:false;
};

export class EpistemicState{
  private readonly claims=new Map<string,EpistemicClaim>();

  upsert(claim:EpistemicClaim):EpistemicClaim{
    const existing=this.claims.get(claim.claimId);
    if(existing&&timestamp(claim.observedAt)<timestamp(existing.observedAt))throw new Error(`stale_epistemic_update:${claim.claimId}`);
    const normalized={...claim,confidence:clamp(claim.confidence),supportingEvidence:[...claim.supportingEvidence],contradictingEvidence:[...claim.contradictingEvidence],invalidationConditions:[...claim.invalidationConditions]};
    this.claims.set(claim.claimId,normalized);
    return structuredClone(normalized);
  }

  get(claimId:string){const claim=this.claims.get(claimId);return claim?structuredClone(claim):null}

  markStatus(claimId:string,status:EpistemicStatus,observedAt:string,confidence?:number):EpistemicClaim{
    const current=this.claims.get(claimId);if(!current)throw new Error(`epistemic_claim_not_found:${claimId}`);
    if(timestamp(observedAt)<timestamp(current.observedAt))throw new Error(`stale_epistemic_update:${claimId}`);
    const next={...current,status,observedAt,confidence:confidence===undefined?current.confidence:clamp(confidence)};
    this.claims.set(claimId,next);return structuredClone(next);
  }

  addEvidence(claimId:string,kind:"SUPPORT"|"CONTRADICT",evidence:EpistemicEvidence):EpistemicClaim{
    const current=this.claims.get(claimId);if(!current)throw new Error(`epistemic_claim_not_found:${claimId}`);
    if(timestamp(evidence.observedAt)<timestamp(current.observedAt))throw new Error(`stale_epistemic_evidence:${claimId}`);
    const support=[...current.supportingEvidence],contradict=[...current.contradictingEvidence];
    if(kind==="SUPPORT")support.push(evidence);else contradict.push(evidence);

    // Contradiction is sticky until an explicit reconciliation/status decision.
    // A later supporting observation must not silently erase unresolved
    // contradictory evidence. This prevents last-evidence-wins belief flips.
    const status:EpistemicStatus=contradict.length>0?"CONTRADICTED":"SUPPORTED";
    const next={...current,status,observedAt:evidence.observedAt,supportingEvidence:support.slice(-50),contradictingEvidence:contradict.slice(-50)};
    this.claims.set(claimId,next);return structuredClone(next);
  }

  invalidate(condition:string,observedAt:string):EpistemicClaim[]{
    const changed:EpistemicClaim[]=[];
    for(const [id,current] of this.claims){
      if(!current.invalidationConditions.includes(condition))continue;
      if(timestamp(observedAt)<timestamp(current.observedAt))continue;
      const next={...current,status:"STALE" as const,observedAt,confidence:Math.min(current.confidence,.49)};
      this.claims.set(id,next);changed.push(structuredClone(next));
    }
    return changed;
  }

  supported(minConfidence=.5):EpistemicClaim[]{
    return this.list().filter(claim=>claim.status==="SUPPORTED"&&claim.confidence>=minConfidence);
  }

  list():EpistemicClaim[]{
    return[...this.claims.values()].map(claim=>structuredClone(claim)).sort((a,b)=>a.claimId.localeCompare(b.claimId));
  }

  snapshot():EpistemicSnapshot{
    const claims=this.list(),count=(status:EpistemicStatus)=>claims.filter(claim=>claim.status===status).length;
    return{version:"CIEAV_EPISTEMIC_STATE_V1",claims,supported:count("SUPPORTED"),contradicted:count("CONTRADICTED"),stale:count("STALE"),unknown:count("UNKNOWN"),authority:false,mayMintExecutionAuthority:false};
  }
}
