import crypto from "node:crypto";
import {computeLinuxTpm2PublicName,TPM_ALG_SHA1,TPM_ALG_SHA256,TPM_ALG_SHA384,TPM_ALG_SHA512} from "./linux-tpm2-attestation.js";
import {parseLinuxTpm2AttestationKeyPublic} from "./linux-tpm2-public.js";

export const TCG_EK_CERTIFICATE_EKU_OID="2.23.133.8.1" as const;
const MAX_CREDENTIAL_BLOB_BYTES=16*1024;
const MAX_ENCRYPTED_SECRET_BYTES=16*1024;
const MAX_ACTIVATION_SECRET_BYTES=128;
const NAME_DIGEST_BYTES=new Map<number,number>([[TPM_ALG_SHA1,20],[TPM_ALG_SHA256,32],[TPM_ALG_SHA384,48],[TPM_ALG_SHA512,64]]);

export type LinuxTpm2EkCertificate={certificate:crypto.X509Certificate;fingerprintSha256:string;publicJwk:crypto.JsonWebKey;eku:readonly string[];issuer:string;subject:string;validFrom:string;validTo:string};
export type LinuxTpm2EkTrustResult={trusted:true;verifiedBy:string};
export type LinuxTpm2CredentialMaterial={credentialBlob:Buffer;encryptedSecret:Buffer};
export type LinuxTpm2CredentialIssuer=(input:{ekPublicJwk:crypto.JsonWebKey;akName:Buffer;secret:Buffer})=>Promise<LinuxTpm2CredentialMaterial>;
export type LinuxTpm2EkTrustVerifier=(certificate:LinuxTpm2EkCertificate)=>Promise<LinuxTpm2EkTrustResult>;
export type LinuxTpm2AkEnrollmentChallenge={protocol:"CIEAV_LINUX_TPM2_AK_ENROLLMENT_V1";id:string;ekCertificateFingerprintSha256:string;akName:string;akPublicJwk:crypto.JsonWebKey;credentialBlob:string;encryptedSecret:string;createdAt:string;expiresAt:string;verifiedEkBy:string};
export type LinuxTpm2AkEnrollmentState={challenge:LinuxTpm2AkEnrollmentChallenge;secret:Buffer;secretDigest:string;consumed:false};
export type LinuxTpm2AkActivationResult={kind:"LINUX_TPM2_AK_ACTIVATION";activationVerified:true;challengeId:string;ekCertificateFingerprintSha256:string;akName:string;akPublicJwk:crypto.JsonWebKey;verifiedEkBy:string;verifiedAt:string};

function fail(code:string):never{throw new Error(`linux_tpm2_ak_enrollment_${code}`)}
function sha256(value:Buffer){return crypto.createHash("sha256").update(value).digest("hex")}
function bounded(value:Buffer,max:number,code:string){if(!Buffer.isBuffer(value)||value.length===0||value.length>max)fail(code);return Buffer.from(value)}
function parseName(name:Buffer){if(name.length<4)fail("ak_name_size");const alg=name.readUInt16BE(0),size=NAME_DIGEST_BYTES.get(alg);if(size===undefined||name.length!==2+size)fail("ak_name_format");return alg}
function safeEqual(a:Buffer,b:Buffer){return a.length===b.length&&crypto.timingSafeEqual(a,b)}

export function parseLinuxTpm2EkCertificate(raw:Buffer|string,now=Date.now()):LinuxTpm2EkCertificate{
  let certificate:crypto.X509Certificate;try{certificate=new crypto.X509Certificate(raw)}catch{fail("ek_certificate_invalid")}
  if(certificate.ca)fail("ek_certificate_ca_forbidden");
  const notBefore=Date.parse(certificate.validFrom),notAfter=Date.parse(certificate.validTo);if(!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||notBefore>now||notAfter<=now)fail("ek_certificate_not_valid");
  const key=certificate.publicKey,details=key.asymmetricKeyDetails;let publicJwk:crypto.JsonWebKey;
  if(key.asymmetricKeyType==="rsa"){if((details?.modulusLength??0)<2048)fail("ek_rsa_key_too_small");publicJwk=key.export({format:"jwk"}) as crypto.JsonWebKey}
  else if(key.asymmetricKeyType==="ec"){if(details?.namedCurve!=="prime256v1"&&details?.namedCurve!=="secp256r1")fail("ek_ecc_curve_unsupported");publicJwk=key.export({format:"jwk"}) as crypto.JsonWebKey}
  else fail("ek_key_type_unsupported");
  const eku=certificate.keyUsage??[];if(eku.length>0&&!eku.includes(TCG_EK_CERTIFICATE_EKU_OID))fail("ek_certificate_eku_mismatch");
  return{certificate,fingerprintSha256:sha256(certificate.raw),publicJwk,eku,issuer:certificate.issuer,subject:certificate.subject,validFrom:certificate.validFrom,validTo:certificate.validTo};
}

export async function beginLinuxTpm2AkEnrollment(input:{ekCertificate:Buffer|string;rawAkPublic:Buffer;verifyEkTrust:LinuxTpm2EkTrustVerifier;issueCredential:LinuxTpm2CredentialIssuer;ttlSeconds?:number;now?:number;randomBytes?:(size:number)=>Buffer}):Promise<LinuxTpm2AkEnrollmentState>{
  const now=input.now??Date.now(),ttl=input.ttlSeconds??120;if(!Number.isInteger(ttl)||ttl<30||ttl>600)fail("ttl");
  const ek=parseLinuxTpm2EkCertificate(input.ekCertificate,now),trust=await input.verifyEkTrust(ek);if(trust?.trusted!==true||typeof trust.verifiedBy!=="string"||trust.verifiedBy.length<3||trust.verifiedBy.length>300)fail("ek_trust_required");
  const ak=parseLinuxTpm2AttestationKeyPublic(input.rawAkPublic),akName=computeLinuxTpm2PublicName(input.rawAkPublic).name;parseName(akName);
  const random=input.randomBytes??crypto.randomBytes,secret=random(32);if(!Buffer.isBuffer(secret)||secret.length!==32)fail("secret_generation");
  const material=await input.issueCredential({ekPublicJwk:ek.publicJwk,akName:Buffer.from(akName),secret:Buffer.from(secret)}),credentialBlob=bounded(material?.credentialBlob,MAX_CREDENTIAL_BLOB_BYTES,"credential_blob"),encryptedSecret=bounded(material?.encryptedSecret,MAX_ENCRYPTED_SECRET_BYTES,"encrypted_secret"),createdAt=new Date(now).toISOString(),expiresAt=new Date(now+ttl*1000).toISOString();
  const challenge:LinuxTpm2AkEnrollmentChallenge={protocol:"CIEAV_LINUX_TPM2_AK_ENROLLMENT_V1",id:crypto.randomUUID(),ekCertificateFingerprintSha256:ek.fingerprintSha256,akName:akName.toString("base64url"),akPublicJwk:ak.publicJwk,credentialBlob:credentialBlob.toString("base64url"),encryptedSecret:encryptedSecret.toString("base64url"),createdAt,expiresAt,verifiedEkBy:trust.verifiedBy};
  return{challenge,secret:Buffer.from(secret),secretDigest:sha256(secret),consumed:false};
}

export function verifyLinuxTpm2AkActivation(state:LinuxTpm2AkEnrollmentState,response:{protocol:"CIEAV_LINUX_TPM2_AK_ENROLLMENT_V1";challengeId:string;activationSecret:string},now=Date.now()):LinuxTpm2AkActivationResult{
  if(state.consumed)fail("challenge_consumed");if(response?.protocol!==state.challenge.protocol||response.challengeId!==state.challenge.id)fail("challenge_identity_mismatch");if(Date.parse(state.challenge.expiresAt)<=now)fail("challenge_expired");
  let recovered:Buffer;try{recovered=Buffer.from(response.activationSecret,"base64url")}catch{fail("activation_secret_encoding")};if(recovered.length===0||recovered.length>MAX_ACTIVATION_SECRET_BYTES)fail("activation_secret_size");if(!safeEqual(recovered,state.secret))fail("activation_secret_mismatch");
  state.secret.fill(0);(state as {consumed:boolean}).consumed=true;
  return{kind:"LINUX_TPM2_AK_ACTIVATION",activationVerified:true,challengeId:state.challenge.id,ekCertificateFingerprintSha256:state.challenge.ekCertificateFingerprintSha256,akName:state.challenge.akName,akPublicJwk:state.challenge.akPublicJwk,verifiedEkBy:state.challenge.verifiedEkBy,verifiedAt:new Date(now).toISOString()};
}
