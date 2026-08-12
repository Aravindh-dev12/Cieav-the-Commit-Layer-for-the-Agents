import crypto,{type KeyObject} from "node:crypto";
import {chmod,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

export interface DeviceReceiptSigner {
  kind:"ed25519";
  privateKey:KeyObject;
  publicKey:KeyObject;
  publicKeyEncoded:string;
  keyId:string;
  legacySecret:string;
}

const b64url=(value:Buffer)=>value.toString("base64url");
const publicDer=(key:KeyObject)=>key.export({type:"spki",format:"der"}) as Buffer;
const keyIdFor=(key:KeyObject)=>`ed25519:${crypto.createHash("sha256").update(publicDer(key)).digest("base64url")}`;
async function maybePrivate(file:string){try{return crypto.createPrivateKey(await readFile(file,"utf8"))}catch(err:any){if(err?.code==="ENOENT")return null;throw err}}
async function maybePublic(file:string){try{return crypto.createPublicKey(await readFile(file,"utf8"))}catch(err:any){if(err?.code==="ENOENT")return null;throw err}}

export async function loadDeviceReceiptSigner(stateDir:string,legacySecret:string):Promise<DeviceReceiptSigner>{
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const privateFile=path.join(stateDir,"receipt-ed25519-private.pem"),publicFile=path.join(stateDir,"receipt-ed25519-public.pem");
  let privateKey=await maybePrivate(privateFile),publicKey=await maybePublic(publicFile);
  if(!privateKey&&publicKey)throw new Error("CIEAV receipt signing identity is incomplete");
  if(!privateKey){
    const pair=crypto.generateKeyPairSync("ed25519");privateKey=pair.privateKey;publicKey=pair.publicKey;
    await writeFile(privateFile,privateKey.export({type:"pkcs8",format:"pem"}) as string,{encoding:"utf8",mode:0o600,flag:"wx"});
    await writeFile(publicFile,publicKey.export({type:"spki",format:"pem"}) as string,{encoding:"utf8",mode:0o644,flag:"wx"});
  }else if(!publicKey){
    publicKey=crypto.createPublicKey(privateKey);
    await writeFile(publicFile,publicKey.export({type:"spki",format:"pem"}) as string,{encoding:"utf8",mode:0o644,flag:"wx"});
  }
  try{await chmod(privateFile,0o600);await chmod(publicFile,0o644)}catch{}
  const derived=crypto.createPublicKey(privateKey),expected=publicDer(derived),actual=publicDer(publicKey);
  if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw new Error("CIEAV receipt signing identity files do not match");
  return{kind:"ed25519",privateKey,publicKey,publicKeyEncoded:b64url(actual),keyId:keyIdFor(publicKey),legacySecret};
}

export function publicKeyFromEncoded(value:string):KeyObject{return crypto.createPublicKey({key:Buffer.from(value,"base64url"),type:"spki",format:"der"})}
export function receiptKeyId(key:KeyObject):string{return keyIdFor(key)}
