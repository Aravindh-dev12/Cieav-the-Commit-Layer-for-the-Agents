#!/usr/bin/env node
import crypto from "node:crypto";
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
const privateExists=existsSync(privateKey),publicExists=existsSync(publicKey);
if(privateExists!==publicExists)throw new Error(`incomplete existing release signing material in ${output}; both private and public keys are required`);
mkdirSync(output,{recursive:true});
let generatedNow=false;
if(!privateExists&&!publicExists){
 run(process.execPath,[path.join(ROOT,"scripts","release-sign.mjs"),"generate","--private-key",privateKey,"--public-key",publicKey]);
 generatedNow=true;
}
const privatePem=readFileSync(privateKey,"utf8"),publicPem=readFileSync(publicKey,"utf8");
let privateObject,publicObject;
try{privateObject=crypto.createPrivateKey(privatePem);publicObject=crypto.createPublicKey(publicPem)}catch(err){throw new Error(`release signing PEM parse failed: ${err?.message??err}`)}
if(privateObject.asymmetricKeyType!=="rsa"||publicObject.asymmetricKeyType!=="rsa")throw new Error("production release signing keys must be RSA");
const derivedPublic=crypto.createPublicKey(privateObject),keyIdFor=key=>crypto.createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex"),derivedId=keyIdFor(derivedPublic),publicId=keyIdFor(publicObject);
const params=JSON.parse(run(process.execPath,[path.join(ROOT,"scripts","release-sign.mjs"),"params","--public-key",publicKey]));
if(derivedId!==publicId||publicId!==params.keyId||params.algorithm!=="RSA-SHA256"||!/^[a-f0-9]{64}$/.test(params.keyId))throw new Error("release signing identity failed private/public self-verification");
let repository=null,configured=false;
if(has("--configure-github")){
 repository=String(process.env.CIEAV_GITHUB_REPOSITORY||JSON.parse(run("gh",["repo","view","--json","nameWithOwner"])).nameWithOwner||"").trim();
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error("unable to resolve GitHub repository identity");
 const publicB64=Buffer.from(publicPem,"utf8").toString("base64"),privateB64=Buffer.from(privatePem,"utf8").toString("base64");
 run("gh",["variable","set","CIEAV_RELEASE_SIGNING_PUBLIC_KEY_B64","--repo",repository,"--body",publicB64]);
 run("gh",["variable","set","CIEAV_RELEASE_SIGNING_KEY_ID","--repo",repository,"--body",params.keyId]);
 run("gh",["secret","set","CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64","--repo",repository],{input:privateB64});
 configured=true;
}
console.log(JSON.stringify({schemaVersion:2,product:"CIEAV",kind:"PRODUCTION_RELEASE_SIGNING_BOOTSTRAP",authority:false,algorithm:params.algorithm,keyId:params.keyId,privateKeyPath:privateKey,publicKeyPath:publicKey,generatedNow,reusedExisting:!generatedNow,repository,configuredGitHub:configured,privateKeyPrinted:false,next:configured?"rerun npm run release:preflight:production":generatedNow?"back up the private key securely, then rerun with --configure-github; the existing validated pair will be reused":"existing keypair validated; rerun with --configure-github to install the GitHub Actions secret/variables"},null,2));
