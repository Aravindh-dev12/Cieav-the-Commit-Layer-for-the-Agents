#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";

const b64url=b=>Buffer.from(b).toString("base64url");
const details=privateKey=>{const publicKey=crypto.createPublicKey(privateKey),der=publicKey.export({type:"spki",format:"der"}),keyId=`ed25519:${crypto.createHash("sha256").update(der).digest("base64url")}`;return{algorithm:"Ed25519",privateKeyPemB64:Buffer.from(privateKey.export({type:"pkcs8",format:"pem"}),"utf8").toString("base64"),publicKeyPem:publicKey.export({type:"spki",format:"pem"}),publicKeyEncoded:b64url(der),keyId}};
try{
 const command=process.argv[2];let privateKey;
 if(command==="generate"){privateKey=crypto.generateKeyPairSync("ed25519").privateKey}
 else if(command==="validate-file"){const file=process.argv[3];if(!file)throw new Error("validate-file requires a path");privateKey=crypto.createPrivateKey(fs.readFileSync(file,"utf8"))}
 else if(command==="validate-b64"){const raw=process.argv[3];if(!raw)throw new Error("validate-b64 requires base64 PEM");privateKey=crypto.createPrivateKey(Buffer.from(raw,"base64").toString("utf8"))}
 else throw new Error("usage: device-receipt-key.mjs generate|validate-file <path>|validate-b64 <base64-pem>");
 if(privateKey.asymmetricKeyType!=="ed25519")throw new Error("receipt key must be Ed25519");
 process.stdout.write(JSON.stringify({ok:true,...details(privateKey)}));
}catch(err){console.error(`CIEAV receipt key helper failed: ${err?.message??err}`);process.exitCode=1}
