import crypto from "node:crypto";

export const CIEAV_WINDOWS_TPM_MEASURED_BOOT_PROTOCOL="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1" as const;
export const TPM_ALG_SHA1=0x0004;
export const TPM_ALG_SHA256=0x000b;
export const TPM_ALG_SHA384=0x000c;
export const TPM_ALG_SHA512=0x000d;
export const EV_NO_ACTION=0x00000003;
export const NCRYPT_PLATFORM_ATTEST_MAGIC=0x44504150;
export const NCRYPT_TPM_PLATFORM_ATTESTATION_STATEMENT_VERSION=0;

const PLATFORM_HEADER_BYTES=24;
const MAX_PLATFORM_CLAIM_BYTES=512*1024;
const MAX_WBCL_BYTES=8*1024*1024;
const MAX_EVENT_BYTES=1024*1024;
const MAX_EVENTS=100_000;
const MAX_DIGESTS=5;
const SRTM_PCR_MASK=0x0000ffff;
const SPEC_ID_EVENT03=Buffer.from([0x53,0x70,0x65,0x63,0x20,0x49,0x44,0x20,0x45,0x76,0x65,0x6e,0x74,0x30,0x33,0x00]);
const KNOWN_DIGEST_SIZES=new Map<number,number>([[TPM_ALG_SHA1,20],[TPM_ALG_SHA256,32],[TPM_ALG_SHA384,48],[TPM_ALG_SHA512,64]]);

export type ParsedPlatformClaim={magic:number;version:number;pcrAlg:number;signature:Buffer;quote:Buffer;pcrs:Buffer};
export type WbclAlgorithm={algorithmId:number;digestSize:number};
export type WbclEvent={pcrIndex:number;eventType:number;digests:ReadonlyMap<number,Buffer>;eventData:Buffer};
export type ParsedWbcl={format:"TCG2";platformClass:number;specVersion:{major:number;minor:number;errata:number;uintnSize:number};algorithms:readonly WbclAlgorithm[];vendorInfo:Buffer;events:readonly WbclEvent[]};

function fail(code:string):never{throw new Error(`windows_tpm_measured_boot_${code}`)}
function checkedEnd(offset:number,length:number,total:number,code:string){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset>total||length>total-offset)fail(code);return offset+length}
function u32(buf:Buffer,offset:number,code:string){checkedEnd(offset,4,buf.length,code);return buf.readUInt32LE(offset)}
function u16(buf:Buffer,offset:number,code:string){checkedEnd(offset,2,buf.length,code);return buf.readUInt16LE(offset)}
function exactKnownDigestSize(algorithmId:number,digestSize:number){const expected=KNOWN_DIGEST_SIZES.get(algorithmId);if(expected!==undefined&&expected!==digestSize)fail("wbcl_known_digest_size_mismatch");if(digestSize<16||digestSize>128)fail("wbcl_digest_size_out_of_range")}

export function parseWindowsPlatformClaim(raw:Buffer):ParsedPlatformClaim{
  if(!Buffer.isBuffer(raw)||raw.length<PLATFORM_HEADER_BYTES||raw.length>MAX_PLATFORM_CLAIM_BYTES)fail("platform_claim_size");
  const magic=u32(raw,0,"platform_claim_header"),version=u32(raw,4,"platform_claim_header"),pcrAlg=u32(raw,8,"platform_claim_header"),cbSignature=u32(raw,12,"platform_claim_header"),cbQuote=u32(raw,16,"platform_claim_header"),cbPcrs=u32(raw,20,"platform_claim_header");
  if(magic!==NCRYPT_PLATFORM_ATTEST_MAGIC)fail("platform_claim_magic");
  if(version!==NCRYPT_TPM_PLATFORM_ATTESTATION_STATEMENT_VERSION)fail("platform_claim_version");
  if(!KNOWN_DIGEST_SIZES.has(pcrAlg))fail("platform_claim_pcr_algorithm");
  if(cbSignature===0||cbQuote===0||cbPcrs===0)fail("platform_claim_empty_section");
  let cursor=PLATFORM_HEADER_BYTES;
  const signatureEnd=checkedEnd(cursor,cbSignature,raw.length,"platform_claim_signature_bounds"),signature=Buffer.from(raw.subarray(cursor,signatureEnd));cursor=signatureEnd;
  const quoteEnd=checkedEnd(cursor,cbQuote,raw.length,"platform_claim_quote_bounds"),quote=Buffer.from(raw.subarray(cursor,quoteEnd));cursor=quoteEnd;
  const pcrEnd=checkedEnd(cursor,cbPcrs,raw.length,"platform_claim_pcr_bounds"),pcrs=Buffer.from(raw.subarray(cursor,pcrEnd));cursor=pcrEnd;
  if(cursor!==raw.length)fail("platform_claim_trailing_data");
  return{magic,version,pcrAlg,signature,quote,pcrs};
}

export function parseWindowsWbcl(raw:Buffer):ParsedWbcl{
  if(!Buffer.isBuffer(raw)||raw.length<32||raw.length>MAX_WBCL_BYTES)fail("wbcl_size");
  // A TCG2 log starts with one legacy-format descriptor event. Its EventData
  // contains Spec ID Event03 and the algorithm/digest-size table used below.
  const descriptorPcr=u32(raw,0,"wbcl_descriptor"),descriptorType=u32(raw,4,"wbcl_descriptor"),descriptorDataSize=u32(raw,28,"wbcl_descriptor");
  if(descriptorPcr!==0||descriptorType!==EV_NO_ACTION)fail("wbcl_descriptor_identity");
  const descriptorStart=32,descriptorEnd=checkedEnd(descriptorStart,descriptorDataSize,raw.length,"wbcl_descriptor_bounds"),d=raw.subarray(descriptorStart,descriptorEnd);
  if(d.length<29||!d.subarray(0,16).equals(SPEC_ID_EVENT03))fail("wbcl_spec_id_event03");
  const platformClass=u32(d,16,"wbcl_descriptor_platform_class"),minor=d[20]!,major=d[21]!,errata=d[22]!,uintnSize=d[23]!,numberOfAlgorithms=u32(d,24,"wbcl_descriptor_algorithm_count");
  if(major<1||(major===1&&minor<2))fail("wbcl_spec_version");
  if(uintnSize!==1&&uintnSize!==2)fail("wbcl_uintn_size");
  if(numberOfAlgorithms===0||numberOfAlgorithms>MAX_DIGESTS)fail("wbcl_algorithm_count");
  let cursor=28;
  const algorithms:WbclAlgorithm[]=[],seenAlgorithms=new Set<number>();
  for(let i=0;i<numberOfAlgorithms;i++){
    const algorithmId=u16(d,cursor,"wbcl_algorithm_table"),digestSize=u16(d,cursor+2,"wbcl_algorithm_table");cursor+=4;
    if(seenAlgorithms.has(algorithmId))fail("wbcl_duplicate_algorithm");
    seenAlgorithms.add(algorithmId);exactKnownDigestSize(algorithmId,digestSize);algorithms.push({algorithmId,digestSize});
  }
  checkedEnd(cursor,1,d.length,"wbcl_vendor_size");const vendorSize=d[cursor]!;cursor+=1;
  const vendorEnd=checkedEnd(cursor,vendorSize,d.length,"wbcl_vendor_bounds"),vendorInfo=Buffer.from(d.subarray(cursor,vendorEnd));cursor=vendorEnd;
  if(cursor!==d.length)fail("wbcl_descriptor_trailing_data");
  const digestSizes=new Map(algorithms.map(a=>[a.algorithmId,a.digestSize] as const)),events:WbclEvent[]=[];
  cursor=descriptorEnd;
  while(cursor<raw.length){
    if(events.length>=MAX_EVENTS)fail("wbcl_event_count");
    const eventStart=cursor,pcrIndex=u32(raw,cursor,"wbcl_event_header"),eventType=u32(raw,cursor+4,"wbcl_event_header"),digestCount=u32(raw,cursor+8,"wbcl_event_digest_count");cursor+=12;
    if(digestCount===0||digestCount>MAX_DIGESTS)fail("wbcl_event_digest_count");
    const digests=new Map<number,Buffer>();
    for(let i=0;i<digestCount;i++){
      const algorithmId=u16(raw,cursor,"wbcl_event_algorithm");cursor+=2;
      if(digests.has(algorithmId))fail("wbcl_event_duplicate_algorithm");
      const digestSize=digestSizes.get(algorithmId);if(digestSize===undefined)fail("wbcl_event_unknown_algorithm");
      const digestEnd=checkedEnd(cursor,digestSize,raw.length,"wbcl_event_digest_bounds");digests.set(algorithmId,Buffer.from(raw.subarray(cursor,digestEnd)));cursor=digestEnd;
    }
    const eventDataSize=u32(raw,cursor,"wbcl_event_data_size");cursor+=4;
    if(eventDataSize>MAX_EVENT_BYTES)fail("wbcl_event_data_too_large");
    const eventEnd=checkedEnd(cursor,eventDataSize,raw.length,"wbcl_event_data_bounds"),eventData=Buffer.from(raw.subarray(cursor,eventEnd));cursor=eventEnd;
    if(cursor<=eventStart)fail("wbcl_event_no_progress");events.push({pcrIndex,eventType,digests,eventData});
  }
  if(cursor!==raw.length)fail("wbcl_trailing_data");
  return{format:"TCG2",platformClass,specVersion:{major,minor,errata,uintnSize},algorithms,vendorInfo,events};
}

function hashNameForAlg(algorithmId:number){switch(algorithmId){case TPM_ALG_SHA1:return"sha1";case TPM_ALG_SHA256:return"sha256";case TPM_ALG_SHA384:return"sha384";case TPM_ALG_SHA512:return"sha512";default:fail("replay_unsupported_algorithm")}}

export function replaySrtmPcrs(parsed:ParsedWbcl,algorithmId:number,pcrMask:number):ReadonlyMap<number,Buffer>{
  if(!Number.isInteger(pcrMask)||pcrMask<=0||(pcrMask&~SRTM_PCR_MASK)!==0)fail("replay_pcr_mask");
  const digestSize=parsed.algorithms.find(a=>a.algorithmId===algorithmId)?.digestSize;if(digestSize===undefined)fail("replay_algorithm_absent");
  const known=KNOWN_DIGEST_SIZES.get(algorithmId);if(known===undefined||known!==digestSize)fail("replay_algorithm_size");
  const states=new Map<number,Buffer>();for(let pcr=0;pcr<16;pcr++)if((pcrMask&(1<<pcr))!==0)states.set(pcr,Buffer.alloc(digestSize));
  const hashName=hashNameForAlg(algorithmId);
  for(const event of parsed.events){
    if(event.eventType===EV_NO_ACTION)continue;
    if(event.pcrIndex>23)fail("replay_pcr_index");
    const current=states.get(event.pcrIndex);if(!current)continue;
    const digest=event.digests.get(algorithmId);if(!digest)fail("replay_selected_digest_missing");
    states.set(event.pcrIndex,crypto.createHash(hashName).update(current).update(digest).digest());
  }
  return states;
}

export function serializePcrTable(pcrs:ReadonlyMap<number,Buffer>,pcrMask:number,digestSize:number):Buffer{
  const parts:Buffer[]=[];for(let pcr=0;pcr<16;pcr++)if((pcrMask&(1<<pcr))!==0){const value=pcrs.get(pcr);if(!value||value.length!==digestSize)fail("pcr_table_incomplete");parts.push(value)}return Buffer.concat(parts);
}
