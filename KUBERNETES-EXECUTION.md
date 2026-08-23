# CIEAV Kubernetes Execution

Kubernetes is a first-class `KUBERNETES` consequence protocol. It is not implemented through `kubectl`, a shell, generic CLI authority, or arbitrary Kubernetes object mutation.

## Operation

The initial production primitive is deliberately narrow:

```text
K8S_DEPLOYMENT_SET_IMAGE
```

It authorizes one image transition for one exact container in one exact `apps/v1` Deployment.

Trusted local configuration fixes:

- Kubernetes HTTPS API origin;
- exact server IP used for the connection while retaining the configured hostname for TLS verification;
- digest-pinned CA file;
- bearer-token environment binding;
- namespace;
- Deployment name;
- container name;
- request timeout and response-size bounds.

The agent cannot choose those values at dispatch time.

## Normalized authority arguments

The consumed ticket binds only:

```json
{
  "expectedUid": "<exact Deployment UID>",
  "expectedResourceVersion": "<exact resourceVersion>",
  "expectedCurrentImage": "<exact current image string>",
  "newImage": "registry.example/app@sha256:<64 lowercase hex>"
}
```

`newImage` must be digest-pinned. Mutable destination tags are not accepted by this operation.

## Target identity

The proposal target binds the HTTPS origin, pinned server IP, namespace, Deployment, and container:

```text
k8s-deployment:<sha256(origin + server-ip + namespace + deployment + container)>
```

The downstream reference additionally binds the CA SHA-256 and the configured bearer-token environment name. The secret bearer value is never included in either identity.

## Pre-effect revalidation

Before one-use execution authority is consumed, CIEAV performs a read-only GET of:

```text
/apis/apps/v1/namespaces/<namespace>/deployments/<deployment>
```

The response must be exactly the configured Deployment and contain exactly one container with the configured name. CIEAV requires the observed UID, `resourceVersion`, and current image to equal the ticket-bound expected values. A stale or mismatched pre-state fails before the mutation boundary.

## Sole mutation primitive

CIEAV sends one HTTPS `PATCH` with media type:

```text
application/json-patch+json
```

The patch contains only these operations, in order:

```text
test    /metadata/uid                                  == expectedUid
test    /metadata/resourceVersion                      == expectedResourceVersion
test    /spec/template/spec/containers/<index>/name   == fixed container name
test    /spec/template/spec/containers/<index>/image  == expectedCurrentImage
replace /spec/template/spec/containers/<index>/image  =  newImage
```

The container index is derived from the preflight observation, but the JSON Patch tests the container name at that exact index before the image replacement. CIEAV does not expose arbitrary patch documents, object paths, verbs, query parameters, or Kubernetes resources to agents.

## TLS and credential isolation

CIEAV does not use ambient kubeconfig, `kubectl`, proxy variables, credential plugins, or exec-based authentication. The adapter:

- requires an HTTPS origin;
- connects only to the configured literal IP;
- retains the configured hostname as TLS `servername`;
- uses Node TLS hostname verification;
- uses only the configured digest-pinned CA file;
- obtains the bearer token from a fixed environment binding inside CIEAV;
- never puts the bearer token in the target, downstream ref, evidence summaries, or result metadata.

The execution bearer should be constrained with Kubernetes RBAC to the exact required read/patch scope. CIEAV's local authority binding is not a substitute for downstream least privilege.

## Outcome semantics

A deterministic pre-effect mismatch is `REJECTED` before the PATCH starts.

Once the mutation request crosses CIEAV's conservative effect boundary, failure is not silently converted to rejection. Kubernetes admission webhooks or other server-side behavior may already have run. Therefore:

- a clean 2xx response containing the exact authorized image may be transport `ACCEPTED`;
- an abnormal/non-2xx response may reconcile to `ACCEPTED` only if a later exact GET observes the same Deployment UID and the authorized new image;
- otherwise the outcome is `UNKNOWN`.

`ACCEPTED` is still transport evidence, not verified success.

## Independent proof

Settlement uses the separate provider:

```text
cieav.kubernetes-deployment-proof.v1
```

configured through:

```text
CIEAV_PROOF_KUBERNETES_DEPLOYMENT_CATALOG
```

The proof provider has its own target catalog, CA pin, server IP pin, and bearer-token environment binding. Production deployments should use a separate token with read-only GET permission on the exact Deployment.

The provider performs GET only and supports deterministic expectations:

```text
uid:<exact UID>
resource-version:<exact resourceVersion>
image:<exact image string>
```

Unknown expectation syntax, configuration errors, TLS failures, HTTP failures, or malformed observations remain non-conclusive. Every proof result has `authority=false` and `mayMintExecutionAuthority=false`.

Example proof catalog:

```json
{
  "version": 1,
  "kubernetesDeploymentProof": [
    {
      "id": "production-api-proof",
      "serverUrl": "https://kubernetes.example.com/",
      "serverIp": "203.0.113.10",
      "caFile": "/absolute/path/to/cluster-ca.pem",
      "caSha256": "<64 lowercase hex>",
      "bearerTokenEnv": "CIEAV_K8S_PROOF_TOKEN",
      "namespace": "production",
      "deployment": "api",
      "container": "api",
      "timeoutMs": 10000,
      "maxResponseBytes": 524288
    }
  ]
}
```

## Qualification boundary

Repository-local implementation and static/constructor qualification do not prove behavior against a real Kubernetes distribution. Production acceptance still requires qualification against the actual API server, TLS/CA topology, RBAC policy, admission webhooks, audit policy, network controls, controller behavior, and failure/retry conditions used by the deployment.

No model, agent, router, proof provider, learning subsystem, or Kubernetes adapter can mint execution authority. Kubernetes execution remains downstream of deterministic CIEAV Authority/Commit and upstream of independent Proof Mesh settlement.
