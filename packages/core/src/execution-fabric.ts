import crypto from "node:crypto";
import type {ExecutionProposal,FederatedTool,FormalAuthorizationDecision,FormalPermissionGraph,PermissionGraphEdge,TrustedToolAuthorizationBinding,TrustedToolConsequenceContract} from "@cieav/contracts/execution-fabric";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
export const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const matches=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const targetMatches=(prefixes:string[],target?:string)=>!prefixes.length||Boolean(target&&prefixes.some(p=>p==="*"||target.startsWith(p)));
const edgeMatches=(edge:PermissionGraphEdge,proposal:ExecutionProposal)=>
  matches(edge.subjectIds,proposal.subjectId)&&edge.intentIds.includes(proposal.intentId)&&matches(edge.toolIds,proposal.toolId)&&matches(edge.operations,proposal.operation)&&targetMatches(edge.targetPrefixes,proposal.target)&&riskRank[proposal.risk]<=riskRank[edge.maxRisk];

export type TrustedToolConsequenceValidation={
  contract:TrustedToolConsequenceContract|null;
  contractDigest:string|null;
  canonicalTarget:string|null;
  productionQualified:boolean;
  authority:false;
  mayMintExecutionAuthority:false;
};

export function assertTrustedToolConsequenceContract(tool:FederatedTool,proposal:ExecutionProposal,options:{requireContract?:boolean}={}):TrustedToolConsequenceValidation{
  if(tool.id!==proposal.toolId||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation)throw new Error("trusted_tool_consequence_route_binding_mismatch");
  if(!tool.consequenceCapable){
    if(proposal.semanticEffect.kind!=="READ")throw new Error("non_consequence_tool_effect_mismatch");
    return{contract:null,contractDigest:null,canonicalTarget:proposal.target??proposal.semanticEffect.target??proposal.semanticEffect.objectRef??null,productionQualified:true,authority:false,mayMintExecutionAuthority:false};
  }
  const contract=tool.consequenceContract;
  if(!contract){
    if(options.requireContract)throw new Error("trusted_tool_consequence_contract_required");
    return{contract:null,contractDigest:null,canonicalTarget:proposal.target??proposal.semanticEffect.target??proposal.semanticEffect.objectRef??null,productionQualified:false,authority:false,mayMintExecutionAuthority:false};
  }
  if(!contract.effectKinds.includes(proposal.semanticEffect.kind))throw new Error("trusted_tool_consequence_effect_kind_mismatch");
  const routeTarget=proposal.target??null,semanticTarget=proposal.semanticEffect.target??proposal.semanticEffect.objectRef??null;
  if(contract.targetBinding==="ROUTE_TARGET"&&!routeTarget)throw new Error("trusted_tool_route_target_required");
  if(contract.targetBinding==="SEMANTIC_TARGET"&&!semanticTarget)throw new Error("trusted_tool_semantic_target_required");
  if(contract.targetBinding==="ROUTE_AND_SEMANTIC_TARGET"){
    if(!routeTarget||!semanticTarget)throw new Error("trusted_tool_route_and_semantic_target_required");
    if(routeTarget!==semanticTarget)throw new Error("trusted_tool_target_binding_mismatch");
  }
  const canonicalTarget=contract.targetBinding==="ROUTE_TARGET"?routeTarget:contract.targetBinding==="SEMANTIC_TARGET"?semanticTarget:routeTarget;
  if(contract.targetPrefixes.length&&(!canonicalTarget||!contract.targetPrefixes.some(prefix=>canonicalTarget.startsWith(prefix))))throw new Error("trusted_tool_target_outside_contract");
  for(const key of contract.requiredAttributeKeys)if(!Object.prototype.hasOwnProperty.call(proposal.semanticEffect.attributes,key))throw new Error(`trusted_tool_semantic_attribute_required:${key}`);
  return{contract,contractDigest:digest(contract),canonicalTarget,productionQualified:true,authority:false,mayMintExecutionAuthority:false};
}

const trustedToolBindingBase=(binding:TrustedToolAuthorizationBinding)=>({
  version:binding.version,
  toolId:binding.toolId,
  protocol:binding.protocol,
  operation:binding.operation,
  contractDigest:binding.contractDigest,
  canonicalTarget:binding.canonicalTarget,
  canonicalResolverId:binding.canonicalResolverId,
  canonicalResolverVersion:binding.canonicalResolverVersion,
  productionQualified:binding.productionQualified,
  authority:binding.authority,
  mayMintExecutionAuthority:binding.mayMintExecutionAuthority
});

export function trustedToolAuthorizationBinding(tool:FederatedTool,proposal:ExecutionProposal,options:{requireContract?:boolean}={}):TrustedToolAuthorizationBinding{
  const validation=assertTrustedToolConsequenceContract(tool,proposal,options);
  if(!validation.productionQualified)throw new Error("trusted_tool_consequence_not_production_qualified");
  const base={
    version:"CIEAV_TRUSTED_TOOL_AUTHORIZATION_BINDING_V1" as const,
    toolId:tool.id,
    protocol:tool.protocol,
    operation:tool.operation,
    contractDigest:validation.contractDigest,
    canonicalTarget:validation.canonicalTarget,
    canonicalResolverId:validation.contract?.canonicalResolverId??null,
    canonicalResolverVersion:validation.contract?.canonicalResolverVersion??null,
    productionQualified:true as const,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return{...base,bindingDigest:digest(base)};
}

export function assertTrustedToolAuthorizationBinding(tool:FederatedTool,proposal:ExecutionProposal,expected:TrustedToolAuthorizationBinding,options:{requireContract?:boolean}={}):TrustedToolAuthorizationBinding{
  if(digest(trustedToolBindingBase(expected))!==expected.bindingDigest)throw new Error("trusted_tool_authorization_binding_integrity_mismatch");
  const current=trustedToolAuthorizationBinding(tool,proposal,options);
  if(current.bindingDigest!==expected.bindingDigest||current.contractDigest!==expected.contractDigest||current.canonicalTarget!==expected.canonicalTarget)throw new Error("trusted_tool_consequence_contract_drift");
  return current;
}

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

export function executionBindingDigest(proposal:ExecutionProposal,graphDigest:string,trustedToolBindingDigest?:string){return digest({version:1,proposalId:proposal.id,taskId:proposal.taskId,intentId:proposal.intentId,scopeDeviceId:proposal.scopeDeviceId,subjectId:proposal.subjectId,identityAttestationId:proposal.identityAttestationId,credentialLeaseId:proposal.credentialLeaseId,toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,risk:proposal.risk,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,semanticEffect:proposal.semanticEffect,realityDigest:proposal.realityWitness.digest,expectedPostStateDigest:proposal.expectedPostStateDigest,proofObligationDigest:proposal.proofObligationDigest,attenuationWitnessIds:proposal.attenuationWitnessIds,continuingAuthority:proposal.continuingAuthority??null,graphDigest,trustedToolBindingDigest:trustedToolBindingDigest??null});}
