# CIEAV Trusted Execution Adapters

CIEAV's authorization plane is intentionally separate from downstream execution. An ALLOW decision, Reality-Bound Commit, Operation Mandate, or Execution Ticket does not itself create an external effect. Every consequence must cross the in-process `CieavExecutionRouter` into an explicitly configured trusted adapter, and transport completion is not final proof of success.

## Authority-to-execution invariant

```text
inspect Execution Ticket
        ↓
select exact trusted adapter
        ↓
adapter preflight (side-effect free)
        ↓
consume Operation Mandate when required
        ↓
consume one-use Execution Ticket
        ↓
trusted downstream effect attempt
        ↓
Execution Attempt Receipt
        ↓
independent Proof Mesh
        ↓
PROVEN / DISPROVEN / UNKNOWN
```

A deterministic configuration or pre-state failure is rejected before one-use authority is consumed wherever possible. After an effect boundary is crossed, ambiguous outcomes remain `UNKNOWN` unless the adapter can independently reconcile the exact downstream state to a deterministic old/new result.

## Adapter catalog

Adapters are configured from `<CIEAV_STATE_DIR>/execution-adapters.json`, or from the exact path in `CIEAV_EXECUTION_ADAPTERS_FILE`. If the default catalog is absent, no catalog-backed adapter is implied. If an explicit catalog is configured and is missing or invalid, construction fails closed.

The catalog is local authority configuration. Agents cannot alter repository paths, executable paths, network origins, credentials, fixed targets, SQL templates, browser origins, ROS/MQTT endpoints, or other adapter policy at dispatch time.

## Native Git ref consequence adapter

Git is a first-class `GIT` execution protocol. It is not routed through the generic `CLI` adapter.

The current operation is deliberately narrow:

```text
operation = GIT_ADVANCE_REF
fixed work tree
+ fixed git directory
+ fixed refs/heads/* ref
+ digest-pinned Git executable
+ exact authorized old object id
+ exact pre-existing candidate commit id
→ compare-and-swap ref transition
```

A production catalog entry has this shape:

```json
{
  "version": 1,
  "gitRef": [
    {
      "toolId": "release-main-advance",
      "repository": "/absolute/work/tree",
      "gitDir": "/absolute/work/tree/.git",
      "ref": "refs/heads/main",
      "gitBinary": "/absolute/path/to/git",
      "gitBinarySha256": "<64 lowercase hex>",
      "requireFastForward": true,
      "timeoutMs": 10000,
      "maxStdoutBytes": 65536,
      "maxStderrBytes": 65536
    }
  ]
}
```

The normalized ticket arguments contain only:

```json
{
  "expectedOldOid": "<40-or-64-hex object id>",
  "newCommitOid": "<40-or-64-hex commit id>"
}
```

The adapter verifies before the effect boundary:

- the configured Git executable is absolute, a regular file, and still matches its SHA-256 pin;
- work-tree and Git-directory paths resolve to the exact configured directories;
- Git itself reports the same work tree and absolute Git directory;
- the ref is a full `refs/heads/*` reference and passes Git ref-format validation;
- the repository object format is explicitly `sha1` or `sha256`, and both OIDs have the matching length;
- the branch currently equals `expectedOldOid` using exact `show-ref --verify` lookup;
- `newCommitOid` exists in the pinned object database and is a `commit` object;
- when `requireFastForward=true`, the old commit is an ancestor of the candidate commit.

The sole mutation primitive is equivalent to:

```text
git update-ref --no-deref <fixed-ref> <newCommitOid> <expectedOldOid>
```

The old OID is therefore Git's compare-and-swap guard, not an application-side check alone.

### Git process isolation

Repository-controlled Git hooks are not allowed to expand a ref transition into arbitrary code execution. Every execution invocation overrides `core.hooksPath` to a high-entropy nonexistent path. The adapter also disables system/global Git config, terminal prompting, replace-object interpretation, and optional lock behavior, runs without a shell, and performs no fetch/push/network operation.

Both the work-tree and Git-directory realpaths participate in the authority target. Work-tree, Git-directory, executable identity, ref, binary digest, and fast-forward policy participate in the downstream reference. A different repository metadata store is therefore a different authorized consequence target.

### Git ambiguity and reconciliation

A clean zero exit from the compare-and-swap update is transport `ACCEPTED`, still requiring proof.

If the Git process starts but terminates abnormally, CIEAV re-reads the exact branch ref after the child is gone:

- exact `newCommitOid` → transport `ACCEPTED` by reconciliation, still requiring independent proof;
- exact `expectedOldOid` → deterministic `REJECTED`;
- any other/unreadable state → `UNKNOWN` and normal semantic-effect quarantine.

This is intentionally stronger than generic CLI semantics because the affected world state is a single exact ref that can be deterministically re-observed.

## Independent exact Git ref proof

Git execution settlement can use `cieav.git-ref-proof.v1`, configured separately through `CIEAV_PROOF_GIT_REF_CATALOG`. The provider has no execution authority and does not import the Git mutation adapter.

Example proof catalog:

```json
{
  "version": 1,
  "gitRefProof": [
    {
      "id": "release-main-proof",
      "repository": "/absolute/work/tree",
      "gitDir": "/absolute/work/tree/.git",
      "ref": "refs/heads/main",
      "gitBinary": "/absolute/path/to/git",
      "gitBinarySha256": "<64 lowercase hex>",
      "timeoutMs": 5000,
      "maxOutputBytes": 65536
    }
  ]
}
```

Supported deterministic expectations are:

```text
ref-oid:<exact object id>
ancestor:<exact object id>
```

Unknown expectation syntax is non-conclusive. Observation/configuration/transport errors are non-conclusive. The provider returns `authority=false` and `mayMintExecutionAuthority=false` in every path.

The execution target and proof target use the same canonical identity form:

```text
git-ref:<sha256(canonical-work-tree + canonical-git-dir)>:<encoded-full-ref>
```

Sharing target identity does not make execution and proof the same authority path: their configurations, classes, runtime registration, and permitted primitives remain separate.

## Other implemented execution surfaces

### HTTP and cloud APIs

HTTP-family adapters bind an exact trusted origin/method/tool policy. Agents cannot provide arbitrary origins, credentials, proxy configuration, raw headers, redirect targets, or downstream URLs. HTTPS is required outside explicit loopback use. CIEAV owns DNS/address policy, credential injection, request/response limits, redirect behavior, and transport ambiguity handling.

### MCP

CIEAV has dedicated MCP stdio and MCP Streamable HTTP adapters. Executable/server identity, tool name, endpoint, credentials, request bounds, and transport behavior come from trusted local configuration. MCP completion is transport evidence, not world-state proof.

### A2A

The protocol-aware A2A adapter constructs bounded A2A task requests and treats remote task completion as transport state only. Real-world success still requires Proof Mesh settlement.

### Browser

The browser adapter supports typed `NAVIGATE`, `CLICK`, and insert-text `TYPE` through the common one-use execution router. The browser host independently verifies consumed-ticket bindings and durable replay state before effects. Browser perception/proof uses a separate read-only capability and does not use arbitrary JavaScript evaluation.

### CLI

The generic CLI adapter executes a digest-pinned absolute executable without a shell. Static argv is trusted configuration; dynamic bounded arguments are delivered as canonical JSON on stdin. Ambiguity after process start is `UNKNOWN`.

### Filesystem

The filesystem adapter supports fixed-target replace/delete with root confinement, symlink rejection, exact pre-state digests, staged fsync/atomic replacement, and `UNKNOWN` after ambiguous post-effect failures.

### Database

The SQLite adapter uses fixed trusted mutation SQL, prepared normalized arguments, transaction/change budgets, rollback semantics, and independent read-only SQLite proof. Agents do not supply SQL text.

### ROS2 and MQTT

ROS2 one-shot/continuing-action and MQTT QoS1 execution paths are implemented with explicit endpoint/executable/runtime bindings. Continuing robotics paths cross Continuing Authority and Reflex checkpoints; transport acknowledgements are not physical-world proof.

## Credential isolation

Adapter credentials are resolved inside CIEAV and are not returned to agents or copied into proof observations. Each adapter accepts only credential modes it explicitly implements. Unsupported modes fail closed.

The Git ref adapter accepts only `credentialMode=NONE` because this local consequence primitive performs no remote network operation.

## Protocol status

| Protocol | In-repository implementation status | Remaining qualification boundary |
|---|---|---|
| HTTP | exact-origin hardened transport | live external endpoint qualification where used |
| CLOUD_API | hardened HTTP-family transport | provider-specific production credentials/endpoints |
| MCP | stdio + Streamable HTTP | external server/runtime qualification |
| A2A | protocol-aware task execution | external agent/runtime qualification |
| BROWSER | NAVIGATE/CLICK/TYPE with ticket/replay binding | physical Chromium + independent external witness qualification |
| CLI | digest-pinned no-shell adapter | per-tool executable/environment qualification |
| **GIT** | fixed-ref CAS advance + exact-ref independent proof | physical cross-platform Git/runtime/repository qualification |
| FILESYSTEM | fixed-target replace/delete | platform filesystem/atomicity qualification |
| DATABASE | fixed SQLite mutation + proof | production database/storage qualification |
| ROS2 | one-shot + continuing action | real ROS2/robot/hardware qualification |
| MQTT | QoS1 publish | real broker/device consequence qualification |

"Implemented" means the deterministic source path, negative tests, and repository-local qualification contract exist. It does **not** mean external production acceptance gates such as signed installers, physical hardware, real remote infrastructure, disaster recovery, or independent security review have passed.
