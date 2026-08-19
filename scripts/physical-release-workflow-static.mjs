#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const file=path.join(ROOT,".github/workflows/physical-hardware-qualification.yml"),source=readFileSync(file,"utf8");
const fail=m=>{console.error(`CIEAV physical release workflow gate FAIL: ${m}`);process.exit(2)};
const requireToken=t=>{if(!source.includes(t))fail(`missing invariant: ${t}`)};
for(const token of [
  "workflow_dispatch:","self-hosted","cieav-release-hardware","cieav-windows-tpm","cieav-macos-secure-enclave","cieav-linux-hsm",
  "github.ref == 'refs/heads/main'","startsWith(github.ref, 'refs/tags/cieav-v')","persist-credentials: false","clean: true",
  "Require reproducible release dependency lock","package-lock.json","run: npm ci","npm audit --omit=dev --audit-level=high","npm audit --audit-level=critical",
  "CIEAV_PHYSICAL_HARDWARE_QUALIFICATION: \"1\"","AZURE_CLIENT_SECRET: ${{ secrets.CIEAV_MAA_AZURE_CLIENT_SECRET }}","CIEAV_LINUX_PKCS11_PROVIDER_REF: ${{ secrets.CIEAV_LINUX_PKCS11_PROVIDER_REF }}",
  "Scrub release worktree","if: ${{ always() }}","git reset --hard HEAD","git clean -ffdx","cancel-in-progress: false"
])requireToken(token);
if(/\njobs:[\s\S]*?\n\s{2}windows-tpm-maa:[\s\S]*?\n\s{4}env:\s*\n/.test(source))fail("Windows release secrets/config must not be job-scoped");
if(/\n\s{2}(?:windows-tpm-maa|macos-secure-enclave|linux-pkcs11):[\s\S]*?\n\s{4}env:\s*\n/.test(source))fail("physical qualification credentials must be scoped to qualification steps");
if(source.includes("run: npm install\n"))fail("physical release workflow must not resolve floating dependencies");
if(!source.includes("permissions:\n  contents: read"))fail("physical release workflow must keep repository token read-only");
console.log("CIEAV physical release workflow gate PASS · trusted refs + self-hosted labels + step-scoped secrets + locked dependencies + worktree scrub enforced");
