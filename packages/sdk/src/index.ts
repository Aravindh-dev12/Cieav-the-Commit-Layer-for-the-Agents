import { AnalyzeResponseSchema, DeviceRegisterResponseSchema, ReceiptListSchema, ReceiptSchema, type ActionContext, type ActionManifest, type Receipt } from "@latch/contracts";

export class CieavClient {
  constructor(public apiBase: string, public token?: string) { this.apiBase = apiBase.replace(/\/$/,""); }
  async register(installId: string, deviceName?: string) {
    const r = await this.request("/v1/devices/register", {method:"POST", body:JSON.stringify({installId, ...(deviceName?{deviceName}:{})})}, false);
    const parsed = DeviceRegisterResponseSchema.parse(r); this.token = parsed.token; return parsed;
  }
  async analyze(context: ActionContext): Promise<ActionManifest> {
    const r = AnalyzeResponseSchema.parse(await this.request("/v1/analyze", {method:"POST",body:JSON.stringify(context)})); return r.manifest;
  }
  async record(manifest: ActionManifest, source: Receipt["source"], status:"PREVIEWED"|"COMMITTED"|"CANCELLED"): Promise<Receipt> {
    const r = await this.request("/v1/receipts", {method:"POST",body:JSON.stringify({requestId:manifest.requestId,manifest,source,status})});
    return ReceiptSchema.parse((r as any).receipt);
  }
  async receipts(limit=50): Promise<Receipt[]> {
    return ReceiptListSchema.parse(await this.request(`/v1/receipts?limit=${limit}`, {method:"GET"})).receipts;
  }
  private async request(path:string, init:RequestInit, auth=true) {
    if (auth && !this.token) throw new Error("CIEAV client token is required");
    const res = await fetch(`${this.apiBase}${path}`, {...init,headers:{"content-type":"application/json",...(auth?{authorization:`Bearer ${this.token}`}:{})}});
    if (!res.ok) throw new Error(`CIEAV API ${res.status}: ${await res.text()}`);
    return res.json();
  }
}

/** @deprecated Use CieavClient. */
export class LatchClient extends CieavClient {}

export function declareCieavWebAction(
  element: HTMLElement,
  declaration: {actionType:string; summary:string; reversibility?:"REVERSIBLE"|"DELAYABLE"|"COMPENSABLE"|"IRREVERSIBLE"|"UNKNOWN"}
) {
  element.dataset.cieavAction = declaration.actionType;
  element.dataset.cieavSummary = declaration.summary;
  if (declaration.reversibility) element.dataset.cieavReversibility = declaration.reversibility;
  return () => {
    delete element.dataset.cieavAction;
    delete element.dataset.cieavSummary;
    delete element.dataset.cieavReversibility;
  };
}

/** @deprecated Use declareCieavWebAction. */
export const declareWebAction = declareCieavWebAction;
