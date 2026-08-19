# CIEAV Hardware Key Provider Plane

CIEAV distinguishes **software-wrapped** keys from **hardware-backed** keys. A key does not become hardware-backed because a configuration field says so. CIEAV requires a provider bridge, key-specific attestation evidence, and a public-key binding before a `HardwareKeyRegistration` can carry `hardwareBacked: true`.

## No software fallback

The central rule is:

> **No software fallback.**

If an intent, policy, credential profile, or downstream service requires a TPM, Secure Enclave, HSM/KMS, or other hardware-rooted key, failure of that provider must stop the operation. CIEAV must not silently create or reuse a `LOCAL_WRAPPED_P256` key instead.

```text
required hardware provider
        ↓
provider bridge available?
        ↓ no → BLOCK
bridge digest matches?
        ↓ no → BLOCK
verified key attestation current?
        ↓ no → BLOCK
public key fingerprint matches attestation?
        ↓ no → BLOCK
purpose/capability permitted?
        ↓ no → BLOCK
hardware key registration usable
```

## Provider bridge

A `ProviderBridgeManifest` binds CIEAV to an exact native provider bridge executable:

- absolute executable path;
- SHA-256 executable digest;
- provider kind and operating-system scope;
- protocol version `CIEAV_KEY_PROVIDER_V1`;
- explicit capabilities;
- allowed CIEAV key purposes;
- provider locator;
- enabled/expiry state.

CIEAV verifies the bridge digest when the manifest is installed **and again whenever a hardware key is used**. Replacing a previously approved helper binary therefore invalidates the key path.

The bridge manifest is not itself evidence that a key is hardware-backed. It proves only which native integration code CIEAV is willing to trust.

## Key attestation

`HardwareKeyAttestation` binds evidence to:

- one provider bridge manifest;
- one provider family;
- one public-key fingerprint;
- one evidence digest;
- one normalized claims digest;
- a verifier identity and verification time;
- optional expiration.

Only `verification: VERIFIED` is accepted for hardware-key registration. `UNVERIFIED` and `REJECTED` evidence cannot produce `hardwareBacked: true`.

The current registry deliberately stores **evidence digests and claims digests**, not arbitrary raw attestation blobs. Platform-specific verifiers can retain or reference raw evidence separately while the core preserves the binding needed for authorization and audit.

## Windows TPM / CNG

Windows exposes key-storage providers through CNG. The **Microsoft Platform Crypto Provider** is the TPM-backed key storage provider. A Windows native bridge should use CNG/NCrypt handles rather than exporting private key bytes, and should collect key-attestation evidence before CIEAV registers the key as hardware-backed.

Target provider mapping:

```text
CIEAV provider: TPM
platform: WINDOWS
native root: Microsoft Platform Crypto Provider / NCrypt
private key: opaque provider handle
attestation: WINDOWS_TPM_KEY_ATTESTATION
```

A Windows TPM bridge is not yet implemented in this repository. The registry makes its prerequisites explicit and fail closed.

## macOS Secure Enclave

Apple Secure Enclave private keys are generated in the enclave and cannot be imported into it. The supported enclave key class is P-256 elliptic-curve private keys. A native macOS bridge must therefore implement **create-in-enclave**, lookup, signing, and platform evidence rather than importing CIEAV software keys.

Target provider mapping:

```text
CIEAV provider: SECURE_ENCLAVE
platform: MACOS
native root: Security.framework / kSecAttrTokenIDSecureEnclave
private key: opaque SecKey / Keychain reference
attestation: APPLE_SECURE_ENCLAVE_KEY
```

CIEAV rejects `SECURE_ENCLAVE` bridge manifests declared for Windows or Linux.

## Linux TPM and PKCS#11

PKCS#11 defines a common Cryptoki interface for cryptographic tokens and devices. For Linux TPM deployments, a native bridge can project a TPM-backed key through an approved TPM/PKCS#11 stack while CIEAV binds to the exact bridge executable and token/key locator.

Target mapping:

```text
CIEAV provider: TPM
platform: LINUX
native root: approved TPM / PKCS#11 implementation
private key: token object handle
attestation: PKCS11_TOKEN_KEY
```

PKCS#11 by itself does **not** prove that a token is hardware backed; the attestation verifier must establish the deployment-specific hardware claim. CIEAV therefore does not infer `hardwareBacked: true` from a PKCS#11 URI alone.

## External KMS / HSM

External KMS/HSM providers use `EXTERNAL_KMS`. The bridge may be platform-independent, but hardware-backed registration still requires verified evidence bound to the returned public key fingerprint.

A cloud KMS API response, key identifier, or successful signature is not automatically hardware attestation. The verifier must establish whatever hardware/HSM assurance the policy requires, and CIEAV stores the resulting evidence/claims digests.

## Registration invariants

A hardware key registration is accepted only when:

1. the provider manifest exists, is enabled, unexpired, valid for the current platform, and its executable digest matches;
2. attestation is `VERIFIED`, unexpired, and belongs to the same provider manifest/provider;
3. attestation kind is compatible with the provider;
4. attested public-key fingerprint equals the registration fingerprint;
5. requested purposes are a subset of the manifest allowlist;
6. required signing or mTLS capability is declared;
7. the public registration is explicitly `hardwareBacked: true` and `exportable: false`.

`assertUsable()` repeats the bridge and attestation checks before use.

## State and authority boundary

The Agent Kernel owns `CieavHardwareKeyProviderRegistry` under a domain-separated HMAC state secret. Registry state is authenticated and atomically persisted. It contains provider manifests, attestation metadata/digests, and public hardware-key registrations only.

No TPM key material, Secure Enclave private key, PKCS#11 secret object, KMS private key, PIN, session credential, or provider secret belongs in this state file.

## What is implemented now

Implemented and cross-platform-testable in this phase:

- provider/attestation/registration contracts;
- digest-pinned native bridge manifests;
- provider/platform compatibility policy;
- verified-attestation requirement;
- public-key fingerprint binding;
- capability and purpose attenuation;
- authenticated durable registry state;
- revalidation of bridge digest and attestation on key use;
- kernel-owned registry lifecycle;
- fail-closed tests for bridge replacement, unverified evidence, impossible platform declarations, and state tampering.

## What this phase does not claim

This phase does **not** claim that GitHub-hosted runners possess a TPM, Secure Enclave, or production HSM. It does not mark any built-in CIEAV key as hardware-backed by default.

Concrete native bridges remain next:

1. Windows CNG/NCrypt bridge for Microsoft Platform Crypto Provider;
2. macOS Security.framework Secure Enclave bridge;
3. Linux TPM/PKCS#11 bridge;
4. external KMS/HSM bridge adapters;
5. provider-specific attestation verifiers;
6. opaque-key signing integration for private_key_jwt, DPoP, HTTP Message Signatures, and provider signatures;
7. native mTLS transport that can use opaque hardware key handles where the runtime TLS stack cannot consume them directly.

The architecture is intentionally structured so those providers can be added without changing CIEAV's higher-level Intent → Authority → Commit → Credential → Execution → Proof semantics.
