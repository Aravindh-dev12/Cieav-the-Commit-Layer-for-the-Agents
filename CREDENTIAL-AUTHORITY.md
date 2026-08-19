# CIEAV Credential Authority Plane

CIEAV treats downstream credentials as an execution mechanism, never as authority. An OAuth access token, client certificate, workload identity, or signing key does not grant permission for a consequence by itself. The consequence must already have passed CIEAV Intent, formal authorization, Reality-Bound Commit, Operation Mandate, and one-use Execution Ticket checks.

## Core invariant

```text
Agent / framework
      ↓
Intent + formal authority
      ↓
Reality-Bound Commit
      ↓
Operation Mandate
      ↓
Execution Ticket
      ↓
credential readiness preflight
      ↓
consume one-use authority
      ↓
atomically reserve one credential derivation
      ↓
Credential Authority derives minimum credential
      ↓
trusted adapter uses credential
      ↓
only derivation receipts/digests persist
      ↓
Proof Mesh settles reality
```

Agents never receive private keys, refresh tokens, subject/actor tokens, access tokens, client secrets, DPoP signing oracles, or arbitrary signing APIs.

## Explicit key source

JOSE signing is selected explicitly as `LOCAL` or `HARDWARE`; CIEAV does not infer the source from an ID.

- `LOCAL` uses `LOCAL_WRAPPED_P256`, an AES-256-GCM-wrapped software P-256 key.
- `HARDWARE` uses a verified `HardwareKeyRegistration` through `CieavHardwareSigner` and an exact provider-native `providerKeyRef`.

> **No hardware-to-software fallback.**

If `HARDWARE` is configured and attestation, bridge integrity, purpose, provider-key binding, algorithm, or native signing fails, the derivation fails. A valid local key is not substituted.

Hardware JOSE signing revalidates the provider bridge SHA-256, current verified attestation, public-key fingerprint, purpose and algorithm immediately before the signature. The provider key reference is resolved through `describe`/`describe-rsa` before each signature and the returned JWK must exactly match the registered JWK. The native bridge receives only the operation, opaque provider key reference and 32-byte SHA-256 digest. Hardware private key material never enters CIEAV state.

## Credential readiness vs derivation

Credential readiness is checked before one-use consequence authority is spent. CIEAV validates the OAuth profile, exact token endpoint policy, source credentials and selected local/hardware key capability.

Actual token acquisition occurs only after the trusted router consumes the Operation Mandate and Execution Ticket. The derivation contract binds proposal, task, Intent, Reality-Bound Commit, credential lease, route, tool/operation, normalized arguments, sender constraint and explicit key source.

Credential minting itself is also durably **at-most-once per consumed Execution Ticket**. Before network token acquisition, CIEAV persists a derivation-use record containing the ticket ID and derivation binding digest. A second attempt for that ticket is rejected with `credential_authority_ticket_already_derived`, including after restart. This prevents the token endpoint from becoming a replay path after an ambiguous downstream failure.

Credential Authority state migration preserves authentication: legacy state is MAC-verified in its exact stored shape before new schema defaults such as the derivation journal are applied. Tampered legacy state still fails closed.

## OAuth and sender-constrained credentials

Implemented OAuth modes include:

- client-credentials grants;
- RFC 8693-style token exchange with subject token and optional actor token;
- resource-bound token requests;
- ES256 `private_key_jwt` client authentication using either `LOCAL` or verified `HARDWARE` signing;
- DPoP at the token endpoint and protected resource using either `LOCAL` or verified `HARDWARE` signing;
- certificate-bound mTLS using the existing software-wrapped key path;
- explicitly configured legacy client-secret Basic authentication;
- HTTPS outside explicit non-mTLS loopback fixtures;
- DNS validation/pinning, private-address blocking, response caps and timeouts;
- access-token non-persistence.

For DPoP, the protected JWS header carries the same public JWK whose opaque private key performs the signature. Both the token-endpoint proof and the later protected-resource proof are generated through the configured source.

A `PRIVATE_KEY_JWT` profile has its own `keySource` and key ID. This may be different from the DPoP sender key. CIEAV records those two cryptographic roles separately rather than treating them as one generic signing identity.

## Hardware JOSE trust chain

```text
HardwareKeyRegistration
  ↓
verified key-specific evidence + public fingerprint
  ↓
digest-pinned CIEAV_KEY_PROVIDER_V1 bridge
  ↓
providerKeyRef -> describe -> exact JWK
  ↓
CieavHardwareSigner
  ↓
private_key_jwt / DPoP JWS
  ↓
OAuth token / protected resource
```

Concrete provider paths now exist for:

- Windows TPM/CNG, including Microsoft Azure Attestation binding of the actual P-256 consequence key through `x-ms-tpm-other-keys`;
- macOS Secure Enclave P-256 signing with trusted local Secure Enclave evidence;
- Linux vendor-neutral PKCS #11 P-256 signing, with hardware status deliberately withheld until a deployment-specific TPM/HSM verifier establishes key-specific evidence.

A software PKCS #11 module cannot promote itself to hardware trust merely by implementing the API.

## Authentication metadata/JWKS network boundary

Microsoft Azure Attestation OpenID metadata/JWKS retrieval uses a hardened HTTPS path: CIEAV resolves the hostname, rejects loopback/private/link-local/multicast/documentation and mixed public/private answers, pins the accepted address into the actual TLS request, keeps hostname certificate validation on the original URL, rejects redirects and enforces response/header/time limits.

This network-hardening rule is separate from JWT claim verification; the signed report must still pass issuer, signing-key, signature, freshness, CIEAV-owned nonce, policy hash and exact TPM key certification checks.

## Hardware mTLS boundary

**Hardware mTLS is not implemented by the JOSE hardware path.** The current Node TLS implementation requires the software-wrapped private key bytes for the TLS handshake. CIEAV therefore rejects using `keySource: HARDWARE` as a substitute for mTLS and does not silently export a TPM/KMS key.

A hardware mTLS implementation requires a provider-native TLS transport (for example Windows Schannel/CNG, Secure Enclave-aware TLS, or an HSM-backed TLS integration) that can use the opaque private key without exporting it.

## Certificate-bound software mTLS

The current mTLS profile uses the same configured X.509 certificate and corresponding CIEAV software-wrapped key at the OAuth token endpoint and protected resource. CIEAV verifies certificate validity, P-256 public-key equality, `MTLS_CLIENT_AUTH` purpose and exact certificate thumbprint binding. An mTLS profile cannot be silently downgraded to bearer or DPoP.

## Separate authentication and consequence networks

OAuth token acquisition remains a different trust path from consequence execution:

```text
Credential Authority auth transport
  → exact trusted token endpoint

Trusted execution transport
  → exact downstream resource endpoint
```

The execution adapter does not loosen its origin policy to perform arbitrary OAuth redirects, and the token endpoint cannot become an alternate consequence route.

## Derivation receipt

`CredentialDerivationReceipt` contains non-secret evidence only. It records proposal/ticket/profile/grant identifiers and digests, sender constraint, explicit sender key source and key ID, `senderKeyFingerprint`, `senderHardwareAttestationId` when hardware-backed, `clientAuthKeySource`, `clientAuthKeyFingerprint`, `clientAuthHardwareAttestationId` for `private_key_jwt`, mTLS certificate thumbprint when applicable, access-token digest, normalized-argument digest, and derivation/expiration timestamps.

The receipt never stores the access token or private key. It proves credential context, not real-world success; Proof Mesh remains responsible for consequence settlement.

## Trusted HTTP/cloud execution

A `FederatedTool` with `credentialMode: DOWNSTREAM_OAUTH` is handled by the OAuth-aware adapter. Its trusted catalog selects `senderConstraint`, `keySource`, exact key ID, resource, scopes and token profile. Preflight verifies the selected hardware/local credential path before one-use authority is consumed. After consumption, credential derivation and the final resource DPoP proof use the same configured source.

A successful token request, HTTP 2xx, DPoP signature or TLS handshake is not task completion.

## Management boundary

Privileged lifecycle administration is mounted only beneath the already Gateway-authenticated Agent Kernel namespace:

```text
/v1/agent-kernel/credential-authority/...
/v1/agent-kernel/hardware-key-providers/...
```

The lifecycle API exposes local key/profile lifecycle metadata, derivation receipts, provider manifests and hardware registrations. It has no private-key export, raw access-token route, arbitrary JWT/DPoP signing route or generic signing oracle.

There is deliberately no generic endpoint that accepts caller-supplied `verification: VERIFIED` hardware evidence. Windows evidence must come from the TPM→MAA collector plus verifier; macOS evidence must come from the Secure Enclave attestor; Linux returns `501 linux_hardware_attestation_verifier_required` until the deployment provides a verifier for its actual TPM/HSM evidence format.

## Root state secret boundary

Credential Authority state encryption/MAC keys are domain-separated from the local authority's strong root signing secret. In the packaged production runtime, that root is persisted through the platform `SecretStore` rather than a plaintext application file:

- Windows — DPAPI in the current-user context;
- macOS — Keychain generic-password storage;
- Linux — Secret Service through `secret-tool` and the user D-Bus session.

Production secure-storage policy rejects an unencrypted backend unless an explicit diagnostic override is supplied. Existing private-file secrets are migrated into the encrypted backend with read-back verification before the legacy file is removed.

The Gateway strips JWT, receipt-signing and Gateway credentials from the semantic child's inherited environment. Managed production starts the dedicated `managed-entry.js` and sends an exact four-field bootstrap over a bounded anonymous stdin pipe: JWT root, receipt-signing root, the durable privileged Gateway bearer, and a distinct process-scoped semantic-router capability. The Python Gateway writes through a mutable buffer and overwrites that serialized buffer immediately after delivery; the managed Node entry independently caps input size, rejects TTY/no-pipe startup, overwrites received/concatenated byte buffers, rejects malformed, weak, duplicated, reused-scope or unexpected bootstrap data, consumes the bootstrap before importing the server, and fails if equivalent environment credentials are present.

The privileged Gateway bearer is needed only to validate inbound trusted Gateway administration in Node. `loadConfig()` converts it to a fixed SHA-256 verifier and does not return a raw `gatewayToken` property; inbound verification hashes the presented bearer and uses constant-time digest comparison. Hugging Face semantic routing does not receive that admin bearer. It retains only the separate random semantic-router capability, and the Python control plane rejects that capability on privileged pause/resume/dashboard/control routes. Legacy/development environment mode remains compatibility-oriented; the stronger scope split is mandatory in managed production.

The browser process receives none of the JWT, receipt-signing, privileged Gateway or semantic-router capabilities. The Node local authority domain-separates the receipt root into Credential Authority, hardware-registry, execution-fabric, control-plane and other state secrets.

This removes the previous process-environment exposure and narrows the long-lived Gateway capability available to Node, but it is not a claim of full same-user process isolation or direct TPM/Secure-Enclave/HSM sealing. The Gateway and semantic process still hold cryptographic material required for their duties in memory. Stronger hardware sealing, rotation, provider-native ACLs and a separately privileged signer/credential broker remain additional hardening tracks.

## Dependency/release security

Hosted CI runs production and full dependency audits. High/critical production advisories fail the gate, and critical advisories in the broader Node build/test graph fail as well. The test stack has been moved to the secure Vitest 4 line on the repository's Node 22 baseline and recent hosted qualification installs have reported zero npm vulnerabilities.

The release matrix also executes the managed-secret bootstrap gate on Ubuntu, macOS and Windows. It compiles the managed API, runs one-shot secret-container, Gateway-verifier and configuration-retention tests, and verifies that empty/weak bootstraps fail closed rather than falling back to inherited credentials. Hosted CI uses per-ref concurrency so superseded validation runs do not replace evidence for the newest commit.

A manual `physical-hardware-qualification` workflow is defined for explicitly labeled self-hosted Windows, macOS and Linux release machines. It is restricted to `main` or `cieav-v*` release refs, does not persist checkout credentials, scopes sensitive release credentials to the actual qualification step, and scrubs the checked-out worktree after the job. The Windows lane performs real TPM challenge signing plus live MAA verification of the exact P-256 consequence key; the macOS lane performs Secure Enclave challenge signing; the Linux lane requires signed deployment-verifier evidence bound to the exact PKCS #11 provider reference and public-key fingerprint.

Physical qualification is intentionally blocked until a generated `package-lock.json` is committed. The Windows lane uses `npm ci`; all lanes first require the lockfile. The lockfile must be produced by npm resolution and reviewed/committed—CIEAV does not treat a hand-authored dependency lock as release evidence. No successful self-hosted physical qualification run is claimed merely because the workflow exists.

## Standards interoperability

CIEAV composes with OAuth token exchange, DPoP, mTLS, Rich Authorization Requests, Transaction Token, SPIFFE/WIMSE and HTTP Message Signatures rather than replacing those standards. CIEAV remains responsible for the broader lifecycle from owner Intent through consequence commit, independent proof, settlement and recovery.

## Remaining credential depth

1. commit and audit a generated `package-lock.json` so physical release qualification can run reproducibly;
2. execute representative self-hosted physical qualification for Windows TPM/MAA, macOS Secure Enclave and approved Linux TPM/HSM deployments;
3. provider-native hardware mTLS;
4. stronger hardware-backed sealing/rotation of the local authority root and reduced in-memory lifetime;
5. stronger process isolation for the Credential Authority / hardware signer broker plus provider-native ACLs;
6. SPIFFE workload identity and workload token exchange;
7. HTTP Message Signatures and provider-specific request signers;
8. separately pinned OAuth protected-resource / authorization-server discovery;
9. RAR projection from Consequence Contracts;
10. Transaction Token / WIMSE projection for downstream call-chain context;
11. OAuth-aware MCP Streamable HTTP and A2A adapters using the same Credential Authority Plane.

Production architecture/hardening for each row is claimed only after executable implementation and qualification. Physical-device and provider-specific external release qualification remains required.
