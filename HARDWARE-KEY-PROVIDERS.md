# CIEAV Hardware Key Provider Plane

CIEAV distinguishes **software-wrapped** keys from **hardware-backed** keys. A key does not become hardware-backed because a configuration field says so. CIEAV requires an exact provider bridge, key-specific verified attestation evidence, and public-key binding before a `HardwareKeyRegistration` may carry `hardwareBacked: true`.

## No software fallback

> **No software fallback.**

If policy requires a TPM, Secure Enclave, HSM/KMS or other hardware-rooted key, failure of that provider stops the operation. CIEAV does not silently create or reuse `LOCAL_WRAPPED_P256`.

```text
required hardware provider
        ↓
provider bridge available + digest matched?
        ↓ no → BLOCK
verified key attestation current?
        ↓ no → BLOCK
attested public-key fingerprint matches?
        ↓ no → BLOCK
algorithm + purpose + capability permitted?
        ↓ no → BLOCK
hardware key registration usable
```

## Provider and attestation boundary

`ProviderBridgeManifest` pins CIEAV to an exact native bridge executable, SHA-256 digest, provider/platform, protocol version, capabilities, purposes and provider locator. The digest is checked at manifest installation and again before use.

`HardwareKeyAttestation` is a separate evidence object. Only `verification: VERIFIED`, current, provider-bound evidence whose public-key fingerprint matches the registration can authorize `hardwareBacked: true`.

## Windows TPM / CNG

The native bridge lives at `native/windows-tpm-cng` and explicitly opens the Microsoft Platform Crypto Provider through NCrypt. It requires the provider implementation flags to report hardware and not software. If the provider/TPM is unavailable, `probe` fails closed with `available:false` and `hardwareBacked:false`.

The bridge now has **two deliberately separate key lanes**:

```text
P-256 consequence-signing lane
  create-p256
  describe
  sign-es256

RSA-2048 TPM-attestation lane
  create-rsa-2048
  describe-rsa
  sign-rs256
```

Both lanes create persistent keys in the Platform Crypto Provider, set private export/archival policy to zero before finalization, re-check non-exportability before use, and expose only public JWK material.

### Why two lanes?

Microsoft's current Azure Attestation TPM key-attestation sample uses an RSA-2048 request key. CIEAV therefore does **not** pretend that an attested RSA request key automatically attests the separate P-256 ES256 consequence key.

A verified RSA TPM attestation establishes only the exact RSA public key named by the MAA report. Any future statement that a P-256 consequence key has equivalent TPM provenance requires its own cryptographically justified binding; provider name, machine identity, or co-residency alone is insufficient.

## Microsoft Azure Attestation verification

`CieavMaaTpmAttestationVerifier` independently verifies an MAA report before producing `WINDOWS_TPM_KEY_ATTESTATION` evidence.

```text
RSA-2048 TPM request key
       ↓
AIK + TPM certify evidence
       ↓
Microsoft Azure Attestation
       ↓
signed JWT
       ↓
CIEAV verifier
  exact HTTPS issuer
  OpenID metadata
  same-origin JWKS
  exactly one signing key by kid
  RS256 signature
  exp / nbf / iat
  relying-party nonce
  pinned attestation-policy hash
  exact x-ms-tpm-request-key RSA JWK
  tpm_certify.name_alg == 11
  tpm_certify.obj_attr == 50
  optional tpm_quote.hash_alg == sha-256
       ↓
HardwareKeyAttestation VERIFIED
```

CIEAV does not accept a caller-supplied boolean asserting that attestation succeeded. The verifier reconstructs trust from the signed report and expected relying-party inputs.

### Freshness

The relying party supplies a per-session nonce. The returned report must carry that exact nonce. Tokens are also constrained by `exp`, `nbf` and `iat`; CIEAV defaults to a substantially shorter acceptance age than the service's maximum token lifetime.

### Policy binding

The expected MAA attestation-policy hash is an explicit verifier input. A correctly signed report created under a different policy is rejected. This prevents signature validity from being confused with policy adequacy.

### Metadata/JWKS boundary

The verifier fetches OpenID metadata from the expected HTTPS issuer, requires the JWKS endpoint to remain on the same origin, rejects redirects in the default fetch path, chooses exactly one RSA signing key by `kid`, and verifies RS256 locally. A token-controlled cross-origin `jku` cannot redirect trust.

### Evidence persistence

The registry stores only the verified public-key fingerprint plus evidence/claims digests and verifier metadata. The raw TPM private key, AIK private key, Azure client secret and provider session credentials are not registry state.

## Algorithm-specific capability attenuation

Hardware registrations declare `algorithm: ES256 | RS256` and the bridge manifest must expose the corresponding signing capability:

- ES256 signing → `SIGN_ES256`
- RS256 signing → `SIGN_RS256`
- mTLS use → `MTLS_CLIENT_AUTH`

An RSA registration cannot be carried by an ES256-only bridge.

## macOS Secure Enclave

Secure Enclave private keys must be generated inside the enclave. A future bridge will implement create-in-enclave, lookup, signing and platform evidence rather than import software keys.

```text
CIEAV provider: SECURE_ENCLAVE
platform: MACOS
native root: Security.framework / kSecAttrTokenIDSecureEnclave
attestation: APPLE_SECURE_ENCLAVE_KEY
```

## Linux TPM / PKCS#11

A Linux provider may project TPM-backed keys through an approved TPM/PKCS#11 stack. PKCS#11 identity alone is not proof of hardware backing; deployment-specific evidence remains mandatory.

## External KMS / HSM

External providers use `EXTERNAL_KMS`. Successful signing or possession of a cloud key identifier is not automatically hardware attestation. The provider-specific verifier must establish the assurance required by policy.

## Current qualification boundary

Implemented in source and deterministic qualification:

- provider/attestation/registration trust plane;
- exact Windows Platform Crypto Provider native bridge;
- P-256 ES256 opaque signing lane;
- RSA-2048 RS256 MAA request-key lane;
- private export-policy enforcement;
- independent MAA JWT verifier;
- issuer/JWKS/signature/freshness/nonce/policy/key/TPM-certify validation;
- algorithm-specific capability attenuation;
- adversarial verifier fixtures;
- Windows native compilation + fail-closed provider probe;
- Linux/macOS static native-source invariants.

Still pending:

1. live TPM evidence collection and AIK enrollment/invocation against a configured MAA provider;
2. feeding the live MAA JWT into the independent verifier on a physical TPM host;
3. a cryptographic attestation path for the P-256 consequence key itself, if supported and justified;
4. Credential Authority opaque-hardware signing for `private_key_jwt`, DPoP and provider signatures;
5. hardware-key mTLS integration;
6. macOS Secure Enclave, Linux TPM/PKCS#11 and external KMS/HSM bridges.

GitHub-hosted runner success qualifies compilation, deterministic verification logic and fail-closed hardware detection; it does not constitute physical-TPM or live-MAA deployment qualification.
