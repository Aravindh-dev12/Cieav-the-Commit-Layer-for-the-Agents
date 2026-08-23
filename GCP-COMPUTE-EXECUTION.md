# CIEAV GCP Compute Execution Contract

CIEAV exposes Google Compute Engine as a first-class `GCP` execution protocol rather than routing it through generic cloud or CLI authority.

## Operation

`GCP_COMPUTE_STOP_INSTANCE`

The trusted catalog fixes the project, zone, instance name, bearer-token environment binding, request bounds, canonical Compute API hostname, and REST resource family. Agents cannot supply provider URLs, arbitrary methods, resource names, stop flags, or request bodies.

Normalized arguments contain only:

```json
{"expectedStatus":"RUNNING"}
```

Before the effect attempt, CIEAV performs an exact `instances.get` for the fixed VM and requires `RUNNING`.

The sole mutation is equivalent to:

```text
POST https://compute.googleapis.com/compute/v1/projects/<fixed-project>/zones/<fixed-zone>/instances/<fixed-instance>/stop?discardLocalSsd=false&noGracefulShutdown=false&requestId=<execution-ticket-uuid>
```

The request body is empty. `discardLocalSsd=false` and `noGracefulShutdown=false` are fixed by construction. The `requestId` is the consumed CIEAV execution-ticket UUID, binding provider-side duplicate suppression to the same one-use authority. No reset, start, suspend, delete, arbitrary Compute method, gcloud command, SDK escape hatch, or metadata-server credential discovery is exposed.

A successful 2xx response is transport `ACCEPTED` only. It does not prove that the instance is stopped. After the stop request crosses the conservative effect boundary, failures remain `UNKNOWN` unless exact subsequent readback observes `STOPPING` or `TERMINATED`; final settlement still requires independent proof.

## Identity, credentials, and network binding

The authority target binds project, zone, and instance. The downstream reference additionally binds the canonical Compute API hostname and configured token environment name. Bearer values never enter target/downstream identities, evidence summaries, or result metadata.

CIEAV resolves `compute.googleapis.com`, rejects private/link-local/reserved/documentation destinations, pins the selected validated address for the HTTPS socket, and retains the official hostname for TLS verification.

## Independent proof

`cieav.gcp-compute-proof.v1` is separately configured through `CIEAV_PROOF_GCP_COMPUTE_CATALOG`. It performs only exact `instances.get` observations and always returns `authority=false` and `mayMintExecutionAuthority=false`.

Production should use a separate read-only Google Cloud principal/token with only the permissions needed to observe the intended instances.

## External qualification boundary

Repository-local implementation does not qualify Google identity or infrastructure. Production acceptance still requires real projects and IAM policies, correct OAuth token audience/scope and expiry behavior, service-account/workload-identity issuance, token rotation/revocation, Compute Engine operation semantics, audit logs, graceful-shutdown behavior, Local SSD policy, network/TLS topology, quota/error handling, and incident/recovery exercises.

No model, agent, router, memory subsystem, proof provider, or GCP adapter can mint authority. Transport `ACCEPTED` never means independently proven real-world success.
