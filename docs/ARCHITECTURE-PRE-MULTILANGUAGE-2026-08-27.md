# CIEAV Architecture

## Consequence Intelligence Framework and Autonomous Computing Substrate

> **Models think. Agents plan. CIEAV commits.**
>
> **CIEAV turns intelligence into provable, governable, and learnable state transitions in the real world.**

This document is the canonical target architecture for CIEAV.

It intentionally separates **what exists and is being qualified today** from the **full production architecture CIEAV is building toward**. A component appearing in this document does not by itself mean that component is already production-qualified. Production qualification requires the explicit gates described below.

---

## 1. Product thesis

CIEAV is not a chatbot, a single foundation model, a browser wrapper, a generic agent framework, or an AI Foundry clone.

CIEAV is a **model- and agent-independent consequence-native intelligence runtime**. Its job is to turn probabilistic machine intention into governed, observable, durable, and learnable changes in reality.

The core transaction is not a token, a tool call, or a workflow step.

The core transaction is a **real-world state transition**:

```text
WORLD BEFORE
    +
objective / intent
    +
agent + model identity
    +
delegated authority
    +
exact proposed operation
    +
current reality
    +
policy
    ↓
REALITY-BOUND COMMIT
    ↓
ONE-USE EXECUTION AUTHORITY
    ↓
REAL EXECUTION
    ↓
INDEPENDENT PERCEPTION / PROOF
    ↓
WORLD AFTER
    ↓
SUCCESS / FAILURE / UNKNOWN
```

CIEAV must remain useful regardless of which model or agent ecosystem is dominant. Frontier API models, local/open models, coding models, multimodal models, enterprise models, and CIEAV-trained models are interchangeable cognitive engines inside the larger runtime.

---

## 2. Constitutional invariants

These invariants are architectural, not optional product preferences.

1. **No model can mint authority.**
2. **No agent can mint authority.**
3. **No learned checkpoint can promote itself.**
4. **No memory system, router, planner, critic, reward model, or cognitive scheduler can authorize a real-world consequence.**
5. **Learning may improve proposals; learning never becomes execution authority.**
6. **`COMMITTED` is not success.** Dispatch and real-world outcome are distinct states.
7. **Unknown remains `UNKNOWN`.** Lack of proof must never be silently converted into success.
8. **Exact authority is bound to exact execution.** Broad intent is not an execution capability.
9. **Execution authority is scoped, short-lived, and preferably one-use.**
10. **Reality is checked both before and after consequential execution when the action semantics require it.**
11. **Recovery and undo are new governed consequences, not privileged bypasses.**
12. **Training data is provenance-bearing and authority-free.** It cannot contain reusable execution capability or secret material.
13. **Production promotion is deterministic and external to model code.**
14. **Human approval may be requested, but hidden UI must never imply silent auto-approval.**
15. **The normal product is background infrastructure. Diagnostic UI is optional and non-authoritative.**

The critical dependency direction is:

```text
cieav.intelligence
        │
        │ proposes
        ▼
cieav.authority
        │
        │ permits
        ▼
cieav.execution
```

Never:

```text
cieav.intelligence ──► signer / permit minting / credential issuance / promotion authority
```

---

## 3. User experience: installed, not opened

The normal CIEAV consumer experience is ambient.

```text
install CIEAV once
      ↓
starts with the operating system
      ↓
runs as a background substrate
      ↓
no dashboard required
no dedicated browser window required
no persistent application UI required
      ↓
AI / agents / automations work normally
      ↓
CIEAV becomes visible only when authority,
uncertainty, failure, recovery, or policy requires attention
```

Normal interaction should be native notification or native approval UX, not a localhost control center.

Examples:

```text
CIEAV
Agent requests permission to deploy release 4.2 to production.
[Allow] [Block]
```

```text
CIEAV
Payment outcome is uncertain. CIEAV did not retry the transfer.
```

```text
CIEAV
Deployment completed and was independently verified.
```

Developer/forensics surfaces may remain available through explicit commands, local authenticated endpoints, logs, receipts, or diagnostic tools. They do not define the consumer product experience and they never become execution authority.

---

## 4. Top-level architecture

CIEAV is one product with security-separated planes.

```text
╔════════════════════════════════════════════════════════════╗
║                          CIEAV                             ║
║              Autonomous Computing Substrate              ║
╠════════════════════════════════════════════════════════════╣
║  INTELLIGENCE PLANE                                       ║
║  frontier / local / open / CIEAV-trained models           ║
║  Intelligence State · Cognitive Scheduler                 ║
║  reasoning · routing · proof planning · recovery          ║
╠════════════════════════════════════════════════════════════╣
║  AGENT PLANE                                              ║
║  MCP · A2A · coding agents · browser agents               ║
║  enterprise agents · custom agents · automation           ║
╠════════════════════════════════════════════════════════════╣
║  CONSEQUENCE COMPILER                                     ║
║  objective → typed consequence program                    ║
║  preconditions · candidate paths · proof obligations      ║
║  recovery semantics · uncertainty constraints             ║
╠════════════════════════════════════════════════════════════╣
║  AUTHORITY / COMMIT PLANE                                 ║
║  identity · hardware attestation · delegation             ║
║  credential leases · permission graph · policy            ║
║  exact arguments · reality witness                        ║
║  reality-bound commit · one-use execution ticket          ║
╠════════════════════════════════════════════════════════════╣
║  EXECUTION PLANE                                          ║
║  browser · SaaS · API · filesystem · Cloud                ║
║  code · infrastructure · MCP · enterprise systems         ║
╠════════════════════════════════════════════════════════════╣
║  PERCEPTION / PROOF PLANE                                 ║
║  CDP/browser · runtime · network · DOM/app state           ║
║  API/database/filesystem witnesses · hardware evidence    ║
║  proof providers                                          ║
║  SUCCESS · FAILURE · UNKNOWN                              ║
╠════════════════════════════════════════════════════════════╣
║  LEARNING PLANE                                           ║
║  Authorized Outcome Trajectories                          ║
║  SFT · DPO · KTO · GRPO/RLVR · offline RL                ║
║  process rewards · adversarial replay · distillation      ║
╠════════════════════════════════════════════════════════════╣
║  QUALIFICATION / PROMOTION PLANE                          ║
║  held-out deterministic evaluation                        ║
║  model/skill qualification · hard constitutional gates    ║
╚════════════════════════════════════════════════════════════╝
```

The planes are connected, but authority is not transitive across them.

---

## 5. Three forms of CIEAV intelligence

CIEAV does not place all intelligence in neural weights.

```text
VERIFIED EXPERIENCE
       │
       ├────────► NEURAL INTELLIGENCE
       │          models / adapters / critics
       │
       ├────────► EMPIRICAL INTELLIGENCE
       │          Consequence Graph
       │
       └────────► COMPILED INTELLIGENCE
                  Verified Skills
```

### 5.1 Neural intelligence

Models perform open-ended reasoning, prediction, classification, proof planning, recovery reasoning, routing, and language/code generation.

### 5.2 Empirical intelligence

The Consequence Graph accumulates observed transition semantics from verified executions: preconditions, required authority, outcomes, failure modes, proof reliability, latency, reversibility, and recovery behavior.

### 5.3 Compiled intelligence

Repeated, sufficiently understood behavior can be compiled into typed, deterministic, qualified Verified Skills so that known operations do not require an LLM to rediscover the procedure every time.

The long-term learning progression is:

```text
unknown situation
    → reason

repeated situation
    → retrieve + learn

well-understood situation
    → compile candidate skill

qualified procedure
    → deterministic Verified Skill
```

A self-improving CIEAV should become **less dependent on probabilistic reasoning for already-understood operations**, not more.

---

## 6. Intelligence State

A CIEAV reasoning episode operates over an explicit **Intelligence State**, not only a chat context window.

A target logical schema is:

```text
IntelligenceState {
    objective

    epistemic_state
    current_reality

    available_models
    model_competence_profiles

    available_agents
    available_tools
    available_skills
    available_proof_providers

    authority_envelope
    credential_constraints

    active_hypotheses
    uncertainty

    consequence_graph_context
    candidate_plans
    proof_obligations
    recovery_requirements

    privacy_constraints
    compute_budget
    latency_budget
    cost_budget
    risk_budget
}
```

A model call mutates only cognitive state. An observation mutates epistemic state. An authorized operation may mutate reality. Proof settles the relationship between expected and observed reality.

---

## 7. Epistemic State

CIEAV memory must distinguish **remembered text** from **currently supported belief**.

A first-class claim can be represented conceptually as:

```text
EpistemicClaim {
    claim
    scope
    supporting_evidence[]
    contradicting_evidence[]
    source
    observed_at
    reality_version
    confidence
    freshness
    invalidation_conditions[]
    status: SUPPORTED | CONTRADICTED | STALE | UNKNOWN
}
```

Example:

```text
claim:
    production is running build 841

support:
    deployment API reports 841
    health endpoint reports 841

observed_at:
    16:04:18

invalidation:
    next deployment event
```

Stale memory must never be treated as fresh authority-relevant reality merely because it exists in context.

---

## 8. Cognitive Scheduler

CIEAV must not assume one model is optimal for every problem.

The Cognitive Scheduler chooses a **computation strategy**, not merely a provider name.

It can choose:

```text
one model
multiple independent models
parallel hypotheses
sequential critique
local/private model
frontier reasoning model
specialist model
retrieval
simulation
proof provider
Verified Skill
human escalation
stop because evidence is insufficient
```

Inputs include:

```text
difficulty
domain
risk
privacy
latency
cost
required modalities
required proof
available model competence
known consequence semantics
available deterministic skills
```

The scheduler itself has **zero execution authority**.

### 8.1 Cognitive Programs

The scheduler may instantiate reusable Cognitive Programs such as:

```text
production_incident:
  1. gather live evidence
  2. generate independent hypotheses
  3. retrieve similar verified incidents
  4. rank by evidence consistency
  5. request missing observations
  6. propose reversible remediation paths
  7. compare blast radius and proofability
  8. submit selected consequence program to authority
  9. execute only after authority
 10. verify recovery
```

```text
software_fix:
  1. reproduce
  2. runtime observe
  3. localize
  4. patch
  5. execute deterministic tests
  6. gather runtime proof
  7. run regression replay
  8. propose skill compilation if pattern repeats
```

CIEAV may learn which cognitive architecture works best for which class of objective.

---

## 9. CIEAV model family

CIEAV should build a family of logical intelligence roles rather than one monolithic model.

### 9.1 CIEAV Router

Purpose: choose models, compute budget, reasoning structure, retrieval, simulation, proof, or deterministic skill execution.

Early implementation can be a small classifier/contextual bandit. It does not need to begin as a large LLM.

### 9.2 CIEAV Core Reasoner

Purpose:

```text
objective decomposition
hypothesis generation
consequence-aware planning
uncertainty identification
proof-aware action selection
recovery-aware planning
```

Target behavior is not generic chat. Its context includes current reality, authority envelope, known consequence semantics, available skills, and proof obligations.

### 9.3 CIEAV Consequence Model

Purpose: estimate possible state transitions.

Input:

```text
world_before
+ action
+ exact arguments
+ environment
+ historical verified transitions
```

Output:

```text
possible world_after states
P(success)
P(failure)
P(unknown)
side effects
blast radius
reversibility
likely failure modes
expected proof sources
```

Start with deterministic empirical statistics. Add learned sequence/graph models only when sufficient verified data exists.

### 9.4 CIEAV Proof Planner

Purpose: propose the strongest practical witness strategy for an expected consequence.

It may suggest API/database/browser/runtime/filesystem/hardware/external witnesses.

It never decides final success. The deterministic outcome verifier decides:

```text
SUCCESS
FAILURE
UNKNOWN
```

### 9.5 CIEAV Authority Advisor

Purpose: suggest minimum likely permission, credential scope, TTL, resource scope, and risk classification.

It is an advisor only.

```text
Authority Advisor suggestion
          ↓
DETERMINISTIC POLICY / AUTHORITY ENGINE
          ↓
actual authority decision
```

### 9.6 CIEAV Recovery Model

Purpose: propose safe recovery after failure, partial completion, timeout, stale state, or unknown settlement.

It must learn the distinction:

```text
UNKNOWN != FAILURE
```

For a timed-out non-idempotent transfer, safe behavior is normally reconciliation first, not blind retry.

### 9.7 CIEAV Critic / Reward Models

Critics score training trajectories across multiple dimensions. They do not authorize execution.

Example reward vector:

```text
R = {
    objective_success,
    proof_strength,
    calibration,
    authority_efficiency,
    privilege_minimization,
    reversibility,
    recovery_quality,
    policy_compliance,
    latency,
    cost
}
```

Penalties include:

```text
false success claim
unsafe duplicate consequence
excess privilege
stale-world action
unnecessary irreversibility
weak or missing proof
unsafe retry
```

### 9.8 CIEAV Skill Compiler

Purpose: convert repeated verified trajectories into candidate deterministic skills.

The compiler proposes. Deterministic qualification decides whether the skill is accepted.

---

## 10. Backbone and adapter strategy

Do not begin by training a foundation model from scratch.

CIEAV should support:

```text
frontier provider APIs
open-weight reasoning models
local/private models
coding specialists
multimodal specialists
CIEAV-trained adapters/checkpoints
```

For owned models, the initial strategy is:

```text
shared open-weight backbone
      │
      ├── reasoner adapter
      ├── proof adapter
      ├── recovery adapter
      ├── authority-advisor adapter
      ├── coding adapter
      └── enterprise/domain adapters
```

Use PEFT/LoRA/QLoRA before maintaining many full independent checkpoints.

Logical deployment tiers:

### Edge

Small local models for routing, extraction, local privacy, lightweight risk hints, and signal classification.

### Core

Mid-sized trainable reasoning models for consequence planning, proof planning, recovery, and tool use.

### Research / Teacher

Large open-weight models and authorized frontier-provider APIs for difficult reasoning and teacher trajectory generation.

Teacher output must not automatically become training truth. Prefer:

```text
teacher proposal
      ↓
CIEAV execution / verifier
      ↓
verified consequence
      ↓
training example
```

---

## 11. Consequence Program

Agents should not be limited to low-level tool calls as the fundamental semantic object.

A **Consequence Program** describes the intended transition and its operational contract.

Conceptual example:

```text
objective:
    refund invoice #4821

expected_world_change:
    invoice.status = refunded
    customer.balance += 12400

preconditions:
    invoice currently paid
    refund not already executed

authority_requirements:
    refund this invoice only
    amount <= 15000
    expires in 3 minutes

execution_candidates:
    provider API
    protected browser fallback

proof_obligations:
    provider refund exists
    invoice status is refunded

recovery_semantics:
    reconcile before any retry

uncertainty_policy:
    UNKNOWN requires escalation

duplication_policy:
    at most one effective refund
```

The Consequence Program is not itself authority.

---

## 12. Consequence Compiler

The Consequence Compiler transforms a probabilistic objective/plan into a typed execution proposal.

```text
natural-language objective
        ↓
agent/model proposal
        ↓
CIEAV Consequence Compiler
        ↓
typed state-transition program
        ↓
preconditions
required authority
candidate execution path
proof obligations
recovery semantics
uncertainty constraints
        ↓
Authority / Commit Plane
```

It may compare multiple execution paths.

Example:

```text
Path A: direct root shell
  authority: very broad
  proofability: medium
  reversibility: weak

Path B: deployment API
  authority: scoped
  proofability: strong
  rollback: deterministic

Path C: qualified deployment skill
  authority: scoped
  proofability: strongest
  historical reliability: high
```

CIEAV should prefer the admissible path with the strongest combination of success probability, minimum authority, reversibility, proofability, cost, latency, and uncertainty.

---

## 13. Consequence Graph

The Consequence Graph is CIEAV's empirical operational model of reality.

Each verified transition can enrich an edge such as:

```text
WORLD STATE A
      │
      │ operation X
      │
      ├── required authority
      ├── preconditions
      ├── success frequency
      ├── failure modes
      ├── UNKNOWN frequency
      ├── proof reliability
      ├── latency distribution
      ├── reversibility
      └── recovery behavior
      │
      ▼
WORLD STATE B
```

This is not merely documentation. It is derived from verified execution evidence.

Planning can then ask:

```text
How do we reach desired state Y from current state X?
```

and rank paths by:

```text
success probability
minimum authority
maximum proofability
maximum reversibility
minimum blast radius
minimum cost
minimum latency
minimum uncertainty
```

### 13.1 Implementation progression

1. deterministic counters/statistics over normalized operation classes;
2. typed state/resource graph;
3. Bayesian/calibrated transition estimates;
4. representation learning over transitions;
5. graph neural models when data scale justifies them.

Do not begin with a GNN before the evidence model is correct.

---

## 14. Proof-carrying consequence

CIEAV should connect **proof that an operation may execute** with **proof of what happened after execution**.

A future complete object may bind:

```text
Intent Contract
Agent Identity
Model / Checkpoint Identity
User / Principal Identity
Hardware / Device Attestation
Delegated Authority
Credential Lease
Pre-State Witness
Policy Decision
Exact Operation + Arguments
Reality-Bound Commit
One-Use Execution Ticket
Execution Trace
Post-State Witness
SUCCESS / FAILURE / UNKNOWN
Recovery Evidence
Learning Provenance
```

Before execution:

```text
proof of permission
```

After execution:

```text
proof of consequence
```

The two must be cryptographically and semantically linked.

---

## 15. Authority / Commit Plane

The Authority / Commit Plane is CIEAV's trust kernel.

Target inputs include:

```text
principal identity
agent identity
model/checkpoint identity where available
delegated authority
credential lease
permission graph
exact operation
exact arguments
resource scope
current reality witness
policy
risk
reversibility
proof obligation
```

Target output:

```text
Reality-Bound Commit
        ↓
short-lived / one-use Execution Ticket
```

The execution ticket must not authorize an arbitrary future action merely because that action resembles the approved proposal.

Hardware-backed attestation is an optional stronger identity property and may only be claimed when the deployment actually provides and verifies it.

---

## 16. Durable consequence transaction semantics

CIEAV must distinguish transaction states because retries can create duplicate real-world consequences.

Target lifecycle:

```text
PROPOSED
   ↓
ANALYZED
   ↓
AUTHORIZED
   ↓
COMMITTED
   ↓
DISPATCHED
   ↓
OBSERVING
   ↓
┌─────────┬─────────┬─────────┐
SUCCESS   FAILURE   UNKNOWN
```

Optional additional states include recovery/compensation settlement.

Retry semantics are operation-specific:

```text
safe read
    → retry permitted

idempotent create with stable idempotency key
    → retry under same logical transaction

money movement / irreversible external action
    → never blindly retry after ambiguous dispatch
    → reconcile first

deployment
    → inspect current state
    → continue, compensate, or stop
```

CIEAV therefore needs an AI-aware transaction engine, not only a generic workflow scheduler.

---

## 17. Execution Plane

Execution providers may include:

```text
browser
HTTP/API
MCP
A2A
filesystem
Git/code
Cloud/infrastructure
SaaS
enterprise systems
database
native OS automation
future physical/robotic execution
```

Execution adapters must support as much of the following contract as the target system allows:

```text
operation identity
argument canonicalization
credential scope
idempotency semantics
precondition check
execution dispatch
execution correlation identifier
post-state witness hooks
recovery hooks
```

Browser automation is one execution provider, not CIEAV's product identity.

---

## 18. Perception / Proof Plane

The Perception / Proof Plane independently observes consequences.

Potential evidence sources:

```text
CDP/browser runtime
DOM/app state
network response
API witness
database witness
filesystem witness
Git state
Cloud control plane
metrics / logs
hardware evidence
external proof provider
```

The deterministic settlement result is:

```text
SUCCESS
FAILURE
UNKNOWN
```

### 18.1 Proof Provider interface

Target provider interface:

```text
CIEAV Proof Provider
    ├── cieav-browser
    ├── cieav-http
    ├── cieav-database
    ├── cieav-filesystem
    ├── cieav-git
    ├── cieav-cloud
    ├── cieav-tpm
    ├── external runtime-verification providers
    └── custom MCP/A2A proof providers
```

Third-party runtime proof systems may plug in through this interface rather than being cloned prematurely.

### 18.2 UNKNOWN as epistemic debt

UNKNOWN is training and operational information.

```text
UNKNOWN rate increases
        ↓
proofability score decreases
        ↓
autonomy confidence decreases
        ↓
stronger witness or alternate execution path required
        ↓
future proofability improves
```

CIEAV should learn not only how to perform tasks, but how to choose execution paths that make reality observable.

---

## 19. Authorized Outcome Trajectory

The most important future learning object is an **Authorized Outcome Trajectory**.

A normal trace is:

```text
prompt
→ tool call
→ tool response
→ answer
```

A CIEAV trajectory can bind:

```text
WHO requested the action
WHICH agent acted
WHICH model/checkpoint participated
WHAT delegated authority existed
WHICH credential lease was used
WHAT exact action and arguments were proposed
WHAT reality existed before execution
WHICH policy authorized it
WHICH Reality-Bound Commit was consumed
WHAT actually executed
WHAT evidence was observed
WHAT state existed afterward
SUCCESS / FAILURE / UNKNOWN
WHETHER recovery occurred
```

Conceptual training schema:

```text
AuthorizedOutcomeTrajectory {
    version
    trajectory_id

    objective

    principal_identity_ref
    agent_identity_ref
    model_identity_ref

    world_before
    epistemic_context

    available_tools
    available_skills
    available_authority

    proposed_plan
    requested_permissions
    credential_scope

    exact_operation
    exact_arguments_digest

    predicted_consequences
    proof_obligations
    recovery_requirements

    policy_result
    reality_bound_commit_ref
    execution_ticket_ref

    execution_events
    world_after
    evidence

    outcome: SUCCESS | FAILURE | UNKNOWN
    recovery

    cost
    latency

    provenance
    consent_scope
    redaction_profile
    learning_labels
}
```

### 19.1 Current receipt evidence is not automatically authority-grade

A finalized signed browser receipt that proves an observed outcome is valuable **OUTCOME_PROOF** evidence, but it is not automatically a complete authority-bound trajectory.

```text
signed finalized receipt
    = verified outcome evidence

signed finalized receipt
    != automatically full execution-fabric authority chain
```

Authority-grade learning eligibility requires the complete required bindings for the target schema. Missing authority/reality links must not be inferred.

---

## 20. Learning Plane

CIEAV's Learning Plane operates offline from authority.

```text
FINALIZED VERIFIED EVIDENCE
          ↓
provenance / consent / redaction
          ↓
training dataset
          │
          ├── SFT
          ├── DPO
          ├── KTO
          ├── reward / critic training
          ├── GRPO / RLVR
          ├── offline RL
          ├── adversarial replay
          └── distillation
                    ↓
             CANDIDATE MODEL
                    ↓
          deterministic qualification
                    ↓
             qualified checkpoint
```

Candidate checkpoints are always unqualified until the deterministic promotion gate says otherwise.

### 20.1 SFT

Use supervised fine-tuning to teach the grammar of consequence reasoning from trusted trajectories:

```text
objective
+ world before
+ authority envelope
+ good plan
+ correct authority request
+ exact action
+ proof obligation
+ outcome
```

### 20.2 DPO

Use paired preferences when two trajectories solve the same objective with different consequence quality.

Preferred:

```text
scoped credential
fresh reality witness
idempotent route
strong proof
reversible path
```

Rejected:

```text
admin credential
stale assumption
weak proof
irreversible route
```

### 20.3 KTO

Use desirable/undesirable labels where paired preference data is unavailable.

Examples:

```text
DESIRABLE: preserved UNKNOWN
UNDESIRABLE: claimed success without proof

DESIRABLE: requested narrow permission
UNDESIRABLE: requested administrator access
```

### 20.4 GRPO / RLVR

CIEAV is well suited to reinforcement learning with verifiable rewards because its environments can expose deterministic post-state checks.

```text
same objective
      ↓
multiple candidate trajectories
      ↓
isolated execution environments
      ↓
deterministic verifier
      ↓
reward
```

Prefer environment/verifier reward over an LLM judge when reality can be mechanically checked.

### 20.5 Process rewards

Final success is not sufficient when the model used excessive authority, ignored stale state, or took an unnecessarily irreversible path. Process reward models may score intermediate decisions for training.

They never become execution authority.

### 20.6 Offline RL

Real production consequences should not be an online exploration environment.

```text
production trajectory
      ↓
finalized evidence
      ↓
offline dataset
      ↓
offline learning
```

Structured policies such as retry/reconcile/stop/escalate/compensate are strong candidates for offline RL.

### 20.7 Distillation

CIEAV may use larger external/open models as teachers, but should prefer distilling **reality-validated behavior**:

```text
teacher proposal
      ↓
CIEAV verification
      ↓
verified examples only
      ↓
distillation
      ↓
smaller owned specialist
```

---

## 21. CIEAV reward semantics

Do not optimize only `task_success`.

A target reward vector can include:

```text
outcome_correctness
proof_completeness
uncertainty_calibration
authority_minimization
privilege_minimization
reversibility
recovery_quality
policy_compliance
cost
latency
```

Penalties include:

```text
unverified success claim
unsafe duplicate consequence
excess privilege
stale-world action
unnecessary irreversibility
missing proof
unsafe retry
```

A generic model asks:

```text
How do I complete the task?
```

CIEAV intelligence should learn to ask:

```text
How do I complete the objective
with minimum necessary authority,
maximum proofability,
controlled uncertainty,
and safe recovery semantics?
```

---

## 22. Agentic training environments

CIEAV should maintain isolated consequence environments rather than exploring directly in production.

Target environments include:

```text
CieavGitEnv
CieavBrowserEnv
CieavCloudEnv
CieavDatabaseEnv
CieavFilesystemEnv
CieavSaaSEnv
CieavPermissionEnv
CieavCredentialEnv
CieavFailureEnv
CieavRecoveryEnv
CieavUnknownOutcomeEnv
CieavStaleRealityEnv
CieavDuplicateExecutionEnv
```

Example unknown-outcome training scenario:

```text
agent submits payment
      ↓
server accepts request
      ↓
network disconnects before response
      ↓
correct policy:
    UNKNOWN
    reconcile first

incorrect policy:
    retry payment blindly
```

The first should be rewarded; the second should receive a strong safety penalty.

---

## 23. ML / RL framework stack

The intended implementation stack is provider-oriented, not locked to one vendor.

### Core ML

```text
PyTorch
Transformers
PEFT / LoRA / QLoRA
TRL
```

### LLM post-training

```text
SFT
DPO
KTO
GRPO / RLVR
reward / critic models
process rewards
on-policy distillation
```

### Agentic environments

```text
OpenEnv-style state/reset/step environments
containerized sandboxes
Harbor-style task + sandbox + verifier separation
```

### Distributed RL / training

```text
verl
Ray
FSDP / FSDP2
Megatron when justified by scale
```

### Serving

```text
vLLM
SGLang
appropriate native/edge runtimes for smaller models
```

### Structured/offline RL

```text
TorchRL
RLlib where distributed offline/online policy training is appropriate
```

### Graph intelligence

```text
PyTorch Geometric or equivalent
```

Do not adopt a framework merely because it is fashionable. CIEAV owns the contracts, evidence semantics, qualification gates, and authority boundary. Training/serving frameworks remain replaceable providers.

---

## 24. Learning Provider interface

CIEAV should define a Learning Provider abstraction.

```text
CIEAV Learning Provider
    ├── cieav-local-trl
    ├── cieav-verl
    ├── hosted training provider
    ├── custom GPU cluster
    └── future providers
```

The learning provider supplies compute/training mechanics.

CIEAV supplies:

```text
which trajectories are trusted
which evidence class is eligible
what redaction/consent applies
what reward semantics apply
what qualification is required
```

Training infrastructure must not inherit authority secrets.

---

## 25. Verified Skills

A Verified Skill is a deterministic, typed procedure derived from repeated verified experience and independently qualified before use.

Example:

```text
skill: production_canary_deploy

inputs:
    signed_artifact
    target_environment

preconditions:
    tests qualified
    current production revision known
    artifact signature verified

authority:
    deploy:production
    read:metrics
    rollback:production

program:
    deploy 5%
    observe settlement
    verify health
    verify error budget
    expand to 100%

proof:
    deployed revision == requested revision
    health == healthy
    metrics within policy

recovery:
    rollback previous qualified revision

unknown_policy:
    stop expansion
    preserve evidence
    escalate
```

### 25.1 Skill compilation lifecycle

```text
repeated verified trajectories
        ↓
Skill Compiler
        ↓
candidate typed procedure
        ↓
simulation
failure injection
proof validation
authority validation
recovery validation
        ↓
CANDIDATE_SKILL
        ↓
deterministic qualification
        ↓
VERIFIED_SKILL
```

The model cannot directly install or qualify a skill.

---

## 26. Qualification / Promotion Plane

Every candidate model and skill must cross deterministic qualification.

```text
MODEL / TRAINING
      ↓
CANDIDATE CHECKPOINT
      ↓
HELD-OUT EVALUATION
      ↓
CONSTITUTIONAL SAFETY GATES
      ↓
PROMOTION DECISION
      ↓
QUALIFIED VERSION
```

After promotion:

```text
MODEL AUTHORITY = 0
```

### 26.1 Model qualification metrics

At minimum:

```text
outcome prediction accuracy
false-success rate
UNKNOWN calibration
authority efficiency
privilege minimization
proof quality
recovery correctness
duplicate-consequence risk
reversibility preference
policy violations
tool/operation accuracy
latency / cost
```

Some failures are hard gates, not weighted averages.

Examples:

```text
critical duplicate-payment violation > 0
    → FAIL

model attempts to mint authority
    → FAIL

candidate attempts self-promotion
    → FAIL

critical false-success claim
    → FAIL
```

An aggregate score must never override a constitutional failure.

---

## 27. Current implementation vs target architecture

This section prevents roadmap language from being mistaken for a production claim.

### 27.1 Current / partially implemented foundations

The repository already contains substantial pieces of:

```text
always-on local Gateway
managed semantic/API process
local deterministic authority boundaries
signed Action Receipts
SUCCESS / FAILURE / UNKNOWN outcome handling
private protected browser transport
browser/runtime observation
replay / recovery gating
consequence-learning dataset construction
SFT / preference / RL-oriented ML scaffolding
candidate-model unqualified-state invariants
local/static qualification scripts
```

Exact production claims must be based on executable tests and external qualification evidence, not on this document.

### 27.2 Near-term productionization

Priorities:

```text
1. finish Authority / Commit core qualification
2. keep the hidden/background runtime stable
3. implement native notification/approval UX
4. formalize Proof Provider interface
5. formalize Learning Provider interface
6. define versioned Authorized Outcome Trajectory schemas
7. distinguish OUTCOME_PROOF from authority-grade settlement evidence
8. expose safe receipt-store/runtime observability
9. add isolated consequence-training environments
10. add deterministic intelligence/authority dependency checks
```

### 27.3 Intelligence framework build-out

```text
11. Intelligence State contract
12. Epistemic State contract
13. Cognitive Scheduler / Router
14. CIEAV Core SFT adapter
15. Proof Planner adapter
16. Recovery adapter
17. deterministic Consequence Graph statistics
18. preference-learning datasets
19. GRPO/RLVR isolated environments
20. reward/critic models
21. offline RL for structured consequence decisions
22. verified teacher-distillation pipeline
23. learned Consequence Model
24. candidate Skill Compiler
25. deterministic Verified Skill qualification
```

### 27.4 Scale-out

Only after local semantics and qualification are proven:

```text
multi-node training
large-scale verl/Ray jobs
FSDP2 / Megatron scale paths
vLLM/SGLang serving pools
large Consequence Graph learning
enterprise proof providers
enterprise policy / permission graphs
cross-system durable consequence transactions
```

---

## 28. Production-readiness definition

A feature is not production-ready because it exists in code.

Production readiness requires evidence appropriate to the feature class.

### Local deterministic features

Require:

```text
unit tests
integration tests
static invariants
negative/fail-closed tests
crash/recovery tests
state corruption tests
secret-handling checks
```

### OS/runtime features

Require real supported operating-system runners and packaging/install tests.

### Hardware-backed identity

Require physical hardware qualification for each claimed attestation path.

### Model/ML features

Require:

```text
reproducible dataset provenance
held-out qualification
calibration
adversarial evaluation
regression gates
candidate remains unqualified until promotion
```

### External-service features

Require real provider integration, network-failure behavior, retry/idempotency validation, and operational monitoring.

### Release security

Require real signing identities, release signing/notarization where applicable, supply-chain verification, and published release metadata.

### Operational production

Require independent security assessment and real backup/recovery/incident/DR exercises before claiming final production qualification.

---

## 29. Security isolation

Recommended package/dependency boundaries:

```text
cieav.intelligence
cieav.graph
cieav.skills
cieav.learning
cieav.qualify

        │ proposal/evidence only
        ▼

cieav.authority
cieav.credentials
cieav.commit

        │ scoped execution capability
        ▼

cieav.execution

        │ observations
        ▼

cieav.proof
```

Training directories and processes must not receive:

```text
receipt private signing keys
permit/commit signing keys
raw credential leases
browser-control capabilities
Gateway admin bearer tokens
promotion signing authority
```

Static CI should enforce forbidden dependency/import patterns where practical.

---

## 30. Privacy and learning governance

Verified consequence data is valuable, but it must not become an excuse to collect everything.

Training eligibility requires explicit controls for:

```text
provenance
consent / organizational policy
purpose limitation
redaction
secret exclusion
credential reference removal
retention
jurisdiction / residency where applicable
human data handling
```

The preferred learning record contains typed semantic evidence and digests/references rather than reusable secrets or unnecessary raw content.

---

## 31. Provider philosophy

CIEAV should integrate mature specialist systems when they provide useful perception or training capability.

Do not recreate every runtime instrumentation platform, GPU scheduler, model server, or agent ecosystem inside the trust kernel.

CIEAV owns the hard boundary:

```text
intention
→ trusted current reality
→ governed authority
→ exact execution
→ independently proven consequence
→ qualified learning
```

Providers own replaceable mechanisms under explicit contracts.

---

## 32. Positioning

Avoid claiming novelty based merely on:

```text
models + agents + evals + governance
```

or:

```text
agent executes → verify → learn
```

Those patterns have substantial adjacent prior art.

The stronger CIEAV architectural thesis is:

> **CIEAV is a model- and agent-independent transaction boundary for autonomous action, binding identity, delegated authority, exact execution intent, current reality, one-use execution authority, and outcome proof into a governed state transition.**

The broader intelligence thesis is:

> **CIEAV is a consequence-native intelligence framework that learns how a specific world actually behaves while preventing learned intelligence from acquiring unchecked authority over that world.**

The long-term data/learning moat is:

> **Authorized, reality-bound, outcome-verified consequence trajectories.**

The product principle is:

> **CIEAV is installed, not opened. Visible only when reality requires attention.**

---

## 33. Complete closed loop

```text
                     OBJECTIVE
                        │
                        ▼
               INTELLIGENCE STATE
                        │
                        ▼
               COGNITIVE SCHEDULER
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    frontier model   CIEAV model   Verified Skill
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                 CONSEQUENCE PLAN
                        │
                        ▼
               CONSEQUENCE COMPILER
                        │
                        ▼
        ╔══════════════════════════════╗
        ║   DETERMINISTIC AUTHORITY    ║
        ║ identity · policy · reality ║
        ║ commit · one-use execution  ║
        ╚══════════════╤═══════════════╝
                       │
                       ▼
                    EXECUTION
                       │
                       ▼
                 PERCEPTION MESH
                       │
                       ▼
              DETERMINISTIC SETTLEMENT
                       │
            SUCCESS / FAILURE / UNKNOWN
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
      CIEAV MODELS  CONSEQUENCE   VERIFIED
                     GRAPH         SKILLS
          │            │             │
          └────────────┼─────────────┘
                       ▼
              BETTER INTELLIGENCE
                       │
                       ▼
              CANDIDATE VERSIONS
                       │
                       ▼
          DETERMINISTIC QUALIFICATION
                       │
                       └──────────────↺
```

At every iteration:

```text
MODEL AUTHORITY = 0
AGENT AUTHORITY = 0
LEARNING AUTHORITY = 0

ONLY THE AUTHORITY / COMMIT PLANE CAN ISSUE EXECUTION AUTHORITY.
```

---

## 34. Engineering rule for all future work

Every new CIEAV feature should answer these questions before it is considered part of the production architecture:

1. What exact state transition does this feature enable or observe?
2. Which identity/principal is responsible?
3. What authority is required?
4. What is the minimum credential scope?
5. What pre-state must be fresh?
6. What exact arguments are bound?
7. What prevents duplicate execution?
8. What proves success?
9. What proves failure?
10. When must the result remain UNKNOWN?
11. What recovery path exists?
12. What evidence can safely become learning data?
13. Can any model or training process accidentally mint authority?
14. What deterministic qualification proves this feature is ready?
15. What external evidence is still required before claiming production readiness?

If those questions do not have explicit answers, the feature is not complete.
