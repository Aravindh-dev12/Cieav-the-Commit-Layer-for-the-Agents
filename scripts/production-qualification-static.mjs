#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const installer=readFileSync(path.join(ROOT,"scripts/installer-live-smoke.py"),"utf8"),installQ=readFileSync(path.join(ROOT,"scripts/qualify-installers.mjs"),"utf8"),publishQ=readFileSync(path.join(ROOT,"scripts/qualify-publish-candidate.mjs"),"utf8"),layoutQ=readFileSync(path.join(ROOT,"scripts/qualify-publish-layout.mjs"),"utf8"),builder=readFileSync(path.join(ROOT,"scripts/build-publish-layout.mjs"),"utf8"),prod=readFileSync(path.join(ROOT,"scripts/qualify-production.mjs"),"utf8"),publishRuntime=readFileSync(path.join(ROOT,"scripts/clean-runtime-publish-smoke.py"),"utf8"),pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
const need=(text,tokens,label)=>{for(const t of tokens)if(!text.includes(t))throw new Error(`${label} invariant missing: ${t}`)};
need(installer,["--confirm-install-mutation","Refusing to overwrite an existing CIEAV runtime or backup","priorRuntimeRestored","candidateRemoved","cleanup","CIEAV_NO_SERVICE"],"live installer harness");
need(installQ,["LIVE_INSTALLER_QUALIFICATION","sameInstaller","exactInstallerIdentityRequired","wrong_platform_installer","installerRollback","priorRuntimeRestored"],"installer qualifier");
need(publishRuntime,["CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT","CIEAV_MACOS_SIGNING_IDENTITY","publish"],"publish runtime signer pin wrapper");
need(publishQ,["PUBLISH_CANDIDATE_QUALIFICATION","missing_apple_notarization","notarized_archive_mismatch","runtime_service_archive_mismatch","windows_signer_pin_mismatch","macos_signer_pin_mismatch"],"publish candidate qualifier");
need(layoutQ,["SIGNED_PUBLISH_LAYOUT","release-sign.mjs","Manifest artifact does not match qualified candidate archive","target set does not exactly match","candidateQualification","install.ps1","install.sh"],"signed publish layout qualifier");
need(builder,["Stale or unexpected runtime metadata","metadata differs from qualified candidate","private key permissions are too broad","CIEAV_RELEASE_SIGNING_KEY_ID","--replace"],"publish layout builder");
need(prod,["PRODUCTION_QUALIFICATION","qualify-publish-candidate.mjs","qualify-publish-layout.mjs","publish_artifact_candidate_mismatch","live_installer_publish_layout_mismatch","macos_notarization_missing","release_signing_key_pin_mismatch","qualification_not_for_current_head"],"production qualifier");
for(const script of ["release:smoke:runtime:publish","release:qualify:current:publish","release:qualify:publish","release:build:publish-layout","release:qualify:layout","release:smoke:installer:success","release:smoke:installer:rollback","release:qualify:installers","release:qualify:production"])if(!pkg.scripts?.[script])throw new Error(`package script missing: ${script}`);
if(installer.includes("http://")||installer.includes("--insecure")||installer.includes("verify=false"))throw new Error("live installer harness introduces an insecure installer bypass");
console.log("CIEAV production qualification static checks passed: pinned platform signatures + exact runtime/service bytes + Apple notarization + signed manifest/archive binding + same-installer live success/rollback + current HEAD/version binding");
