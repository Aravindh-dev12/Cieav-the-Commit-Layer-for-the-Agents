import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {CieavMaaTpmAttestationVerifier,hardwareJwkFingerprint} from "./maa-tpm-attestation.js";

const issuer="https://maa.cieav.test/",jwksUrl=`${issuer}certs`,policyHash="policy-hash-cieav-tpm-v1",nonce="nonce-from-relying-party-123";
const signing=crypto.generateKeyPairSync("rsa",{modulusLength:2048}),request=crypto.generateKeyPairSync("rsa",{modulusLength:2048});
const signingJwk=signing.publicKey.export({format:"jwk"}) as JsonWebKey,requestJwkRaw=request.publicKey.export({format:"jwk"}) as JsonWebKey;
if(signingJwk.kty!=="RSA"||!signingJwk.n||!signingJwk.e||requestJwkRaw.kty!=="RSA"||!requestJwkRaw.n||!requestJwkRaw.e)throw new Error("RSA fixture unavailable");
const requestJwk={kty:"RSA" as const,n:requestJwkRaw.n,e:requestJwkRaw.e};
const kid="maa-signing-key-1";
const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
function token(overrides:Record<string,unknown>={},headerOverrides:Record<string,unknown>={}){const now=Math.floor(Date.now()/1000),header={alg:"RS256",typ:"JWT",kid,jku:jwksUrl,...headerOverrides},payload={iss:issuer,iat:now,nbf:now-1,exp:now+600,jti:crypto.randomUUID(),nonce,"x-ms-ver":"1.0","x-ms-policy-hash":policyHash,"x-ms-tpm-request-key":{jwk:requestJwk,info:{tpm_quote:{hash_alg:"sha-256"},tpm_certify:{name_alg:11,obj_attr:50,auth_policy:"AQIDBA"}}},...overrides},encoded=`${b64(header)}.${b64(payload)}`,sig=crypto.sign("RSA-SHA256",Buffer.from(encoded),signing.privateKey).toString("base64url");return`${encoded}.${sig}`}
function verifier(){const fetchJson=async(url:string)=>{if(url===`${issuer}.well-known/openid-configuration`)return{issuer,jwks_uri:jwksUrl,id_token_signing_alg_values_supported:["RS256"]};if(url===jwksUrl)return{keys:[{...signingJwk,kid,use:"sig"}]};throw new Error(`unexpected fetch ${url}`)};return new CieavMaaTpmAttestationVerifier(fetchJson)}
const input=(jwt:string)=>({token:jwt,issuer,providerManifestId:"windows-tpm-cng",expectedNonce:nonce,expectedPolicyHash:policyHash,expectedPublicJwk:requestJwk,maxTokenAgeSeconds:900});

describe("CieavMaaTpmAttestationVerifier",()=>{
  it("creates VERIFIED evidence only after signature, freshness, policy, nonce, key and TPM certify checks",async()=>{const result=await verifier().verify(input(token()));expect(result.attestation.verification).toBe("VERIFIED");expect(result.attestation.kind).toBe("WINDOWS_TPM_KEY_ATTESTATION");expect(result.attestation.publicKeyFingerprint).toBe(hardwareJwkFingerprint(requestJwk));expect(result.publicJwk).toEqual(requestJwk);expect(result.claims.objectAttributes).toBe(50);expect(result.claims.nameAlg).toBe(11);expect(result.attestation.evidenceDigest).toMatch(/^[0-9a-f]{64}$/)});

  it("rejects nonce replay and policy substitution",async()=>{await expect(verifier().verify(input(token({nonce:"old-nonce"})))).rejects.toThrow("maa_tpm_nonce_mismatch");await expect(verifier().verify(input(token({"x-ms-policy-hash":"other-policy"})))).rejects.toThrow("maa_tpm_policy_hash_mismatch")});

  it("rejects a token that certifies a different TPM key",async()=>{const other=crypto.generateKeyPairSync("rsa",{modulusLength:2048}).publicKey.export({format:"jwk"}) as JsonWebKey;await expect(verifier().verify(input(token({"x-ms-tpm-request-key":{jwk:{kty:"RSA",n:other.n,e:other.e},info:{tpm_certify:{name_alg:11,obj_attr:50}}}})))).rejects.toThrow("maa_tpm_request_key_mismatch")});

  it("rejects weak TPM object attributes and an unexpected name algorithm",async()=>{await expect(verifier().verify(input(token({"x-ms-tpm-request-key":{jwk:requestJwk,info:{tpm_certify:{name_alg:11,obj_attr:0}}}})))).rejects.toThrow("maa_tpm_object_attributes_invalid");await expect(verifier().verify(input(token({"x-ms-tpm-request-key":{jwk:requestJwk,info:{tpm_certify:{name_alg:4,obj_attr:50}}}})))).rejects.toThrow("maa_tpm_name_algorithm_invalid")});

  it("rejects signature tampering, signing-key ambiguity and cross-origin JWKS",async()=>{const good=token(),parts=good.split("."),tampered=`${parts[0]}.${b64({...JSON.parse(Buffer.from(parts[1]!,"base64url").toString("utf8")),nonce:"tampered"})}.${parts[2]}`;await expect(verifier().verify(input(tampered))).rejects.toThrow("maa_tpm_signature_invalid");const ambiguous=new CieavMaaTpmAttestationVerifier(async(url)=>url.includes("openid")?{issuer,jwks_uri:jwksUrl}:{keys:[{...signingJwk,kid,use:"sig"},{...signingJwk,kid,use:"sig"}]});await expect(ambiguous.verify(input(good))).rejects.toThrow("maa_tpm_signing_key_ambiguous");const crossOrigin=new CieavMaaTpmAttestationVerifier(async()=>({issuer,jwks_uri:"https://attacker.example/certs"}));await expect(crossOrigin.verify(input(good))).rejects.toThrow("maa_tpm_jwks_origin_mismatch")});

  it("rejects expired and stale attestation reports",async()=>{const now=Math.floor(Date.now()/1000);await expect(verifier().verify(input(token({iat:now-2000,nbf:now-2000,exp:now+300})))).rejects.toThrow("maa_tpm_token_stale");await expect(verifier().verify(input(token({iat:now-100,nbf:now-100,exp:now-100})))).rejects.toThrow("maa_tpm_token_expired")});
});
