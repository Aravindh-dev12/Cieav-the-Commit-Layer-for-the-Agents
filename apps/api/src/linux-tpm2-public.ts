import {computeLinuxTpm2PublicName,type LinuxTpm2PublicName,TPM_ALG_ECDSA,TPM_ALG_RSASSA,TPM_ALG_SHA1,TPM_ALG_SHA256,TPM_ALG_SHA384,TPM_ALG_SHA512} from "./linux-tpm2-attestation.js";

export const TPM_ALG_RSA=0x0001;
export const TPM_ALG_NULL=0x0010;
export const TPM_ALG_ECC=0x0023;
export const TPM_ECC_NIST_P256=0x0003;
export const TPMA_OBJECT_FIXEDTPM=1<<1;
export const TPMA_OBJECT_FIXEDPARENT=1<<4;
export const TPMA_OBJECT_SENSITIVEDATAORIGIN=1<<5;
export const TPMA_OBJECT_USERWITHAUTH=1<<6;
export const TPMA_OBJECT_ADMINWITHPOLICY=1<<7;
export const TPMA_OBJECT_NODA=1<<10;
export const TPMA_OBJECT_RESTRICTED=1<<16;
export const TPMA_OBJECT_DECRYPT=1<<17;
export const TPMA_OBJECT_SIGN=1<<18;

const MAX_AUTH_POLICY=128,MAX_UNIQUE=1024;
const HASHES=new Set([TPM_ALG_SHA1,TPM_ALG_SHA256,TPM_ALG_SHA384,TPM_ALG_SHA512]);
export type LinuxTpm2SigningPublic={publicName:LinuxTpm2PublicName;objectAttributes:number;authPolicy:Buffer;scheme:number;schemeHashAlgorithm?:number;publicJwk:{kty:"EC";crv:"P-256";x:string;y:string}|{kty:"RSA";n:string;e:string};keyBits?:number;exponent?:number};
export type LinuxTpm2AttestationKeyPublic=LinuxTpm2SigningPublic&{restricted:true};

function fail(code:string):never{throw new Error(`linux_tpm2_public_${code}`)}
class Reader{private offset=0;constructor(private readonly raw:Buffer){}remaining(){return this.raw.length-this.offset}done(){return this.offset===this.raw.length}private take(n:number,code:string){if(!Number.isSafeInteger(n)||n<0||n>this.remaining())fail(code);const out=this.raw.subarray(this.offset,this.offset+n);this.offset+=n;return out}u16(code:string){return this.take(2,code).readUInt16BE(0)}u32(code:string){return this.take(4,code).readUInt32BE(0)}bytes(n:number,code:string){return Buffer.from(this.take(n,code))}sized(max:number,code:string){const n=this.u16(`${code}_size`);if(n>max)fail(`${code}_too_large`);return this.bytes(n,`${code}_bounds`)}}
const b64url=(value:Buffer)=>value.toString("base64url");
function requireHash(value:number){if(!HASHES.has(value))fail("unsupported_hash_algorithm");return value}
function requireBaseSigningAttributes(attributes:number){const required=TPMA_OBJECT_FIXEDTPM|TPMA_OBJECT_FIXEDPARENT|TPMA_OBJECT_SENSITIVEDATAORIGIN|TPMA_OBJECT_SIGN;if((attributes&required)!==required)fail("signing_attributes_required");if((attributes&TPMA_OBJECT_DECRYPT)!==0)fail("signing_decrypt_forbidden")}
function requireSubjectAttributes(attributes:number){requireBaseSigningAttributes(attributes);if((attributes&TPMA_OBJECT_RESTRICTED)!==0)fail("subject_restricted_forbidden")}
function requireAkAttributes(attributes:number){requireBaseSigningAttributes(attributes);if((attributes&TPMA_OBJECT_RESTRICTED)===0)fail("ak_restricted_required")}
function parseNullSymmetric(r:Reader){if(r.u16("symmetric_algorithm")!==TPM_ALG_NULL)fail("signing_symmetric_must_be_null")}
function parseScheme(r:Reader,allowed:number){const scheme=r.u16("scheme");if(scheme===TPM_ALG_NULL)return{scheme};if(scheme!==allowed)fail("signing_scheme_unsupported");return{scheme,schemeHashAlgorithm:requireHash(r.u16("scheme_hash"))}}
function exponentBytes(value:number){if(value<=0||value>0xffffffff)fail("rsa_exponent");const b=Buffer.alloc(4);b.writeUInt32BE(value);let i=0;while(i<3&&b[i]===0)i++;return b.subarray(i)}
function parseSigningPublic(rawPublic:Buffer,profile:"SUBJECT"|"AK"):LinuxTpm2SigningPublic{
  const publicName=computeLinuxTpm2PublicName(rawPublic),r=new Reader(publicName.publicArea),type=r.u16("type"),nameAlg=r.u16("name_alg");requireHash(nameAlg);if(type!==publicName.type||nameAlg!==publicName.nameAlg)fail("public_header_mismatch");
  const objectAttributes=r.u32("object_attributes"),authPolicy=r.sized(MAX_AUTH_POLICY,"auth_policy");profile==="AK"?requireAkAttributes(objectAttributes):requireSubjectAttributes(objectAttributes);
  if(type===TPM_ALG_RSA){
    parseNullSymmetric(r);const schemeInfo=parseScheme(r,TPM_ALG_RSASSA),keyBits=r.u16("rsa_key_bits"),encodedExponent=r.u32("rsa_exponent"),exponent=encodedExponent===0?65537:encodedExponent;if(keyBits<2048||keyBits>4096||keyBits%8!==0)fail("rsa_key_bits");if(exponent<3||exponent%2===0)fail("rsa_exponent");const modulus=r.sized(MAX_UNIQUE,"rsa_unique");if(modulus.length!==keyBits/8)fail("rsa_modulus_size");if(!r.done())fail("public_trailing_data");return{publicName,objectAttributes,authPolicy,...schemeInfo,publicJwk:{kty:"RSA",n:b64url(modulus),e:b64url(exponentBytes(exponent))},keyBits,exponent};
  }
  if(type===TPM_ALG_ECC){
    parseNullSymmetric(r);const schemeInfo=parseScheme(r,TPM_ALG_ECDSA),curveId=r.u16("ecc_curve");if(curveId!==TPM_ECC_NIST_P256)fail("ecc_curve_unsupported");if(r.u16("ecc_kdf")!==TPM_ALG_NULL)fail("ecc_kdf_must_be_null");const x=r.sized(80,"ecc_x"),y=r.sized(80,"ecc_y");if(x.length!==32||y.length!==32)fail("ecc_coordinate_size");if(!r.done())fail("public_trailing_data");return{publicName,objectAttributes,authPolicy,...schemeInfo,publicJwk:{kty:"EC",crv:"P-256",x:b64url(x),y:b64url(y)}};
  }
  fail("signing_type_unsupported");
}

export function parseLinuxTpm2SigningPublic(rawPublic:Buffer):LinuxTpm2SigningPublic{return parseSigningPublic(rawPublic,"SUBJECT")}
export function parseLinuxTpm2AttestationKeyPublic(rawPublic:Buffer):LinuxTpm2AttestationKeyPublic{const parsed=parseSigningPublic(rawPublic,"AK");return{...parsed,restricted:true}}
export function linuxTpm2PublicJwkFingerprintInput(value:LinuxTpm2SigningPublic["publicJwk"]){return JSON.stringify(value,Object.keys(value).sort())}
