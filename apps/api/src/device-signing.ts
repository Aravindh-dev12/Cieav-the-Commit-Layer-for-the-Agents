import crypto,{type KeyObject} from "node:crypto";
import {chmod,mkdir,readFile,rename,unlink,writeFile} from "node:fs/promises";
import path from "node:path";

export interface DeviceReceiptSigner {
  kind:"ed25519";
  privateKey:KeyObject;
  publicKey:KeyObject;
  publicKeyEncoded:string;
  keyId:string;
  legacySecret:string;
}

type EncryptedPrivateKey={version:1;algorithm:"AES-256-GCM";kdf:"scrypt";salt:string;iv:string;tag:string;ciphertext:string};
const b64url=(value:Buffer)=>value.toString("base64url");
const publicDer=(key:KeyObject)=>key.export({type:"spki",format:"der"}) as Buffer;
const keyIdFor=(key:KeyObject)=>`ed25519:${crypto.createHash("sha256").update(publicDer(key)).digest("base64url")}`;
const deriveKey=(secret:string,salt:Buffer)=>crypto.scryptSync(secret,salt,32,{N:1<<15,r:8,p:1,maxmem:64*1024*1024});
function sealPrivatePem(pem:string,secret:string):EncryptedPrivateKey{if(secret.length<32)throw new Error("receipt wrapping secret is too weak");const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=deriveKey(secret,salt),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(Buffer.from("CIEAV receipt Ed25519 private key v1"));const ciphertext=Buffer.concat([cipher.update(pem,"utf8"),cipher.final()]),tag=cipher.getAuthTag();key.fill(0);return{version:1,algorithm:"AES-256-GCM",kdf:"scrypt",salt:salt.toString("base64"),iv:iv.toString("base64"),tag:tag.toString("base64"),ciphertext:ciphertext.toString("base64")}}
function openPrivatePem(value:EncryptedPrivateKey,secret:string):string{if(value?.version!==1||value.algorithm!=="AES-256-GCM"||value.kdf!=="scrypt")throw new Error("unsupported CIEAV receipt private-key envelope");const salt=Buffer.from(value.salt,"base64"),iv=Buffer.from(value.iv,"base64"),tag=Buffer.from(value.tag,"base64"),ciphertext=Buffer.from(value.ciphertext,"base64");if(salt.length!==16||iv.length!==12||tag.length!==16||!ciphertext.length)throw new Error("invalid CIEAV receipt private-key envelope");const key=deriveKey(secret,salt),decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(Buffer.from("CIEAV receipt Ed25519 private key v1"));decipher.setAuthTag(tag);try{return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString("utf8")}finally{key.fill(0)}}
async function maybeEncrypted(file:string,secret:string){try{const raw=JSON.parse(await readFile(file,"utf8")) as EncryptedPrivateKey;return crypto.createPrivateKey(openPrivatePem(raw,secret))}catch(err:any){if(err?.code==="ENOENT")return null;throw err}}
async function maybePrivate(file:string){try{return crypto.createPrivateKey(await readFile(file,"utf8"))}catch(err:any){if(err?.code==="ENOENT")return null;throw err}}
async function maybePublic(file:string){try{return crypto.createPublicKey(await readFile(file,"utf8"))}catch(err:any){if(err?.code==="ENOENT")return null;throw err}}
async function atomicEncryptedWrite(file:string,key:KeyObject,secret:string){const pem=key.export({type:"pkcs8",format:"pem"}) as string,body=JSON.stringify(sealPrivatePem(pem,secret),null,2)+"\n",tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,body,{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,file);try{await chmod(file,0o600)}catch{}const reopened=await maybeEncrypted(file,secret);if(!reopened)throw new Error("encrypted receipt private key could not be reopened");const expected=publicDer(crypto.createPublicKey(key)),actual=publicDer(crypto.createPublicKey(reopened));if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw new Error("encrypted receipt private-key verification failed")}

export async function loadDeviceReceiptSigner(stateDir:string,legacySecret:string):Promise<DeviceReceiptSigner>{
  if(legacySecret.length<32)throw new Error("CIEAV receipt wrapping secret is too weak");
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const encryptedFile=path.join(stateDir,"receipt-ed25519-private.enc.json"),legacyPrivateFile=path.join(stateDir,"receipt-ed25519-private.pem"),publicFile=path.join(stateDir,"receipt-ed25519-public.pem");
  let privateKey=await maybeEncrypted(encryptedFile,legacySecret),publicKey=await maybePublic(publicFile);
  if(!privateKey){
    const legacy=await maybePrivate(legacyPrivateFile);
    if(legacy){
      if(legacy.asymmetricKeyType!=="ed25519")throw new Error("legacy CIEAV receipt private key is not Ed25519");
      privateKey=legacy;await atomicEncryptedWrite(encryptedFile,privateKey,legacySecret);
      const check=await maybeEncrypted(encryptedFile,legacySecret);if(!check)throw new Error("receipt private-key migration verification failed");
      try{await unlink(legacyPrivateFile)}catch(err:any){if(err?.code!=="ENOENT")throw err}
    }
  }
  if(!privateKey){privateKey=crypto.generateKeyPairSync("ed25519").privateKey;await atomicEncryptedWrite(encryptedFile,privateKey,legacySecret)}
  if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("CIEAV receipt private key is not Ed25519");
  const derived=crypto.createPublicKey(privateKey);
  if(!publicKey){publicKey=derived;await writeFile(publicFile,publicKey.export({type:"spki",format:"pem"}) as string,{encoding:"utf8",mode:0o644,flag:"wx"})}
  try{await chmod(encryptedFile,0o600);await chmod(publicFile,0o644)}catch{}
  const expected=publicDer(derived),actual=publicDer(publicKey);
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw new Error("CIEAV receipt signing identity files do not match");
  return{kind:"ed25519",privateKey,publicKey,publicKeyEncoded:b64url(actual),keyId:keyIdFor(publicKey),legacySecret};
}

export function publicKeyFromEncoded(value:string):KeyObject{return crypto.createPublicKey({key:Buffer.from(value,"base64url"),type:"spki",format:"der"})}
export function receiptKeyId(key:KeyObject):string{return keyIdFor(key)}
export const DeviceSigningCrypto={sealPrivatePem,openPrivatePem};
