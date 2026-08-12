#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const installer=readFileSync(path.join(ROOT,"scripts/installer-live-smoke.py"),"utf8"),installQ=readFileSync(path.join(ROOT,"scripts/qualify-installers.mjs"),"utf8"),prod=readFileSync(path.join(ROOT,"scripts/qualify-production.mjs"),"utf8"),docs=readFileSync(path.join(ROOT,"docs/release-qualification.md"),"utf8"),pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
const need=(text,tokens,label)=>{for(const t of tokens)if(!text.includes(t))throw new Error(`${label} invariant missing: ${t}`)};
need(installer,["--confirm-install-mutation","Refusing to overwrite an existing CIEAV runtime or backup","scenario\",required=True,choices=(\"success\",\"rollback\")","restoring previous runtime","priorRuntimeRestored","candidateRemoved","cleanup","CIEAV_NO_SERVICE"],"live installer harness");
need(installQ,["LIVE_INSTALLER_QUALIFICATION","installerSuccess","installerRollback","priorRuntimeRestored","cleanup","mode!==\"publish\"","windows-x64,macos-arm64,linux-x64"],"installer qualifier");
need(prod,["PRODUCTION_QUALIFICATION","candidate_qualification_not_pass","installer_qualification_not_pass","candidate_installer_commit_mismatch","qualification_not_for_current_head","qualification_not_for_current_version","latest-production-qualification.json"],"production qualifier");
need(docs,["release:smoke:installer:success","release:smoke:installer:rollback","release:qualify:installers","release:qualify:production","Only after this PASS should a staged draft release be made public"],"production runbook");
for(const script of ["release:smoke:installer:success","release:smoke:installer:rollback","release:qualify:installers","release:qualify:production"])if(!pkg.scripts?.[script])throw new Error(`package script missing: ${script}`);
if(installer.includes("http://")||installer.includes("--insecure")||installer.includes("verify=false"))throw new Error("live installer harness introduces an insecure installer bypass");
console.log("CIEAV production qualification static checks passed: live signed install + real rollback + cross-platform aggregation + current HEAD/version binding");
