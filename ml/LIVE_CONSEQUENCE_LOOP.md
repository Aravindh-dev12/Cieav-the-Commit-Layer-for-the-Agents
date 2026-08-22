# CIEAV live consequence learning loop

This path connects real finalized local CIEAV receipts to local post-training without giving the learning plane execution authority.

The receipt path is intentionally classified as **OUTCOME_PROOF**, not authority-grade agentic RL. A signed finalized receipt proves a CIEAV-observed consequence and receipt provenance, but does not by itself prove the complete execution-fabric chain of agent attestation + credential lease + formal permission graph + consumed reality-bound commit + one-use execution ticket.

## 1. Pull and re-run the static gate

```powershell
git pull
node scripts/ml-consequence-learning-static.mjs
```

The gate now includes a temporary SQLite receipt store, real Ed25519 signing/verification, a deliberately tampered receipt, Python normalization, and consequence dataset generation.

## 2. Find the local receipt database

Managed local authority requires `CIEAV_STATE_DIR`. If the variable is present in the shell that owns the gateway state:

```powershell
$env:CIEAV_STATE_DIR
```

The default receipt database inside that state directory is:

```text
<CIEAV_STATE_DIR>\receipts.sqlite3
```

If `CIEAV_SQLITE_PATH` was configured, that path takes precedence.

Do not copy private receipt-signing keys into the learning pipeline. The exporter needs only the signed receipt rows and verifies their embedded Ed25519 public identity.

## 3. Export finalized signed receipts

With `CIEAV_STATE_DIR` available:

```powershell
node scripts/export-finalized-receipts-for-learning.mjs `
  --output=ml/data/live/finalized-receipt-evidence.jsonl
```

Or point directly at a database:

```powershell
node scripts/export-finalized-receipts-for-learning.mjs `
  --db="C:\path\to\receipts.sqlite3" `
  --output=ml/data/live/finalized-receipt-evidence.jsonl
```

The exporter is read-only and accepts only:

- v3 CIEAV receipts;
- Ed25519 signatures that verify against the embedded public key and key id;
- `COMMITTED`, `UNDONE`, or `UNDO_FAILED` receipts;
- receipts with a finalized `OBSERVED_SUCCESS`, `OBSERVED_FAILURE`, or `UNKNOWN` outcome.

The exported evidence is stamped:

```text
authority=false
productionAuthority=false
authorityGrade=false
realityBound=false
evidenceClass=FINALIZED_RECEIPT
```

Original outcome summaries are replaced by a minimized generic summary plus a SHA-256 digest.

## 4. Normalize and seal trajectories

```powershell
python ml/consequence_learning_cli.py normalize-jsonl `
  --input ml/data/live/finalized-receipt-evidence.jsonl `
  --output ml/data/live/finalized-receipt-trajectories.jsonl

python ml/consequence_learning_cli.py verify `
  --input ml/data/live/finalized-receipt-trajectories.jsonl
```

Receipt-derived trajectories must report:

```text
trainingScope=OUTCOME_PROOF
eligibleAgenticRl=false
authorityEvidenceComplete=false
```

The normalization step seals these properties into the trajectory digest.

## 5. Build SFT/DPO/KTO/GRPO data

```powershell
python ml/consequence_learning_cli.py dataset `
  --input ml/data/live/finalized-receipt-trajectories.jsonl `
  --output-dir ml/data/live/dataset
```

The generated dataset manifest records how many inputs are authority-grade and how many are eligible for agentic RL. Receipt-derived evidence must produce zero for both counts.

## 6. Train a real local candidate

The local stack from `ml/requirements-local.txt` is sufficient. No GPU, model download, River account, or external API is required.

```powershell
python ml/train_consequence_candidate.py `
  --trajectories ml/data/live/finalized-receipt-trajectories.jsonl `
  --output ml/runs/live-consequence-candidate `
  --steps 4
```

The candidate trainer creates its tiny causal base model locally, applies PEFT/LoRA, runs TRL SFT on the actual verified consequence examples, saves the checkpoint, and records a standard CIEAV ML training-round manifest.

The required final state is:

```text
status=TRAINED_UNQUALIFIED
qualification=UNQUALIFIED
authority=false
productionAuthority=false
promotionExecuted=false
```

Verify it independently:

```powershell
python ml/training_round.py verify `
  --manifest ml/runs/live-consequence-candidate/training-round.json
```

## 7. What this proves—and what it does not

A passing run proves the local loop:

```text
signed finalized CIEAV receipt
  -> cryptographic receipt verification
  -> minimized consequence evidence
  -> provenance-bound trajectory
  -> consequence dataset
  -> real TRL/PEFT training
  -> TRAINED_UNQUALIFIED checkpoint
```

It does **not** qualify a model for production, and receipt evidence is not allowed to claim the complete authority chain.

The next stronger evidence source is the execution-fabric path, where training examples can be bound to verified agent identity, credential lease, formal permission graph, consumed reality-bound commit, execution ticket, exact arguments, proof obligation, and settlement. Only that complete class may become `AUTHORITY_AND_OUTCOME` / `eligibleAgenticRl=true`, and it still remains `authority=false` as training data.
