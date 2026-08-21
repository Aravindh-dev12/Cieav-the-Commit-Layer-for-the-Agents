#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8").replace(/\r\n/g,"\n");
const fail=m=>{console.error(`CIEAV local live qualification static FAIL: ${m}`);process.exit(2)};
const ps=read("scripts/local-live-windows-qualification.ps1"),server=read("scripts/local-live-loopback-server.mjs"),ignore=read(".gitignore"),pkg=JSON.parse(read("package.json"));
const need=(s,tokens,label)=>{for(const t of tokens)if(!s.includes(t))fail(`${label} missing invariant: ${t}`)};
need(ps,["ConfirmLocalMutation","Assert-CleanSource","npm.cmd run release:verify","PyInstaller","New-SelfSignedCertificate -Type CodeSigningCert","Set-AuthenticodeSignature","build-release-runtime.py","clean-runtime-smoke.py","service-lifecycle-smoke.py","--confirm-service-mutation","release-sign.mjs generate","make-release-manifest.py","render-installers.py","installer-live-smoke.py --installer $Installer --scenario success --mode local --confirm-install-mutation","installer-live-smoke.py --installer $Installer --scenario rollback --mode local --confirm-install-mutation","LOCAL_LIVE_WINDOWS_QUALIFICATION","authority = $false","production = $false","Remove-TestCertificate","GitHub self-hosted runner provenance is not claimed"],"Windows local live harness");
need(server,["https.createServer","minVersion:\"TLSv1.2\"","localhost","/v1/devices/register","/v1/inference/analyze","privacy contract violation","--fail-cloud-after-artifact","cloudUnavailable=true"],"loopback HTTPS fixture");
if(!ignore.split("\n").includes(".tmp/"))fail(".tmp/ generated native build output must be ignored");
if(pkg.scripts?.["release:qualify:local-live:windows"]!=="powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-live-windows-qualification.ps1")fail("package command for Windows local live qualification is missing or changed");
for(const forbidden of ["release:preflight:production","CIEAV_WINDOWS_CODE_SIGN_PFX_B64","CIEAV_MACOS_DEVELOPER_ID_P12_B64","CIEAV_APPLE_NOTARY_KEY_B64"]){if(ps.includes(forbidden))fail(`local live harness must not depend on production credential/config boundary: ${forbidden}`)}
if(process.platform==="win32"){
  const script=path.join(ROOT,"scripts/local-live-windows-qualification.ps1").replace(/'/g,"''");
  const command=`$errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$null,[ref]$errors); if($errors.Count){$errors|ForEach-Object{Write-Error $_}; exit 2}`;
  const parsed=spawnSync("powershell",["-NoProfile","-ExecutionPolicy","Bypass","-Command",command],{cwd:ROOT,encoding:"utf8",shell:false});
  if(parsed.error||parsed.status!==0)fail(`PowerShell parser rejected local live harness: ${String(parsed.stderr||parsed.stdout||parsed.error||"").trim()}`);
}
console.log("CIEAV local live qualification static PASS - explicit mutation consent + PowerShell parse gate + ephemeral local trust + signed loopback HTTPS installer success/rollback + real packaged runtime/service lifecycle + production=false evidence enforced");
