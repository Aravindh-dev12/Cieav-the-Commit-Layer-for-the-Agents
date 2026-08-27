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
const REQUIRED_DOTNET_MAJOR=10;
const digest=(value)=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");

function run(name,cmd,args,env=process.env){
  const started=Date.now();
  const result=spawnSync(cmd,args,{cwd:ROOT,env,encoding:"utf8",shell:false,windowsHide:true,maxBuffer:32*1024*1024});
  const errorText=result.error
    ? `${result.error.name}:${result.error.message}${result.error.code?` (${result.error.code})`:""}`
    : null;
  return {
    name,
    ok:!result.error&&result.status===0,
    status:result.status??(result.error?127:-1),
    durationMs:Date.now()-started,
    stdout:String(result.stdout??""),
    stderr:[String(result.stderr??""),errorText].filter(Boolean).join("\n")
  };
}

function git(args){
  const result=run(`git ${args.join(" ")}`,"git",args);
  if(!result.ok)throw new Error(result.stderr||result.stdout);
  return result.stdout.trim();
}

function version(cmd,args){
  const result=run(`${cmd} version`,cmd,args);
  return result.ok?(result.stdout||result.stderr).trim().split(/\r?\n/)[0]:null;
}

function findNativeLibrary(){
  const names=process.platform==="win32"
    ? ["cieav_native.dll"]
    : process.platform==="darwin"
      ? ["libcieav_native.dylib"]
      : ["libcieav_native.so"];
  const stack=[BUILD];
  while(stack.length){
    const dir=stack.pop();
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())stack.push(full);
      else if(names.includes(entry.name))return full;
    }
  }
  throw new Error(`built shared native library not found under ${BUILD}`);
}

function dotnetSdkPreflight(){
  const result=run("require .NET 10 SDK","dotnet",["--list-sdks"]);
  if(!result.ok)return result;
  const sdkLines=result.stdout.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  const hasRequired=sdkLines.some((line)=>new RegExp(`^${REQUIRED_DOTNET_MAJOR}\\.`).test(line));
  if(hasRequired)return result;
  const installed=sdkLines.length?sdkLines.join("\n"):"none";
  const installHint=process.platform==="win32"
    ? "Install with: winget install Microsoft.DotNet.SDK.10 --source winget"
    : "Install a supported .NET SDK 10.x before running this qualifier.";
  return {
    ...result,
    ok:false,
    status:2,
    stderr:`CIEAV native/.NET qualification requires .NET SDK 10.x. Installed SDKs:\n${installed}\n${installHint}`
  };
}

fs.mkdirSync(BUILD,{recursive:true});
fs.mkdirSync(REPORT_DIR,{recursive:true});
const steps=[];
let failure=null;
let nativeLibrary=null;
let installedDotnetSdks=[];

function record(result){
  steps.push(result);
  process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(`${result.stderr}${result.stderr.endsWith("\n")?"":"\n"}`);
  if(!result.ok)failure=result.name;
}

function step(name,cmd,args,env){
  if(failure)return;
  record(run(name,cmd,args,env));
}

step("configure native C/C++ ABI","cmake",["-S","native","-B",BUILD,"-DCMAKE_BUILD_TYPE=Release","-DCIEAV_NATIVE_BUILD_SHARED=ON","-DCIEAV_NATIVE_BUILD_TESTS=ON"]);
step("build native C/C++ ABI","cmake",["--build",BUILD,"--config","Release","--parallel"]);
step("test native C/C++ ABI","ctest",["--test-dir",BUILD,"-C","Release","--output-on-failure"]);

if(!failure){
  try{nativeLibrary=findNativeLibrary();}
  catch(error){
    failure="resolve built native shared library";
    steps.push({name:failure,ok:false,status:1,durationMs:0,stdout:"",stderr:String(error?.message??error)});
  }
}

if(!failure){
  const preflight=dotnetSdkPreflight();
  installedDotnetSdks=preflight.stdout.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  record(preflight);
}

step("build .NET 10 platform host","dotnet",["build","dotnet/Cieav.Platform/Cieav.Platform.csproj","-c","Release","--nologo"]);
const integratedEnv=nativeLibrary?{...process.env,CIEAV_NATIVE_LIBRARY:nativeLibrary}:process.env;
step("validate native ABI through .NET host","dotnet",["run","--project","dotnet/Cieav.Platform/Cieav.Platform.csproj","-c","Release","--no-build","--","native-health"],integratedEnv);
step("selftest authenticated .NET platform host with native ABI","dotnet",["run","--project","dotnet/Cieav.Platform/Cieav.Platform.csproj","-c","Release","--no-build","--","selftest"],integratedEnv);

const commit=git(["rev-parse","HEAD"]);
const branch=git(["branch","--show-current"]);
const sanitizedSteps=steps.map(({stdout,stderr,...summary})=>({...summary,stdoutDigest:digest(stdout),stderrDigest:digest(stderr)}));
const nativeLibraryDigest=nativeLibrary&&fs.existsSync(nativeLibrary)?digest(fs.readFileSync(nativeLibrary)):null;
const report={
  version:"CIEAV_NATIVE_DOTNET_QUALIFICATION_V1",
  commit,
  branch,
  platform:process.platform,
  arch:process.arch,
  requirements:{dotnetSdkMajor:REQUIRED_DOTNET_MAJOR},
  toolchain:{
    node:process.version,
    cmake:version("cmake",["--version"]),
    dotnet:version("dotnet",["--version"]),
    installedDotnetSdks,
    cc:process.env.CC??null,
    cxx:process.env.CXX??null
  },
  nativeLibrary:nativeLibrary?{file:path.basename(nativeLibrary),sha256:nativeLibraryDigest}:null,
  steps:sanitizedSteps,
  authority:false,
  mayMintExecutionAuthority:false,
  executionAuthorityIssued:false,
  verdict:failure?"FAIL":"PASS",
  completedAt:new Date().toISOString()
};
if(failure)report.failure=failure;
report.digest=digest(report);

fs.writeFileSync(reportJson,JSON.stringify(report,null,2)+"\n");
fs.writeFileSync(reportText,
  `CIEAV Native + .NET Qualification\n`+
  `Verdict: ${report.verdict}\n`+
  `Commit: ${commit}\n`+
  `Branch: ${branch}\n`+
  `Platform: ${process.platform}/${process.arch}\n`+
  `Required .NET SDK major: ${REQUIRED_DOTNET_MAJOR}\n`+
  `.NET: ${report.toolchain.dotnet??"unavailable"}\n`+
  `Installed .NET SDKs: ${installedDotnetSdks.length?installedDotnetSdks.join(", "):"none"}\n`+
  `CMake: ${report.toolchain.cmake??"unavailable"}\n`+
  `Native library SHA-256: ${nativeLibraryDigest??"unavailable"}\n`+
  `Digest: ${report.digest}\n`+
  (failure?`Failure: ${failure}\n`:"")
);

console.log(`CIEAV native + .NET qualification: ${report.verdict}`);
console.log(`Commit: ${commit}`);
console.log(`Receipt: ${reportJson}`);
if(failure)process.exit(1);
