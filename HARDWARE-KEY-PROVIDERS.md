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

A `ProviderBridgeManifest` binds CIEAV to an exact native provider bridge executable by absolute path, SHA-256 digest, provider/platform, protocol version, explicit capabilities, allowed purposes, provider locator, and enabled/expiry state. CIEAV verifies the executable digest when the manifest is installed and again whenever a registered hardware key is used.

The bridge manifest is not itself evidence that a key is hardware-backed. It proves only which native integration code CIEAV is willing to trust.

## Key attestation

`HardwareKeyAttestation` binds evidence to one provider bridge, provider family, public-key fingerprint, evidence digest, normalized claims digest, verifier identity, verification time and optional expiration. Only `verification: VERIFIED` can back a hardware registration.

## Windows TPM / CNG

The repository now contains the first concrete native provider bridge at `native/windows-tpm-cng`.

It explicitly opens `Microsoft Platform Crypto Provider` through NCrypt and requires the provider implementation flags to report hardware and not software. It supports a narrow `CIEAV_KEY_PROVIDER_V1` command surface:

```text
probe
create-p256 <keyName>
describe <keyName>
sign-es256 <keyName> <sha256Hex>
```

`create-p256` uses the Platform Crypto Provider, creates a persistent ECDSA P-256 key, disables private export/archival policy before finalization, and exports only the public ECC blob. `describe` and `sign-es256` reopen the same named provider key and re-check private-export policy before use.

If the Platform Crypto Provider or TPM is unavailable, `probe` returns `available:false`, `hardwareBacked:false` and a nonzero status. There is no fallback to Microsoft Software Key Storage Provider.

Target mapping:

```text
CIEAV provider: TPM
platform: WINDOWS
native root: Microsoft Platform Crypto Provider / NCrypt
private key: opaque provider-managed key
attestation: WINDOWS_TPM_KEY_ATTESTATION
```

The bridge itself does **not yet** synthesize a `VERIFIED` TPM attestation record. Provider identity + hardware implementation flags + non-export policy are necessary but are not treated as an independently verified Windows TPM key-attestation claim. See `WINDOWS-TPM-CNG.md`.

## macOS Secure Enclave

Apple Secure Enclave private keys are generated in the enclave and cannot be imported into it. A future native macOS bridge must therefore implement create-in-enclave, lookup, signing and platform evidence rather than importing CIEAV software keys.

```text
CIEAV provider: SECURE_ENCLAVE
platform: MACOS
native root: Security.framework / kSecAttrTokenIDSecureEnclave
private key: opaque SecKey / Keychain reference
attestation: APPLE_SECURE_ENCLAVE_KEY
```

## Linux TPM and PKCS#11

A Linux bridge may project a TPM-backed key through an approved TPM/PKCS#11 stack while CIEAV binds to the exact bridge executable and token/key locator. PKCS#11 alone is not accepted as proof that a token is hardware-backed.

```text
CIEAV provider: TPM
platform: LINUX
native root: approved TPM / PKCS#11 implementation
private key: token object handle
attestation: PKCS11_TOKEN_KEY
```

## External KMS / HSM

External providers use `EXTERNAL_KMS`. Successful signing or a cloud key identifier is not automatically hardware attestation; a provider-specific verifier must establish the assurance required by policy.

## Registration invariants

A hardware key registration is accepted only when the bridge is enabled/current/digest-matched/platform-valid; attestation is verified/current/provider-bound; attested public fingerprint matches registration; purposes are attenuated to the manifest; required signing/mTLS capability exists; and the registration is explicitly non-exportable and hardware-backed. `assertUsable()` repeats bridge and attestation checks before use.

## State and authority boundary

The Agent Kernel owns `CieavHardwareKeyProviderRegistry` under a domain-separated HMAC secret. Registry state contains provider manifests, attestation metadata/digests and public registrations only. No TPM private key, Secure Enclave private key, PKCS#11 secret object, KMS private key, PIN or provider credential belongs in that state.

## Current qualification boundary

Implemented now:

- provider/attestation/registration trust plane;
- Windows CNG/NCrypt native bridge source and hardened MSVC build;
- exact Microsoft Platform Crypto Provider selection;
- hardware/software implementation flag enforcement;
- persistent ECDSA P-256 creation;
- private export-policy rejection;
- public-key-only export;
- opaque provider signing through `NCryptSignHash`;
- Windows CI compilation and fail-closed runtime probe;
- static invariant checks on Linux/macOS.

Still pending:

1. Windows TPM key-attestation claim creation and independent verification;
2. bridge invocation from Credential Authority for opaque-key `private_key_jwt` / DPoP / provider signatures;
3. hardware-key TLS integration for mTLS;
4. macOS Secure Enclave bridge;
5. Linux TPM/PKCS#11 bridge;
6. external KMS/HSM bridges.

GitHub-hosted runner success qualifies bridge compilation and fail-closed provider detection; it does not prove a production machine has a physical TPM. External release qualification remains pending.
