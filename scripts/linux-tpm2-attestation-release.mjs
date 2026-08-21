#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"apps/api/src/linux-tpm2-attestation.ts"),"utf8"),tests=readFileSync(path.join(ROOT,"apps/api/src/linux-tpm2-attestation.test.ts"),"utf8"),admin=readFileSync(path.join(ROOT,"apps/api/src/credential-hardware-admin-api.ts"),"utf8");
const fail=m=>{console.error(`CIEAV Linux TPM2 attestation gate FAIL: ${m}`);process.exit(2)},expectTokens=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};
expectTokens(source,["TPM_GENERATED_VALUE","TPM_ST_ATTEST_CERTIFY","TPM_ST_ATTEST_QUOTE","TPM_ALG_RSASSA","TPM_ALG_RSAPSS","TPM_ALG_ECDSA","parseLinuxTpm2Attest","parseLinuxTpm2Signature","verifyLinuxTpm2AttestationSignature","computeLinuxTpm2PublicName","verifyLinuxTpm2CertifiedPublic","verifyLinuxTpm2QuoteBinding","verifyLinuxTpm2CertifyBinding","RSA_PKCS1_PADDING","dsaEncoding:\"der\"","timingSafeEqual","signature_rsapss_unqualified","attestation_signature_invalid","quote_nonce_mismatch","quote_pcr_digest_mismatch","certify_name_mismatch"],"Linux TPM2 verifier foundation");
expectTokens(tests,["TPM2B_ATTEST framing","selected PCR digest binding","certified TPM Name","recomputes Name from exact TPM2B_PUBLIC publicArea bytes","verifies RSASSA signatures","verifies ECDSA signatures","attestation_signature_invalid","signature_rsapss_unqualified"],"Linux TPM2 verifier tests");
expectTokens(admin,["linux_hardware_attestation_verifier_required","PKCS#11 reachability is not hardware evidence"],"Linux admin fail-closed boundary");
if(/verification\s*:\s*["']VERIFIED["']/.test(source)||/HardwareKeyAttestationSchema/.test(source))fail("Linux TPM2 foundation must not emit durable VERIFIED attestation before AK trust policy, TPM public-area semantic validation and physical qualification");
const npm=process.platform==="win32"?"npm.cmd":"npm",r=spawnSync(npm,["run","test","-w","@cieav/api","--","src/linux-tpm2-attestation.test.ts"],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`focused Linux TPM2 tests exited ${r.status}`);
console.log(`CIEAV Linux TPM2 attestation gate PASS · platform=${process.platform} · bounded attestation/signature parser + trusted-AK RSASSA/ECDSA verification + exact public-area Name recomputation + nonce/PCR/certify binding verified · RSAPSS and durable hardware qualification remain fail-closed`);
