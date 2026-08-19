# CIEAV Windows TPM → Microsoft Azure Attestation Collector

CIEAV separates **evidence collection** from **evidence verification**.

```text
physical TPM + AIK + TPM request key
              ↓
native CIEAV MAA collector
              ↓
Microsoft Azure Attestation exchange
              ↓
raw attestation JWT (transient only)
              ↓
CieavMaaTpmAttestationVerifier
              ↓
VERIFIED / reject
              ↓
digest-only HardwareKeyAttestation state
```

The collector is not an authority decision-maker. It gathers evidence. Only the independent verifier can turn a returned report into `WINDOWS_TPM_KEY_ATTESTATION / VERIFIED` evidence.

## Native flow

`native/windows-tpm-maa-collector` follows Microsoft's current Attestation Client TPM session shape:

1. open `Microsoft Platform Crypto Provider` and require a hardware implementation;
2. open the enrolled AIK and the named TPM RSA request key through NCrypt;
3. create an `ATT_SESSION_TYPE_TPM` session with relying-party ID and fresh nonce;
4. call `att_attest` until the session completes;
5. send each outbound attestation message through Azure `AttestationClient::AttestTpm`;
6. retrieve the final report with `att_get_report`;
7. emit only the final report to stdout.

Diagnostics and failures go to stderr. The collector does not write the report to disk.

## Nonce, issuer and policy ownership

The API-side `CieavWindowsTpmMaaCollector` creates a new 32-byte cryptographic nonce for every collection. Callers cannot provide one.

The MAA issuer and expected policy hash are pinned in collector configuration, not supplied per request. The same issuer is used for the collector's `AZURE_MAA_URI` and for independent verification.

This prevents a caller from collecting against one provider/policy and asking CIEAV to verify against another.

## Credential boundary

The native collector receives only canonical environment variables:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_MAA_URI
```

CIEAV may source the first three from differently named owner-controlled environment variables, but maps them into the canonical names only for the child process.

The child environment does not inherit `PATH`, proxy variables, Node/Python injection variables, or arbitrary parent environment state. Minimal Windows system variables such as `SystemRoot`, `WINDIR`, `TEMP` and `TMP` may be passed.

Azure credentials are transient process inputs. They are not written to the hardware-key registry, attestation records, release evidence, or runtime metadata.

## Executable and DLL closure pinning

Pinning only the collector executable is insufficient because it dynamically loads the Microsoft Attestation/Azure native stack.

The launcher therefore requires:

- collector executable SHA-256;
- a complete declared list of adjacent DLL filenames and SHA-256 digests;
- every declared dependency to be a regular non-symlink file;
- no undeclared adjacent DLLs.

All hashes are checked immediately before every collection attempt. Replacing the executable, replacing a DLL, or dropping an extra DLL beside the collector fails closed before Azure credentials are passed to the child process.

## Release packaging

The native CMake target intentionally does **not** download NuGet/vcpkg dependencies. Release engineering must pre-provision the Microsoft Attestation Client and Azure C++ SDK build dependencies.

For a Windows release, `scripts/build-release-runtime.py` can accept:

```text
--windows-tpm-maa-collector-dir <prebuilt-directory>
```

That directory must contain:

- `cieav-windows-tpm-maa-collector.exe`;
- its complete adjacent DLL closure;
- no unrelated files.

The release builder copies the closure into:

```text
cieav-runtime/native/windows-tpm-maa-collector/
```

and emits `manifest.json` with SHA-256 digests. Runtime metadata records whether the collector was bundled.

This remains a **zero-package-manager consumer path**. NuGet/vcpkg/CMake are release-engineering concerns, not end-user requirements.

## Bundled is not live-qualified

A runtime with `windowsTpmMaaCollectorBundled: true` has the native collector artifact and digest manifest. It does **not** prove that a target machine has:

- a physical/trusted TPM;
- a valid enrolled AIK;
- the configured TPM request key;
- working Entra credentials;
- a reachable/configured MAA provider;
- a policy producing the claims required by the CIEAV verifier.

Those require an external clean-machine/live-service qualification run.

## Current verification handoff

A successful collector report is immediately passed to `CieavMaaTpmAttestationVerifier`, which independently checks MAA JWT signature/issuer/JWKS, time validity, the CIEAV-generated nonce, pinned policy hash, exact TPM request-key JWK and required TPM certify attributes.

Only the resulting evidence and claims digests are intended for durable registry state. The raw MAA JWT remains transient.

## Current qualification wording

**production architecture/hardening green; external release qualification still pending.**
