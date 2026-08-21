# Windows TPM native attestation

CIEAV supports two Windows TPM attestation backends:

- **Native local attestation** — Azure-free. Uses Windows CNG/Platform Crypto Provider APIs on the release host to create nonce-bound key-attestation claims and then performs a separate local `NCryptVerifyClaim` verification pass.
- **Microsoft Azure Attestation (MAA)** — optional managed remote attestation. The existing MAA collector/verifier remains supported and is not replaced by the native backend.

These backends provide different assurance boundaries. Native attestation is deliberately reported as `LOCAL_WINDOWS`; it is **not** represented as remote attestation and is not treated as equivalent to an independently operated MAA verifier.

## Native trust contract

A native `VERIFIED` result requires all of the following:

1. `Microsoft Platform Crypto Provider` reports a hardware implementation and does not report a software implementation.
2. The release RSA request key and P-256 consequence key are opened from that provider and have no private-export policy enabled.
3. The machine AIK exposes an X.509 certificate through `NCRYPT_CERTIFICATE_PROPERTY`.
4. The leaf AIK certificate explicitly contains EKU OID `2.23.133.8.3` (TPM Attestation Identity Key certificate). CIEAV reads the certificate extension itself with `CERT_FIND_EXT_ONLY_ENHKEY_USAGE_FLAG`; an absent EKU is not treated as “all usages.”
5. The certificate public key exactly matches the opened AIK public key.
6. Deployment configuration pins the exact AIK leaf certificate SHA-256 digest and the exact AIK trust-root certificate SHA-256 digest.
7. The native bridge first discovers the Windows-built AIK chain, requires its terminus to match the configured root digest and to be a valid self-signed root, then rebuilds the chain with `CertCreateCertificateChainEngine` using that certificate as `hExclusiveRoot`. This is application-local trust; CIEAV does not add the root to the machine-wide Trusted Root store.
8. The exclusive-root chain must pass certificate policy for the AIK EKU with revocation checking for the chain excluding the pinned root. Automatic AuthRoot updates are disabled for this verification pass.
9. CIEAV generates a fresh random nonce for every attempt.
10. `NCryptCreateClaim` creates nonce-bound key-attestation claims for both the RSA request key and P-256 consequence key under the AIK.
11. CIEAV independently checks the public JWKs returned by the native collector against the expected release keys.
12. Claim bytes are handed to a separate `verify` invocation, which reopens the AIK and release keys and runs `NCryptVerifyClaim` for each claim using the same nonce and pinned root.
13. The verifier result must still bind the same AIK certificate, root certificate, AIK public key, request key, consequence key and nonce before the API can store a `VERIFIED` hardware attestation.

The native executable is also required to be an absolute, regular, non-symlink file with a configured SHA-256 digest. Adjacent DLLs are rejected because this bridge is intended to depend only on Windows system libraries.

## AIK bootstrap and trust-root pinning

The bridge exposes two read-only AIK commands. Neither command creates, deletes or rotates TPM keys.

`describe-aik` validates the AIK leaf certificate EKU and exact AIK public-key binding, then reports the chain terminus that Windows currently builds, its SHA-256 fingerprint, whether the terminus is self-signed, and the normal Windows system-chain policy result. This is diagnostic/bootstrap output; it is **not** a `VERIFIED` attestation result.

```powershell
& $NativeBridge describe-aik --aik cieav-release-aik-v1
```

The expected output includes:

- `aikCertificateSha256`
- `rootCandidateSha256`
- `rootCandidateSelfSigned`
- `systemTrusted`
- `systemChainPolicyError`

An operator must independently approve the reported root candidate before making it a deployment pin. Do not blindly copy a root fingerprint from an untrusted machine into production configuration.

After the root has been approved, `inspect-aik` performs the full application-local exclusive-root validation:

```powershell
& $NativeBridge inspect-aik `
  --aik cieav-release-aik-v1 `
  --expected-root-sha256 <approved-root-sha256>
```

Only a successful `inspect-aik` result should be used to establish the AIK leaf/root pins for physical qualification.

## Configuration

The pinned JSON configuration used by the API/native physical qualification has this shape:

```json
{
  "executablePath": "C:\\CIEAV\\release\\windows-tpm-native-attestation\\cieav-windows-tpm-native-attestation.exe",
  "executableSha256": "<64 lowercase hex>",
  "aikName": "cieav-release-aik-v1",
  "aikMachineKey": true,
  "expectedAikCertificateSha256": "<64 lowercase hex>",
  "expectedAikRootCertificateSha256": "<64 lowercase hex>",
  "requestKeyName": "cieav-maa-request-rsa-v1",
  "consequenceKeyName": "cieav-release-consequence-p256-v1",
  "timeoutMs": 30000,
  "attestationTtlSeconds": 900
}
```

Do not recreate the AIK merely to change a pin. If the leaf certificate or trusted root legitimately changes, treat that as trust-policy rotation and requalify the machine.

The physical runner additionally pins the configuration file itself with:

- `CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG`
- `CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256`

The TPM/CNG signing bridge remains independently pinned by:

- `CIEAV_WINDOWS_TPM_CNG_BRIDGE`
- `CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256`

## Physical release workflow

The manual physical qualification workflow defaults Windows to `windows_attestor=native`. Selecting `maa` instead uses the existing Azure MAA path and its Azure credentials. Native qualification intentionally receives no Azure credentials.

A native Windows physical PASS means:

- a physical Platform Crypto Provider TPM was reachable;
- the exact non-exportable P-256 consequence key produced a fresh signature that CIEAV independently verified;
- the exact RSA and P-256 keys passed nonce-bound native key attestation under the pinned AIK certificate;
- the AIK certificate terminated at the exact pinned exclusive trust root;
- Windows EKU/time/signature/revocation checks and `NCryptVerifyClaim` succeeded locally.

It does **not** mean that an independent remote party verified the evidence.

## Measured boot is a separate increment

Key attestation proves binding of the release keys to the TPM/AIK trust path. Platform-state/Measured Boot attestation is separate evidence. Windows also supports `NCryptCreateClaim` with `NCRYPT_CLAIM_PLATFORM`, a PCR mask and a nonce/challenge. CIEAV will add that as a distinct measured-boot evidence lane rather than quietly treating key attestation as proof of Secure Boot/PCR state.

Until that platform-evidence lane is implemented and physically exercised, the native backend should not be described as providing the same boot-state assurance as a full TPM remote-attestation service.
