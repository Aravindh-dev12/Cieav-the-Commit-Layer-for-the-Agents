import crypto from "node:crypto";
import type {ExecutionProposal,FormalAuthorizationDecision,FormalPermissionGraph,PermissionGraphEdge} from "@cieav/contracts/execution-fabric";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
export const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const matches=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const targetMatches=(prefixes:string[],target?:string)=>!prefixes.length||Boolean(target&&prefixes.some(p=>p==="*"||target.startsWith(p)));
const edgeMatches=(edge:PermissionGraphEdge,proposal:ExecutionProposal)=>
  matches(edge.subjectIds,proposal.subjectId)&&edge.intentIds.includes(proposal.intentId)&&matches(edge.toolIds,proposal.toolId)&&matches(edge.operations,proposal.operation)&&targetMatches(edge.targetPrefixes,proposal.target)&&riskRank[proposal.risk]<=riskRank[edge.maxRisk];

export function permissionGraphDigest(graph:Omit<FormalPermissionGraph,"digest">){return digest(graph)}
export function verifyPermissionGraph(graph:FormalPermissionGraph):boolean{
  const {digest:actual,...unsigned}=graph;
  return graph.defaultDecision==="DENY"&&actual===permissionGraphDigest(unsigned);
}

export function evaluateFormalAuthorization(graph:FormalPermissionGraph,proposal:ExecutionProposal):FormalAuthorizationDecision{
  const now=new Date().toISOString();
  if(graph.scopeDeviceId!==proposal.scopeDeviceId||graph.rootIntentId!==proposal.intentId)return{decision:"BLOCK",graphDigest:graph.digest,intentId:proposal.intentId,subjectId:proposal.subjectId,toolId:proposal.toolId,operation:proposal.operation,matchedEdgeIds:[],evidenceRefs:[],reasons:["Permission graph scope or root Intent does not match the execution proposal."],evaluatedAt:now,engine:"CIEAV_FORMAL_AUTH_V1"};
  if(!verifyPermissionGraph(graph))return{decision:"BLOCK",graphDigest:graph.digest,intentId:proposal.intentId,subjectId:proposal.subjectId,toolId:proposal.toolId,operation:proposal.operation,matchedEdgeIds:[],evidenceRefs:[],reasons:["Permission graph integrity verification failed."],evaluatedAt:now,engine:"CIEAV_FORMAL_AUTH_V1"};
  const matched=graph.edges.filter(e=>edgeMatches(e,proposal));
  const denied=matched.filter(e=>e.effect==="DENY"),asked=matched.filter(e=>e.effect==="ASK"),allowed=matched.filter(e=>e.effect==="ALLOW");
  const decisive=denied.length?denied:asked.length?asked:allowed;
  const decision:FormalAuthorizationDecision["decision"]=denied.length?"BLOCK":asked.length?"ASK":allowed.length?"ALLOW":"BLOCK";
  return{decision,graphDigest:graph.digest,intentId:proposal.intentId,subjectId:proposal.subjectId,toolId:proposal.toolId,operation:proposal.operation,matchedEdgeIds:decisive.map(e=>e.id),evidenceRefs:[...new Set(decisive.flatMap(e=>e.evidenceRefs))],reasons:decisive.length?decisive.map(e=>e.reason):["Deny-by-default: no permission edge authorizes this execution."],evaluatedAt:now,engine:"CIEAV_FORMAL_AUTH_V1"};
}

export function executionBindingDigest(proposal:ExecutionProposal,graphDigest:string){return digest({version:1,proposalId:proposal.id,taskId:proposal.taskId,intentId:proposal.intentId,scopeDeviceId:proposal.scopeDeviceId,subjectId:proposal.subjectId,identityAttestationId:proposal.identityAttestationId,credentialLeaseId:proposal.credentialLeaseId,toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,risk:proposal.risk,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,semanticEffect:proposal.semanticEffect,realityDigest:proposal.realityWitness.digest,expectedPostStateDigest:proposal.expectedPostStateDigest,proofObligationDigest:proposal.proofObligationDigest,attenuationWitnessIds:proposal.attenuationWitnessIds,continuingAuthority:proposal.continuingAuthority??null,graphDigest});}
