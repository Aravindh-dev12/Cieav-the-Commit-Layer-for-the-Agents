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
  "Attach assets to GitHub Release"
];
for(const token of required)if(!workflow.includes(token))throw new Error(`release workflow invariant missing: ${token}`);
const publish=workflow.indexOf("publish-layout:"),qualify=workflow.indexOf("qualify-release:");
if(qualify<0||publish<0||qualify>publish)throw new Error("cross-platform qualification must be declared before publish-layout");
const publishBody=workflow.slice(publish);
if(!publishBody.includes("needs: [build-runtime, qualify-release]"))throw new Error("publish layout is not transitively gated on qualification");
if(publishBody.indexOf("npm run release:verify:publish")>publishBody.indexOf("Sign release metadata with offline trust root"))throw new Error("production preflight occurs after metadata signing");
if(publishBody.indexOf("Recheck qualification before signing metadata")>publishBody.indexOf("Sign release metadata with offline trust root"))throw new Error("qualification is not rechecked before release signing");
for(const forbidden of ["continue-on-error: true","force: true","--force-with-lease"]){if(publishBody.includes(forbidden))throw new Error(`release publication contains forbidden bypass: ${forbidden}`)}
console.log("CIEAV release workflow static checks passed: build → source gate → exact runtime/service evidence → qualification → production preflight → signed publish");
