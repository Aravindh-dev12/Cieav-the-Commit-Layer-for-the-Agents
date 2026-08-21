# Windows TPM native physical qualification — 2026-08-21

Status: **PASS for the CIEAV Azure-free Windows native key-attestation lane**.

This record is intentionally narrower than a full release qualification. It records a real physical Windows TPM run of CIEAV's local native key-attestation path. It does **not** claim remote attestation, measured-boot/PCR qualification, hardware-backed mTLS, or stronger same-user process isolation.

## Qualified machine evidence

The physical qualification script completed successfully with the following trust bindings:

- native protocol: `CIEAV_WINDOWS_TPM_NATIVE_ATTESTATION_V1`
- TPM provider: `Microsoft Platform Crypto Provider`
- provider hardware availability: `true`
- native attestation mode: `LOCAL_WINDOWS`
- native release bridge SHA-256: `aa145404d3fa65035cd0330a785f73abfe2b7edee2cbd51334ae8ca927f2992a`
- pinned native qualification config SHA-256: `e1c8f72a86e97d2d935a67a1d6066de43128efa083b76452afe47156f8a97f35`
- existing TPM/CNG bridge SHA-256: `7fff2d70ddb202ec6ad2df8912811ada5542ca77a5908a5cb0aa6a2c71b141ac`
- AIK name: `cieav-release-aik-v1`
- AIK scope: machine key
- AIK leaf certificate SHA-256: `35eba671ad308db28ed2ef4e425f4a6e9ddf8242b6a9967561c3a4b667dfed4e`
- AIK EKU: `2.23.133.8.3`
- approved AIK trust root SHA-256: `870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da`
- approved root policy id: `microsoft-tpm-root-ca-2014`
- trust-anchor mode: `PINNED_EXCLUSIVE_ROOT`
- revocation policy: `ISSUING_CA_REQUIRED_LEAF_UNKNOWN_ALLOWED`
- Windows system-chain status remained `0x800B0109`; this does not override the separately validated CIEAV exclusive-root chain.
- request key: `cieav-maa-request-rsa-v1`
- consequence key: `cieav-release-consequence-p256-v1`
- exact consequence public-key fingerprint: `adb421e4603f923fb7eab22c002629d8571d17a64a4a82519787bd5566668ce3`
- remote attestation: `false`

## What physically passed

The physical qualification gate established all of the following on the real Windows machine:

1. The Microsoft Platform Crypto Provider was reachable and reported hardware backing.
2. The exact P-256 consequence key remained non-exportable and hardware-backed.
3. A fresh opaque challenge was signed with that consequence key and independently verified against its public JWK.
4. The exact RSA request key remained non-exportable and hardware-backed.
5. The enrolled AIK certificate contained the TPM AIK EKU and its public key exactly matched the AIK handle.
6. The AIK chain terminated at the explicitly approved Microsoft TPM root and was revalidated under an application-local exclusive-root chain engine.
7. Revocation status remained mandatory for issuing CAs; only unknown end-certificate revocation information was tolerated.
8. Fresh nonce-bound `NCryptCreateClaim` key-attestation claims were created for the exact request and consequence keys.
9. The claims were handed to a separate verification invocation and accepted only after `NCryptVerifyClaim` succeeded under the same AIK/root/nonce/key bindings.
10. CIEAV emitted `VERIFIED` only after the exact consequence-key fingerprint matched the independently verified signing key.

Final physical gate output:

```text
CIEAV physical Windows TPM native qualification PASS · TPM opaque-sign verified · local nonce-bound AIK key claims verified · pinned AIK certificate=35eba671ad308db28ed2ef4e425f4a6e9ddf8242b6a9967561c3a4b667dfed4e · pinned AIK root=870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da (microsoft-tpm-root-ca-2014) · revocation=ISSUING_CA_REQUIRED_LEAF_UNKNOWN_ALLOWED · exact consequence fingerprint=adb421e4603f923fb7eab22c002629d8571d17a64a4a82519787bd5566668ce3 · remote-attestation=false
```

## Pre-qualification software checks

Immediately before the physical gate, the Windows native bridge release gate passed, repository typechecking passed, and the focused API native-attestation test suite passed 8/8.

The repository-wide umbrella test remains separately blocked by the existing Python/package version mismatch (`cieav_platform` 0.7.0 versus package 0.8.0). That mismatch is not evidence against the native TPM qualification above and must be tracked as its own repository/release issue.

## Assurance boundary

This PASS closes the **Azure-free Windows local key-attestation physical gate** for this qualified bridge/config/key identity.

It does not establish:

- independent remote attestation;
- PCR/Measured Boot state verification;
- replay of the Windows Boot Configuration Log / TCG event log;
- Secure Boot policy derived from measured events;
- hardware-backed mTLS client authentication;
- stronger protection against another process running as the same Windows user.

Any change to the native bridge bytes, qualification config, AIK leaf certificate, approved AIK root policy, request key, or consequence key requires requalification rather than inheriting this PASS.
