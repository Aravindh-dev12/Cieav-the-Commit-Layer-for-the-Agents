import type crypto from "node:crypto";
import {beginLinuxTpm2AkEnrollment,parseLinuxTpm2EkCertificate,verifyLinuxTpm2AkActivation,type LinuxTpm2AkActivationResult,type LinuxTpm2EkTrustVerifier} from "./linux-tpm2-ak-enrollment.js";
import {parseLinuxTpm2AttestationKeyPublic,parseLinuxTpm2EndorsementPublic} from "./linux-tpm2-public.js";
import type {LinuxTpm2PersistentHandleIdentity} from "./linux-tpm2-readpublic.js";

export type LinuxTpm2HandleVerifier={verify(input:{handle:string;expectedName:Buffer;expectedPublicJwk:crypto.JsonWebKey}):Promise<LinuxTpm2PersistentHandleIdentity>};
export type LinuxTpm2CredentialIssuerLike={issue(input:{ekPublicJwk:crypto.JsonWebKey;akName:Buffer;secret:Buffer}):Promise<{credentialBlob:Buffer}>};
export type LinuxTpm2CredentialActivator={activate(credentialBlob:Buffer,handles:{akSerializedHandle:Buffer;ekSerializedHandle:Buffer}):Promise<Buffer>};
export type LinuxTpm2EnrollmentProof={kind:"LINUX_TPM2_EK_AK_ENROLLMENT_PROOF";activation:LinuxTpm2AkActivationResult;ekName:string;akName:string;ekHandle:string;akHandle:string;ekProfile:"TCG_LOW_RANGE_STORAGE_EK"};

function fail(code:string):never{throw new Error(`linux_tpm2_enrollment_${code}`)}
function canonicalJwk(jwk:crypto.JsonWebKey){return jwk.kty==="RSA"?{kty:"RSA",n:jwk.n,e:jwk.e}:jwk.kty==="EC"?{kty:"EC",crv:jwk.crv,x:jwk.x,y:jwk.y}:jwk}
function sameJwk(a:crypto.JsonWebKey,b:crypto.JsonWebKey){return JSON.stringify(canonicalJwk(a))===JSON.stringify(canonicalJwk(b))}

export class CieavLinuxTpm2EnrollmentOrchestrator{
  constructor(private readonly handleVerifier:LinuxTpm2HandleVerifier,private readonly credentialIssuer:LinuxTpm2CredentialIssuerLike,private readonly credentialActivator:LinuxTpm2CredentialActivator,private readonly verifyEkTrust:LinuxTpm2EkTrustVerifier){}
  async enroll(input:{ekCertificate:Buffer|string;rawEkPublic:Buffer;ekHandle:string;rawAkPublic:Buffer;akHandle:string;ttlSeconds?:number;now?:number;randomBytes?:(size:number)=>Buffer}):Promise<LinuxTpm2EnrollmentProof>{
    const now=input.now??Date.now(),certificate=parseLinuxTpm2EkCertificate(input.ekCertificate,now),ek=parseLinuxTpm2EndorsementPublic(input.rawEkPublic),ak=parseLinuxTpm2AttestationKeyPublic(input.rawAkPublic);if(!sameJwk(certificate.publicJwk,ek.publicJwk))fail("ek_certificate_public_key_mismatch");
    const [verifiedEk,verifiedAk]=await Promise.all([this.handleVerifier.verify({handle:input.ekHandle,expectedName:ek.publicName.name,expectedPublicJwk:ek.publicJwk}),this.handleVerifier.verify({handle:input.akHandle,expectedName:ak.publicName.name,expectedPublicJwk:ak.publicJwk})]);
    const state=await beginLinuxTpm2AkEnrollment({ekCertificate:input.ekCertificate,rawAkPublic:input.rawAkPublic,verifyEkTrust:this.verifyEkTrust,issueCredential:value=>this.credentialIssuer.issue(value),ttlSeconds:input.ttlSeconds,now,...(input.randomBytes?{randomBytes:input.randomBytes}:{})}),credentialBlob=Buffer.from(state.challenge.credentialBlob,"base64url");let activated:Buffer|undefined;
    try{activated=await this.credentialActivator.activate(credentialBlob,{akSerializedHandle:verifiedAk.serializedHandle,ekSerializedHandle:verifiedEk.serializedHandle});const activation=verifyLinuxTpm2AkActivation(state,{protocol:state.challenge.protocol,challengeId:state.challenge.id,activationSecret:activated.toString("base64url")},now);return{kind:"LINUX_TPM2_EK_AK_ENROLLMENT_PROOF",activation,ekName:ek.publicName.name.toString("base64url"),akName:ak.publicName.name.toString("base64url"),ekHandle:input.ekHandle,akHandle:input.akHandle,ekProfile:ek.profile}}
    finally{activated?.fill(0)}
  }
}
