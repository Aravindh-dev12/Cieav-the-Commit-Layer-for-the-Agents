#!/usr/bin/env node
import crypto from "node:crypto";
import {chmod,mkdir,readFile,writeFile,stat} from "node:fs/promises";
import path from "node:path";

const args=process.argv.slice(2),command=args.shift();
const flag=name=>{const i=args.indexOf(name);if(i<0)return null;const v=args[i+1];args.splice(i,2);return v};
const privateKeyPath=flag("--private-key"),publicKeyPath=flag("--public-key"),outputDir=flag("--output-dir");
const files=args.filter(x=>!x.startsWith("--"));
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const b64=b=>Buffer.from(b).toString("base64");
const keyId=key=>sha256(key.export({type:"spki",format:"der"}));
const safeFile=p=>{const b=path.basename(p);if(!b||b!==p&&p.includes(".."))throw new Error(`unsafe release path: ${p}`);return b};
async function mode600(file){try{await chmod(file,0o600)}catch{}}

async function generate(){
  if(!privateKeyPath||!publicKeyPath)throw new Error("generate requires --private-key and --public-key");
  for(const p of [privateKeyPath,publicKeyPath]){try{await stat(p);throw new Error(`refusing to overwrite existing key: ${p}`)}catch(e){if(e?.code!=="ENOENT")throw e}}
  const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
  await mkdir(path.dirname(path.resolve(privateKeyPath)),{recursive:true});await mkdir(path.dirname(path.resolve(publicKeyPath)),{recursive:true});
  await writeFile(privateKeyPath,privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});await mode600(privateKeyPath);
  await writeFile(publicKeyPath,publicKey.export({type:"spki",format:"pem"}));
  console.log(JSON.stringify({ok:true,algorithm:"Ed25519",keyId:keyId(publicKey),privateKey:privateKeyPath,publicKey:publicKeyPath},null,2));
}

async function loadPublic(file){return crypto.createPublicKey(await readFile(file,"utf8"))}
async function loadPrivate(file){return crypto.createPrivateKey(await readFile(file,"utf8"))}

async function sign(){
  if(!privateKeyPath||!publicKeyPath||!outputDir||!files.length)throw new Error("sign requires --private-key --public-key --output-dir and one or more files");
  const privateKey=await loadPrivate(privateKeyPath),publicKey=await loadPublic(publicKeyPath),derived=crypto.createPublicKey(privateKey);
  if(keyId(derived)!==keyId(publicKey))throw new Error("release private/public key mismatch");
  await mkdir(outputDir,{recursive:true});const id=keyId(publicKey),signed=[];
  for(const file of files){const bytes=await readFile(file),name=safeFile(path.basename(file)),signature=crypto.sign(null,bytes,privateKey),envelope={schemaVersion:1,product:"CIEAV",algorithm:"Ed25519",keyId:id,file:name,sha256:sha256(bytes),signature:b64(signature)};const out=path.join(outputDir,`${name}.sig.json`);await writeFile(out,JSON.stringify(envelope,null,2)+"\n","utf8");signed.push({file:name,signature:path.basename(out),sha256:envelope.sha256})}
  console.log(JSON.stringify({ok:true,algorithm:"Ed25519",keyId:id,signed},null,2));
}

async function verify(){
  if(!publicKeyPath||!files.length)throw new Error("verify requires --public-key and one or more files");
  const publicKey=await loadPublic(publicKeyPath),id=keyId(publicKey),verified=[];
  for(const file of files){const bytes=await readFile(file),name=path.basename(file),sigPath=outputDir?path.join(outputDir,`${name}.sig.json`):`${file}.sig.json`,envelope=JSON.parse(await readFile(sigPath,"utf8"));if(envelope?.schemaVersion!==1||envelope?.product!=="CIEAV"||envelope?.algorithm!=="Ed25519"||envelope?.file!==name)throw new Error(`invalid signature envelope for ${name}`);if(envelope.keyId!==id)throw new Error(`release key mismatch for ${name}`);if(envelope.sha256!==sha256(bytes))throw new Error(`release digest mismatch for ${name}`);let signature;try{signature=Buffer.from(envelope.signature,"base64")}catch{throw new Error(`invalid release signature encoding for ${name}`)}if(!crypto.verify(null,bytes,publicKey,signature))throw new Error(`release signature verification failed for ${name}`);verified.push({file:name,sha256:envelope.sha256})}
  console.log(JSON.stringify({ok:true,algorithm:"Ed25519",keyId:id,verified},null,2));
}

try{if(command==="generate")await generate();else if(command==="sign")await sign();else if(command==="verify")await verify();else throw new Error("usage: release-sign.mjs generate|sign|verify [options] files...")}catch(err){console.error(`CIEAV release signing failed: ${err?.message??err}`);process.exitCode=1}
