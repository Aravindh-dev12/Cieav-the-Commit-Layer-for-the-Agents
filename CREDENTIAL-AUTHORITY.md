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

Agents never receive a private key, refresh token, subject token, actor token, access token, client secret, DPoP signing oracle, arbitrary signing API, or TLS key handle that can be dereferenced outside trusted CIEAV execution.

## Credential readiness vs derivation

Credential readiness is checked before one-use consequence authority is spent. CIEAV validates that the OAuth profile exists, the token endpoint is allowed and resolvable, required source credentials exist, and the selected key handle can perform the required operation.

Actual token acquisition happens only after the trusted router has consumed the Operation Mandate and Execution Ticket. The derivation contract is bound to the proposal, task, Intent, Reality-Bound Commit, credential lease, exact route, tool/operation, and normalized argument digest.

This prevents a credential for one authorized proposal from being reused for a different payload.

## Key handles

`KeyHandle` is the public reference to a cryptographic capability. The concrete software provider is `LOCAL_WRAPPED_P256`:

- P-256 / ES256 key pairs can be generated inside CIEAV;
- existing enterprise P-256 keys can be imported one way into CIEAV for migration and mTLS use;
- private PKCS#8 material is encrypted at rest with AES-256-GCM under a key derived from the local Agent Kernel state secret;
- `exportable` is always `false` through the CIEAV authority API;
- only public JWK/fingerprint metadata leaves the credential authority;
- key purpose is explicit (`DPOP`, `OAUTH_CLIENT_ASSERTION`, `MTLS_CLIENT_AUTH`, etc.);
- revocation and optional expiration are enforced before use.

`LOCAL_WRAPPED_P256` is **software-wrapped**, not hardware-backed. The contracts reserve `TPM`, `SECURE_ENCLAVE`, `SPIFFE`, and `EXTERNAL_KMS` providers, but they are not yet concrete qualified providers. CIEAV must not describe the software provider as TPM-, Secure-Enclave-, HSM-, or KMS-backed.

## OAuth support

The Credential Authority supports:

- OAuth client-credentials grants;
- RFC 8693-style token exchange with subject token and optional actor token;
- resource-bound token requests;
- `private_key_jwt`-style ES256 client assertions;
- DPoP proofs at the token endpoint and protected resource;
- certificate-bound mTLS token acquisition and protected-resource execution;
- legacy client-secret Basic authentication only when a trusted environment mapping explicitly configures it;
- strict token-endpoint HTTPS outside explicit non-mTLS loopback fixtures;
- DNS validation/pinning, private/link-local/multicast blocking, response caps, and timeouts;
- access-token non-persistence: only SHA-256 token digests and derivation metadata are stored.

Generic HTTP Message Signatures and provider-specific hardware signers remain intentionally unimplemented until separately qualified.

## Certificate-bound mTLS

CIEAV's first mTLS profile intentionally supports one strict model: the OAuth authorization server and protected resource are both reached with the **same client certificate and corresponding CIEAV key handle**.

```text
CIEAV KeyHandle (MTLS_CLIENT_AUTH)
          │
          ├── public key must equal X.509 public key
          │
          ▼
OAuth token endpoint
  mutual TLS with client certificate
          │
          ▼
certificate-bound access token
          │
          ▼
Protected resource
  mutual TLS with the same client certificate/key
          │
          ▼
CredentialDerivationReceipt
  certificate SHA-256 thumbprint only
```

The following checks are fail closed:

- the token endpoint must use HTTPS;
- the protected resource must use HTTPS;
- the certificate must be within its validity interval;
- the certificate P-256 public key must match the selected CIEAV key handle;
- the key handle must carry `MTLS_CLIENT_AUTH` purpose;
- an mTLS OAuth profile cannot be downgraded to `senderConstraint: NONE` or DPoP;
- an mTLS sender constraint cannot reference a non-mTLS OAuth profile;
- the protected-resource identity thumbprint must equal the thumbprint recorded during credential derivation.

The mutual-TLS test fixture requires a client certificate at both the token and resource servers and verifies that both servers observe the same certificate thumbprint. This tests an actual TLS handshake rather than only configuration metadata.

## Separate authentication and consequence networks

OAuth token acquisition is a different trust path from consequence execution.

```text
Credential Authority auth transport
  → exact trusted token endpoint

Trusted execution transport
  → exact downstream resource endpoint
```

The execution adapter does not loosen its origin policy to perform OAuth discovery or follow arbitrary redirects. Likewise, the token endpoint cannot become an alternate consequence route.

For the current strict mTLS profile, the configured CA bundle is reused for the token and protected-resource endpoints. Separate authorization-server and resource-server CA policies are a future extension and should not be inferred from the present implementation.

## Derivation receipt

CIEAV persists a `CredentialDerivationReceipt` containing only non-secret evidence:

- derivation contract ID;
- proposal and Execution Ticket IDs;
- tool/profile/grant type;
- token endpoint/resource/scope digests;
- sender-constraint mode and public key-handle ID;
- mTLS certificate SHA-256 thumbprint when applicable;
- access-token digest, never the access token;
- normalized-argument digest;
- derivation and expiration timestamps.

A derivation receipt proves which credential context was used; it does **not** prove that the real-world consequence succeeded. Proof Mesh still performs independent settlement.

## OAuth-bound HTTP and cloud execution

A `FederatedTool` with `credentialMode: DOWNSTREAM_OAUTH` is handled by the dedicated OAuth-aware adapter rather than the legacy static-header adapter.

The adapter performs credential readiness during preflight. After the router consumes one-use authority, the adapter derives the token, creates any required DPoP proof or obtains the mTLS identity for the exact protected-resource request, executes against the exact pinned endpoint, and records only response/credential digests.

A token endpoint success, HTTP 2xx, valid DPoP request, or successful mTLS handshake is not task completion.

## Trusted lifecycle API boundary

The Credential Authority lifecycle handler supports public key-handle listing/creation/revocation, one-way P-256 import, OAuth profile management, derivation-receipt inspection, and runtime capability reporting. It has no private-key export route, raw access-token route, generic signing endpoint, or arbitrary DPoP/JWT signing oracle.

The handler is intended to be mounted only under CIEAV's existing local Gateway-authorized management perimeter. Until that mount is explicitly wired and qualified, operators should treat the handler as an internal component rather than a separately exposed service.

## Standards interoperability

CIEAV composes with established identity and authorization standards rather than replacing them. OAuth token exchange, DPoP, mTLS, Rich Authorization Requests, Transaction Tokens, SPIFFE/WIMSE, and HTTP Message Signatures can become projections or transports for CIEAV authority. CIEAV remains responsible for the broader lifecycle from owner Intent through consequence commit, independent proof, settlement, and recovery.

## Pending credential depth

The next qualification families are:

1. TPM / Secure Enclave / OS-keystore-backed key providers;
2. external KMS/HSM provider interfaces and remote signing;
3. SPIFFE workload identity and workload token exchange;
4. HTTP Message Signatures and provider-specific request signers;
5. protected-resource / authorization-server metadata discovery with separately pinned auth-network policy;
6. RAR projection from CIEAV Consequence Contracts;
7. Transaction Token / WIMSE projection for downstream call-chain context;
8. OAuth-aware MCP Streamable HTTP and A2A adapters using the same Credential Authority Plane;
9. separate token-endpoint and resource-endpoint trust-bundle policy for mTLS.

Production architecture/hardening for each row is claimed only after executable implementation and cross-platform qualification.
