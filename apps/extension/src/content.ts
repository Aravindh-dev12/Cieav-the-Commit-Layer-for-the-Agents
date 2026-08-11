import type { ActionContext, ActionManifest, PageField } from "@latch/contracts";
import { classifyField, redactText } from "@latch/core";
import type { MessageResponse } from "./shared";

const VERSION = "0.1.0";
const bypass = new WeakSet<Element>();
const bypassForms = new WeakSet<HTMLFormElement>();
let modalOpen = false;
let latchApiOrigin = "";
const undoTargets = new Map<string, HTMLElement>();

const consequential = /(delete|remove|erase|close account|deactivate|publish|post|tweet|submit|apply|confirm|share|invite|grant|allow|authorize|connect|link account|upload|attach|pay|transfer|withdraw|purchase|subscribe|revoke|disconnect|checkout|place order)/i;

function labelFor(el: Element): string {
  const any = el as HTMLElement;
  const aria = any.getAttribute?.("aria-label") ?? "";
  const text = any.innerText ?? any.textContent ?? "";
  const value = el instanceof HTMLInputElement ? el.value : "";
  return [aria,text,value].filter(Boolean).join(" ").trim().slice(0,500);
}

function closestActionElement(start: Element | null): HTMLElement | null {
  if (!start) return null;
  return start.closest("button,a,input[type=submit],input[type=button],[role=button],[role=menuitem],summary") as HTMLElement | null;
}

function isCandidate(el: HTMLElement): boolean {
  if (latchApiOrigin && location.origin === latchApiOrigin && location.pathname.startsWith("/dashboard")) return false;
  if (el.closest("[data-latch-ui]")) return false;
  const text = labelFor(el);
  if (consequential.test(text)) return true;
  const form = el.closest("form");
  if (form?.querySelector('input[type="file"]')) return true;
  if (form) {
    for (const input of form.querySelectorAll("input,textarea,select")) {
      const n = `${input.getAttribute("name") ?? ""} ${input.getAttribute("autocomplete") ?? ""} ${input.getAttribute("type") ?? ""}`;
      if (/(password|cc-|card|iban|passport|ssn|aadhaar|aadhar|medical|health)/i.test(n)) return true;
    }
  }
  return false;
}

function fieldLabel(el: Element): string {
  const id = el.getAttribute("id");
  const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined;
  const wrapping = el.closest("label")?.textContent;
  return redactText((explicit ?? wrapping ?? el.getAttribute("aria-label") ?? "").trim()).slice(0,300);
}

function formSnapshot(form?: HTMLFormElement | null): ActionContext["form"] | undefined {
  if (!form) return undefined;
  const fields: PageField[] = [];
  const fileNames: string[] = [];
  for (const el of [...form.querySelectorAll("input,textarea,select")].slice(0,100)) {
    const inputType = el.getAttribute("type") ?? el.tagName.toLowerCase();
    const name = el.getAttribute("name") ?? el.getAttribute("id") ?? "unnamed";
    const label = fieldLabel(el);
    fields.push({name:redactText(name).slice(0,200),type:inputType,label,required:(el as HTMLInputElement).required,redacted:true,dataCategory:classifyField(name,label,inputType)});
    if (el instanceof HTMLInputElement && el.type === "file" && el.files) {
      for (const file of [...el.files].slice(0,20)) {
        const ext = file.name.includes(".") ? `.${file.name.split(".").pop()?.slice(0,10)}` : "";
        fileNames.push(`[selected-file${ext}]`);
      }
    }
  }
  return {method:(form.method||"get").toUpperCase(),action:form.action||location.href,fields,fileNames,submitterText:""};
}

function nearbyText(el: Element): string {
  const container = el.closest("dialog,[role=dialog],form,section,article,main") ?? el.parentElement;
  return redactText((container?.textContent ?? "").replace(/\s+/g," ").trim()).slice(0,2200);
}

function contextFor(el: HTMLElement, form?: HTMLFormElement | null): ActionContext {
  const anchor = el.closest("a") as HTMLAnchorElement | null;
  const effectiveForm = form ?? el.closest("form");
  const f = formSnapshot(effectiveForm);
  if (f) f.submitterText = redactText(labelFor(el));
  return {
    requestId: crypto.randomUUID(),
    url: location.href,
    origin: location.origin,
    title: redactText(document.title).slice(0,500),
    element: {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? undefined,
      text: redactText(labelFor(el)).slice(0,1000) || undefined,
      ariaLabel: redactText(el.getAttribute("aria-label") ?? "").slice(0,500) || undefined,
      name: redactText(el.getAttribute("name") ?? "").slice(0,300) || undefined,
      inputType: el instanceof HTMLInputElement ? el.type : undefined,
      href: anchor?.href,
      method: f?.method,
      action: f?.action,
      declaredActionType: el.getAttribute("data-latch-action") ?? undefined,
      declaredSummary: el.getAttribute("data-latch-summary") ?? undefined,
      declaredReversibility: (["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"].includes(el.getAttribute("data-latch-reversibility") ?? "") ? el.getAttribute("data-latch-reversibility") : undefined) as ActionContext["element"]["declaredReversibility"]
    },
    ...(f ? {form:f} : {}),
    nearbyText: nearbyText(el),
    timestamp: new Date().toISOString(),
    clientVersion: VERSION
  };
}

function send<T extends MessageResponse>(message: unknown): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

function riskColor(risk: ActionManifest["risk"]) {
  return risk === "CRITICAL" ? "#b91c1c" : risk === "HIGH" ? "#dc2626" : risk === "MEDIUM" ? "#d97706" : "#15803d";
}

function showManifest(manifest: ActionManifest): Promise<"continue"|"cancel"> {
  modalOpen = true;
  const host = document.createElement("div"); host.setAttribute("data-latch-ui","");
  Object.assign(host.style,{position:"fixed",inset:"0",zIndex:"2147483647"});
  const shadow = host.attachShadow({mode:"closed"});
  shadow.innerHTML = `<style>
    *{box-sizing:border-box}.back{position:fixed;inset:0;background:rgba(17,24,39,.45);display:grid;place-items:center;padding:20px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}.card{width:min(520px,100%);max-height:80vh;overflow:auto;background:white;color:#111;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.3);padding:22px}.top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.brand{font-weight:850;letter-spacing:.05em;font-size:12px}.risk{font-size:11px;font-weight:800;color:white;border-radius:99px;padding:5px 8px}.summary{font-size:20px;font-weight:750;line-height:1.25;margin:16px 0 6px}.target{color:#6b7280;font-size:13px}.section{border-top:1px solid #eceef0;margin-top:16px;padding-top:14px}.section b{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}ul{margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.55}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.box{background:#f6f7f8;border-radius:10px;padding:10px}.box small{display:block;color:#6b7280}.box strong{font-size:13px}.actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}button{border:0;border-radius:10px;padding:10px 14px;font-weight:750;cursor:pointer}.cancel{background:#eef0f2;color:#111}.go{background:#111;color:#fff}.warning{color:#991b1b}</style>
    <div class="back"><div class="card" role="dialog" aria-modal="true" aria-label="LATCH action preview">
      <div class="top"><div class="brand">LATCH · ACTION PREVIEW</div><span class="risk" style="background:${riskColor(manifest.risk)}">${manifest.risk}</span></div>
      <div class="summary"></div><div class="target"></div>
      <div class="meta"><div class="box"><small>Reversibility</small><strong class="rev"></strong></div><div class="box"><small>Confidence</small><strong class="confidence"></strong></div></div>
      <div class="section effects"><b>What may happen</b><ul></ul></div>
      <div class="section warnings"><b>Warnings</b><ul></ul></div>
      <div class="actions"><button class="cancel">Cancel</button><button class="go">Continue</button></div>
    </div></div>`;
  (shadow.querySelector(".summary") as HTMLElement).textContent = manifest.summary;
  (shadow.querySelector(".target") as HTMLElement).textContent = manifest.target ?? location.hostname;
  (shadow.querySelector(".rev") as HTMLElement).textContent = manifest.reversibility.replaceAll("_"," ");
  (shadow.querySelector(".confidence") as HTMLElement).textContent = `${Math.round(manifest.confidence*100)}%`;
  const effects = shadow.querySelector(".effects ul")!;
  manifest.effects.forEach(e=>{const li=document.createElement("li");li.textContent=e;effects.appendChild(li)});
  const warns = shadow.querySelector(".warnings") as HTMLElement; const list=warns.querySelector("ul")!;
  if (!manifest.warnings.length) warns.style.display="none"; else manifest.warnings.forEach(w=>{const li=document.createElement("li");li.className="warning";li.textContent=w;list.appendChild(li)});
  document.documentElement.appendChild(host);
  return new Promise(resolve => {
    const done=(v:"continue"|"cancel")=>{host.remove();modalOpen=false;resolve(v)};
    shadow.querySelector(".cancel")!.addEventListener("click",()=>done("cancel"));
    shadow.querySelector(".go")!.addEventListener("click",()=>done("continue"));
    shadow.querySelector(".back")!.addEventListener("click",e=>{if(e.target===shadow.querySelector(".back"))done("cancel")});
  });
}

function inversePattern(actionType: string): RegExp | null {
  if (actionType === "access.grant") return /^(revoke|disconnect|unlink|unshare|remove access|remove permission)$/i;
  if (actionType === "content.publish") return /^(unpublish|remove post|delete post|undo post)$/i;
  if (actionType === "file.upload") return /^(remove file|delete file|clear upload)$/i;
  if (actionType === "resource.delete") return /^(restore|recover|undo delete)$/i;
  return null;
}

function findInverse(original: HTMLElement, manifest: ActionManifest): HTMLElement | null {
  const pattern = inversePattern(manifest.actionType);
  if (!pattern) return null;
  const scope = original.closest("dialog,[role=dialog],form,section,article") ?? original.parentElement;
  if (!scope) return null;
  const candidates = [...scope.querySelectorAll("button,a,[role=button]")]
    .filter((x): x is HTMLElement => x instanceof HTMLElement)
    .filter(x => x !== original && pattern.test(labelFor(x).trim()));
  if (pattern.test(labelFor(original).trim()) && original.isConnected) candidates.unshift(original);
  return candidates.length === 1 ? candidates[0]! : null;
}

function shouldIntervene(manifest: ActionManifest, level: "balanced"|"strict"|"high-only"): boolean {
  if (level === "strict") return true;
  if (["HIGH","CRITICAL"].includes(manifest.risk)) return true;
  if (level === "high-only") return false;
  if (["financial.commit","resource.delete","access.grant","content.publish","file.upload"].includes(manifest.actionType)) return true;
  return manifest.dataCategories.some(c => !["NONE","OTHER"].includes(c));
}

async function prepareAction(el: HTMLElement, form?: HTMLFormElement | null): Promise<{allowed:boolean; manifest?:ActionManifest; source?:{url:string;origin:string;title?:string}}> {
  const context = contextFor(el,form);
  const res = await send<MessageResponse>({type:"LATCH_ANALYZE",context});
  if (!res.ok || !res.manifest) return {allowed:true};
  const cfg = await send<MessageResponse>({type:"LATCH_CONFIG"});
  const source = {url:location.href,origin:location.origin,title:document.title};
  if (!shouldIntervene(res.manifest, cfg.config?.interventionLevel ?? "balanced")) return {allowed:true,manifest:res.manifest,source};
  const choice = await showManifest(res.manifest);
  if (choice === "cancel") {
    await send({type:"LATCH_RECEIPT",manifest:res.manifest,source,status:"CANCELLED"});
    return {allowed:false,manifest:res.manifest,source};
  }
  return {allowed:true,manifest:res.manifest,source};
}

async function recordCommit(el: HTMLElement, prepared: {manifest?:ActionManifest;source?:{url:string;origin:string;title?:string}}) {
  if (!prepared.manifest || !prepared.source) return;
  const receiptRes = await send<MessageResponse>({type:"LATCH_RECEIPT",manifest:prepared.manifest,source:prepared.source,status:"COMMITTED"});
  if (receiptRes.receipt) {
    const receiptId=receiptRes.receipt.id;
    setTimeout(()=>{const inverse=findInverse(el,prepared.manifest!);if(inverse){undoTargets.set(receiptId,inverse);void send({type:"LATCH_UNDO_READY",receiptId})}},700);
  }
}

async function handleClick(event: MouseEvent) {
  if (modalOpen || !event.isTrusted || event.button !== 0) return;
  const target = event.target instanceof Element ? closestActionElement(event.target) : null;
  if (!target || bypass.has(target) || !isCandidate(target)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const prepared = await prepareAction(target);
  if (!prepared.allowed) return;
  bypass.add(target);
  const targetForm = target.closest("form");
  if (targetForm) bypassForms.add(targetForm);
  queueMicrotask(()=>{ try { target.click(); void recordCommit(target,prepared); } finally { setTimeout(()=>{bypass.delete(target);if(targetForm)bypassForms.delete(targetForm)},250); } });
}

async function handleSubmit(event: SubmitEvent) {
  if (modalOpen || !event.isTrusted) return;
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form || bypassForms.has(form)) return;
  const submitter = event.submitter instanceof HTMLElement ? event.submitter : (form.querySelector('button[type="submit"],input[type="submit"]') as HTMLElement | null);
  if (!submitter) return;
  if (!isCandidate(submitter) && !form.querySelector('input[type="file"]')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const prepared = await prepareAction(submitter, form);
  if (!prepared.allowed) return;
  bypassForms.add(form);
  queueMicrotask(()=>{ try { form.requestSubmit(event.submitter instanceof HTMLElement ? event.submitter : undefined); void recordCommit(submitter,prepared); } finally { setTimeout(()=>bypassForms.delete(form),250); } });
}

void send<MessageResponse>({type:"LATCH_CONFIG"}).then(r=>{try{if(r.config?.apiBase)latchApiOrigin=new URL(r.config.apiBase).origin}catch{}}).catch(()=>{});
document.addEventListener("click", handleClick, true);
document.addEventListener("submit", handleSubmit, true);

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message?.type !== "LATCH_UNDO_PAGE") return;
  const target = undoTargets.get(String(message.receiptId));
  if (!target || !target.isConnected) { sendResponse({ok:false,error:"No unambiguous live-page inverse is available."}); return; }
  const label = labelFor(target);
  const confirmed = window.confirm(`LATCH found an inverse action: “${label}”. Run it now?`);
  if (!confirmed) { sendResponse({ok:false,error:"cancelled"}); return; }
  bypass.add(target);
  try { target.click(); undoTargets.delete(String(message.receiptId)); sendResponse({ok:true}); }
  catch (e: any) { sendResponse({ok:false,error:String(e?.message ?? e)}); }
  finally { setTimeout(()=>bypass.delete(target),250); }
});
