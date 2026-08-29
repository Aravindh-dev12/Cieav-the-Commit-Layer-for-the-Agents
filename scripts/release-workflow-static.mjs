#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(relativePath)=>readFileSync(path.join(ROOT,relativePath),"utf8");
const workflow=read(".github/workflows/release-runtime.yml");

const required=["target: linux-x64","target: windows-x64","target: macos-arm64","npm run release:verify:publish","python scripts/clean-runtime-publish-smoke.py","python scripts/service-lifecycle-smoke.py --mode publish --confirm-service-mutation","python scripts/notarize-runtime.py --mode publish","node scripts/qualify-publish-candidate.mjs --require","qualify-release:","npm run release:qualify:publish","needs: [build-runtime, qualify-release]","node scripts/build-publish-layout.mjs --replace","latest-publish-layout.json","Stage assets in draft GitHub Release","gh release create \"$TAG\" --draft","Refusing to overwrite an already-published release before live production qualification","pyinstaller --noconfirm --clean --onefile --name cieav --paths python python/cieav_platform/__main__.py","id-token: write","attestations: write","actions/attest@v4","Attest qualified runtime build provenance","subject-path: 'release-out/cieav-runtime-*.zip'","CIEAV_WINDOWS_SIGNING_PROVIDER","CIEAV_WINDOWS_CODE_SIGN_SUBJECT","azure/login@v3","azure/artifact-signing-action@v2","scripts/sign-windows-release.ps1","Provider artifact-signing","Provider store","Provider pfx","/Fo:dist\\cdp-win-bridge.obj"];
for(const t of required)if(!workflow.includes(t))throw new Error(`release workflow invariant missing: ${t}`);
for(const bad of ["python scripts/clean-runtime-smoke.py --mode local","python scripts/service-lifecycle-smoke.py --mode local","continue-on-error: true","force: true","--draft=false","python/latch_platform/__main__.py"])if(workflow.includes(bad))throw new Error(`release workflow contains forbidden legacy/bypass path: ${bad}`);
const q=workflow.indexOf("qualify-release:"),p=workflow.indexOf("publish-layout:");
if(q<0||p<0||q>p)throw new Error("publish candidate qualification must precede publish-layout");
const build=workflow.slice(workflow.indexOf("build-runtime:"),q),pub=workflow.slice(p);
if(build.indexOf("npm run release:verify:publish")>build.indexOf("Assemble fully-gated runtime archive"))throw new Error("publish gate occurs after runtime assembly");
if(build.indexOf("Publish-mode clean extracted runtime smoke")>build.indexOf("Publish-mode OS service lifecycle smoke"))throw new Error("service lifecycle runs before extracted runtime verification");
if(build.indexOf("Verify managed Windows signatures and bind release thumbprint")>build.indexOf("Assemble fully-gated runtime archive"))throw new Error("managed Windows signature verification occurs after runtime assembly");
if(!build.includes("Notarize exact macOS runtime archive")||build.indexOf("Notarize exact macOS runtime archive")>build.indexOf("Qualify current publish target"))throw new Error("macOS notarization is not bound before target qualification");
const qualify=build.indexOf("Qualify current publish target"),attest=build.indexOf("Attest qualified runtime build provenance"),upload=build.indexOf("uses: actions/upload-artifact@v4");
if(attest<0||attest<qualify||upload<attest)throw new Error("release provenance attestation must occur after target qualification and before artifact upload");
if(!pub.includes("needs: [build-runtime, qualify-release]")||!pub.includes("node scripts/build-publish-layout.mjs --replace"))throw new Error("publish layout is not gated/bound to candidates");
if(!pub.includes("gh release view \"$TAG\" --json isDraft")||!pub.includes("test \"$IS_DRAFT\" = \"true\""))throw new Error("draft status is not checked before upload");
if(/gh release create "\$TAG"(?![^\n]*--draft)/.test(pub))throw new Error("workflow contains a non-draft GitHub Release creation path");

const qualificationWorkflows=[
  [".github/workflows/consequence-algebra-qualification.yml",true],
  [".github/workflows/authority-state-qualification.yml",true],
  [".github/workflows/authority-transaction-qualification.yml",true],
  [".github/workflows/managed-learning-qualification.yml",true],
  [".github/workflows/ai-provider-runtime-qualification.yml",true],
  [".github/workflows/native-dotnet-qualification.yml",false]
];
for(const [relativePath,usesNpmCi] of qualificationWorkflows){
  const candidate=read(relativePath);
  if(candidate.includes("tmp-consequence-algebra-build"))throw new Error(`${relativePath} still targets retired temporary branch`);
  if(!/push:\s*\n\s*branches:\s*\n\s*- main(?:\s|$)/m.test(candidate))throw new Error(`${relativePath} must protect pushes to main`);
  if(!candidate.includes(relativePath))throw new Error(`${relativePath} must trigger when its own workflow definition changes`);
  if(usesNpmCi&&candidate.includes("npm ci")&&!candidate.includes("package-lock.json"))throw new Error(`${relativePath} runs npm ci without watching package-lock.json`);
}

const authorityStateWorkflow=read(".github/workflows/authority-state-qualification.yml");
for(const requiredPath of ["apps/api/src/authority-cluster-sqlserver*.ts","apps/api/src/authority-sqlserver-candidate-runtime.ts","apps/api/src/authority-trusted-state-sqlserver*.ts","apps/api/package.json","package-lock.json"]){
  if(!authorityStateWorkflow.includes(requiredPath))throw new Error(`authority-state workflow does not cover SQL authority dependency: ${requiredPath}`);
}

console.log("CIEAV release workflow static checks passed: canonical CIEAV entrypoint -> publish gate on every OS -> managed/PFX/store Windows signing -> exact signer binding -> service lifecycle -> macOS notarization -> cross-platform qualification -> GitHub build provenance attestation -> exact signed publish layout -> draft-only staging; milestone qualification workflows protect main with dependency-sensitive path coverage");
