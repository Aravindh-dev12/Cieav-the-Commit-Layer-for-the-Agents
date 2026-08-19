# CIEAV Physical Hardware Qualification

Hosted CI validates source, compilation, fail-closed behavior and cross-platform integration. It does not qualify a release key as representative production hardware.

For a production release host, run:

```text
node scripts/release-gate.mjs --physical-hardware
```

The release gate sets `CIEAV_PHYSICAL_HARDWARE_QUALIFICATION=1` only for the physical qualification subprocess. The qualification subprocess refuses to run without that explicit opt-in. After physical qualification, hardware paths, provider references and Azure credentials are removed from the environment passed to the remaining release verification steps.

All native bridge paths used for physical qualification must be absolute, regular non-symlink files and must match a supplied SHA-256 digest.

## Windows: TPM + live Microsoft Azure Attestation

Required environment:

```text
CIEAV_WINDOWS_TPM_CNG_BRIDGE=<absolute path to cieav-windows-tpm-cng.exe>
CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256=<64 hex chars>
CIEAV_WINDOWS_MAA_CONFIG=<absolute path to collector JSON config>
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

The MAA config is the same strict object accepted by `CieavWindowsTpmMaaCollector`. It must include both `requestKeyName` and `consequenceKeyName`, the digest-pinned collector executable/DLL closure, AIK settings, relying-party ID, issuer and expected policy hash.

Qualification requires all of the following:

1. Microsoft Platform Crypto Provider reports hardware backing.
2. The pre-provisioned P-256 consequence key and RSA MAA request key resolve as non-exportable hardware-backed keys.
3. The P-256 consequence key signs a fresh 64-byte random challenge digest through CNG; Node independently verifies the returned IEEE-P1363 ES256 signature against the resolved JWK.
4. The live collector obtains a fresh MAA report using a CIEAV-owned nonce.
5. `CieavMaaTpmAttestationVerifier` independently verifies the report, including issuer/JWKS/signature/freshness/policy, exact RSA request key, TPM certify attributes and the exact P-256 consequence key in `x-ms-tpm-other-keys`.
6. The MAA consequence-key fingerprint must equal the independently challenge-verified signing-key fingerprint.

A configured TPM key that can sign but cannot produce the required live MAA evidence does not qualify.

## macOS: Secure Enclave

Required environment:

```text
CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE=<absolute path to cieav-macos-secure-enclave>
CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256=<64 hex chars>
CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME=<pre-provisioned key name>
```

Qualification requires:

1. The bridge probe reports `Security.framework Secure Enclave`, `available:true`, `hardwareBacked:true`.
2. `describe` resolves the exact pre-provisioned P-256 key with `hardwareBacked:true` and `exportable:false`.
3. The key signs a fresh random challenge digest using the Secure Enclave digest-signing operation.
4. Node independently verifies the returned IEEE-P1363 ES256 signature against the resolved public JWK.

This is physical local Secure Enclave qualification. It is not described as Apple remote attestation.

## Linux: PKCS #11 + deployment verifier

Required environment:

```text
CIEAV_LINUX_PKCS11_BRIDGE=<absolute path to cieav-linux-pkcs11>
CIEAV_LINUX_PKCS11_BRIDGE_SHA256=<64 hex chars>
CIEAV_LINUX_PKCS11_PROVIDER_REF=module=/absolute/vendor.so|slot=<id>|id=<hex>|pinfile=/absolute/protected-pin-file
CIEAV_LINUX_ATTESTATION_EVIDENCE=<absolute path to signed JSON statement>
CIEAV_LINUX_ATTESTATION_PUBLIC_KEY=<absolute path to trusted Ed25519 verifier public key PEM>
```

Generic PKCS #11 deliberately remains `hardwareBacked:false` and `attestationRequired:true`. Physical qualification first proves that the exact PKCS #11 key can perform an opaque P-256 signature, then separately requires deployment-verifier evidence for that exact key.

The evidence JSON contains a detached-signature envelope. `signature` is base64url Ed25519 over CIEAV canonical JSON of every other field. The signed statement must include:

```json
{
  "version": 1,
  "provider": "PKCS11",
  "hardwareBacked": true,
  "verification": "VERIFIED",
  "providerRefDigest": "<sha256 of exact provider reference>",
  "publicKeyFingerprint": "<sha256 of canonical P-256 JWK>",
  "verifiedAt": "<ISO-8601 timestamp>",
  "expiresAt": "<future ISO-8601 timestamp>",
  "verifiedBy": "<deployment verifier identity>",
  "signature": "<base64url Ed25519 signature>"
}
```

The deployment verifier is responsible for validating the actual TPM/HSM evidence appropriate to that approved module and device. CIEAV's qualification gate authenticates the verifier statement, checks freshness, binds the exact provider reference and exact public key, and then requires the same key to pass independent opaque-signature verification.

A software PKCS #11 module cannot qualify merely by returning valid ECDSA signatures.

## Release evidence

A successful physical gate prints only platform, qualification results and public-key fingerprints. Private keys, PIN values, access tokens, Azure client secrets and provider credentials are not written into release evidence by this gate.

Physical qualification is intentionally separate from hosted CI. Each production release population should retain its own signed release evidence identifying the representative machines/tokens, bridge digests, public-key fingerprints, verifier identity and qualification time.