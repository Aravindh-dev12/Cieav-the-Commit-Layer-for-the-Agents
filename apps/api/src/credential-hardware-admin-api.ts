import type {IncomingMessage} from "node:http";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavCredentialAuthorityApi} from "./credential-authority-api.js";
import {CieavMaaTpmAttestationVerifier} from "./maa-tpm-attestation.js";
import {CieavSecureEnclaveAttestor} from "./secure-enclave-attestation.js";
import {CieavWindowsTpmMaaCollector} from "./windows-tpm-maa-collector.js";

const MAX_BODY=256_000;
async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
const conflict=(err:unknown)=>({status:409,body:{error:String((err as any)?.message??err)}});

/**
 * Privileged credential/hardware lifecycle surface. This class is deliberately
 * mounted only beneath /v1/agent-kernel by CieavAgentKernelApi, so server.ts's
 * Gateway authentication remains the single administrative trust boundary.
 *
 * Raw VERIFIED hardware attestations are intentionally not accepted here.
 * Platform evidence must be produced by a CIEAV verifier/attestor.
 */
export class CieavCredentialHardwareAdminApi{
  private readonly credentials:CieavCredentialAuthorityApi;
  constructor(private readonly store:CieavAgentKernelStore){this.credentials=new CieavCredentialAuthorityApi(store.credentialAuthority)}

  async handle(req:IncomingMessage,pathname:string):Promise<{status:number;body:unknown}|null>{
    const credentialPrefix="/v1/agent-kernel/credential-authority";
    if(pathname===credentialPrefix||pathname.startsWith(`${credentialPrefix}/`)){
      const delegated=pathname.replace(credentialPrefix,"/v1/credential-authority");
      return await this.credentials.handle(req,delegated);
    }

    const hardwarePrefix="/v1/agent-kernel/hardware-key-providers";
    if(pathname===`${hardwarePrefix}/runtime`&&req.method==="GET")return{status:200,body:{stats:await this.store.hardwareKeyProviders.stats(),platform:process.platform,rawVerifiedAttestationImport:false}};
    if(pathname===`${hardwarePrefix}/manifests`){
      if(req.method==="GET")return{status:200,body:{manifests:await this.store.hardwareKeyProviders.listManifests()}};
      if(req.method==="POST"||req.method==="PUT"){try{return{status:200,body:{manifest:await this.store.hardwareKeyProviders.putManifest(await parseBody(req))}}}catch(err){return conflict(err)}}
    }
    if(pathname===`${hardwarePrefix}/attestations`&&req.method==="GET")return{status:200,body:{attestations:await this.store.hardwareKeyProviders.listAttestations()}};
    if(pathname===`${hardwarePrefix}/keys`){
      if(req.method==="GET")return{status:200,body:{keys:await this.store.hardwareKeyProviders.listKeys()}};
      if(req.method==="POST"){try{return{status:201,body:{key:await this.store.hardwareKeyProviders.registerKey(await parseBody(req))}}}catch(err){return conflict(err)}}
    }
    const revoke=pathname.match(/^\/v1\/agent-kernel\/hardware-key-providers\/keys\/([0-9a-f-]+)\/revoke$/i);if(req.method==="POST"&&revoke?.[1]){try{return{status:200,body:{key:await this.store.hardwareKeyProviders.revokeKey(revoke[1])}}}catch(err){return conflict(err)}}

    if(pathname===`${hardwarePrefix}/macos/attest`&&req.method==="POST"){
      const raw=await parseBody(req);try{const result=await new CieavSecureEnclaveAttestor(this.store.hardwareKeyProviders).attest(String(raw?.providerManifestId??""),String(raw?.providerKeyRef??""),raw?.expectedPublicJwk);return{status:201,body:result}}catch(err){return conflict(err)}
    }

    if(pathname===`${hardwarePrefix}/windows-tpm-maa/attest`&&req.method==="POST"){
      const raw=await parseBody(req);try{
        const collector=new CieavWindowsTpmMaaCollector(raw?.collectorConfig,new CieavMaaTpmAttestationVerifier());
        const result=await collector.collectAndVerify({providerManifestId:String(raw?.providerManifestId??""),expectedPublicJwk:raw?.expectedPublicJwk,...(raw?.expectedConsequencePublicJwk?{expectedConsequencePublicJwk:raw.expectedConsequencePublicJwk}:{})});
        const attestation=await this.store.hardwareKeyProviders.putAttestation(result.attestation);
        return{status:201,body:{attestation,publicJwk:result.publicJwk,requestPublicJwk:result.requestPublicJwk,claims:result.claims}};
      }catch(err){return conflict(err)}
    }

    if(pathname===`${hardwarePrefix}/linux/attest`&&req.method==="POST")return{status:501,body:{error:"linux_hardware_attestation_verifier_required",note:"PKCS#11 reachability is not hardware evidence. Configure a deployment-specific TPM/HSM verifier before registration."}};
    return null;
  }
}
