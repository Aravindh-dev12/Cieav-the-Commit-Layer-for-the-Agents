import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {TPM_ALG_ECDSA,TPM_ALG_RSASSA,TPM_ALG_SHA256} from "./linux-tpm2-attestation.js";
import {TPM_ALG_ECC,TPM_ALG_NULL,TPM_ALG_RSA,TPM_ECC_NIST_P256,TPMA_OBJECT_FIXEDPARENT,TPMA_OBJECT_FIXEDTPM,TPMA_OBJECT_RESTRICTED,TPMA_OBJECT_SENSITIVEDATAORIGIN,TPMA_OBJECT_SIGN,parseLinuxTpm2SigningPublic} from "./linux-tpm2-public.js";

const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b},sized=b=>Buffer.concat([u16(b.length),b]);
const required=TPMA_OBJECT_FIXEDTPM|TPMA_OBJECT_FIXEDPARENT|TPMA_OBJECT_SENSITIVEDATAORIGIN|TPMA_OBJECT_SIGN;
function eccPublic(attributes=required,curve=TPM_ECC_NIST_P256){const x=crypto.randomBytes(32),y=crypto.randomBytes(32),area=Buffer.concat([u16(TPM_ALG_ECC),u16(TPM_ALG_SHA256),u32(attributes),sized(Buffer.alloc(0)),u16(TPM_ALG_NULL),u16(TPM_ALG_ECDSA),u16(TPM_ALG_SHA256),u16(curve),u16(TPM_ALG_NULL),sized(x),sized(y)]);return{wrapped:Buffer.concat([u16(area.length),area]),x,y}}
function rsaPublic(attributes=required){const modulus=Buffer.concat([Buffer.from([0x80]),crypto.randomBytes(255)]),area=Buffer.concat([u16(TPM_ALG_RSA),u16(TPM_ALG_SHA256),u32(attributes),sized(Buffer.alloc(0)),u16(TPM_ALG_NULL),u16(TPM_ALG_RSASSA),u16(TPM_ALG_SHA256),u16(2048),u32(0),sized(modulus)]);return{wrapped:Buffer.concat([u16(area.length),area]),modulus}}

describe("Linux TPM2 signing public policy",()=>{
  it("extracts a certified TPM-generated fixed P-256 signing key as the exact CIEAV JWK",()=>{const value=eccPublic(),parsed=parseLinuxTpm2SigningPublic(value.wrapped);expect(parsed.publicJwk).toEqual({kty:"EC",crv:"P-256",x:value.x.toString("base64url"),y:value.y.toString("base64url")});expect(parsed.objectAttributes&required).toBe(required);expect(parsed.scheme).toBe(TPM_ALG_ECDSA)});
  it("extracts a 2048-bit RSA signing key and applies the TPM default exponent",()=>{const value=rsaPublic(),parsed=parseLinuxTpm2SigningPublic(value.wrapped);expect(parsed.publicJwk).toEqual({kty:"RSA",n:value.modulus.toString("base64url"),e:Buffer.from([1,0,1]).toString("base64url")});expect(parsed.keyBits).toBe(2048);expect(parsed.exponent).toBe(65537);expect(parsed.scheme).toBe(TPM_ALG_RSASSA)});
  it("rejects a key that is not TPM-generated/fixed or is restricted",()=>{expect(()=>parseLinuxTpm2SigningPublic(eccPublic(required&~TPMA_OBJECT_SENSITIVEDATAORIGIN).wrapped)).toThrow("subject_attributes_required");expect(()=>parseLinuxTpm2SigningPublic(eccPublic(required|TPMA_OBJECT_RESTRICTED).wrapped)).toThrow("subject_restricted_forbidden")});
  it("rejects non-P256 ECC and malformed RSA public parameters",()=>{expect(()=>parseLinuxTpm2SigningPublic(eccPublic(required,0x0004).wrapped)).toThrow("ecc_curve_unsupported");const value=rsaPublic(),changed=Buffer.from(value.wrapped),keyBitsOffset=18;changed.writeUInt16BE(1024,keyBitsOffset);expect(()=>parseLinuxTpm2SigningPublic(changed)).toThrow("rsa_key_bits")});
});
