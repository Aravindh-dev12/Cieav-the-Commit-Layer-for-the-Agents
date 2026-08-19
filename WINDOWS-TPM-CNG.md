# CIEAV Windows TPM / CNG Native Bridge

This bridge is the first concrete hardware-key provider behind the CIEAV Hardware Key Provider Trust Plane.

## Provider boundary

`cieav-windows-tpm-cng.exe` talks only to Windows CNG/NCrypt and explicitly opens `Microsoft Platform Crypto Provider` (`MS_PLATFORM_CRYPTO_PROVIDER`). It rejects a provider that does not report `NCRYPT_IMPL_HARDWARE_FLAG` or that reports `NCRYPT_IMPL_SOFTWARE_FLAG`. CIEAV does not fall back to Microsoft Software Key Storage Provider.

## Two key lanes

CIEAV deliberately separates consequence signing from the Microsoft Azure Attestation request-key path:

```text
P-256 consequence key
  create-p256 <keyName>
  describe <keyName>
  sign-es256 <keyName> <sha256Hex>

RSA-2048 TPM attestation request key
  create-rsa-2048 <keyName>
  describe-rsa <keyName>
  sign-rs256 <keyName> <sha256Hex>
```

Both are persistent Platform Crypto Provider keys. Before finalization the private export policy is set to zero, and private export/archival flags are rechecked before later use. Only public JWK material leaves the bridge.

The P-256 lane exports `BCRYPT_ECCPUBLIC_BLOB`. The RSA lane exports `BCRYPT_RSAPUBLIC_BLOB`, requires a 2048-bit modulus, and signs SHA-256 digests with PKCS#1 v1.5 semantics for RS256.

## Why RSA for attestation?

Microsoft's current Azure Attestation TPM key-attestation sample creates an RSA-2048 TPM request key. CIEAV follows that supported shape rather than claiming the existing P-256 key is covered by the same attestation.

**A verified RSA request-key attestation does not automatically attest the separate P-256 consequence key.** Same provider, machine or TPM does not by itself establish a cryptographic binding between two distinct keys.

## Independent MAA verification

CIEAV separates evidence production from the decision to mark evidence `VERIFIED`.

A live TPM host will eventually use an AIK and Microsoft Attestation Client flow to obtain a Microsoft Azure Attestation JWT. `CieavMaaTpmAttestationVerifier` then independently checks:

- exact configured HTTPS MAA issuer;
- issuer OpenID metadata;
- same-origin JWKS endpoint;
- exactly one RSA signing key matching JWT `kid`;
- RS256 JWT signature;
- `exp`, `nbf`, and `iat` freshness;
- exact relying-party nonce;
- exact configured MAA policy hash;
- exact `x-ms-tpm-request-key` RSA JWK;
- `tpm_certify.name_alg == 11`;
- `tpm_certify.obj_attr == 50`;
- `tpm_quote.hash_alg == sha-256` when quote information is present.

Only after all checks pass does CIEAV create a `WINDOWS_TPM_KEY_ATTESTATION` object with `verification: VERIFIED`. Persisted registry evidence contains the public-key fingerprint and evidence/claims digests, not TPM private material or Azure credentials.

## Freshness and policy

The attestation request must use a per-session relying-party nonce. A report with a different nonce is rejected even if its signature is valid. CIEAV also pins the expected attestation-policy hash so a validly signed token issued under a weaker or different policy cannot be substituted.

## Probe semantics

`probe` returns protocol `CIEAV_KEY_PROVIDER_V1`.

- Platform Crypto Provider hardware available: exit `0`, `available:true`, `hardwareBacked:true`.
- TPM/provider unavailable: exit `20`, `available:false`, `hardwareBacked:false`.

Unavailable hardware never causes software-key substitution.

## What is qualified in this phase

Deterministically testable now:

- hardened CNG native bridge compiles on Windows;
- Platform Crypto Provider fail-closed probe;
- P-256 ES256 lane;
- RSA-2048 RS256 MAA request-key lane;
- non-export policy invariants;
- independent MAA JWT verification;
- nonce, policy, signing-key, request-key and TPM-certify adversarial tests;
- generic RS256 hardware capability attenuation.

## Still pending for a live physical TPM deployment

The repository does not yet invoke the Microsoft Attestation Client library to collect real TPM evidence. That live collector needs:

1. a physical TPM;
2. an enrolled AIK / AIK certificate appropriate for the attestation service;
3. a per-session relying-party nonce;
4. a configured Microsoft Azure Attestation provider and authenticated service access where required;
5. delivery of the returned JWT to the independent CIEAV verifier.

Azure client secrets, AIK private material and other provider credentials must never be persisted in the CIEAV hardware registry.

GitHub-hosted runner success qualifies compilation, fail-closed provider detection and deterministic verifier behavior. It does not constitute live physical-TPM/MAA qualification.
