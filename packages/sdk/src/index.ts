import { AnalyzeResponseSchema, DeviceRegisterResponseSchema, ReceiptListSchema, ReceiptSchema, type ActionContext, type ActionManifest, type Receipt } from "@latch/contracts";
import {ActionProposalSchema,AuthorityDecisionSchema,CommitPermitSchema,ConsequenceAssessmentSchema,IntentContractSchema,OpenLoopSchema,type ActionProposal,type AuthorityDecision,type CommitPermit,type ConsequenceAssessment,type IntentContract,type IntentCreateRequest,type OpenLoop,type OpenLoopCreateRequest,type OpenLoopUpdateRequest,type RealityEvaluateRequest} from "@latch/contracts/reality";

export type RealityEvaluation={intent:IntentContract;proposal:ActionProposal;assessment:ConsequenceAssessment;authority:AuthorityDecision;permit?:CommitPermit};
export class CieavClient {
  constructor(public apiBase: string, public token?: string) { this.apiBase = apiBase.replace(/\/$/,""); }
  async register(installId: string, deviceName?: string) {const r=await this.request("/v1/devices/register",{method:"POST",body:JSON.stringify({installId,...(deviceName?{deviceName}:{})})},false),parsed=DeviceRegisterResponseSchema.parse(r);this.token=parsed.token;return parsed}
  async analyze(context: ActionContext): Promise<ActionManifest> {return AnalyzeResponseSchema.parse(await this.request("/v1/analyze",{method:"POST",body:JSON.stringify(context)})).manifest}
  async record(manifest: ActionManifest, source: Receipt["source"], status:"PREVIEWED"|"COMMITTED"|"CANCELLED"): Promise<Receipt> {const r=await this.request("/v1/receipts",{method:"POST",body:JSON.stringify({requestId:manifest.requestId,manifest,source,status})});return ReceiptSchema.parse((r as any).receipt)}
  async receipts(limit=50): Promise<Receipt[]> {return ReceiptListSchema.parse(await this.request(`/v1/receipts?limit=${limit}`,{method:"GET"})).receipts}
  async createIntent(input:IntentCreateRequest):Promise<IntentContract>{const r=await this.request("/v1/intents",{method:"POST",body:JSON.stringify(input)});return IntentContractSchema.parse((r as any).intent)}
  async intents():Promise<IntentContract[]>{const r=await this.request("/v1/intents",{method:"GET"}) as any;return Array.isArray(r?.intents)?r.intents.map((x:unknown)=>IntentContractSchema.parse(x)):[]}
  async evaluateReality(input:RealityEvaluateRequest&{manifest:ActionManifest}):Promise<RealityEvaluation>{const r=await this.request("/v1/reality/evaluate",{method:"POST",body:JSON.stringify(input)}) as any;return{intent:IntentContractSchema.parse(r.intent),proposal:ActionProposalSchema.parse(r.proposal),assessment:ConsequenceAssessmentSchema.parse(r.assessment),authority:AuthorityDecisionSchema.parse(r.authority),...(r.permit?{permit:CommitPermitSchema.parse(r.permit)}:{})}}
  async consumePermit(permit:CommitPermit,proposal:ActionProposal):Promise<{ok:true;permitId:string;consumedAt:string}>{return await this.request("/v1/reality/consume",{method:"POST",body:JSON.stringify({permit,proposal})}) as any}
  async createOpenLoop(input:OpenLoopCreateRequest):Promise<OpenLoop>{const r=await this.request("/v1/open-loops",{method:"POST",body:JSON.stringify(input)}) as any;return OpenLoopSchema.parse(r.openLoop)}
  async openLoops():Promise<OpenLoop[]>{const r=await this.request("/v1/open-loops",{method:"GET"}) as any;return Array.isArray(r?.openLoops)?r.openLoops.map((x:unknown)=>OpenLoopSchema.parse(x)):[]}
  async updateOpenLoop(id:string,patch:OpenLoopUpdateRequest):Promise<OpenLoop>{const r=await this.request(`/v1/open-loops/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(patch)}) as any;return OpenLoopSchema.parse(r.openLoop)}
  private async request(path:string, init:RequestInit, auth=true) {if(auth&&!this.token)throw new Error("CIEAV client token is required");const res=await fetch(`${this.apiBase}${path}`,{...init,headers:{"content-type":"application/json",...(auth?{authorization:`Bearer ${this.token}`}:{})}});if(!res.ok)throw new Error(`CIEAV API ${res.status}: ${await res.text()}`);return res.json()}
}

/** @deprecated Use CieavClient. */
export class LatchClient extends CieavClient {}
export function declareCieavWebAction(element:HTMLElement,declaration:{actionType:string;summary:string;reversibility?:"REVERSIBLE"|"DELAYABLE"|"COMPENSABLE"|"IRREVERSIBLE"|"UNKNOWN"}){element.dataset.cieavAction=declaration.actionType;element.dataset.cieavSummary=declaration.summary;if(declaration.reversibility)element.dataset.cieavReversibility=declaration.reversibility;return()=>{delete element.dataset.cieavAction;delete element.dataset.cieavSummary;delete element.dataset.cieavReversibility}}
/** @deprecated Use declareCieavWebAction. */
export const declareWebAction=declareCieavWebAction;
