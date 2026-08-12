# Hugging Face semantic tier

LATCH uses Hugging Face as its first semantic model tier while keeping deterministic safety policy authoritative.

Default model:

```text
ibm-granite/granite-4.1-3b
```

The model is configurable and must pass the LATCH model-promotion evals before production replacement.

## Runtime flow

```text
privacy-reduced Action Context
        ↓
deterministic baseline
        ↓
Python LATCH Gateway
        ↓
Hugging Face 3B semantic gate
        ↓
conservative merge
        ↓
        ├─ high confidence / lower risk → continue locally
        │
        └─ unavailable / low confidence / injection / UNKNOWN / HIGH / CRITICAL
                         ↓
                  optional frontier verifier
                         ↓
                  conservative consensus
```

The Hugging Face tier cannot lower deterministic risk or make deterministic reversibility more optimistic.

## Credential boundary

Never commit a Hugging Face token to Git or place it in browser code.

Store it locally:

```bash
latch model hf-login
```

The CLI prompts with hidden input and writes the token to the local LATCH state directory (`~/.latch/hf-token` by default) with restrictive permissions where the operating system supports them.

The Python Gateway reads the token directly. It explicitly removes `HF_TOKEN` and `HUGGING_FACE_HUB_TOKEN` from child-process environments. Chromium never receives the Hugging Face credential.

Remove it with:

```bash
latch model hf-logout
```

## Live verification

After storing the token, restart the Gateway:

```bash
latch gateway restart
```

For foreground development use:

```bash
latch gateway run
```

Then verify configuration:

```bash
latch model hf-status
```

Run the live safety probe:

```bash
latch model hf-probe
```

The probe sends only a synthetic LATCH test case describing a ₹50,000 non-refundable payment. It succeeds only if the model returns `CRITICAL` risk with conservative (`IRREVERSIBLE` or `UNKNOWN`) reversibility. The command exits non-zero when inference fails or the classification is unsafe.

## Hugging Face operating modes

### Inference Providers

Default:

```bash
LATCH_HF_MODEL=ibm-granite/granite-4.1-3b
LATCH_HF_PROVIDER=auto
```

The Python `huggingface_hub.InferenceClient` asks Hugging Face to route the configured model to a supported inference provider.

Provider/model availability is not assumed. `latch model hf-probe` is the runtime source of truth.

### Dedicated Hugging Face Inference Endpoint

If the exact model is not available through routed Inference Providers, deploy it as a Hugging Face Inference Endpoint and configure:

```bash
LATCH_HF_ENDPOINT_URL=https://YOUR-ENDPOINT
```

The same LATCH structured-output contract is used.

### Future fully local endpoint

The provider boundary is intentionally compatible with a local OpenAI-style model server. Granite can later be served locally (for example through vLLM) and the Gateway can route to localhost, eliminating hosted inference for the first tier.

## Structured output

The HF call uses a strict JSON Schema for:

```text
actionType
risk
reversibility
confidence
needsDeepReview
promptInjectionSuspected
reasons[]
```

Page content is explicitly marked as untrusted data in the model prompt. The provider receives privacy-reduced context rather than raw form values or URL query parameters.

## Escalation policy

Frontier inference is requested when any of these hold:

- HF inference failed or timed out;
- `needsDeepReview=true`;
- prompt injection is suspected;
- HF confidence is below the threshold;
- final risk is `HIGH` or `CRITICAL`;
- reversibility is `UNKNOWN`.

If no frontier provider is configured, LATCH retains the stricter deterministic/HF result. A failed HF call never makes the action safer.

## Tests

Offline provider boundary test:

```bash
npm run test:hf
```

This test uses a fake `InferenceClient`; it validates strict structured output, model routing, prompt safety instructions, token persistence, and that HF credentials are not inherited by Node/Chromium.

Live provider/model test:

```bash
latch model hf-probe
```
