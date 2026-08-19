# CIEAV Windows TPM / CNG Native Bridge

This bridge is the first concrete hardware-key provider implementation behind the CIEAV Hardware Key Provider Trust Plane.

## Provider boundary

The executable `cieav-windows-tpm-cng.exe` talks only to the Windows CNG Key Storage API and explicitly opens `Microsoft Platform Crypto Provider` (`MS_PLATFORM_CRYPTO_PROVIDER`). CIEAV does not accept the default key-storage provider and does not fall back to Microsoft Software Key Storage Provider.

At startup/use the bridge reads `NCRYPT_IMPL_TYPE_PROPERTY` and requires `NCRYPT_IMPL_HARDWARE_FLAG`. If the provider also reports `NCRYPT_IMPL_SOFTWARE_FLAG`, the bridge rejects it.

## Key creation

`create-p256 <keyName>` creates a persistent `BCRYPT_ECDSA_P256_ALGORITHM` key in the Platform Crypto Provider, sets the private export policy to zero before finalization, finalizes the key, re-reads export policy, and exports only `BCRYPT_ECCPUBLIC_BLOB` for public registration.

The command never returns a private key blob.

## Signing

`sign-es256 <keyName> <sha256Hex>` reopens the named key through the Platform Crypto Provider, re-checks that private export/archival policy is disabled, and calls `NCryptSignHash` over exactly one 32-byte digest. The bridge returns the ECDSA signature and no key material.

## Probe semantics

`probe` returns JSON using protocol `CIEAV_KEY_PROVIDER_V1`.

If the Platform Crypto Provider is available and reports hardware implementation, the command exits 0 with `available:true` and `hardwareBacked:true`.

If the provider/TPM is unavailable, the command exits 20 with `available:false` and `hardwareBacked:false`.

Unavailable hardware is not a reason to substitute a software key.

## Attestation boundary

This bridge proves provider identity, provider implementation type, non-export policy, public-key identity, and native signing. It does **not yet** create a Windows TPM key-attestation claim that is independently verified by CIEAV. Therefore this phase must not automatically produce a `VERIFIED` `WINDOWS_TPM_KEY_ATTESTATION` record solely from `probe`, `create-p256`, or `describe` output.

The next Windows depth is a provider-specific attestation verifier using the Windows TPM/CNG attestation mechanisms. Only after that verifier succeeds may the Hardware Key Provider Registry register the key as trusted `hardwareBacked:true` for CIEAV authority use.

## Qualification

`scripts/windows-tpm-cng-release.mjs` performs source/build invariant checks on every OS and compiles the bridge on the Windows GitHub runner. The Windows runtime probe is accepted only in one of two states:

- real Platform Crypto Provider hardware is available and reports hardware backing; or
- hardware is unavailable and the bridge fails closed without claiming hardware backing.

GitHub-hosted runner success therefore qualifies the native bridge/build/fail-closed boundary, not physical TPM deployment or external release qualification.
