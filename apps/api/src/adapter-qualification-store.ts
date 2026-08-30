import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {
  AdapterQualificationReportSchema,
  QualifiedToolManifestSchema,
  type AdapterQualificationReport,
  type QualifiedToolManifest
} from "@cieav/contracts";
import {
  assertAdapterQualificationReportIntegrity,
  assertQualifiedToolManifestCurrent,
  assertQualifiedToolManifestIntegrity,
  makeQualifiedToolManifest,
  type QualifiedToolCurrentState
} from "@cieav/core/adapter-qualification";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const handle=await open(tmp,"r+");try{await handle.sync()}finally{await handle.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const directory=await open(dir,"r");try{await directory.sync()}finally{await directory.close()}}catch{}
}

type Payload={version:1;manifests:QualifiedToolManifest[];reports:AdapterQualificationReport[];updatedAt:string};
type Envelope={payload:Payload;mac:string};
const empty=():Payload=>({version:1,manifests:[],reports:[],updatedAt:new Date(0).toISOString()});

export class CieavAdapterQualificationStore{
  private loaded=false;
  private payload:Payload=empty();
  private chain:Promise<void>=Promise.resolve();

  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV adapter qualification state secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private verifyPayload(payload:Payload){
    if(payload.version!==1)throw new Error("adapter_qualification_store_version_unsupported");
    const manifests=payload.manifests.map(value=>assertQualifiedToolManifestIntegrity(QualifiedToolManifestSchema.parse(value)));
    const reports=payload.reports.map(value=>assertAdapterQualificationReportIntegrity(AdapterQualificationReportSchema.parse(value)));
    const currentTools=new Set<string>();
    for(const manifest of manifests){if(currentTools.has(manifest.toolId))throw new Error(`duplicate_adapter_qualification_tool:${manifest.toolId}`);currentTools.add(manifest.toolId)}
    const updatedAt=new Date(payload.updatedAt).toISOString();
    return{version:1 as const,manifests,reports,updatedAt};
  }
  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const envelope=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(!envelope?.payload||typeof envelope.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(envelope.payload);
      if(expected.length!==envelope.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(envelope.mac)))throw new Error("integrity check failed");
      this.payload=this.verifyPayload(envelope.payload);
    }catch(error:any){if(error?.code!=="ENOENT")throw new Error(`CIEAV adapter qualification store is unreadable, corrupt, or unauthenticated: ${String(error?.message??error)}`)}
    this.loaded=true;
  }
  private async persist(){this.payload={...this.verifyPayload(this.payload),updatedAt:new Date().toISOString()};await durableReplace(this.file,JSON.stringify({payload:this.payload,mac:this.mac(this.payload)},null,2)+"\n")}

  putManifest(raw:QualifiedToolManifest){return this.enqueue(async()=>{await this.load();const manifest=assertQualifiedToolManifestIntegrity(QualifiedToolManifestSchema.parse(raw)),index=this.payload.manifests.findIndex(value=>value.toolId===manifest.toolId);if(index>=0)this.payload.manifests[index]=manifest;else this.payload.manifests.push(manifest);await this.persist();return manifest})}
  putReport(raw:AdapterQualificationReport){return this.enqueue(async()=>{await this.load();const report=assertAdapterQualificationReportIntegrity(AdapterQualificationReportSchema.parse(raw));if(!this.payload.manifests.some(value=>value.manifestDigest===report.manifestDigest))throw new Error("adapter_qualification_report_manifest_missing");this.payload.reports=this.payload.reports.filter(value=>value.reportDigest!==report.reportDigest);this.payload.reports.push(report);await this.persist();return report})}
  getManifest(toolId:string){return this.enqueue(async()=>{await this.load();return this.payload.manifests.find(value=>value.toolId===toolId)??null})}
  listManifests(){return this.enqueue(async()=>{await this.load();return this.payload.manifests.slice().sort((a,b)=>a.toolId.localeCompare(b.toolId))})}
  listReports(toolId?:string){return this.enqueue(async()=>{await this.load();if(!toolId)return this.payload.reports.slice().reverse();const current=this.payload.manifests.find(value=>value.toolId===toolId);return current?this.payload.reports.filter(value=>value.manifestDigest===current.manifestDigest).slice().reverse():[]})}
  requireCurrentQualified(toolId:string,current:QualifiedToolCurrentState){return this.enqueue(async()=>{await this.load();const manifest=this.payload.manifests.find(value=>value.toolId===toolId);if(!manifest)throw new Error(`qualified_tool_manifest_missing:${toolId}`);const checked=assertQualifiedToolManifestCurrent(manifest,current),reports=this.payload.reports.filter(value=>value.manifestDigest===checked.manifestDigest);if(!reports.some(value=>value.qualified))throw new Error(`qualified_tool_report_required:${toolId}`);return checked})}
  setState(toolId:string,state:"QUALIFIED"|"SUSPENDED"|"REVOKED"){return this.enqueue(async()=>{await this.load();const index=this.payload.manifests.findIndex(value=>value.toolId===toolId);if(index<0)throw new Error("qualified_tool_manifest_missing");const current=this.payload.manifests[index]!,{manifestDigest:_,...base}=current,next=makeQualifiedToolManifest({...base,qualificationState:state,productionQualified:state==="QUALIFIED"});this.payload.manifests[index]=next;await this.persist();return next})}
  verifyIntegrity(){return this.enqueue(async()=>{await this.load();this.payload=this.verifyPayload(this.payload);return true})}
  stats(){return this.enqueue(async()=>{await this.load();return{manifests:this.payload.manifests.length,qualified:this.payload.manifests.filter(value=>value.productionQualified).length,suspended:this.payload.manifests.filter(value=>value.qualificationState==="SUSPENDED").length,revoked:this.payload.manifests.filter(value=>value.qualificationState==="REVOKED").length,reports:this.payload.reports.length,updatedAt:this.payload.updatedAt}})}
  async close(){await this.chain}
}
