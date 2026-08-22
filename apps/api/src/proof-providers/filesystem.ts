import crypto from "node:crypto";
import {readFile,realpath,stat} from "node:fs/promises";
import path from "node:path";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const PROVIDER_ID="cieav.filesystem-proof.v1";
const digest=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const normalize=(p:string)=>process.platform==="win32"?p.toLowerCase():p;
const within=(root:string,target:string)=>{const rel=path.relative(root,target);return rel===""||(!rel.startsWith("..")&&!path.isAbsolute(rel))};

export class FilesystemProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["FILESYSTEM_METADATA","FILESYSTEM_SHA256"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private rootsPromise:Promise<string[]>;
  constructor(allowedRoots:string[],private readonly maxReadBytes=8*1024*1024){
    if(!allowedRoots.length)throw new Error("filesystem_proof_allowed_root_required");
    if(!Number.isSafeInteger(maxReadBytes)||maxReadBytes<1||maxReadBytes>64*1024*1024)throw new Error("filesystem_proof_invalid_max_read_bytes");
    this.rootsPromise=Promise.all(allowedRoots.map(async root=>normalize(await realpath(path.resolve(root)))));
  }
  async health(){return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:"Filesystem proof provider ready with canonical-root confinement.",authority:false})}
  private async resolveTarget(targetRef:string){
    const target=normalize(await realpath(path.resolve(targetRef)));
    const roots=await this.rootsPromise;
    if(!roots.some(root=>within(root,target)))throw new Error("filesystem_proof_target_outside_allowed_roots");
    return target;
  }
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{
    const request=ProofObservationRequestSchema.parse(raw);
    if(request.providerId!==PROVIDER_ID)throw new Error("filesystem_proof_provider_id_mismatch");
    const observedAt=new Date().toISOString();
    try{
      const target=await this.resolveTarget(request.targetRef),info=await stat(target);
      const observations=[{kind:"FILESYSTEM_METADATA",source:target,observedAt,summary:`type=${info.isFile()?"file":info.isDirectory()?"directory":"other"};size=${info.size};mtimeMs=${Math.trunc(info.mtimeMs)}`,digest:digest(JSON.stringify({size:info.size,mtimeMs:Math.trunc(info.mtimeMs),mode:info.mode,type:info.isFile()?"file":info.isDirectory()?"directory":"other"})),confidence:1}];
      let contentDigest:string|undefined;
      if(info.isFile()&&info.size<=this.maxReadBytes){const body=await readFile(target);contentDigest=digest(body);observations.push({kind:"FILESYSTEM_SHA256",source:target,observedAt,summary:`sha256=${contentDigest};bytes=${body.byteLength}`,digest:contentDigest,confidence:1})}
      const checks=request.expectedState.map(expected=>{
        if(expected==="exists")return true;
        if(expected==="type:file")return info.isFile();
        if(expected==="type:directory")return info.isDirectory();
        if(expected.startsWith("size:"))return info.size===Number(expected.slice(5));
        if(expected.startsWith("sha256:"))return Boolean(contentDigest&&contentDigest===expected.slice(7).toLowerCase());
        return null;
      });
      const understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length;
      const proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations,...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false});
    }catch(error:any){
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false});
    }
  }
}
