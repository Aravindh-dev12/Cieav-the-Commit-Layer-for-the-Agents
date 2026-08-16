import crypto from "node:crypto";
import {chmod,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {CommitCapabilitySchema,SignedCommitCapabilitySchema,type Commitment,type EffectProposal,type SignedCommitCapability} from "@cieav/contracts";
import {authorityKeyId,commitCapabilitySigningPayload,consequenceGraphDigest,effectProposalDigest,proofObligationDigest} from "@cieav/core";

type KeyFile={version:1;privateKeyPem:string;publicKeyPem:string;keyId:string};

export class CieavEffectAuthority{
  private key?:KeyFile;

  constructor(private readonly file:string){}

  private async load():Promise<KeyFile>{
    if(this.key)return this.key;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const raw=JSON.parse(await readFile(this.file,"utf8")) as KeyFile;
      if(raw?.version!==1||typeof raw.privateKeyPem!=="string"||typeof raw.publicKeyPem!=="string"||typeof raw.keyId!=="string")throw new Error("invalid authority key file");
      if(authorityKeyId(raw.publicKeyPem)!==raw.keyId)throw new Error("authority key id mismatch");
      const probe=Buffer.from("cieav-effect-authority-probe");
      const signature=crypto.sign(null,probe,crypto.createPrivateKey(raw.privateKeyPem));
      if(!crypto.verify(null,probe,crypto.createPublicKey(raw.publicKeyPem),signature))throw new Error("authority keypair mismatch");
      this.key=raw;
      return raw;
    }catch(err:any){
      if(err?.code!=="ENOENT")throw new Error(`CIEAV effect authority key is unreadable or invalid: ${String(err?.message??err)}`);
    }

    const pair=crypto.generateKeyPairSync("ed25519");
    const privateKeyPem=pair.privateKey.export({format:"pem",type:"pkcs8"}).toString();
    const publicKeyPem=pair.publicKey.export({format:"pem",type:"spki"}).toString();
    const value:KeyFile={version:1,privateKeyPem,publicKeyPem,keyId:authorityKeyId(publicKeyPem)};
    await writeFile(this.file,JSON.stringify(value,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
    try{await chmod(this.file,0o600)}catch{}
    this.key=value;
    return value;
  }

  async publicIdentity(){
    const key=await this.load();
    return{keyId:key.keyId,publicKeyPem:key.publicKeyPem};
  }

  async issue(commitment:Commitment,proposal:EffectProposal,ttlSeconds=90):Promise<SignedCommitCapability>{
    if(commitment.state!=="AUTHORIZED"&&commitment.state!=="RECOVERING")throw new Error("effect capability can only be issued for an authorized or recovering commitment");
    if(proposal.commitmentId!==commitment.id)throw new Error("effect proposal commitment mismatch");
    if(proposal.consequenceGraphDigest!==consequenceGraphDigest(commitment)||proposal.proofObligationDigest!==proofObligationDigest(commitment))throw new Error("effect proposal commitment digests do not match current commitment");

    const now=new Date();
    const ttl=Math.max(5,Math.min(300,ttlSeconds));
    const capability=CommitCapabilitySchema.parse({
      id:crypto.randomUUID(),
      commitmentId:commitment.id,
      principal:commitment.actor,
      consequenceGraphDigest:proposal.consequenceGraphDigest,
      proposalDigest:effectProposalDigest(proposal),
      proofObligationDigest:proposal.proofObligationDigest,
      allowedActionType:proposal.actionType,
      ...(proposal.target?{allowedTarget:proposal.target}:{}),
      maxRisk:commitment.risk,
      issuedAt:now.toISOString(),
      expiresAt:new Date(now.getTime()+ttl*1000).toISOString(),
      singleUse:true,
      nonce:crypto.randomBytes(24).toString("base64url")
    });
    const key=await this.load();
    const signature=crypto.sign(null,commitCapabilitySigningPayload(capability),crypto.createPrivateKey(key.privateKeyPem)).toString("base64url");
    return SignedCommitCapabilitySchema.parse({capability,signature,signatureAlgorithm:"ed25519",authorityKeyId:key.keyId});
  }
}
