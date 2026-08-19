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
Credential Authority derives minimum credential
      ↓
trusted adapter uses credential
      ↓
credential disappears from execution memory
      ↓
only derivation receipt/digests persist
      ↓
Proof Mesh settles reality
```

Agents never receive a private key, refresh token, subject token, actor token, access token, client secret, DPoP signing oracle, or arbitrary signing API.

## Credential readiness vs derivation

Credential readiness is checked before one-use consequence authority is spent. CIEAV validates that the OAuth profile exists, the token endpoint is allowed and resolvable, required source credentials exist, and the selected key handle can perform the required operation.

Actual token acquisition happens only after the trusted router has consumed the Operation Mandate and Execution Ticket. The derivation contract is bound to the proposal, task, Intent, Reality-Bound Commit, credential lease, exact route, tool/operation, and normalized argument digest.

This prevents a credential for one authorized proposal from being reused for a different payload.

## Key handles

`KeyHandle` is the public reference to a signing capability. The v1 concrete provider is `LOCAL_WRAPPED_P256`:

- P-256 / ES256 key pair generated inside CIEAV;
- private PKCS#8 material encrypted at rest with AES-256-GCM under a key derived from the local Agent Kernel state secret;
- `exportable` is always `false`;
- only the public JWK and fingerprint leave the credential authority;
- key purpose is explicit (`DPOP`, `OAUTH_CLIENT_ASSERTION`, etc.);
- revocation and optional expiration are enforced before signing.

The contracts reserve `TPM`, `SECURE_ENCLAVE`, `SPIFFE`, and `EXTERNAL_KMS` providers, but they are **not yet concrete implementations**. CIEAV must not claim hardware-backed protection until the corresponding provider is implemented and qualified.

## OAuth v1 support

The first concrete Credential Authority implementation supports:

- OAuth client-credentials grants;
- RFC 8693-style token exchange with subject token and optional actor token;
- resource-bound token requests;
- `private_key_jwt`-style ES256 client assertions;
- DPoP proofs at the token endpoint and at the resource request;
- legacy client-secret Basic authentication only when a trusted environment mapping explicitly configures it;
- strict token-endpoint HTTPS outside explicit loopback test fixtures;
- DNS validation/pinning, private/link-local/multicast blocking, response caps, and timeouts;
- access-token non-persistence: only SHA-256 token digests and derivation metadata are stored.

`MTLS` remains fail closed in v1 until the TLS client-key provider can guarantee non-exportable key handling and certificate lifecycle management. Generic HTTP Message Signatures and provider-specific signers are also intentionally not represented as implemented yet.

## Separate authentication and consequence networks

OAuth token acquisition is a different trust path from consequence execution.

```text
Credential Authority auth transport
  → exact trusted token endpoint

Trusted execution transport
  → exact downstream resource endpoint
```

The execution adapter does not loosen its origin policy to perform OAuth discovery or follow arbitrary redirects. Likewise, the token endpoint cannot become an alternate consequence route.

## Derivation receipt

CIEAV persists a `CredentialDerivationReceipt` containing only non-secret evidence:

- derivation contract ID;
- proposal and Execution Ticket IDs;
- tool/profile/grant type;
- token endpoint/resource/scope digests;
- sender-constraint mode and public key-handle ID;
- access-token digest, never the access token;
- normalized-argument digest;
- derivation and expiration timestamps.

A derivation receipt proves which credential context was used; it does **not** prove that the real-world consequence succeeded. Proof Mesh still performs independent settlement.

## OAuth-bound HTTP and cloud execution

A `FederatedTool` with `credentialMode: DOWNSTREAM_OAUTH` is handled by the dedicated OAuth-aware adapter rather than the legacy static-header adapter.

The adapter performs credential readiness during preflight. After the router consumes one-use authority, the adapter derives the token, creates any required DPoP proof for the exact resource request, executes against the exact pinned endpoint, and records only response/credential digests.

A token endpoint success, HTTP 2xx, or DPoP-valid request is not task completion.

## Standards interoperability

CIEAV is designed to compose with established identity and authorization standards rather than replace them. OAuth token exchange, DPoP, mTLS, Rich Authorization Requests, Transaction Tokens, SPIFFE/WIMSE, and HTTP Message Signatures can become projections or transports for CIEAV authority. CIEAV remains responsible for the broader lifecycle from owner Intent through consequence commit, independent proof, settlement, and recovery.

## Pending credential depth

The next qualification families are:

1. non-exportable mTLS client authentication and certificate-bound access tokens;
2. TPM / Secure Enclave / OS keystore providers;
3. SPIFFE workload identity and workload token exchange;
4. HTTP Message Signatures and provider-specific request signers;
5. protected-resource / authorization-server metadata discovery with a separately pinned auth-network policy;
6. RAR projection from CIEAV Consequence Contracts;
7. Transaction Token / WIMSE projection for downstream call-chain context;
8. OAuth-aware MCP Streamable HTTP and A2A adapters using the same Credential Authority Plane.

Production architecture/hardening for each row is claimed only after executable implementation and cross-platform qualification.
