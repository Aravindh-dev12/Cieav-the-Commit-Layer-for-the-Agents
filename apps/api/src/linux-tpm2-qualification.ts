import crypto from "node:crypto";
import type {LinuxTpm2EsapiEvidence} from "./linux-tpm2-esapi-collector.js";
import type {LinuxTpm2EnrollmentProof} from "./linux-tpm2-enrollment-orchestrator.js";
import {verifyLinuxTpm2FirmwareLogQuote,type LinuxTpm2FirmwareLogBinding} from "./linux-tpm2-measured-boot.js";
import {verifyLinuxTpm2BootPolicy,type LinuxTpm2BootPolicyResult} from "./linux-tpm2-boot-policy.js";

export type LinuxTpm2EvidenceCollector={collect():Promise<LinuxTpm2EsapiEvidence>};
export type LinuxTpm2EnrollmentVerifier={enroll(input:{ekCertificate:Buffer|string;rawEkPublic:Buffer;ekHandle:string;rawAkPublic:Buffer;akHandle:string;ttlSeconds?:number;now?:number;randomBytes?:(size:number)=>Buffer}):Promise<LinuxTpm2EnrollmentProof>};
export type LinuxTpm2NativeQualification={kind:"LINUX_TPM2_NATIVE_QUALIFICATION";qualification:"QUALIFIED_LOCAL_TPM_EVIDENCE";ekName:string;akName:string;subjectName:string;subjectPublicKeyFingerprint:string;ekCertificateFingerprintSha256:string;ekTrustVerifier:string;bootPolicy:LinuxTpm2BootPolicyResult;firmwareEventCount:number;firmwareLogDigest:string;certifyEvidenceDigest:string;quoteEvidenceDigest:string;qualifiedAt:string};

function fail(code:string):never{throw new Error(`linux_tpm2_qualification_${code}`)}
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";

export class CieavLinuxTpm2NativeQualificationVerifier{
  constructor(private readonly collector:LinuxTpm2EvidenceCollector,private readonly enrollment:LinuxTpm2EnrollmentVerifier,private readonly measuredVerifier:typeof verifyLinuxTpm2FirmwareLogQuote=verifyLinuxTpm2FirmwareLogQuote,private readonly policyVerifier:typeof verifyLinuxTpm2BootPolicy=verifyLinuxTpm2BootPolicy){}
  async qualify(input:{ekCertificate:Buffer|string;ekHandle:string;akHandle:string;eventLog:Buffer;bootPolicy:unknown;now?:number;enrollmentTtlSeconds?:number}):Promise<LinuxTpm2NativeQualification>{
    const now=input.now??Date.now();if(!Buffer.isBuffer(input.eventLog)||input.eventLog.length<32||input.eventLog.length>32*1024*1024)fail("event_log_size");const evidence=await this.collector.collect();
    const enrollment=await this.enrollment.enroll({ekCertificate:input.ekCertificate,rawEkPublic:evidence.ekPublic,ekHandle:input.ekHandle,rawAkPublic:evidence.akPublic,akHandle:input.akHandle,now,...(input.enrollmentTtlSeconds?{ttlSeconds:input.enrollmentTtlSeconds}:{})});
    if(enrollment.ekName!==evidence.ekName.toString("base64url")||enrollment.akName!==evidence.akName.toString("base64url"))fail("enrollment_identity_mismatch");if(enrollment.activation.akName!==evidence.akName.toString("base64url"))fail("activation_ak_mismatch");
    const measured=this.measuredVerifier({rawQuote:evidence.quoteAttest,rawSignature:evidence.quoteSignature,expectedNonce:evidence.quoteNonce,akPublicJwk:evidence.akPublicJwk,eventLog:input.eventLog}),bootPolicy=this.policyVerifier(measured,input.bootPolicy,now),subjectPublicKeyFingerprint=sha256(canonical(evidence.subjectPublicJwk)),certifyEvidenceDigest=sha256(Buffer.concat([evidence.certifyNonce,evidence.certifyAttest,evidence.certifySignature,evidence.subjectPublic])),quoteEvidenceDigest=sha256(Buffer.concat([evidence.quoteNonce,evidence.quoteAttest,evidence.quoteSignature]));
    return{kind:"LINUX_TPM2_NATIVE_QUALIFICATION",qualification:"QUALIFIED_LOCAL_TPM_EVIDENCE",ekName:evidence.ekName.toString("base64url"),akName:evidence.akName.toString("base64url"),subjectName:evidence.subjectName.toString("base64url"),subjectPublicKeyFingerprint,ekCertificateFingerprintSha256:enrollment.activation.ekCertificateFingerprintSha256,ekTrustVerifier:enrollment.activation.verifiedEkBy,bootPolicy,firmwareEventCount:measured.eventCount,firmwareLogDigest:sha256(input.eventLog),certifyEvidenceDigest,quoteEvidenceDigest,qualifiedAt:new Date(now).toISOString()};
  }
}
