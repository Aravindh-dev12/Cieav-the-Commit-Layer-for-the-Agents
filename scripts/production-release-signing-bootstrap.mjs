#!/usr/bin/env node
import {readFileSync,mkdirSync,existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined},has=name=>process.argv.includes(name);
const run=(cmd,args,opts={})=>{const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:8*1024*1024,...opts});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed: ${String(r.stderr||r.stdout||"").trim().slice(-3000)}`);return String(r.stdout||"").trim()};
const output=path.resolve(arg("--output-dir")??path.join(os.homedir(),".cieav-production","release-signing")),rel=path.relative(ROOT,output);
if(rel===""||(!rel.startsWith(`..${path.sep}`)&&rel!==".."&&!path.isAbsolute(rel)))throw new Error("production release signing material must be generated outside the repository worktree");
const privateKey=path.join(output,"cieav-release-private.pem"),publicKey=path.join(output,"cieav-release-public.pem");
if(existsSync(privateKey)||existsSync(publicKey))throw new Error(`refusing to overwrite existing release signing material in ${output}`);
mkdirSync(output,{recursive:true});
const generated=JSON.parse(run(process.execPath,[path.join(ROOT,"scripts","release-sign.mjs"),"generate","--private-key",privateKey,"--public-key",publicKey]));
const params=JSON.parse(run(process.execPath,[path.join(ROOT,"scripts","release-sign.mjs"),"params","--public-key",publicKey]));
if(generated.keyId!==params.keyId||params.algorithm!=="RSA-SHA256"||!/^[a-f0-9]{64}$/.test(params.keyId))throw new Error("generated release signing identity failed self-verification");
const privateB64=readFileSync(privateKey).toString("base64"),publicB64=readFileSync(publicKey).toString("base64");
let repository=null,configured=false;
if(has("--configure-github")){
 repository=String(process.env.CIEAV_GITHUB_REPOSITORY||JSON.parse(run("gh",["repo","view","--json","nameWithOwner"])).nameWithOwner||"").trim();
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error("unable to resolve GitHub repository identity");
 run("gh",["variable","set","CIEAV_RELEASE_SIGNING_PUBLIC_KEY_B64","--repo",repository,"--body",publicB64]);
 run("gh",["variable","set","CIEAV_RELEASE_SIGNING_KEY_ID","--repo",repository,"--body",params.keyId]);
 run("gh",["secret","set","CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64","--repo",repository],{input:privateB64});
 configured=true;
}
console.log(JSON.stringify({schemaVersion:1,product:"CIEAV",kind:"PRODUCTION_RELEASE_SIGNING_BOOTSTRAP",authority:false,algorithm:params.algorithm,keyId:params.keyId,privateKeyPath:privateKey,publicKeyPath:publicKey,repository,configuredGitHub:configured,privateKeyPrinted:false,next:configured?"rerun npm run release:preflight:production":"review the key paths, back up the private key securely, then rerun with --configure-github to install the GitHub Actions secret/variables"},null,2));
