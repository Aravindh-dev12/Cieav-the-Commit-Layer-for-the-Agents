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
6. Windows certificate-chain validation succeeds for the AIK EKU with revocation checking for the chain excluding the root.
7. Deployment configuration pins the exact AIK certificate SHA-256 digest. A different otherwise-trusted AIK is rejected.
8. CIEAV generates a fresh random nonce for every attempt.
9. `NCryptCreateClaim` creates nonce-bound key-attestation claims for both the RSA request key and P-256 consequence key under the AIK.
10. CIEAV independently checks the public JWKs returned by the native collector against the expected release keys.
11. Claim bytes are handed to a separate `verify` invocation, which reopens the AIK and release keys and runs `NCryptVerifyClaim` for each claim using the same nonce.
12. The verifier result must still bind the same AIK certificate, AIK public key, request key, consequence key and nonce before the API can store a `VERIFIED` hardware attestation.

The native executable is also required to be an absolute, regular, non-symlink file with a configured SHA-256 digest. Adjacent DLLs are rejected because this bridge is intended to depend only on Windows system libraries.

The bridge exposes `inspect-aik --aik <name>` as a non-mutating bootstrap command. It performs the same AIK certificate/public-key/EKU/chain/revocation checks and emits the certificate SHA-256 so an operator can establish `expectedAikCertificateSha256` without generating claims or recreating any TPM key.

## Configuration

The pinned JSON configuration used by the API/native physical qualification has this shape:

```json
{
  "executablePath": "C:\\CIEAV\\release\\windows-tpm-native-attestation\\cieav-windows-tpm-native-attestation.exe",
  "executableSha256": "<64 lowercase hex>",
  "aikName": "cieav-release-aik-v1",
  "aikMachineKey": true,
  "expectedAikCertificateSha256": "<64 lowercase hex>",
  "requestKeyName": "cieav-maa-request-rsa-v1",
  "consequenceKeyName": "cieav-release-consequence-p256-v1",
  "timeoutMs": 30000,
  "attestationTtlSeconds": 900
}
```

After building the bridge, establish the AIK pin with a read-only inspection such as:

```powershell
& $NativeBridge inspect-aik --aik cieav-release-aik-v1
```

Record only the returned `aikCertificateSha256` value in the configuration. Do not recreate the AIK merely to change this pin.

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
- Windows chain/EKU/revocation checks and `NCryptVerifyClaim` succeeded locally.

It does **not** mean that an independent remote party verified the evidence.

## Measured boot is a separate increment

Key attestation proves binding of the release keys to the TPM/AIK trust path. Platform-state/Measured Boot attestation is separate evidence. Windows also supports `NCryptCreateClaim` with `NCRYPT_CLAIM_PLATFORM`, a PCR mask and a nonce/challenge. CIEAV will add that as a distinct measured-boot evidence lane rather than quietly treating key attestation as proof of Secure Boot/PCR state.

Until that platform-evidence lane is implemented and physically exercised, the native backend should not be described as providing the same boot-state assurance as a full TPM remote-attestation service.
