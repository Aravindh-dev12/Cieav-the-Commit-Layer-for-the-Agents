# CIEAV Hardware Key Provider Plane

CIEAV distinguishes **software-wrapped** keys from **hardware-backed** keys. A provider name is never proof of hardware. A usable hardware registration requires a digest-pinned native bridge, key-specific verified evidence, an exact public-key fingerprint and an opaque provider key reference that resolves back to that same public key immediately before signing.

## Core fail-closed invariant

```text
hardware required
  ↓
pinned bridge is a regular non-symlink file and digest matches
  ↓
platform/provider/capability/purpose match
  ↓
current VERIFIED key evidence exists
  ↓
providerKeyRef -> describe -> exact registered JWK fingerprint
  ↓
opaque digest signing
  ↓
no software fallback
```

If any step fails, CIEAV blocks the operation. `LOCAL_WRAPPED_P256` is never substituted for a hardware-required key.

## Shared signing boundary

`CieavHardwareSigner` revalidates the registry trust chain and resolves the provider-native `providerKeyRef` through `describe`/`describe-rsa` before every signature. The public JWK returned by the provider must exactly match the registered JWK and fingerprint. Only then does the bridge receive the signing operation, opaque key reference and a 32-byte SHA-256 digest.

Hardware private-key bytes never enter CIEAV state.

## Windows — TPM / CNG / Microsoft Azure Attestation

The Windows bridge at `native/windows-tpm-cng` uses the Microsoft Platform Crypto Provider through NCrypt. It requires the provider to report hardware implementation and rejects a software implementation. Persistent P-256 and RSA-2048 keys are created with private export/archival disabled and that policy is rechecked before use.

Two key roles remain intentionally separate:

- **P-256 ES256 consequence key** — `create-p256`, `describe`, `sign-es256`.
- **RSA-2048 MAA request key** — `create-rsa-2048`, `describe-rsa`, `sign-rs256`.

The live collector at `native/windows-tpm-maa-collector` includes the P-256 consequence key as an MAA `other_key`. `CieavMaaTpmAttestationVerifier` verifies the signed MAA JWT, expected issuer/JWKS/signature/freshness/nonce/policy, the exact RSA request key and the exact expected P-256 key in `x-ms-tpm-other-keys`. Both certified-key paths require TPM `name_alg == 11` and `obj_attr == 50` and reject a non-SHA-256 quote when present.

When an expected consequence key is supplied, the resulting `WINDOWS_TPM_KEY_ATTESTATION.publicKeyFingerprint` is the **P-256 consequence key fingerprint**, not the RSA request-key fingerprint. This closes the previous co-residency gap.

The verifier's OpenID metadata and JWKS transport is also fail-closed: HTTPS is mandatory, loopback/private/link-local/multicast/documentation addresses are rejected, mixed public/private DNS answers are rejected, the accepted address is pinned into the actual TLS request, redirects are not followed and response size/time limits apply. TLS still authenticates the original issuer hostname.

The collector executable and complete adjacent DLL closure are digest pinned, symlinks/non-regular files are rejected, undeclared adjacent DLLs are rejected, a fresh CIEAV-owned nonce is generated per collection, the issuer/policy are pinned and the child environment excludes inherited PATH/proxy/runtime-injection variables.

Physical TPM + enrolled AIK + live MAA qualification remains a release-host requirement; GitHub-hosted source checks cannot substitute for it.

## macOS — Secure Enclave

The bridge at `native/macos-secure-enclave/main.swift` uses Security.framework and `kSecAttrTokenIDSecureEnclave`.

It supports:

```text
probe
create-p256 <keyName>
describe <keyName>
sign-es256 <keyName> <sha256-digest-hex>
```

Keys are generated inside the Secure Enclave, persisted by application tag, checked for the Secure Enclave token attribute and rejected if private external representation is available. Public P-256 material is exported as JWK; signatures are produced with `ecdsaSignatureDigestX962SHA256` and normalized to 64-byte IEEE-P1363 ES256 form.

`CieavSecureEnclaveAttestor` provides the trusted **local** evidence path. It uses the digest-pinned bridge to require a successful Secure Enclave probe, an exact non-exportable P-256 `describe` result and an optional expected JWK match before creating short-lived `APPLE_SECURE_ENCLAVE_KEY` evidence. This is local platform evidence, not a claim of Apple remote attestation.

On a Mac without a usable Secure Enclave, the probe reports `available:false` / `hardwareBacked:false` and the hardware path stops.

## Linux — PKCS #11 / TPM / HSM

The bridge at `native/linux-pkcs11/main.cpp` is vendor-module agnostic and uses the standard PKCS #11 `C_GetFunctionList` entry point. Its opaque provider reference binds:

```text
module=/absolute/vendor-pkcs11.so|slot=<slot-id>|id=<CKA_ID hex>|pinfile=/protected/pin-file
```

The bridge:

- rejects non-absolute, symlinked or non-regular module/PIN files;
- requires the PIN file to deny group/other access and be owned by the service user or root;
- requires the configured slot to contain a present token;
- finds exactly one EC public/private key pair by `CKA_ID`;
- verifies `CKA_EC_PARAMS` is P-256 and reads `CKA_EC_POINT` for the exact public JWK;
- signs the 32-byte digest using `CKM_ECDSA` and requires 64-byte raw P-256 output.

A successful PKCS #11 operation **does not itself prove hardware**. The bridge deliberately reports `hardwareBacked:false` and `attestationRequired:true`. A Linux deployment can register the key as hardware-backed only after a trusted verifier inserts current key-specific `PKCS11_TOKEN_KEY` evidence establishing the assurance required for that token/TPM/HSM. This prevents software PKCS #11 modules from self-promoting to hardware trust.

The generic Gateway admin route therefore returns `501 linux_hardware_attestation_verifier_required` for Linux attestation. Each approved Linux TPM/HSM deployment must provide a verifier for its actual evidence format before CIEAV will accept the key as hardware-backed.

## External KMS / HSM

`EXTERNAL_KMS` remains supported by the generic provider plane. Signing success or possession of a cloud key identifier is not attestation. Provider-specific evidence must bind the exact public key and assurance level before a registration can be trusted as hardware-backed.

## Gateway-only lifecycle administration

Credential and hardware lifecycle management is mounted under the existing Gateway-authenticated Agent Kernel namespace rather than on a second administrative surface:

```text
/v1/agent-kernel/credential-authority/...
/v1/agent-kernel/hardware-key-providers/...
```

Software-wrapped key/profile lifecycle is delegated to `CieavCredentialAuthorityApi`. Hardware manifests and key registrations can be managed there, but there is deliberately **no generic POST endpoint for `verification: VERIFIED` hardware evidence**.

Verified hardware evidence is produced only by a CIEAV platform verifier/attestor:

- macOS: `CieavSecureEnclaveAttestor`;
- Windows: live `CieavWindowsTpmMaaCollector` + independent `CieavMaaTpmAttestationVerifier`;
- Linux: deployment-specific TPM/HSM verifier required.

A key registration still passes through `CieavHardwareKeyProviderRegistry`, so a caller cannot register an alleged hardware-backed key without a current verified evidence object bound to the same manifest/provider/public-key fingerprint.

## Credential integration

The Credential Authority supports explicit `LOCAL` or `HARDWARE` JOSE signing for DPoP and `private_key_jwt`. Hardware selection never falls back to local signing. Credential derivation is durably **at-most-once per consumed execution ticket**: the derivation binding is persisted before token acquisition, so a ticket cannot mint another credential after a restart, concurrent call or ambiguous downstream failure.

Credential Authority state upgrades preserve authentication semantics: an existing state file is MAC-verified in its exact stored legacy shape before the new derivation journal default is applied. A modified legacy payload still fails integrity verification.

Hardware mTLS remains separate. The current Node TLS path requires software private-key bytes, so CIEAV still rejects pretending an opaque TPM/Secure-Enclave/PKCS#11 key can be used as hardware mTLS. A provider-native TLS implementation is required before that claim can be enabled.

## Root secret storage and process boundary

The strong root secret from which Agent Kernel subsystem state keys are domain-separated is OS-encrypted at rest in the packaged production runtime:

- Windows: current-user DPAPI;
- macOS: Keychain;
- Linux: Secret Service through `secret-tool` and the user D-Bus session.

Production secure-storage policy refuses an unencrypted file backend unless an explicit diagnostic override is configured. Legacy private-file secrets are migrated with read-back verification before deletion.

The Python Gateway strips inherited signing and Gateway-capability variables from the managed semantic environment. Production starts `apps/api/dist/managed-entry.js` with a private anonymous stdin pipe and sends an exact four-field bootstrap: JWT root, receipt-signing root, durable privileged Gateway bearer, and a distinct random process-scoped semantic-router capability. The Python side serializes this into a mutable buffer and overwrites it immediately after delivery. The managed Node entry independently caps input size, rejects TTY/no-pipe startup, overwrites received and concatenated byte buffers, rejects oversized, weak, malformed, duplicated, reused-scope or unexpected fields, consumes the bootstrap before importing `server.js`, and fails if equivalent credentials are also present in the process environment.

The durable privileged Gateway bearer is not retained raw in Node configuration. It is converted to a fixed SHA-256 verifier; inbound trusted-Gateway requests hash the presented bearer and use constant-time digest comparison. Hugging Face semantic routing uses only the distinct semantic-router capability. The Python control plane accepts that narrower capability only on the semantic `/v1/hf/*` surface and rejects it on privileged pause/resume/dashboard and related control routes. The browser receives none of the JWT, receipt-signing, privileged Gateway or semantic-router capabilities.

This materially reduces ambient secret exposure compared with inherited environment variables and removes the raw privileged Gateway bearer from long-lived Node configuration, but it is **not same-user process isolation**. The Gateway and semantic process still hold cryptographic material required for their duties in memory, and provider-native keys remain usable according to their underlying OS/HSM access policy. Direct hardware sealing, secret rotation, stronger provider ACLs and a narrowly privileged signer/credential broker remain further hardening work.

## CI and release qualification

The hosted cross-platform matrix executes provider, lifecycle and root-secret gates on Ubuntu, macOS and Windows:

- Windows TPM/CNG source/build/probe boundary;
- Windows TPM→MAA collector and exact P-256 other-key verifier invariants;
- public-address-pinned MAA metadata/JWKS retrieval;
- macOS Secure Enclave Swift compilation plus fail-closed runtime probe;
- Linux PKCS #11 C++ compilation plus fail-closed unconfigured probe;
- Gateway-only credential/hardware lifecycle and no raw verified-evidence import;
- DPAPI/Keychain/Secret-Service production root-secret storage wiring and browser-secret isolation;
- bounded one-shot private Gateway→semantic bootstrap with transient-buffer overwrite, privileged-bearer digest retention and semantic/admin capability separation;
- full Agent Kernel and trusted-adapter regressions.

Hosted CI uses per-ref concurrency so obsolete validation runs are cancelled when a newer commit supersedes them. The Node dependency gate rejects high/critical production dependency advisories and critical advisories anywhere in the test/build graph.

A manual `physical-hardware-qualification` workflow is defined for explicitly labeled self-hosted release machines. It deliberately differs from hosted CI:

- only `main` and `cieav-v*` release refs can schedule the hardware jobs;
- runners must carry `cieav-release-hardware` plus the platform-specific TPM/Secure-Enclave/HSM label;
- checkout credentials are not persisted and repository permissions remain read-only;
- sensitive Azure MAA and Linux provider credentials are scoped only to the qualification step rather than the entire job;
- the worktree is reset and cleaned after qualification even on failure;
- the workflow is non-cancellable once a physical release qualification has started.

The physical qualification script exercises real cryptographic operations, not a provider-name assertion:

1. **Windows:** physical Microsoft Platform Crypto Provider probe, exact P-256 consequence-key and RSA request-key resolution, fresh TPM ES256 challenge signing with independent verification, then live MAA collection/verification whose attested consequence fingerprint must equal the signing key.
2. **macOS:** Secure Enclave hardware probe, exact non-exportable P-256 key resolution, fresh enclave challenge signing and independent verification.
3. **Linux:** exact PKCS #11 key resolution and challenge signing plus independently signed deployment-verifier evidence binding the precise provider reference and public-key fingerprint; generic PKCS #11 success alone remains insufficient.

Physical release qualification additionally refuses to run until a generated `package-lock.json` is committed. The Windows lane uses `npm ci`; every lane requires the lockfile before hardware evidence is accepted. The lock must come from an actual npm resolver and review/commit process rather than hand-authored dependency metadata.

A green hosted matrix therefore proves deterministic source/build/fail-closed wiring only. It does **not** prove that representative physical hardware has qualified, and no successful self-hosted physical run is claimed merely because the workflow exists.

## Remaining release assurance

Before a final production release can claim these hardware paths as qualified, the repository still needs:

1. a reviewed npm-generated `package-lock.json` committed to the release ref;
2. successful self-hosted qualification evidence from representative Windows TPM/MAA, macOS Secure Enclave and each approved Linux TPM/HSM deployment;
3. provider-native hardware mTLS before any opaque-hardware-key mTLS claim;
4. stronger same-user process isolation/provider ACL policy if the target threat model requires protection against another process running as the same OS user.
