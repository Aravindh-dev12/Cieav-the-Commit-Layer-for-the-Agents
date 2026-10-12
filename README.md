# CIEAV: The Commit Layer for AI Agents

> **Commit is not success.** An agent executing an action is a dispatch; whether the real world actually completed that action safely and reversibly requires independent observation, verifiable receipts, and an immutable safety floor.

CIEAV is a local control plane and transaction coordinator for autonomous AI agents. It sits directly between agent reasoning and consequential execution (moving money, altering cloud resources, mutating databases, changing permissions, or sending communications).

Instead of relying on fragile prompt-based guardrails or hoping an LLM adheres to system instructions, CIEAV intercepts tool calls at runtime, enforces non-negotiable deterministic safety policies, computes calibrated risk probabilities, requires single-use execution tokens, signs Ed25519 hash-chained receipts, and verifies post-execution state transitions before permitting Undo operations.

```
Agent Tool Invocation (e.g. transfer_funds, delete_s3_bucket)
                    │
                    ▼
       ┌─────────────────────────────┐
       │   CIEAV Gateway (Local)     │
       └──────────────┬──────────────┘
                      │
        1. Intercept & Redact Secrets (Credit cards, tokens, passwords)
                      │
        2. Deterministic Safety Floor (Non-negotiable policy rules)
                      │
        3. Calibrated Risk Evaluation:
           - Embedded Local Decision Model (cieav-decider-mini, <3ms)
           - Optional AWS Bedrock Converse (Claude Haiku 4.5)
           - Optional Crustdata Payee Verification
           * Invariant: Risk can only ratchet UPWARDS, never downwards.
                      │
        4. Cognitive Friction Engine (Fatigue detection & step-up confirmation)
                      │
        5. Single-Use Cryptographic Token (60s TTL, bound to action ID)
                      │
                      ▼
             Execution Sandbox / Target API
                      │
                      ▼
        6. State Observer (Inspects before vs. after real world state)
                      │
             ┌────────┴────────┐
             ▼                 ▼
     OBSERVED_SUCCESS    OBSERVED_FAILURE / UNKNOWN
             │                 │
     Receipt v3 Signed   Receipt v3 Signed
     Inverse Available   Undo Permanently Denied
```

---

## Core Invariants

1. **Deterministic Safety Floor**: An AI model can **only escalate risk**, never lower it. If deterministic policy marks `delete_file` as `CRITICAL`, no language model or decision heuristic can demote it to `LOW` or `AUTO`.
2. **HIGH and CRITICAL Never Auto-Execute**: Consequential actions always require explicit human confirmation. Under high approval frequency (cognitive fatigue), even lower-risk actions ratchet up to preview mode.
3. **Committed ≠ Succeeded**: An action in state `COMMITTED` simply means it entered the execution pipeline. Consequence is independently verified as `OBSERVED_SUCCESS`, `OBSERVED_FAILURE`, or `UNKNOWN`.
4. **Two-Phase Undo**: Undo is only permitted if the action's outcome was verified as `OBSERVED_SUCCESS` **and** the tool registered a valid inverse function. Ambiguous outcomes (`UNKNOWN`) permanently forbid Undo.
5. **Local Authority**: Private keys, receipts, execution capabilities, and durable SQLite state remain strictly on the host machine.
6. **Zero External Keys Required**: Runs 100% locally out-of-the-box using the embedded decision engine (`cieav-decider-mini`). External cloud services (AWS Bedrock, Crustdata, Neatlogs) are strictly optional enhancements.

---

## Architectural Components

### 1. Embedded Local Decision Engine (`/v1/decisions` & `/v1/systemone`)
CIEAV includes a low-latency, self-contained decision engine. Instead of burning hundreds of tokens generating open-ended chat completions, the decision engine evaluates typed questions and returns calibrated probabilities in under 3 milliseconds:
- **Predicates**: Boolean probabilities `[0.0, 1.0]` (e.g., `is_destructive`, `is_prompt_injection`, `is_routine`).
- **Choices**: Probability distributions over category tiers (e.g., `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Scores**: Continuous scalar values on calibrated ranges (e.g., consequence severity from `0.0` to `1.0`).

The gateway exposes both `/v1/decisions` and `/v1/systemone` endpoints directly for any agent or workflow.

### 2. Autonomous Agent Gateway Protocol
Provides standardized agent session and boundary governance:
- **Discovery**: Hosted at `/.well-known/poppy.json`, publishing organization endpoints, supported intents, and authentication schemes.
- **Session Lifecycle**: HMAC-signed session tokens (`poppy_sess_*`) binding agents to specific scopes and TTLs.
- **Governed Turns**: All agent actions are mediated through the commit layer, requiring step-up confirmation on consequential operations.

### 3. Governed Action Surfaces & Readiness Audit
Enforces structured action surfaces for mission-critical operations:
- **Action Surfaces**: Formally defined interfaces with strict idempotency keys (`idempotency_key`), preventing accidental double-spends or duplicate executions.
- **Trajectory Evidence**: Canonical execution logs hashed with SHA-256 to provide tamper-proof forensic evidence for compliance.
- **Readiness Audit**: Evaluates agent action surface readiness, generating a calibrated reliability score and execution grade.

### 4. Headroom Context Optimization & CCR Vault
Context optimization middleware that reduces token consumption:
- **Content-Aware Compression**: Specialized compressors for structured JSON (`SmartCrusher`), source code ASTs, and operational logs.
- **CCR Vault**: Offloads large payloads to a local content-addressable vault (`ccr_*`), replacing them with compressed previews and saving up to 95.8% of tokens while preserving loss-free retrieval.

### 5. Procedural Graph Memory Engine
Graph-structured execution memory:
- Caches verified execution graphs: `(precondition -> action -> postcondition -> outcome)`.
- When an agent encounters a known intent, the engine recalls the certified procedure graph, skipping exploratory loops and redundant LLM reasoning turns while preserving all safety checks.

### 6. Cryptographic Receipt Ledger
- Every state transition generates an **Ed25519**-signed receipt.
- Receipts form an immutable SHA-256 hash chain (`prev_hash`). Any manual database tampering breaks cryptographic verification (`GET /api/receipts/verify`).
- Audit updates use an append-only pattern to prevent revisionism.

---

## Environment Configuration

CIEAV is designed to run completely offline without external keys. When cloud providers are configured, they enrich tracing, payee verification, and secondary model evaluation:

```env
# ---------------------------------------------------------------------------
# 1. Neatlogs (Distributed Tracing & Gateway Observability)
# ---------------------------------------------------------------------------
NEATLOGS_API_KEY=your-neatlogs-project-key

# ---------------------------------------------------------------------------
# 2. AWS Bedrock (Claude Haiku 4.5 via Bedrock Converse API)
# ---------------------------------------------------------------------------
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_DEFAULT_REGION=us-east-1

# ---------------------------------------------------------------------------
# 3. Crustdata (Counterparty & Payee Screening)
# ---------------------------------------------------------------------------
CRUSTDATA_API_KEY=your-crustdata-key

# ---------------------------------------------------------------------------
# 4. Local Decision Model Configuration (Zero-Key Default)
# ---------------------------------------------------------------------------
CIEAV_DECISION_MODEL_ENABLED=1
CIEAV_DECISION_MODEL=cieav-decider-mini
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Virtual environment recommended

### Installation
```bash
git clone https://github.com/Aravindh-dev12/Cieav-the-Commit-Layer-for-the-Internet.git
cd Cieav-the-Commit-Layer-for-the-Internet

# Install dependencies
pip install -r commit_layer/requirements.txt
```

### Launch the Gateway & Dashboard
```bash
python -m uvicorn commit_layer.app:app --host 127.0.0.1 --port 8000 --reload
```

Open **`http://127.0.0.1:8000`** in your browser to access the live dashboard:
- **Pending Approvals**: Review queued high-risk actions and submit typed confirmations.
- **World State Ledger**: Inspect real-time bank ledger balances, filesystem nodes, and trash containers.
- **Hash-Chained Receipt Timeline**: View signed Ed25519 receipts with one-click Undo execution.
- **System Telemetry**: Monitor readiness scores, procedural memory caches, and Headroom vault statistics.

---

## Verification & Testing

### 1. Unit Test Suite (38 tests)
Runs all unit tests across the decision model, policy floor, cryptographic chains, Headroom vault, procedural memory, and action surfaces:
```bash
python -m pytest commit_layer/tests/ -v
```

### 2. Live End-to-End System Test (14 stages)
Executes a live test against the running gateway over HTTP, validating all 14 subsystems:
```bash
python commit_layer/live_e2e_test.py
```
Validates:
- Sandbox ledger resets
- Hash chain integrity
- Prompt injection blocking
- Governed payments and 2-phase Undo
- Multi-domain intent planning with typed confirmation
- Headroom CCR token compression (95%+ reduction)
- Procedural graph recall
- Action surface idempotency key caching and replay defense
- Agent Gateway Protocol discovery and session handling
- Open-Agent-Connector dispatch

### 3. Adversarial Red Team Suite (10 injection attacks)
Tests the deterministic policy floor against hostile prompt injection, privilege escalation, and credential exfiltration attempts:
```bash
python -m commit_layer.redteam
```

---

## API Usage Examples

### 1. Calibrated Decisions API
Query the embedded decision model directly:

```bash
curl -X POST http://127.0.0.1:8000/v1/decisions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "cieav-decider-mini",
    "input": "delete_file path=/var/log/audit.log on production cluster",
    "questions": [
      {
        "id": "risk_tier",
        "type": "choice",
        "choices": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        "question": "What is the consequence severity?"
      },
      {
        "id": "is_destructive",
        "type": "predicate",
        "question": "Does this action permanently delete data?"
      }
    ]
  }'
```

**Response:**
```json
{
  "model": "cieav-decider-mini",
  "object": "decision.completion",
  "created": 1791664500,
  "decisions": {
    "risk_tier": {
      "type": "choice",
      "choice": "CRITICAL",
      "probabilities": {
        "LOW": 0.0016,
        "MEDIUM": 0.0055,
        "HIGH": 0.0242,
        "CRITICAL": 0.9687
      }
    },
    "is_destructive": {
      "type": "predicate",
      "probability": 0.95,
      "value": true
    }
  },
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 6,
    "total_tokens": 14
  }
}
```

### 2. Intercepting an Action via Gateway
Submit an agent action to the commit gateway:

```bash
curl -X POST http://127.0.0.1:8000/api/actions \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "send_payment",
    "args": {
      "to": "merchant_a",
      "amount": 250,
      "card_number": "4111-2222-3333-4444"
    },
    "agent_id": "procurement-bot"
  }'
```

Notice that credit card details are immediately redacted before logging, policy evaluation, or model forwarding. Because `$250 >= $100`, the action is classified as `HIGH` and queued for typed confirmation:

```json
{
  "action_id": "908946b8-a7f2-4898-9f44-1027fe8366d9",
  "status": "pending",
  "tool": "send_payment",
  "args_redacted": {
    "to": "merchant_a",
    "amount": 250,
    "card_number": "[CARD_REDACTED]"
  },
  "risk": "HIGH",
  "reasons": ["Payment >= $100: HIGH risk"],
  "decision": "preview_with_typed_confirmation",
  "requires_typed_confirmation": true
}
```

### 3. Approving with Typed Confirmation
Approve the queued action:

```bash
curl -X POST http://127.0.0.1:8000/api/actions/908946b8-a7f2-4898-9f44-1027fe8366d9/approve \
  -H "Content-Type: application/json" \
  -d '{
    "approved_by": "secops-admin",
    "typed_confirmation": "COMMIT"
  }'
```

The gateway issues a single-use token, executes the transfer in the sandbox, inspects before/after ledger balances, signs the receipt, and marks undo as available:

```json
{
  "action_id": "908946b8-a7f2-4898-9f44-1027fe8366d9",
  "status": "committed",
  "outcome": "OBSERVED_SUCCESS",
  "undo_state": "AVAILABLE",
  "result": {
    "status": "sent",
    "amount": 250,
    "to": "merchant_a"
  },
  "receipt_id": "908946b8-a7f2-4898-9f44-1027fe8366d9"
}
```

### 4. Executing Two-Phase Undo
Compensate the committed payment:

```bash
curl -X POST http://127.0.0.1:8000/api/receipts/908946b8-a7f2-4898-9f44-1027fe8366d9/undo
```

The refund executes, ledger balances are restored, and a new signed audit receipt marks `undo_state: UNDONE`.

---

## Directory Structure

```text
Cieav-the-Commit-Layer-for-the-Internet/
├── commit_layer/
│   ├── app.py                   # FastAPI application & REST/WebSocket routes
│   ├── decision_model.py        # Embedded local decision engine (/v1/decisions)
│   ├── gateway.py               # Central interception and approval pipeline
│   ├── policy.py                # Deterministic safety rules (immutable floor)
│   ├── classifier.py            # Risk classifier (policy floor + Bedrock + local model)
│   ├── privacy.py               # Token, secret, card, and PII sanitizer
│   ├── receipts.py              # Ed25519 signing & SHA-256 hash-chain ledger
│   ├── observer.py              # Before/after outcome verification
│   ├── tokens.py                # Single-use execution token authority (60s TTL)
│   ├── friction.py              # Cognitive debt & rate fatigue tracking
│   ├── poppy.py                 # Autonomous Agent Gateway protocol (discovery & sessions)
│   ├── webzero.py               # Action Surfaces, idempotency & reliability scoring
│   ├── memorable.py             # Procedural graph memory (SQLite)
│   ├── connectors.py            # Open-Agent-Connector & Open-Dots workspace
│   ├── crustdata.py             # Payee & counterparty identity checks
│   ├── telemetry.py             # Neatlogs distributed tracing wrapper
│   ├── sandbox.py               # Mock world state (Bank, Filesystem, ACLs)
│   ├── redteam.py               # 10 adversarial injection test scenarios
│   ├── live_e2e_test.py         # 14-stage live HTTP test runner
│   ├── headroom/                # Context compression & CCR vault
│   │   ├── ccr.py               # Chunk cache and retrieval vault
│   │   ├── crusher.py           # JSON and structural crusher
│   │   ├── code.py              # AST code compressor
│   │   ├── log.py               # Log compressor
│   │   └── router.py            # Content-type router
│   ├── tools/                   # Registered sandbox tools
│   │   ├── payments.py          # SendPayment & FlakyPayment tools
│   │   ├── files.py             # DeleteFile tool
│   │   ├── access.py            # GrantAccess tool
│   │   └── email.py             # SendEmail tool
│   └── tests/                   # Pytest test suite (38 unit tests)
├── .env.example                 # Clean environment configuration template
└── README.md                    # Project documentation
```

---

## License

Apache-2.0
