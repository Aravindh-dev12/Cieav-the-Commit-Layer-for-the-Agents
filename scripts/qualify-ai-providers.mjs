#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),live=process.argv.includes("--live"),requireQualified=process.argv.includes("--require-qualified");
const npm=process.platform==="win32"?(args)=>run("npm",process.env.ComSpec||"cmd.exe",["/d","/s","/c","npm.cmd",...args]):(args)=>run("npm","npm",args);
function run(name,cmd,args){const started=Date.now(),r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,windowsHide:true,maxBuffer:16*1024*1024}),error=r.error?`${r.error.name}:${r.error.message}${r.error.code?` (${r.error.code})`:""}`:"",ok=!r.error&&r.status===0;return{name,ok,status:r.status??(r.error?127:-1),durationMs:Date.now()-started,stdout:String(r.stdout??""),stderr:[String(r.stderr??""),error].filter(Boolean).join("\n")}}
function digest(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}
function git(args){const r=spawnSync("git",args,{cwd:ROOT,encoding:"utf8",shell:false,windowsHide:true});if(r.error||r.status!==0)throw new Error(`git ${args.join(" ")} failed: ${String(r.stderr??r.error?.message??"").trim()}`);return String(r.stdout).trim()}
const steps=[];for(const step of [()=>npm(["run","build:api"]),()=>npm(["run","test:providers"])]){const result=step();steps.push(result);process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(!result.ok)break}
const commit=git(["rev-parse","HEAD"]),branch=git(["branch","--show-current"]),report={version:"CIEAV_AI_PROVIDER_QUALIFICATION_V1",commit,branch,platform:process.platform,arch:process.arch,node:process.version,mode:live?"LIVE":"OFFLINE",requireQualified,startedAt:new Date().toISOString(),steps:steps.map(({stdout,stderr,...s})=>({...s,stdoutDigest:digest(stdout),stderrDigest:digest(stderr)})),providerReport:null,authority:false,mayMintExecutionAuthority:false,executionAuthorityIssued:false,verdict:"FAIL"};
let failure=steps.find(x=>!x.ok)?.name;
if(!failure){
  const {loadOptionalEnvFile}=await import(pathToUrl(path.join(ROOT,"apps/api/dist/env-file.js")));loadOptionalEnvFile();
  const {loadAIProviderRegistry}=await import(pathToUrl(path.join(ROOT,"apps/api/dist/model/provider-registry.js"))),{checkConfiguredProviderModels}=await import(pathToUrl(path.join(ROOT,"apps/api/dist/model/provider-discovery.js")));
  const registry=loadAIProviderRegistry(process.env.CIEAV_STATE_DIR?path.resolve(process.env.CIEAV_STATE_DIR):undefined),enabled=[...registry.providers.values()].filter(p=>p.enabled);
  if(live){if(!enabled.length)failure="no_enabled_ai_provider";else{const discovered=await checkConfiguredProviderModels(registry);report.providerReport=discovered;if(discovered.errors.length)failure=`provider_discovery_failed:${discovered.errors.map(x=>x.provider).join(",")}`;const primaryChecks=discovered.checks.filter(x=>x.role==="primary"),missing=primaryChecks.filter(x=>!x.available);if(!failure&&missing.length)failure=`configured_model_missing:${missing.map(x=>`${x.provider}:${x.model}`).join(",")}`;if(!failure&&requireQualified){if(!registry.requireQualifiedModels)failure="qualified_model_enforcement_disabled";else{const unqualified=discovered.checks.filter(x=>(x.role==="primary"||x.role==="verifier")&&!x.qualified);if(unqualified.length)failure=`unqualified_model:${unqualified.map(x=>`${x.provider}:${x.role}:${x.model}`).join(",")}`}}}}
  else report.providerReport={version:"CIEAV_PROVIDER_DISCOVERY_REPORT_V1",discoveries:[],checks:[],errors:[],offline:true,enabledProviders:enabled.map(p=>p.id),authority:false};
}
report.verdict=failure?"FAIL":"PASS";report.completedAt=new Date().toISOString();if(failure)report.failure=failure;const unsigned={...report},finalDigest=digest(unsigned);report.digest=finalDigest;const dir=path.join(ROOT,"release/reports");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"latest-ai-provider-qualification.json"),JSON.stringify(report,null,2)+"\n");fs.writeFileSync(path.join(dir,"latest-ai-provider-qualification.txt"),`CIEAV AI Provider Qualification\nVerdict: ${report.verdict}\nCommit: ${commit}\nBranch: ${branch}\nMode: ${report.mode}\nRequire qualified: ${requireQualified}\nDigest: ${finalDigest}\n${failure?`Failure: ${failure}\n`:""}`);console.log(`CIEAV AI provider qualification: ${report.verdict}`);console.log(`Commit: ${commit}`);console.log(`Mode: ${report.mode}`);console.log(`Receipt: ${path.join(dir,"latest-ai-provider-qualification.json")}`);if(failure)process.exit(1);
function pathToUrl(file){return new URL(`file://${process.platform==="win32"?"/":""}${file.replaceAll("\\","/")}`).href}
