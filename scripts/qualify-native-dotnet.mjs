#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const BUILD=path.join(ROOT,".cieav",`native-build-${process.platform}-${process.arch}`);
const REPORT_DIR=path.join(ROOT,"release","reports");
const reportJson=path.join(REPORT_DIR,"latest-native-dotnet-qualification.json");
const reportText=path.join(REPORT_DIR,"latest-native-dotnet-qualification.txt");
const digest=v=>crypto.createHash("sha256").update(typeof v==="string"?v:JSON.stringify(v)).digest("hex");
function run(name,cmd,args){const started=Date.now(),r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,windowsHide:true,maxBuffer:32*1024*1024}),err=r.error?`${r.error.name}:${r.error.message}${r.error.code?` (${r.error.code})`:"":null;return{name,ok:!r.error&&r.status===0,status:r.status??(r.error?127:-1),durationMs:Date.now()-started,stdout:String(r.stdout??""),stderr:[String(r.stderr??""),err].filter(Boolean).join("\n")}}
function git(args){const r=run(`git ${args.join(" ")}`,"git",args);if(!r.ok)throw new Error(r.stderr||r.stdout);return r.stdout.trim()}
function version(cmd,args){const r=run(`${cmd} version`,cmd,args);return r.ok?(r.stdout||r.stderr).trim().split(/\r?\n/)[0]:null}

fs.mkdirSync(BUILD,{recursive:true});fs.mkdirSync(REPORT_DIR,{recursive:true});
const steps=[];
const commands=[
  ["configure native C/C++ ABI","cmake",["-S","native","-B",BUILD,"-DCMAKE_BUILD_TYPE=Release","-DCIEAV_NATIVE_BUILD_SHARED=ON","-DCIEAV_NATIVE_BUILD_TESTS=ON"]],
  ["build native C/C++ ABI","cmake",["--build",BUILD,"--config","Release","--parallel"]],
  ["test native C/C++ ABI","ctest",["--test-dir",BUILD,"-C","Release","--output-on-failure"]],
  ["build .NET 10 platform host","dotnet",["build","dotnet/Cieav.Platform/Cieav.Platform.csproj","-c","Release","--nologo"]],
  ["selftest .NET 10 platform host","dotnet",["run","--project","dotnet/Cieav.Platform/Cieav.Platform.csproj","-c","Release","--no-build","--","selftest"]]
];
let failure=null;
for(const [name,cmd,args] of commands){const result=run(name,cmd,args);steps.push(result);process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(!result.ok){failure=name;break}}
const commit=git(["rev-parse","HEAD"]),branch=git(["branch","--show-current"]);
const sanitizedSteps=steps.map(({stdout,stderr,...step})=>({...step,stdoutDigest:digest(stdout),stderrDigest:digest(stderr)}));
const report={version:"CIEAV_NATIVE_DOTNET_QUALIFICATION_V1",commit,branch,platform:process.platform,arch:process.arch,toolchain:{node:process.version,cmake:version("cmake",["--version"]),dotnet:version("dotnet",["--version"]),cc:process.env.CC??null,cxx:process.env.CXX??null},steps:sanitizedSteps,authority:false,mayMintExecutionAuthority:false,executionAuthorityIssued:false,verdict:failure?"FAIL":"PASS",completedAt:new Date().toISOString()};if(failure)report.failure=failure;report.digest=digest(report);
fs.writeFileSync(reportJson,JSON.stringify(report,null,2)+"\n");fs.writeFileSync(reportText,`CIEAV Native + .NET Qualification\nVerdict: ${report.verdict}\nCommit: ${commit}\nBranch: ${branch}\nPlatform: ${process.platform}/${process.arch}\n.NET: ${report.toolchain.dotnet??"unavailable"}\nCMake: ${report.toolchain.cmake??"unavailable"}\nDigest: ${report.digest}\n${failure?`Failure: ${failure}\n`:""}`);
console.log(`CIEAV native + .NET qualification: ${report.verdict}`);console.log(`Commit: ${commit}`);console.log(`Receipt: ${reportJson}`);if(failure)process.exit(1);
