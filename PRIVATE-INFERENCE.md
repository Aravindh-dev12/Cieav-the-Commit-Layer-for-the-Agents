# CIEAV Private Inference

CIEAV separates intelligence from authority.

> **Remote/private inference may interpret and propose. Only the local CIEAV Gateway may authorize and execute consequential actions.**

The user runtime does not need to bundle a large language model. A production CIEAV deployment can run an OpenAI-compatible model service on CIEAV-controlled GPU infrastructure, in a customer VPC/on-prem environment, or locally on the user's machine.

## Security boundary

The inference service receives only the privacy-reduced semantic packet produced by the local Gateway/API boundary. It must never receive or hold:

- Gateway bearer authority;
- MCP/A2A execution credentials;
- browser-control capabilities;
- receipt or release signing private keys;
- passwords, OTPs, payment-card values, or raw form values;
- durable Personal/Company Twin state by default;
- raw receipt or audit history.

The model response is untrusted semantic output. CIEAV validates its schema and then re-applies deterministic risk, policy, Commitment, Consequence Graph, approval, capability, execution, and proof rules locally.

## Protocol

The backend is an OpenAI-compatible `/v1/chat/completions` service. CIEAV sends the header:

```text
X-CIEAV-Inference-Protocol: cieav-private-inference-v1
```

Inference metadata declares:

```text
zeroRetention = true
executionAuthority = false
```

Those fields describe the CIEAV protocol contract. Production infrastructure must enforce them operationally: application/access logs must not contain prompts or model outputs, and model workers must not have credentials that can mutate user systems.

## Production transport

`CIEAV_CLOUD_MODEL_BASE_URL` must use HTTPS in production. CIEAV accepts plaintext HTTP only for loopback (`127.0.0.1`, `localhost`, `::1`) testing. Redirects are rejected by the inference client.

Recommended configuration shape:

```text
CIEAV_CLOUD_MODEL_BASE_URL=https://inference.example.com/v1
CIEAV_CLOUD_MODEL=<served-model-id>
CIEAV_CLOUD_MODEL_REVISION=<immutable-revision>
CIEAV_CLOUD_MODEL_DIGEST=<sha256-of-approved-model-artifact-or-manifest>
CIEAV_CLOUD_MODEL_API_KEY=<server-to-server-secret>
```

The repository defaults to `Qwen/Qwen3-32B` as a practical open-weight development target. Production model selection remains configuration, not a CIEAV security invariant.

## Local verification

The private-inference boundary is covered by the API Vitest suite. It starts a loopback OpenAI-compatible mock model server and verifies that:

- loopback HTTP works for development;
- non-loopback plaintext HTTP is rejected;
- the private-inference protocol header is sent;
- the model system prompt explicitly denies execution authority;
- returned metadata is marked zero-retention/non-authoritative;
- model revision/digest provenance can be attached.

Run:

```powershell
npm run build
npm run typecheck
npm run test:core
npm test
```

The existing `scripts/cloud-provider-smoke.py` separately verifies the device-side privacy reducer, enrollment token flow, no-redirect cloud transport, and exclusion of raw secrets/form values before remote inference.

## Real model server

For local development, any OpenAI-compatible server can be used, including vLLM/SGLang-compatible deployments. Point CIEAV at its `/v1` endpoint:

```powershell
$env:CIEAV_CLOUD_MODEL_BASE_URL = "http://127.0.0.1:8000/v1"
$env:CIEAV_CLOUD_MODEL = "<served-model-id>"
```

For production, replace the loopback endpoint with the HTTPS CIEAV/customer inference origin and pin the approved model revision/digest in release/deployment configuration.
