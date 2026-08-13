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
const b64urlBytes=s=>Buffer.from(String(s).replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-String(s).length%4)%4),"base64");
const safeFile=p=>{const b=path.basename(p);if(!b||b!==p&&p.includes(".."))throw new Error(`unsafe release path: ${p}`);return b};
async function mode600(file){try{await chmod(file,0o600)}catch{}}
async function loadPublic(file){const key=crypto.createPublicKey(await readFile(file,"utf8"));if(key.asymmetricKeyType!=="rsa")throw new Error("release public key must be RSA");return key}
async function loadPrivate(file){const key=crypto.createPrivateKey(await readFile(file,"utf8"));if(key.asymmetricKeyType!=="rsa")throw new Error("release private key must be RSA");return key}

function publicParams(publicKey){
  const jwk=publicKey.export({format:"jwk"});if(!jwk.n||!jwk.e)throw new Error("RSA public key parameters unavailable");
  return{algorithm:"RSA-SHA256",keyId:keyId(publicKey),modulus:b64(b64urlBytes(jwk.n)),exponent:b64(b64urlBytes(jwk.e)),publicKeyPemBase64:b64(publicKey.export({type:"spki",format:"pem"}))};
}

async function generate(){
  if(!privateKeyPath||!publicKeyPath)throw new Error("generate requires --private-key and --public-key");
  for(const p of [privateKeyPath,publicKeyPath]){try{await stat(p);throw new Error(`refusing to overwrite existing key: ${p}`)}catch(e){if(e?.code!=="ENOENT")throw e}}
  const {privateKey,publicKey}=crypto.generateKeyPairSync("rsa",{modulusLength:3072,publicExponent:0x10001});
  await mkdir(path.dirname(path.resolve(privateKeyPath)),{recursive:true});await mkdir(path.dirname(path.resolve(publicKeyPath)),{recursive:true});
  await writeFile(privateKeyPath,privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600});await mode600(privateKeyPath);
  await writeFile(publicKeyPath,publicKey.export({type:"spki",format:"pem"}));
  console.log(JSON.stringify({ok:true,...publicParams(publicKey),privateKey:privateKeyPath,publicKey:publicKeyPath},null,2));
}

async function params(){if(!publicKeyPath)throw new Error("params requires --public-key");console.log(JSON.stringify({ok:true,...publicParams(await loadPublic(publicKeyPath))},null,2))}

async function sign(){
  if(!privateKeyPath||!publicKeyPath||!outputDir||!files.length)throw new Error("sign requires --private-key --public-key --output-dir and one or more files");
  const privateKey=await loadPrivate(privateKeyPath),publicKey=await loadPublic(publicKeyPath),derived=crypto.createPublicKey(privateKey);
  if(keyId(derived)!==keyId(publicKey))throw new Error("release private/public key mismatch");
  await mkdir(outputDir,{recursive:true});const id=keyId(publicKey),signed=[];
  for(const file of files){const bytes=await readFile(file),name=safeFile(path.basename(file)),signature=crypto.sign("sha256",bytes,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING}),envelope={schemaVersion:2,product:"CIEAV",algorithm:"RSA-SHA256",keyId:id,file:name,sha256:sha256(bytes),signature:b64(signature)};const out=path.join(outputDir,`${name}.sig.json`);await writeFile(out,JSON.stringify(envelope,null,2)+"\n","utf8");signed.push({file:name,signature:path.basename(out),sha256:envelope.sha256})}
  console.log(JSON.stringify({ok:true,algorithm:"RSA-SHA256",keyId:id,signed},null,2));
}

async function verify(){
  if(!publicKeyPath||!files.length)throw new Error("verify requires --public-key and one or more files");
  const publicKey=await loadPublic(publicKeyPath),id=keyId(publicKey),verified=[];
  for(const file of files){const bytes=await readFile(file),name=path.basename(file),sigPath=outputDir?path.join(outputDir,`${name}.sig.json`):`${file}.sig.json`,envelope=JSON.parse(await readFile(sigPath,"utf8"));if(envelope?.schemaVersion!==2||envelope?.product!=="CIEAV"||envelope?.algorithm!=="RSA-SHA256"||envelope?.file!==name)throw new Error(`invalid signature envelope for ${name}`);if(envelope.keyId!==id)throw new Error(`release key mismatch for ${name}`);if(envelope.sha256!==sha256(bytes))throw new Error(`release digest mismatch for ${name}`);let signature;try{signature=Buffer.from(envelope.signature,"base64")}catch{throw new Error(`invalid release signature encoding for ${name}`)}if(!crypto.verify("sha256",bytes,{key:publicKey,padding:crypto.constants.RSA_PKCS1_PADDING},signature))throw new Error(`release signature verification failed for ${name}`);verified.push({file:name,sha256:envelope.sha256})}
  console.log(JSON.stringify({ok:true,algorithm:"RSA-SHA256",keyId:id,verified},null,2));
}

try{if(command==="generate")await generate();else if(command==="params")await params();else if(command==="sign")await sign();else if(command==="verify")await verify();else throw new Error("usage: release-sign.mjs generate|params|sign|verify [options] files...")}catch(err){console.error(`CIEAV release signing failed: ${err?.message??err}`);process.exitCode=1}
