#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=path.join(ROOT,".github/workflows/physical-hardware-qualification.yml"),source=readFileSync(file,"utf8");
const fail=m=>{console.error(`CIEAV physical release workflow gate FAIL: ${m}`);process.exit(2)};
const requireToken=t=>{if(!source.includes(t))fail(`missing invariant: ${t}`)};
for(const token of [
  "workflow_dispatch:","windows_attestor:","default: native","- native","- maa","self-hosted","cieav-release-hardware","cieav-windows-tpm","cieav-macos-secure-enclave","cieav-linux-hsm",
  "github.ref == 'refs/heads/main'","startsWith(github.ref, 'refs/tags/cieav-v')","persist-credentials: false","clean: true",
  "Require reproducible release dependency lock","package-lock.json","run: npm ci","npm audit --omit=dev --audit-level=high","npm audit --audit-level=critical",
  "Qualify physical Windows TPM with local native attestation","inputs.windows_attestor == 'native'","CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG","CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256","physical-windows-tpm-native-qualification.mjs",
  "Qualify physical Windows TPM with live Microsoft Azure Attestation","inputs.windows_attestor == 'maa'","AZURE_CLIENT_SECRET: ${{ secrets.CIEAV_MAA_AZURE_CLIENT_SECRET }}",
  "CIEAV_LINUX_PKCS11_PROVIDER_REF: ${{ secrets.CIEAV_LINUX_PKCS11_PROVIDER_REF }}","Scrub release worktree","if: ${{ always() }}","git reset --hard HEAD","git clean -ffdx","cancel-in-progress: false"
])requireToken(token);
if(/\njobs:[\s\S]*?\n\s{2}windows-tpm-attestation:[\s\S]*?\n\s{4}env:\s*\n/.test(source))fail("Windows release secrets/config must not be job-scoped");
if(/\n\s{2}(?:windows-tpm-attestation|macos-secure-enclave|linux-pkcs11):[\s\S]*?\n\s{4}env:\s*\n/.test(source))fail("physical qualification credentials must be scoped to qualification steps");
const nativeStart=source.indexOf("- name: Qualify physical Windows TPM with local native attestation"),maaStart=source.indexOf("- name: Qualify physical Windows TPM with live Microsoft Azure Attestation"),scrubStart=source.indexOf("- name: Scrub release worktree",maaStart);
if(nativeStart<0||maaStart<=nativeStart||scrubStart<=maaStart)fail("Windows qualification step boundaries are malformed");
const nativeBlock=source.slice(nativeStart,maaStart),maaBlock=source.slice(maaStart,scrubStart);
if(nativeBlock.includes("AZURE_"))fail("native Windows TPM qualification must not depend on Azure credentials");
for(const token of ["AZURE_TENANT_ID","AZURE_CLIENT_ID","AZURE_CLIENT_SECRET","CIEAV_WINDOWS_MAA_CONFIG"])if(!maaBlock.includes(token))fail(`MAA Windows qualification missing ${token}`);
if(source.includes("run: npm install\n"))fail("physical release workflow must not resolve floating dependencies");
if(!source.includes("permissions:\n  contents: read"))fail("physical release workflow must keep repository token read-only");
console.log("CIEAV physical release workflow gate PASS · native Windows TPM attestation defaults Azure-free + optional MAA + trusted refs + self-hosted labels + step-scoped credentials + locked dependencies + worktree scrub enforced");
