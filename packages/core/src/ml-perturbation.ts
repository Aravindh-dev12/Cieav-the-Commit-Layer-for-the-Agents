import type {MlCandidateDecision} from "./ml-types.js";

export type MlPerturbationKind="INVARIANT"|"MATERIAL";
export interface MlPerturbationCase{id:string;kind:MlPerturbationKind;dimension:string;expectedChange?:readonly (keyof MlCandidateDecision)[]}
export interface MlPerturbationResult{id:string;passed:boolean;detail:string}

function materiallyEqual(a:MlCandidateDecision,b:MlCandidateDecision){return a.actionType===b.actionType&&a.risk===b.risk&&a.reversibility===b.reversibility&&Boolean(a.abstain)===Boolean(b.abstain)}
export function verifyMlPerturbation(base:MlCandidateDecision,mutated:MlCandidateDecision,test:MlPerturbationCase):MlPerturbationResult{
  if(test.kind==="INVARIANT")return{id:test.id,passed:materiallyEqual(base,mutated),detail:materiallyEqual(base,mutated)?"semantics_preserved":"irrelevant_perturbation_changed_material_decision"};
  const fields=test.expectedChange??["risk","reversibility","actionType"];
  const changed=fields.some(k=>base[k]!==mutated[k]);return{id:test.id,passed:changed,detail:changed?"material_change_detected":"material_perturbation_failed_to_change_decision"};
}

export function summarizeMlPerturbations(results:readonly MlPerturbationResult[]){const failures=results.filter(x=>!x.passed);return{passed:failures.length===0,total:results.length,failures:failures.map(x=>x.id),stability:results.length?(results.length-failures.length)/results.length:1}}
