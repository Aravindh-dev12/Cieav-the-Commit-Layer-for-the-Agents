#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),DIR=path.join(ROOT,"release","reports");
const run=script=>{const r=spawnSync(process.execPath,[path.join(ROOT,"scripts",script)],{cwd:ROOT,stdio:"inherit",shell:false,env:process.env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)};
run("qualify-release.mjs");run("qualify-installers.mjs");
const candidate=JSON.parse(readFileSync(path.join(DIR,"latest-qualification.json"),"utf8")),installer=JSON.parse(readFileSync(path.join(DIR,"latest-installer-qualification.json"),"utf8"));
const head=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",shell:false});if(head.status!==0)throw new Error("cannot resolve current Git commit");const commit=head.stdout.trim();
const pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
const reasons=[];if(candidate.verdict!=="PASS")reasons.push("candidate_qualification_not_pass");if(installer.verdict!=="PASS")reasons.push("installer_qualification_not_pass");if(candidate.commit!==installer.commit)reasons.push("candidate_installer_commit_mismatch");if(candidate.version!==installer.version)reasons.push("candidate_installer_version_mismatch");if(candidate.commit!==commit||installer.commit!==commit)reasons.push("qualification_not_for_current_head");if(candidate.version!==pkg.version||installer.version!==pkg.version)reasons.push("qualification_not_for_current_version");
const verdict=reasons.length?"FAIL":"PASS",out={schemaVersion:1,product:"CIEAV",kind:"PRODUCTION_QUALIFICATION",verdict,reasons,createdAt:new Date().toISOString(),version:pkg.version,commit,candidateQualification:"latest-qualification.json",installerQualification:"latest-installer-qualification.json"};writeFileSync(path.join(DIR,"latest-production-qualification.json"),JSON.stringify(out,null,2)+"\n","utf8");const text=["CIEAV Production Qualification","==============================",`Verdict: ${verdict}`,`Version: ${pkg.version}`,`Commit: ${commit}`,...reasons.map(x=>`FAIL  ${x}`),"",`PRODUCTION QUALIFICATION: ${verdict}`].join("\n")+"\n";writeFileSync(path.join(DIR,"latest-production-qualification.txt"),text,"utf8");console.log(text);if(verdict!=="PASS")process.exitCode=1;
