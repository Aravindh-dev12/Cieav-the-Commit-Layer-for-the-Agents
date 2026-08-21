import crypto from "node:crypto";

export const TPM_GENERATED_VALUE=0xff544347;
export const TPM_ST_ATTEST_CERTIFY=0x8017;
export const TPM_ST_ATTEST_QUOTE=0x8018;
export const TPM_ALG_SHA1=0x0004;
export const TPM_ALG_SHA256=0x000b;
export const TPM_ALG_SHA384=0x000c;
export const TPM_ALG_SHA512=0x000d;

const MAX_ATTEST_BYTES=128*1024;
const MAX_NAME_BYTES=128;
const MAX_EXTRA_DATA_BYTES=1024;
const MAX_PCR_BANKS=16;
const MAX_PCR_SELECT_BYTES=4;
const HASHES=new Map<number,{name:"sha1"|"sha256"|"sha384"|"sha512";bytes:number}>([
  [TPM_ALG_SHA1,{name:"sha1",bytes:20}],
  [TPM_ALG_SHA256,{name:"sha256",bytes:32}],
  [TPM_ALG_SHA384,{name:"sha384",bytes:48}],
  [TPM_ALG_SHA512,{name:"sha512",bytes:64}]
]);

export type LinuxTpm2PcrSelection={hashAlgorithm:number;select:Buffer;selectedPcrs:readonly number[]};
export type LinuxTpm2AttestCommon={format:"TPMS_ATTEST"|"TPM2B_ATTEST";signedData:Buffer;magic:number;qualifiedSigner:Buffer;extraData:Buffer;clock:bigint;resetCount:number;restartCount:number;safe:boolean;firmwareVersion:bigint};
export type LinuxTpm2QuoteAttest=LinuxTpm2AttestCommon&{type:"QUOTE";attestType:typeof TPM_ST_ATTEST_QUOTE;pcrSelections:readonly LinuxTpm2PcrSelection[];pcrDigest:Buffer};
export type LinuxTpm2CertifyAttest=LinuxTpm2AttestCommon&{type:"CERTIFY";attestType:typeof TPM_ST_ATTEST_CERTIFY;name:Buffer;qualifiedName:Buffer};
export type LinuxTpm2Attest=LinuxTpm2QuoteAttest|LinuxTpm2CertifyAttest;

function fail(code:string):never{throw new Error(`linux_tpm2_${code}`)}
class Reader{
  private offset=0;
  constructor(private readonly raw:Buffer){}
  remaining(){return this.raw.length-this.offset}
  done(){return this.offset===this.raw.length}
  private take(length:number,code:string){if(!Number.isSafeInteger(length)||length<0||length>this.remaining())fail(code);const out=this.raw.subarray(this.offset,this.offset+length);this.offset+=length;return out}
  u8(code:string){return this.take(1,code)[0]!}
  u16(code:string){return this.take(2,code).readUInt16BE(0)}
  u32(code:string){return this.take(4,code).readUInt32BE(0)}
  u64(code:string){return this.take(8,code).readBigUInt64BE(0)}
  bytes(length:number,code:string){return Buffer.from(this.take(length,code))}
  sized(max:number,code:string){const length=this.u16(`${code}_size`);if(length>max)fail(`${code}_too_large`);return this.bytes(length,`${code}_bounds`)}
}
function safeEqual(a:Buffer,b:Buffer){return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function hashInfo(algorithm:number){const info=HASHES.get(algorithm);if(!info)fail("unsupported_hash_algorithm");return info}
function unwrapAttest(raw:Buffer){
  if(!Buffer.isBuffer(raw)||raw.length<6||raw.length>MAX_ATTEST_BYTES)fail("attest_size");
  if(raw.readUInt32BE(0)===TPM_GENERATED_VALUE)return{format:"TPMS_ATTEST" as const,signedData:Buffer.from(raw)};
  const declared=raw.readUInt16BE(0);if(declared!==raw.length-2||declared<4||raw.readUInt32BE(2)!==TPM_GENERATED_VALUE)fail("attest_wrapper");
  return{format:"TPM2B_ATTEST" as const,signedData:Buffer.from(raw.subarray(2))};
}
function parseSelections(r:Reader){
  const count=r.u32("quote_selection_count");if(count===0||count>MAX_PCR_BANKS)fail("quote_selection_count");
  const selections:LinuxTpm2PcrSelection[]=[];const seenBanks=new Set<number>();
  for(let i=0;i<count;i++){
    const hashAlgorithm=r.u16("quote_selection_hash");hashInfo(hashAlgorithm);if(seenBanks.has(hashAlgorithm))fail("quote_duplicate_bank");seenBanks.add(hashAlgorithm);
    const size=r.u8("quote_selection_size");if(size===0||size>MAX_PCR_SELECT_BYTES)fail("quote_selection_size");
    const select=r.bytes(size,"quote_selection_bounds"),selectedPcrs:number[]=[];
    for(let byteIndex=0;byteIndex<select.length;byteIndex++){const value=select[byteIndex]!;for(let bit=0;bit<8;bit++)if((value&(1<<bit))!==0)selectedPcrs.push(byteIndex*8+bit)}
    if(selectedPcrs.length===0)fail("quote_empty_selection");selections.push({hashAlgorithm,select,selectedPcrs});
  }
  return selections;
}

export function parseLinuxTpm2Attest(raw:Buffer):LinuxTpm2Attest{
  const {format,signedData}=unwrapAttest(raw),r=new Reader(signedData),magic=r.u32("attest_magic");if(magic!==TPM_GENERATED_VALUE)fail("attest_magic");
  const attestType=r.u16("attest_type"),qualifiedSigner=r.sized(MAX_NAME_BYTES,"qualified_signer"),extraData=r.sized(MAX_EXTRA_DATA_BYTES,"extra_data"),clock=r.u64("clock"),resetCount=r.u32("reset_count"),restartCount=r.u32("restart_count"),safeByte=r.u8("safe"),firmwareVersion=r.u64("firmware_version");
  if(safeByte!==0&&safeByte!==1)fail("safe_value");
  const common={format,signedData,magic,qualifiedSigner,extraData,clock,resetCount,restartCount,safe:safeByte===1,firmwareVersion};
  if(attestType===TPM_ST_ATTEST_QUOTE){
    const pcrSelections=parseSelections(r),pcrDigest=r.sized(64,"quote_pcr_digest");if(![20,32,48,64].includes(pcrDigest.length))fail("quote_pcr_digest_size");if(!r.done())fail("quote_trailing_data");
    return{...common,type:"QUOTE",attestType:TPM_ST_ATTEST_QUOTE,pcrSelections,pcrDigest};
  }
  if(attestType===TPM_ST_ATTEST_CERTIFY){
    const name=r.sized(MAX_NAME_BYTES,"certify_name"),qualifiedName=r.sized(MAX_NAME_BYTES,"certify_qualified_name");if(name.length<2||qualifiedName.length<2)fail("certify_name_empty");if(!r.done())fail("certify_trailing_data");
    return{...common,type:"CERTIFY",attestType:TPM_ST_ATTEST_CERTIFY,name,qualifiedName};
  }
  fail("unsupported_attest_type");
}

export function linuxTpm2PcrKey(hashAlgorithm:number,pcrIndex:number){if(!Number.isInteger(hashAlgorithm)||!Number.isInteger(pcrIndex)||pcrIndex<0||pcrIndex>=MAX_PCR_SELECT_BYTES*8)fail("pcr_key");return`${hashAlgorithm.toString(16).padStart(4,"0")}:${pcrIndex}`}
export function verifyLinuxTpm2QuoteBinding(raw:Buffer,expectedNonce:Buffer,pcrValues:ReadonlyMap<string,Buffer>,signatureHashAlgorithm:number):LinuxTpm2QuoteAttest{
  const parsed=parseLinuxTpm2Attest(raw);if(parsed.type!=="QUOTE")fail("quote_required");if(expectedNonce.length<16||expectedNonce.length>128||!safeEqual(parsed.extraData,expectedNonce))fail("quote_nonce_mismatch");
  const parts:Buffer[]=[];
  for(const selection of parsed.pcrSelections){const bank=hashInfo(selection.hashAlgorithm);for(const pcr of selection.selectedPcrs){const value=pcrValues.get(linuxTpm2PcrKey(selection.hashAlgorithm,pcr));if(!value)fail("quote_pcr_missing");if(value.length!==bank.bytes)fail("quote_pcr_size");parts.push(value)}}
  const signingHash=hashInfo(signatureHashAlgorithm);if(parsed.pcrDigest.length!==signingHash.bytes)fail("quote_pcr_digest_size");const calculated=crypto.createHash(signingHash.name).update(Buffer.concat(parts)).digest();if(!safeEqual(calculated,parsed.pcrDigest))fail("quote_pcr_digest_mismatch");return parsed;
}
export function verifyLinuxTpm2CertifyBinding(raw:Buffer,expectedNonce:Buffer,expectedName:Buffer,expectedQualifiedName?:Buffer):LinuxTpm2CertifyAttest{
  const parsed=parseLinuxTpm2Attest(raw);if(parsed.type!=="CERTIFY")fail("certify_required");if(expectedNonce.length<16||expectedNonce.length>128||!safeEqual(parsed.extraData,expectedNonce))fail("certify_nonce_mismatch");if(!safeEqual(parsed.name,expectedName))fail("certify_name_mismatch");if(expectedQualifiedName&&!safeEqual(parsed.qualifiedName,expectedQualifiedName))fail("certify_qualified_name_mismatch");return parsed;
}
