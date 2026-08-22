# CIEAV verified consequence learning

CIEAV can learn from real agent outcomes without letting a model, trainer, proof provider, or external ML service become an execution authority.

The architecture is intentionally split into planes:

1. **Intelligence** — upstream proprietary/open/local models plus CIEAV-trained checkpoints.
2. **Authority / Commit** — deterministic CIEAV identity, permission, credential, reality-bound commit, execution-ticket, outcome, and recovery rules.
3. **Perception / Proof** — native CIEAV browser/CDP evidence and optional proof providers such as a Reticle-compatible MCP service.
4. **Learning** — Python post-training with PyTorch, Transformers, datasets, TRL, PEFT and Accelerate; scale-out GRPO/agentic RL with verl + Ray and vLLM/SGLang rollout engines; optional hosted learning providers such as River.

The invariant is one-way:

`verified execution/outcome -> redacted learning trajectory -> training -> unqualified candidate -> independent promotion`

Never:

`model/trainer/proof provider -> permit/commit/undo authority`

## Authorized Outcome Trajectory

`CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V1` binds a learning example to digests or safe metadata for:

- agent/model identity context;
- task and intent;
- exact tool/operation and argument digest;
- formal authorization/permission and credential-lease digests;
- reality-bound commit and execution-ticket identifiers;
- pre-state, expected post-state, and proof-obligation digests;
- execution effect/receipt digests;
- normalized `SUCCESS`, `FAILURE`, or `UNKNOWN` outcome evidence;
- recovery/Undo status;
- SHA-256 integrity of the entire trajectory.

Secret-like keys, bearer values and private-key payloads are redacted before retention. Raw provider credentials must never enter this learning object.

`UNKNOWN` is an explicit training signal. It must never be relabeled as successful merely to improve reward.

## Providers

Inspect local provider readiness:

```powershell
python ml/consequence_learning_cli.py providers
python ml/consequence_learning_cli.py providers --plane proof
python ml/consequence_learning_cli.py providers --plane learning
```

Built-in/declared providers currently include:

- `cieav-browser-proof` — native private-CDP browser/outcome proof;
- `reticle-mcp-proof` — optional external Reticle-compatible MCP proof surface (`CIEAV_RETICLE_MCP_COMMAND`);
- `trl-peft` — local PyTorch/Transformers/datasets/TRL/PEFT/Accelerate training;
- `verl-ray` — distributed GRPO/agentic RL;
- `vllm-rollout` and `sglang-rollout` — rollout/sampling engines;
- `river-learning` — optional hosted training/sampling/checkpoint provider (`CIEAV_RIVER_API_KEY`).

Provider readiness is informational. No provider can mint CIEAV permits, consume reality-bound commits, or authorize Undo.

## Normalize verified execution evidence

The current CLI accepts a normalized, already-finalized JSON evidence object. It is not intended to ingest arbitrary raw logs.

```powershell
python ml/consequence_learning_cli.py normalize --input evidence.json --output trajectories.jsonl
python ml/consequence_learning_cli.py verify --input trajectories.jsonl
```

## Build training data

```powershell
python ml/consequence_learning_cli.py dataset --input trajectories.jsonl --output-dir ml/data/consequence
```

The builder deterministically partitions trajectory IDs into train, validation, adversarial, and promotion sets and emits:

- SFT records;
- DPO chosen/rejected pairs;
- KTO positive/negative examples;
- GRPO prompts with deterministic expectations and `requiresFreshModelRollout=true`.

These datasets plug into the existing CIEAV `ml/train_trl.py`, verifier, curriculum, adversarial replay, environment qualification, GPU determinism, and checkpoint-promotion system.

## Windows/local single-node learning

For a local Windows/CPU qualification loop, use the intentionally smaller requirements set. It excludes vLLM, verl, Ray and SGLang so the basic learning environment does not depend on Linux/GPU-oriented scale engines.

Check without modifying the machine:

```powershell
python scripts/ml-local-learning-bootstrap.py --check
```

Install missing single-node dependencies:

```powershell
python scripts/ml-local-learning-bootstrap.py
```

Then run a real offline training smoke:

```powershell
python scripts/ml-local-learning-smoke.py
```

The smoke performs actual training without downloading a model: it builds a local tokenizer, instantiates a tiny GPT-style causal LM from configuration, attaches PEFT LoRA adapters, trains through TRL `SFTTrainer` on a `datasets.Dataset`, and requires trainable parameter values to change. The emitted evidence remains `authority=false`, `productionAuthority=false`, and the resulting candidate is explicitly unqualified.

This test is CPU-compatible and does not require River, Reticle, a GPU, Hugging Face model access, or any external API.

## Fast boundary test

No GPU, model download, River account, or Reticle account is required for the boundary smoke:

```powershell
python scripts/ml-consequence-learning-smoke.py
node scripts/ml-consequence-learning-static.mjs
```

The smoke creates success/failure/unknown fixtures, proves secret redaction, verifies SHA-256 trajectory integrity, enumerates provider surfaces, and builds all four dataset formats. The static gate also syntax-checks the local learning bootstrap/training smoke and verifies that the Windows-safe local dependency set does not force scale engines.

## Production boundary

This feature does **not** change CIEAV production authority. A learned checkpoint remains unqualified until the existing deterministic promotion/release gates pass. External proof/training providers are replaceable compute/evidence resources, not trust roots.
