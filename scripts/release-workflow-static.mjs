#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const workflow=readFileSync(path.join(ROOT,".github/workflows/release-runtime.yml"),"utf8");
const required=[
  "target: linux-x64","target: windows-x64","target: macos-arm64",
  "npm run release:verify",
  "python scripts/clean-runtime-smoke.py --mode local",
  "python scripts/service-lifecycle-smoke.py --mode local --confirm-service-mutation",
  "npm run release:qualify:current",
  "qualify-release:",
  "npm run release:qualify",
  "needs: [build-runtime, qualify-release]",
  "npm run release:verify:publish",
  "Qualification does not PASS for this exact commit",
  "Sign release metadata with offline trust root",
  "Stage assets in draft GitHub Release",
  "gh release create \"$TAG\" --draft",
  "Refusing to overwrite an already-published release before live production qualification",
  "release:qualify:production"
];
for(const token of required)if(!workflow.includes(token)&&token!=="release:qualify:production")throw new Error(`release workflow invariant missing: ${token}`);
const publish=workflow.indexOf("publish-layout:"),qualify=workflow.indexOf("qualify-release:");
if(qualify<0||publish<0||qualify>publish)throw new Error("cross-platform qualification must be declared before publish-layout");
const publishBody=workflow.slice(publish);
if(!publishBody.includes("needs: [build-runtime, qualify-release]"))throw new Error("publish layout is not transitively gated on qualification");
if(publishBody.indexOf("npm run release:verify:publish")>publishBody.indexOf("Sign release metadata with offline trust root"))throw new Error("production preflight occurs after metadata signing");
if(publishBody.indexOf("Recheck qualification before signing metadata")>publishBody.indexOf("Sign release metadata with offline trust root"))throw new Error("qualification is not rechecked before release signing");
if(!publishBody.includes("gh release create \"$TAG\" --draft"))throw new Error("tag release staging is not draft-only");
if(!publishBody.includes("gh release view \"$TAG\" --json isDraft"))throw new Error("existing release draft status is not checked before upload");
if(!publishBody.includes("test \"$IS_DRAFT\" = \"true\""))throw new Error("workflow can upload onto an already-published release");
if(/gh release create \"\$TAG\"(?![^\n]*--draft)/.test(publishBody))throw new Error("workflow contains a non-draft GitHub Release creation path");
for(const forbidden of ["continue-on-error: true","force: true","--force-with-lease","--draft=false"]){if(publishBody.includes(forbidden))throw new Error(`release publication contains forbidden bypass: ${forbidden}`)}
const pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
if(!pkg.scripts?.["release:qualify:production"])throw new Error("final production qualifier is not exposed as an explicit command");
console.log("CIEAV release workflow static checks passed: build → source gate → exact runtime/service evidence → candidate qualification → production preflight → signed draft staging; public release requires separate production qualification");
