import crypto from "node:crypto";
import {mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {loadDeviceReceiptSigner} from "./device-signing.js";

const dirs:string[]=[];
async function temp(){const d=await mkdtemp(path.join(os.tmpdir(),"cieav-signing-"));dirs.push(d);return d}
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true})});

describe("encrypted receipt signing identity",()=>{
  it("creates encrypted private material and preserves identity across restart",async()=>{
    const dir=await temp(),secret="s".repeat(64),first=await loadDeviceReceiptSigner(dir,secret);
    const encrypted=path.join(dir,"receipt-ed25519-private.enc.json"),legacy=path.join(dir,"receipt-ed25519-private.pem");
    const body=await readFile(encrypted,"utf8");expect(body).toContain('"AES-256-GCM"');expect(body).not.toContain("PRIVATE KEY");
    await expect(stat(legacy)).rejects.toMatchObject({code:"ENOENT"});
    const second=await loadDeviceReceiptSigner(dir,secret);expect(second.keyId).toBe(first.keyId);expect(second.publicKeyEncoded).toBe(first.publicKeyEncoded);
  });

  it("fails closed with the wrong wrapping secret",async()=>{
    const dir=await temp();await loadDeviceReceiptSigner(dir,"a".repeat(64));
    await expect(loadDeviceReceiptSigner(dir,"b".repeat(64))).rejects.toThrow();
  });

  it("migrates a legacy plaintext key only after encrypted verification",async()=>{
    const dir=await temp(),secret="m".repeat(64),pair=crypto.generateKeyPairSync("ed25519"),legacy=path.join(dir,"receipt-ed25519-private.pem");
    await writeFile(legacy,pair.privateKey.export({type:"pkcs8",format:"pem"}) as string,{mode:0o600});
    const expected=crypto.createHash("sha256").update(pair.publicKey.export({type:"spki",format:"der"}) as Buffer).digest("base64url");
    const signer=await loadDeviceReceiptSigner(dir,secret);expect(signer.keyId).toBe(`ed25519:${expected}`);
    await expect(stat(legacy)).rejects.toMatchObject({code:"ENOENT"});
    const envelope=JSON.parse(await readFile(path.join(dir,"receipt-ed25519-private.enc.json"),"utf8"));expect(envelope.algorithm).toBe("AES-256-GCM");
  });
});
