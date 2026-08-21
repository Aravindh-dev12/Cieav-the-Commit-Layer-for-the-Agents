# CIEAV ML post-training architecture

This directory is the GPU/research side of CIEAV's model pipeline. It is intentionally separate from the shipped Node authority runtime.

## Safety boundary

Models interpret; CIEAV deterministic code authorizes. No trained model, reward model, process verifier, or LLM judge can mint a permit, commit an action, mark UNKNOWN as success, or authorize undo. Promotion requires deterministic held-out evaluation.

## Training stages

1. `SFT` — teach CIEAV schemas, consequence reasoning, abstention format, and process traces.
2. `DPO` — improve explanations, refusals, previews, and friction preferences.
3. `KTO` — optional binary production-feedback alignment when paired preferences are unavailable.
4. `RLVR/GRPO` — optimize against CIEAV deterministic verifiers.
5. `PROCESS` — add step/fact/policy-check credit from process traces.
6. `SOFT_RLVR` — partial credit for checklist-like semantic requirements; never authority.
7. `AGENTIC_RL` — train multi-turn tool trajectories with permit, approval, commit, outcome, and undo invariants.
8. `CALIBRATION` — reward correct confidence and abstention on insufficient evidence.
9. `ADVERSARIAL` — held-out reward-hacking, prompt-injection, secret-leakage, and policy-conflict suites.
10. `DISTILL` — distill the qualified teacher into a smaller local semantic model, then re-run the complete promotion gate.

## Frameworks

Prototype/single-node training uses PyTorch + Transformers + TRL + PEFT. Scale-out RL uses verl with vLLM/SGLang rollouts. These frameworks optimize models only; the canonical reward semantics live in `packages/core/src/ml-*.ts` and must be mirrored/tested when ported to Python workers.

## Data flow

`evals/cases.v1.json` -> `dataset/build_from_evals.py` -> JSONL training/eval records -> TRL/verl rollout -> deterministic verifier service/offline scorer -> held-out promotion report.

Never train and promote on the same verifier corpus. Keep separate train, validation, adversarial, and promotion partitions; promotion corpora must be immutable/versioned for each release candidate.
