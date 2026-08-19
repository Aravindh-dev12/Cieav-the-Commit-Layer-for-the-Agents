import crypto from "node:crypto";
import {spawn} from "node:child_process";
import type {HardwareKeyRegistration,KeyPurpose} from "@cieav/contracts";
import type {CieavHardwareKeyProviderRegistry} from "./hardware-key-provider.js";

export type HardwareSignPurpose=Extract<KeyPurpose,"OAUTH_CLIENT_ASSERTION"|"DPOP"|"HTTP_MESSAGE_SIGNATURE"|"PROVIDER_SIGNING">;
export type HardwareSignResult={key:HardwareKeyRegistration;signature:Buffer;algorithm:"ES256"|"RS256"};
export type HardwareBridgeRunner=(executable:string,args:string[],timeoutMs:number,maxOutputBytes:number)=>Promise<unknown>;

const defaultRunner:HardwareBridgeRunner=async(executable,args,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()};
  const append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("hardware_signer_output_too_large")}return next};
  child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});
  child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});
  child.on("error",err=>finish(()=>reject(new Error(`hardware_signer_spawn_failed:${err.message}`))));
  child.on("close",code=>finish(()=>{if(code!==0)return reject(new Error(`hardware_signer_bridge_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`));let body:unknown;try{body=JSON.parse(stdout.toString("utf8"))}catch{return reject(new Error("hardware_signer_invalid_json"))}resolve(body)}));
  timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("hardware_signer_timeout")))},timeoutMs);
});

function parseSignature(raw:unknown,algorithm:"ES256"|"RS256"){const body=raw as Record<string,unknown>;if(body?.protocol!=="CIEAV_KEY_PROVIDER_V1")throw new Error("hardware_signer_protocol_mismatch");const expectedOp=algorithm==="ES256"?"sign-es256":"sign-rs256";if(body.operation!==expectedOp)throw new Error("hardware_signer_operation_mismatch");if(typeof body.signature!=="string"||!body.signature)throw new Error("hardware_signer_signature_missing");let signature:Buffer;try{signature=Buffer.from(body.signature,"base64url")}catch{throw new Error("hardware_signer_signature_encoding_invalid")};if(algorithm==="ES256"&&signature.length!==64)throw new Error("hardware_signer_es256_signature_length_invalid");if(algorithm==="RS256"&&signature.length<128)throw new Error("hardware_signer_rs256_signature_length_invalid");return signature}

export class CieavHardwareSigner{
  constructor(private readonly registry:CieavHardwareKeyProviderRegistry,private readonly runner:HardwareBridgeRunner=defaultRunner,private readonly timeoutMs=5000){}
  async signDigest(keyId:string,purpose:HardwareSignPurpose,digest32:Buffer):Promise<HardwareSignResult>{
    if(digest32.length!==32)throw new Error("hardware_signer_sha256_digest_required");
    const {key,manifest}=await this.registry.assertUsable(keyId,purpose);
    if(key.algorithm!=="ES256"&&key.algorithm!=="RS256")throw new Error("hardware_signer_algorithm_unsupported");
    const command=key.algorithm==="ES256"?"sign-es256":"sign-rs256";
    const body=await this.runner(manifest.executablePath,[command,key.providerKeyRef,digest32.toString("hex")],this.timeoutMs,16*1024);
    const signature=parseSignature(body,key.algorithm);
    return{key,signature,algorithm:key.algorithm};
  }
  async signJws(keyId:string,purpose:HardwareSignPurpose,protectedHeader:Record<string,unknown>,payload:Record<string,unknown>):Promise<string>{
    const {key}=await this.registry.assertUsable(keyId,purpose);
    if(key.algorithm!=="ES256")throw new Error("hardware_signer_jose_es256_required");
    const header=Buffer.from(JSON.stringify({...protectedHeader,alg:"ES256",jwk:key.publicJwk})).toString("base64url"),body=Buffer.from(JSON.stringify(payload)).toString("base64url"),input=`${header}.${body}`,digest=crypto.createHash("sha256").update(input).digest(),signed=await this.signDigest(keyId,purpose,digest);
    return`${input}.${signed.signature.toString("base64url")}`;
  }
}
