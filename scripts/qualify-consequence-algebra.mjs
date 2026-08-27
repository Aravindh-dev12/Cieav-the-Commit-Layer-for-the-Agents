#!/usr/bin/env node
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),REPORT_DIR=path.join(ROOT,"release","reports");
mkdirSync(REPORT_DIR,{recursive:true});
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);
const run=(name,cmd,args)=>{const started=Date.now();const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,env:process.env,maxBuffer:32*1024*1024});const result={name,command:[cmd,...args].join(" "),status:r.status??-1,durationMs:Date.now()-started,stdout:String(r.stdout??"").slice(-20000),stderr:String(r.stderr??"").slice(-20000)};process.stdout.write(result.stdout);process.stderr.write(result.stderr);return result};
const node=args=>run(args.join(" "),process.execPath,args),npm=args=>run(`npm ${args.join(" ")}`,process.platform==="win32"?"npm.cmd":"npm",args);
const git=(...args)=>{const r=spawnSync("git",args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.status!==0)throw new Error(`git ${args.join(" ")} failed`);return r.stdout.trim()};
const steps=[];
steps.push(node(["scripts/consequence-algebra-static.mjs"]));
steps.push(npm(["run","build:api"]));
steps.push(npm(["run","typecheck","-w","@cieav/contracts"]));
steps.push(npm(["run","typecheck","-w","@cieav/core"]));
steps.push(npm(["run","typecheck","-w","@cieav/api"]));
steps.push(npm(["run","test","-w","@cieav/core","--","consequence-algebra.test.ts"]));
steps.push(npm(["run","test","-w","@cieav/api","--","consequence-algebra-store.test.ts","consequence-algebra-tool.test.ts","execution-fabric-consequence-algebra.test.ts"]));
const failed=steps.filter(x=>x.status!==0),commit=git("rev-parse","HEAD"),branch=(()=>{try{return git("rev-parse","--abbrev-ref","HEAD")}catch{return"unknown"}})(),pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
const evidence={schemaVersion:1,product:"CIEAV",kind:"CONSEQUENCE_ALGEBRA_QUALIFICATION",verdict:failed.length?"FAIL":"PASS",createdAt:new Date().toISOString(),version:pkg.version,commit,branch,platform:{os:process.platform,release:os.release(),arch:process.arch,node:process.version,cpuCount:os.cpus().length},scope:{crossPlatformRunner:true,windowsCompatible:true,macosCompatible:true,linuxCompatible:true,actualPlatformQualified:process.platform,zeroAuthority:true,mandatoryExecutionFabricInterposition:true,routeIndependentSemanticIdentity:true,relationRules:true,invariantRules:true,persistentActiveGraph:true,proofabilityAdmission:true,causalFences:true,unknownQuarantine:true,cumulativeAntiFragmentation:true,tamperDetection:true,startupRecovery:true},steps:steps.map(({stdout,stderr,...x})=>({...x,stdoutDigest:crypto.createHash("sha256").update(stdout).digest("hex"),stderrDigest:crypto.createHash("sha256").update(stderr).digest("hex")})),failures:failed.map(x=>x.name),authority:false,mayMintExecutionAuthority:false};
const out={...evidence,digestAlgorithm:"SHA-256",digest:crypto.createHash("sha256").update(canonical(evidence)).digest("hex")};
writeFileSync(path.join(REPORT_DIR,"latest-consequence-algebra-qualification.json"),JSON.stringify(out,null,2)+"\n","utf8");
const text=["CIEAV Consequence Algebra Qualification","======================================",`Verdict: ${out.verdict}`,`Commit: ${commit}`,`Branch: ${branch}`,`Platform: ${process.platform}/${process.arch} ${os.release()}`,`Node: ${process.version}`,...steps.map(x=>`${x.status===0?"PASS":"FAIL"}  ${x.name} (${x.durationMs}ms)`),"",`CONSEQUENCE ALGEBRA QUALIFICATION: ${out.verdict}`].join("\n")+"\n";
writeFileSync(path.join(REPORT_DIR,"latest-consequence-algebra-qualification.txt"),text,"utf8");console.log(text);if(failed.length)process.exitCode=1;
