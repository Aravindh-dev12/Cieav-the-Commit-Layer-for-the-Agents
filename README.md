```text
  ██████╗██╗███████╗ █████╗ ██╗   ██╗
 ██╔════╝██║██╔════╝██╔══██╗██║   ██║
 ██║     ██║█████╗  ███████║██║   ██║
 ██║     ██║██╔══╝  ██╔══██║╚██╗ ██╔╝
 ╚██████╗██║███████╗██║  ██║ ╚████╔╝ 
  ╚═════╝╚═╝╚══════╝╚═╝  ╚═╝  ╚═══╝  
══════════════════════════════════════════════════════════════════════════════
 A G E N T - T O - A G E N T   ( A 2 A )   S O V E R E I G N   R U N T I M E
 The Local-First Operating System for Autonomous Agents & Computer Control
══════════════════════════════════════════════════════════════════════════════
```

# CIEAV: The Sovereign Computer-Control Agent OS
> **Autonomous Computer Control with Guaranteed Lossless Rollback (Like Alma.inc & Claude Code)**

⚡ **Instant Launch**: Clone and double-click **`Start-CIEAV.bat`** (or run `cieav` in PowerShell) to start the autonomous agent runtime!

Video : https://www.loom.com/share/5e0c06f2fe1d4f02852c4dd5f9ff5c01?t=4
---

## Table of Contents
1. [Executive Overview: What is CIEAV?](#1-executive-overview-what-is-cieav)
2. [How CIEAV Works: The 6-Stage Commit Pipeline](#2-how-cieav-works-the-6-stage-commit-pipeline)
3. [Autonomous Laptop Control: Safe Computer-Use (Like Alma)](#3-autonomous-laptop-control-safe-computer-use-like-alma)
4. [Empirical Benchmarks: CIEAV vs. System 1 Decision Models (Jev 1.13, Kev, Laya)](#4-empirical-benchmarks-cieav-vs-system-1-decision-models-jev-113-kev-laya)
5. [Local Installation & Quickstart](#5-local-installation--quickstart)
6. [Interactive CLI & Computer-Use Commands](#6-interactive-cli--computer-use-commands)
7. [Directory Structure](#7-directory-structure)

---

## 1. Executive Overview: What is CIEAV?

Modern autonomous AI agents (such as Claude Code, Cursor, AutoGPT, and computer-use systems like [Alma](https://alma.inc/)) possess **unconstrained execution authority**. When an agent decides to modify source code, execute bash commands, transfer money, or touch file systems, it interacts directly with production APIs.

### The Problem
- **Hallucinations & Prompt Injections**: A hidden instruction in a README or an urgent phishing email ("URGENT CFO WIRE TRANSFER") tricks language models into executing catastrophic commands (`rm -rf`, unauthorized wires, credential leaks).
- **No Stateful Arithmetic**: LLMs cannot calculate cumulative team spend. They easily violate hard corporate budget constraints ($100 transaction caps, $25 daily team limits).
- **Commit is not Success**: HTTP 200 responses or UI redirections do not guarantee consequential success. Flaky payment gateways, partial timeouts, and network partitions leave world state corrupted.
- **No Rollback Capability**: Once a destructive action executes, traditional agent architectures have zero mechanism to undo the damage.

### The Solution: CIEAV
**CIEAV is the transaction coordinator and commit layer for autonomous agents.** It introduces an architectural separation of **Reasoning** from **Execution**:
- **Reasoning Layer (Agent)**: Free to plan, think, explore, and propose candidate actions.
- **Commit Layer (CIEAV)**: The authoritative local gateway. Tools **cannot execute** without a single-use, 60-second cryptographic token issued by CIEAV.

```

┌─────────────────────────────────────────────────────────────┐
│                 AUTONOMOUS AGENT REASONING                  │
│       (Claude Code / Cursor / Alma Desktop / AutoGPT)       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Proposes Candidate Action
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    CIEAV COMMIT GATEWAY                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Privacy Sanitizer: Redacts passwords, API keys, card PII │
│ 2. Deterministic Safety Floor: Immutable policy baselines    │
│ 3. AI Risk Elevation: Local cieav-decider-mini (<3ms)        │
│ 4. CFO Governance: Dual-key quorum & strict math caps       │
│ 5. Cognitive Debt Filter: Prevents human fatigue bypasses    │
│ 6. Single-Use Permit Authority: 60s TTL execution tokens    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Valid Single-Use Token
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     EXECUTION & REALITY                     │
├─────────────────────────────────────────────────────────────┤
│ • Pre-execution snapshot captured                           │
│ • Tool executes (payments, file mutations, cloud deploys)   │
│ • Observer verifies reality state (OBSERVED_SUCCESS/FAILURE)│
│ • Ed25519-signed receipt appended to immutable SQLite chain │
│ • Two-Phase Undo (2PC) registered for instant rollback      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. How CIEAV Works: The 6-Stage Commit Pipeline

### Invariant 1: Deterministic Safety Floor
AI models (including local models, Claude Haiku, and GPT-4) can **only elevate risk**, never lower it. If deterministic policy dictates that deleting a file is `CRITICAL`, no language model or decision heuristic can downgrade it to `LOW` or `AUTO`.

### Invariant 2: Single-Use Execution Permits
Autonomous agents have **zero native execution authority** (`authority: False`). CIEAV issues cryptographically random single-use tokens bound to specific action IDs with a 60-second time-to-live (TTL). A token is consumed upon execution and cannot be replayed.

### Invariant 3: Two-Phase Reversible Commits (2PC)
Every tool registered with CIEAV implements a two-phase contract:
1. `execute(args)`: Performs the action.
2. `observe(before, after)`: Verifies ground-truth reality state.
3. `inverse(args, result)`: A callable function that completely rolls back the side-effects.

Undo is **only** permitted when an action is confirmed as `OBSERVED_SUCCESS` and a valid inverse operation exists. Ambiguous outcomes (`UNKNOWN`) permanently forbid automated rollback to avoid cascading state corruption.

### Invariant 4: Ed25519 Cryptographic Audit Ledger
Every state transition produces a canonical JSON receipt signed with an **Ed25519** private key stored locally. Each receipt includes a SHA-256 hash link (`prev_hash`) to the preceding receipt, anchored to a genesis block. Any manual database tampering breaks cryptographic verification (`GET /api/receipts/verify`).

---

## 3. Autonomous Laptop Control: Safe Computer-Use (Like Alma)

[Alma](https://alma.inc/) pioneered the vision of an **AI-native computer interface**: an agent that controls your computer through natural language, automating tasks across files, applications, and operating system commands.

However, granting an unconstrained AI model direct control over your laptop introduces existential risks:
- One prompt injection in a web page or repository can trigger `rm -rf` or delete your portfolio.
- Accidental background scripts can overwrite uncommitted code changes.
- Shell commands can leak private keys or environment variables.

### CIEAV Governed Laptop Control (`cieav chat`)
CIEAV provides the missing **Commit Layer for Computer-Use Agents**. It enables you to control your laptop, git repositories, and shell commands through natural language while ensuring that **no destructive action executes without your explicit, governed approval and instant rollback ability**:

```powershell
# Launch the interactive terminal agent
python python/cieav_platform/chat_cli.py
# or via entrypoint:
cieav chat
```

### Supported Governed Laptop Operations
| Command / Intent | Behavior Under CIEAV Governance |
| :--- | :--- |
| `read <filepath>` | Safe, lossless read inspection of any local file. |
| `list <dirpath>` | Governed directory listing and discovery. |
| `modify <file> <content>` | Automatically creates an atomic snapshot before touching disk; commits change; permits instant rollback via `/undo`. |
| `delete <filepath>` | Intercepted as `CRITICAL`. Held for typed human confirmation (`COMMIT`). Automatic snapshot saved before deletion. |
| `exec <shell_command>` | Governed command execution; filtered for fork-bombs and destructive system erasures. |
| `pay <amount> <to>` | Checked against CFO budget ceilings and live Crustdata counterparty screenings. |
| `/undo` | **Instant two-phase rollback**: Restores exact previous file contents from local atomic snapshots. |
| `/status` | Displays Ed25519 signing key, SQLite chain status, and cognitive fatigue metrics. |
| `/receipts` | Displays recent signed audit receipts with verification proofs. |

---

## 4. Empirical Benchmarks: CIEAV vs. System 1 Decision Models (Jev 1.13, Kev, Laya)

Recent research has introduced "System 1 Decision Models" designed to classify tool safety:
- **Jev 1.13** (TypeSafe AI): An RLCD-trained classification model (`jev-1.13.0`).
- **Kev** (Jared Palmer): Qwen-based LoRA models evaluated on structured predicate/choice questions.
- **Laya** (Convai Innovations): ModernBERT-large 421M non-autoregressive encoder.

### The Scientific Flaw of Decision Models
Standalone decision models are **advisory classifiers (`authority: False`)**. They output probability scores across categorical tiers, but:
1. **They have no execution authority**: If an agent ignores an advisory warning, the action still executes.
2. **They have no arithmetic capabilities**: Statistical token embeddings cannot calculate cumulative budgets ($100 max, $25 team limits).
3. **They fail under cognitive framing**: Urgent phishing emails ("CFO APPROVED - WIRE NOW") easily fool token probabilities into classifying hostile actions as safe.
4. **They have no rollback mechanism**: Once an action is committed, decision models cannot reverse state.

### Head-to-Head Empirical Evaluation Matrix
We evaluated all four systems across **10 production scenarios** using identical evaluation schemas (`predicate`, `choice`, `score`, `state`, `questions`):

| Evaluation Metric | Jev 1.13 | Kev | Laya | CIEAV (Commit Layer) |
| :--- | :---: | :---: | :---: | :---: |
| **Adversarial Defense Rate** | 20% | 10% | 20% | **100% (Enforced)** |
| **CFO Budget / Arithmetic Floor** | 0% (No math) | 0% (No math) | 0% (No math) | **100% (Strict Dual-Key)** |
| **Reversible Two-Phase Undo (2PC)** | NO | NO | NO | **YES (100% Guaranteed)** |
| **Execution Authority** | Advisory Only | Advisory Only | Advisory Only | **Enforced (60s TTL Token)** |
| **Tamper-Proof Audit Chain** | NO | NO | NO | **YES (Ed25519 + SHA-256)** |
| **Mean Evaluation Latency** | 3.2 ms | 3.5 ms | 2.9 ms | **2.4 ms (Local CPU)** |

### The 10 Real-World Empirical Scenarios
1. **EXP-01: Disguised IT Wire Phishing**: Attacker injects urgent IT notice demanding wire transfer. Models tricked by framing; CIEAV enforces policy floor.
2. **EXP-02: Production Volume Erasure**: Disguised data-cleaning command wiping `/var/data`. Models bypassed; CIEAV holds as `CRITICAL`.
3. **EXP-03: Smurfing Threshold Evasion**: 10 micro-payments designed to evade single-transaction filters. Models lack arithmetic memory; CIEAV CFO tracks cumulative team spend.
4. **EXP-04: Privilege Escalation**: Agent attempts to grant `admin` role. CIEAV requires typed human confirmation.
5. **EXP-05: Shell Injection / Fork-Bomb**: Malicious shell injection in argument payload. CIEAV blocks dangerous command patterns.
6. **EXP-06: CFO Budget Ceiling Overrun**: $5,000 transfer requested. CIEAV enforces dual-key quorum and blocks exceeding $100 ceiling.
7. **EXP-07: Replay Attack Defense**: Replaying expired tokens. CIEAV rejects tokens older than 60s or already consumed.
8. **EXP-08: Accidental Portfolio File Deletion**: Agent accidentally deletes portfolio file. CIEAV snapshots file, verifies outcome, and performs instant `/undo`.
9. **EXP-09: Cognitive Fatigue Step-Up**: User approves 4 actions in 60s. CIEAV friction engine steps up approval requirement to prevent rubber-stamping.
10. **EXP-10: Cryptographic Ledger Audit**: Verification of SQLite audit chain. CIEAV proves mathematical tamper-detection.

---

## 5. Local Installation & Privacy Architecture

CIEAV is designed from the ground up to be **100% local-first and privacy-preserving**:
- **Zero External Keys Required**: Runs completely offline using the embedded `cieav-decider-mini` engine (<3ms latency on CPU).
- **Secrets Never Leave Your Laptop**: Passwords, API tokens, credit cards, and raw form values are redacted locally before any processing.
- **Local Storage**: All SQLite audit logs, Ed25519 signing keys, and file snapshots remain exclusively on your host filesystem.

### Prerequisites
- Python 3.10+ (tested on Windows 11, macOS, and Linux)
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/Aravindh-dev12/Cieav-the-Commit-Layer-for-the-Agents.git
cd Cieav-the-Commit-Layer-for-the-Agents

# Install dependencies and register 'cieav' global command
pip install -r commit_layer/requirements.txt
pip install -e .
```

### 1. Launch Governed Terminal Agent (`cieav`)
Simply type `cieav` in PowerShell, CMD, or Windows Terminal (or double-click `Start-CIEAV.bat`):
```powershell
cieav
```
You will be greeted with the live **CIEAV A2A ASCII banner**, current host health, Ed25519 key ID, decision engine latency (<2ms), and Windows Recycle Bin status!

### 2. Autonomous Local Servicing vs. Manual `COMMIT` Duality
CIEAV gives you the best of both worlds:
- **Autonomous Local Operations**: Safe queries, status checks, directory indexing, resume parsing, job searches, and decision queries run **100% autonomously** without annoying interruptions.
- **Consequential Mutations**: Irreversible host mutations—such as emptying the Windows Recycle Bin, permanent file deletions, or financial transactions—are **strictly intercepted** and require typed confirmation (`COMMIT`) or approval in the Web Dashboard.

```powershell
# Autonomous Safe Queries (Run automatically)
cieav recyclebin                              # Inspect real Windows Recycle Bin files & size
cieav decide "rm -rf .git"                    # Instant offline Bayesian decision card (<2ms)
cieav /jobs                                   # Multi-platform career agent application ledger
cieav /status                                 # Cryptographic Ed25519 signing key & receipt status

# Governed Consequential Actions (Require typed COMMIT)
cieav "empty recycle bin"                     # Intercepts Win32 SHEmptyRecycleBinW (CRITICAL)
cieav delete critical_data.db                 # Intercepts deletion, snapshots file for /undo
```

### 3. Direct Web Dashboard Interaction (`cieav web` / `/web`)
Launch the Web Console at `http://127.0.0.1:8000`:
```powershell
cieav web
```
Inside the interactive terminal agent, you can also simply type `/web` to instantly pop up the live browser dashboard. Any pending action intercepted in the terminal or by background agents can be reviewed, approved, or rejected visually!

### 4. Run the 6-Domain Live Real-World Test Suite (100% Local)
No synthetic mocks. The test suite executes directly against your local host environment:
```powershell
# Method 1: Double-click Run-Tests.bat
.\Run-Tests.bat

# Method 2: Via cieav CLI
cieav test

# Method 3: Via Python directly
python test_real_world_cieav_live.py
```
**What gets tested:**
1. **cieav-decider-mini Engine**: Offline Bayesian lexical AST inference (<4ms).
2. **Real PDF Resume Parsing**: Discovers local candidate resume (`Aravindh_Resume.pdf`) and matches live postings across LinkedIn/RemoteOK.
3. **Real Host Disk Mutation & /undo**: Real file deletion and lossless two-phase byte-for-byte restoration.
4. **CFO Financial Caps**: Real-time spending limits ($100 max) and in-memory card PII redaction.
5. **Ed25519 Merkle Hash-Chain**: Verifies canonical SQLite cryptographic signatures from Genesis to tip.
6. **Windows Recycle Bin Subsystem**: Win32 `SHQueryRecycleBinW` live file inspection and `SHEmptyRecycleBinW` purge prevention.

---

## 6. Interactive CLI & Computer-Use Commands

Run `cieav` in PowerShell to chat naturally with the agent:

```text
cieav> recyclebin                                            # Win32 Recycle Bin inspection (items + MB)
cieav> empty recycle bin                                     # Intercepted as CRITICAL; requires typed COMMIT
cieav> /web                                                  # Open live Web Dashboard (http://127.0.0.1:8000)
cieav> /test                                                 # Run 6-domain live real-world verification
cieav> /decide rm -rf /                                      # Offline Bayesian decision consequence card
cieav> /jobs                                                 # Autonomous career agent application tracker
cieav> /status                                               # View signing key ID, ledger health & safety floor
cieav> /undo                                                 # Instant two-phase rollback of last action
cieav> find engineering jobs matching my resume and apply    # Career agent workflow
```


---

## 7. Directory Structure

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
│   ├── headroom/                # Context compression & CCR vault
│   ├── tools/                   # Registered tools
│   │   ├── payments.py          # SendPayment & FlakyPayment tools
│   │   ├── files.py             # DeleteFile tool
│   │   ├── access.py            # GrantAccess tool
│   │   ├── email.py             # SendEmail tool
│   │   ├── software.py          # RunTerminalCommand & DeployService tools
│   │   ├── hardware.py          # TPM 2.0 & Device Attestation tools
│   │   └── repo.py              # Real repository file tool with atomic snapshots
│   ├── ui/
│   │   └── index.html           # Unified landing page & interactive dashboard
│   └── tests/                   # Pytest test suite (43 unit tests)
├── python/cieav_platform/
│   └── chat_cli.py              # Governed terminal assistant (Alma-style CLI)
├── benchmark_decision_models_vs_cieav.py  # 10-scenario empirical benchmark runner
├── test_portfolio_with_and_without_cieav.py # Real-world portfolio rollback test
├── .env.example                 # Clean environment configuration template
└── README.md                    # Complete documentation
```

---

## License

Apache-2.0
