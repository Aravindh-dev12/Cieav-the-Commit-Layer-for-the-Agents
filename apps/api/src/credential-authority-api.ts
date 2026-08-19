import type {IncomingMessage} from "node:http";
import {KeyPurposeSchema} from "@cieav/contracts/credential-authority";
import type {RealityRouteResult} from "./reality-api.js";
import type {CieavCredentialAuthority} from "./credential-authority.js";

const MAX_BODY=128_000;
async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
const conflict=(err:unknown):RealityRouteResult=>({status:409,body:{error:String((err as any)?.message??err)}});
const purposes=(raw:unknown)=>Array.isArray(raw)?raw.map(x=>KeyPurposeSchema.parse(x)):[];

export class CieavCredentialAuthorityApi{
  constructor(private readonly authority:CieavCredentialAuthority){}
  async handle(req:IncomingMessage,pathname:string):Promise<RealityRouteResult|null>{
    if(pathname==="/v1/credential-authority/keys"){
      if(req.method==="GET")return{status:200,body:{keys:await this.authority.listKeys()}};
      if(req.method==="POST"){const raw=await parseBody(req),alias=String(raw?.alias??""),keyPurposes=purposes(raw?.purposes);if(!alias||!keyPurposes.length)return{status:400,body:{error:"alias_and_purposes_required"}};try{return{status:201,body:{key:await this.authority.createLocalKey(alias,keyPurposes,raw?.expiresAt?String(raw.expiresAt):undefined)}}}catch(err){return conflict(err)}}
    }
    if(req.method==="POST"&&pathname==="/v1/credential-authority/keys/import-p256"){const raw=await parseBody(req),alias=String(raw?.alias??""),keyPurposes=purposes(raw?.purposes),privateKeyPem=String(raw?.privateKeyPem??"");if(!alias||!keyPurposes.length||!privateKeyPem)return{status:400,body:{error:"alias_purposes_and_private_key_required"}};if(privateKeyPem.length>64_000)return{status:413,body:{error:"private_key_too_large"}};try{const key=await this.authority.importLocalP256Key(alias,keyPurposes,privateKeyPem,raw?.expiresAt?String(raw.expiresAt):undefined);return{status:201,body:{key,privateKeyExportable:false}}}catch(err){return conflict(err)}}
    const revoke=pathname.match(/^\/v1\/credential-authority\/keys\/([0-9a-f-]+)\/revoke$/i);if(req.method==="POST"&&revoke?.[1]){try{return{status:200,body:{key:await this.authority.revokeKey(revoke[1])}}}catch(err){return conflict(err)}}
    if(pathname==="/v1/credential-authority/oauth-profiles"){
      if(req.method==="GET")return{status:200,body:{profiles:await this.authority.listProfiles()}};
      if(req.method==="POST"||req.method==="PUT"){try{return{status:200,body:{profile:await this.authority.putProfile(await parseBody(req))}}}catch(err){return conflict(err)}}
    }
    if(req.method==="GET"&&pathname==="/v1/credential-authority/derivation-receipts")return{status:200,body:{receipts:await this.authority.listReceipts()}};
    if(req.method==="GET"&&pathname==="/v1/credential-authority/runtime")return{status:200,body:{version:"credential-authority-v2",privateKeyImport:true,privateKeyExport:false,agentTokenAccess:false,oauthClientCredentials:true,oauthTokenExchange:true,privateKeyJwt:true,dpop:true,mtls:true,mtlsSameCertificateBinding:true,softwareWrappedMtls:true,hardwareBackedMtls:false,httpMessageSignatures:false}};
    return null;
  }
}
