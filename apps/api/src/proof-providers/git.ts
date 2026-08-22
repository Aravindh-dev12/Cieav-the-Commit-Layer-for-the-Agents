import crypto from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {realpath} from "node:fs/promises";
import path from "node:path";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const runFile=promisify(execFile),PROVIDER_ID="cieav.git-proof.v1";
const digest=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");
const normalize=(value:string)=>process.platform==="win32"?value.toLowerCase():value;
const HEX40=/^[0-9a-f]{40}$/;

export class GitProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["GIT_HEAD","GIT_TREE","GIT_STATUS","GIT_BRANCH"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private repositoriesPromise:Promise<Set<string>>;
  constructor(allowedRepositories:string[],private readonly gitBinary="git",private readonly maxOutputBytes=1024*1024){
    if(!allowedRepositories.length)throw new Error("git_proof_allowed_repository_required");
    if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<4096||maxOutputBytes>16*1024*1024)throw new Error("git_proof_invalid_output_limit");
    this.repositoriesPromise=Promise.all(allowedRepositories.map(async repo=>normalize(await realpath(path.resolve(repo))))).then(values=>new Set(values));
  }
  private async run(repo:string,args:string[],timeoutMs:number){
    const {stdout}=await runFile(this.gitBinary,["-C",repo,...args],{encoding:"utf8",timeout:timeoutMs,maxBuffer:this.maxOutputBytes,windowsHide:true,env:{...process.env,GIT_CONFIG_NOSYSTEM:"1",GIT_TERMINAL_PROMPT:"0",GIT_OPTIONAL_LOCKS:"0"}});
    return String(stdout).trim();
  }
  async health(){try{const {stdout}=await runFile(this.gitBinary,["--version"],{encoding:"utf8",timeout:2000,maxBuffer:4096,windowsHide:true});return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:String(stdout).trim().slice(0,1000),authority:false})}catch(error:any){return ProviderHealthSchema.parse({ok:false,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:String(error?.message??error).slice(0,1000),authority:false})}}
  private async repository(targetRef:string,timeoutMs:number){
    const target=normalize(await realpath(path.resolve(targetRef))),top=normalize(await realpath(await this.run(target,["rev-parse","--show-toplevel"],timeoutMs))),allowed=await this.repositoriesPromise;
    if(!allowed.has(top))throw new Error("git_proof_repository_not_allowed");
    return top;
  }
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{
    const request=ProofObservationRequestSchema.parse(raw);if(request.providerId!==PROVIDER_ID)throw new Error("git_proof_provider_id_mismatch");const observedAt=new Date().toISOString();
    try{
      const repo=await this.repository(request.targetRef,request.timeoutMs),[head,tree,status,branch]=await Promise.all([
        this.run(repo,["rev-parse","HEAD"],request.timeoutMs),this.run(repo,["rev-parse","HEAD^{tree}"],request.timeoutMs),this.run(repo,["status","--porcelain=v1","--untracked-files=normal"],request.timeoutMs),this.run(repo,["symbolic-ref","--quiet","--short","HEAD"],request.timeoutMs).catch(()=>"")
      ]);
      if(!HEX40.test(head)||!HEX40.test(tree))throw new Error("git_proof_invalid_object_id");
      const clean=status.length===0,observations=[
        {kind:"GIT_HEAD",source:repo,observedAt,summary:`head=${head}`,digest:digest(head),confidence:1},
        {kind:"GIT_TREE",source:repo,observedAt,summary:`tree=${tree}`,digest:digest(tree),confidence:1},
        {kind:"GIT_STATUS",source:repo,observedAt,summary:clean?"working-tree=clean":`working-tree=dirty;statusDigest=${digest(status)}`,digest:digest(status),confidence:1},
        {kind:"GIT_BRANCH",source:repo,observedAt,summary:`branch=${branch||"DETACHED"}`,digest:digest(branch||"DETACHED"),confidence:1}
      ];
      const checks=request.expectedState.map(expected=>{if(expected==="clean")return clean;if(expected==="dirty")return!clean;if(expected.startsWith("head:"))return head===expected.slice(5).toLowerCase();if(expected.startsWith("tree:"))return tree===expected.slice(5).toLowerCase();if(expected.startsWith("branch:"))return(branch||"DETACHED")===expected.slice(7);return null});
      const understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length,proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations,...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false});
    }catch(error:any){return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.killed?"git_proof_timeout":error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false})}
  }
}
