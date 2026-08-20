#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot.ts"),"utf8");
const tests=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot.test.ts"),"utf8");
const fail=m=>{console.error(`CIEAV Windows measured-boot static gate FAIL: ${m}`);process.exit(2)};
const requireTokens=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};

requireTokens(source,[
  "CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1",
  "NCRYPT_PLATFORM_ATTEST_MAGIC=0x44504150",
  "NCRYPT_TPM_PLATFORM_ATTESTATION_STATEMENT_VERSION=0",
  "PLATFORM_HEADER_BYTES=24",
  "Spec ID Event03",
  "MAX_WBCL_BYTES",
  "MAX_EVENT_BYTES",
  "MAX_EVENTS",
  "MAX_DIGESTS",
  "wbcl_duplicate_algorithm",
  "wbcl_known_digest_size_mismatch",
  "wbcl_event_duplicate_algorithm",
  "wbcl_event_unknown_algorithm",
  "wbcl_event_data_bounds",
  "replay_selected_digest_missing",
  "PCR :=",
  "crypto.createHash(hashName).update(current).update(digest).digest()"
],"measured-boot parser");
requireTokens(tests,[
  "parses the exact Windows platform-attestation statement layout",
  "rejects wrong magic, version, unsupported PCR bank, truncation and trailing bytes",
  "replays a selected SHA-256 PCR",
  "rejects duplicate descriptor algorithms",
  "rejects malformed or truncated descriptor and event structures",
  "rejects duplicate and undeclared event digest algorithms",
  "fails replay when a selected PCR event omits the selected digest bank"
],"measured-boot tests");

if(/verification\s*:\s*["']VERIFIED["']/.test(source)||/measured.?boot.*VERIFIED/i.test(source))fail("parser/replay foundation must not emit measured-boot VERIFIED state");
if(source.includes("0x414c5054"))fail("obsolete placeholder platform-attestation magic is forbidden");
if(!source.includes("0x44504150"))fail("Windows NCRYPT_PLATFORM_ATTEST_MAGIC must remain exact");

console.log("CIEAV Windows measured-boot static gate PASS · exact NCRYPT ABI + bounded TCG2/WBCL parser + fail-closed PCR replay · qualification remains disabled");
