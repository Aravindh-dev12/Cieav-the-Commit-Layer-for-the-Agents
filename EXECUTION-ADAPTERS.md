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

The local operation is deliberately narrow:

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

The sole local mutation primitive is equivalent to:

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

## Git Smart HTTP remote ref publication

CIEAV also implements a separate first-class `GIT_PUSH_REF` consequence for publishing one already-existing candidate commit to one exact remote branch over Git Smart HTTP. It is not generic `git push` authority.

```text
operation = GIT_PUSH_REF
fixed local repository + git dir + object dir
+ fixed HTTPS repository URL
+ fixed refs/heads/* destination
+ digest-pinned Git executable
+ fixed credential binding
+ exact expected remote old OID
+ exact pre-existing local candidate commit OID
→ exact leased remote ref publication
```

Production URLs must use HTTPS. Plain HTTP is accepted only when `allowLoopback=true`, which exists for repository-local qualification fixtures and is not a production deployment mode.

A catalog entry has this shape:

```json
{
  "version": 1,
  "gitRemoteRef": [
    {
      "toolId": "release-origin-main-push",
      "repository": "/absolute/work/tree",
      "gitDir": "/absolute/work/tree/.git",
      "objectDir": "/absolute/work/tree/.git/objects",
      "remoteUrl": "https://git.example.com/org/repo.git",
      "remoteRef": "refs/heads/main",
      "gitBinary": "/absolute/path/to/git",
      "gitBinarySha256": "<64 lowercase hex>",
      "credential": {"kind":"BEARER_ENV","env":"CIEAV_GIT_PUSH_TOKEN"},
      "requireFastForward": true,
      "allowLoopback": false,
      "timeoutMs": 30000,
      "maxStdoutBytes": 131072,
      "maxStderrBytes": 131072
    }
  ]
}
```

`credential.kind` is `NONE`, `BEARER_ENV`, or `BASIC_ENV`. Secret values are read only inside CIEAV. They are injected into Git's runtime configuration environment as an HTTP `Authorization` header; they are not placed in the remote URL, argv, authority target, downstream reference, evidence summary, or result metadata. The credential binding records only the credential kind and configured environment name, plus the BASIC username when applicable.

Before any receive-pack attempt, the adapter:

- revalidates the pinned Git executable and exact local repository, Git directory, and absolute object directory;
- confirms both authorized OIDs are commits in the pinned local object store and have the repository's actual SHA-1/SHA-256 width;
- enforces local fast-forward ancestry when configured;
- validates the remote URL and exact full branch ref;
- resolves the hostname itself and rejects private, loopback, link-local, multicast, documentation/reserved, or otherwise disallowed destinations in production mode;
- pins the validated address set into Git/libcurl using `http.curloptResolve`, retaining the configured hostname for HTTPS certificate verification;
- performs an exact read-only `ls-remote --refs` and requires the observed remote OID to equal `expectedOldOid`.

The mutation itself is constrained to an ephemeral bare Git directory that reads candidate objects through `GIT_ALTERNATE_OBJECT_DIRECTORIES`. The source repository's remotes, hooks, push configuration, and credential helpers are therefore not inherited. The destination ref update uses both an explicit source OID and Git's stable exact lease form:

```text
git push --no-verify \
  --force-with-lease=<fixed-ref>:<expectedOldOid> \
  <fixed-remote-url> \
  <newCommitOid>:<fixed-ref>
```

Ambient Git/network state is suppressed: system/global config, credential helpers, interactive credentials, proxy configuration, redirects, cookies, terminal prompting, replace objects, and unapproved protocols are disabled. Git runs with `shell=false`. `GIT_PROTOCOL_FROM_USER=0` and `GIT_ALLOW_PROTOCOL` restrict protocol selection, and the adapter does not inherit `HTTP_PROXY`/`HTTPS_PROXY` from the parent environment.

### Remote Git ambiguity is deliberately asymmetric

A deterministic stale remote observation before push starts is `REJECTED` with `effectAttempted=false`. A clean zero push exit is transport `ACCEPTED`, still requiring independent proof.

Once the push child has started, however, the remote receive-pack path may already have executed server-side hooks or other external logic. Therefore a later observation of the old ref is **not** enough to claim that nothing happened. After the effect boundary:

- exact readback of `newCommitOid` may reconcile transport to `ACCEPTED`, still requiring proof;
- old ref, another ref value, observation failure, timeout, process error, or rejected receive-pack remain `UNKNOWN` unless the exact authorized new state is proven.

CIEAV never silently maps this post-effect ambiguity to success or deterministic rejection.

## Independent remote Git ref proof

Remote settlement uses the separate read-only provider `cieav.git-remote-ref-proof.v1`, configured through `CIEAV_PROOF_GIT_REMOTE_REF_CATALOG`. Production deployments should use a credential that can read the ref but cannot publish it, independently from the execution credential.

Example:

```json
{
  "version": 1,
  "gitRemoteRefProof": [
    {
      "id": "release-origin-main-proof",
      "remoteUrl": "https://git.example.com/org/repo.git",
      "remoteRef": "refs/heads/main",
      "gitBinary": "/absolute/path/to/git",
      "gitBinarySha256": "<64 lowercase hex>",
      "credential": {"kind":"BEARER_ENV","env":"CIEAV_GIT_READ_TOKEN"},
      "allowLoopback": false,
      "timeoutMs": 10000,
      "maxOutputBytes": 65536
    }
  ]
}
```

The provider uses only exact `git ls-remote --refs <fixed-url> <fixed-ref>` observation under the same DNS, proxy, redirect, protocol and credential isolation rules. It supports the deterministic expectation `ref-oid:<exact object id>`. Unknown expectation syntax and observation errors are non-conclusive. Every result is authority-free and may not mint execution authority.

Repository-local Smart HTTP qualification covers exact leased publication, stale pre-state rejection, independent exact-ref proof, BASIC credential isolation, and the critical receive-pack hook case where a real server hook runs but rejects the ref: that outcome stays `UNKNOWN`. Real GitHub/GitLab/enterprise hosting, production TLS/proxy topology, credential rotation/revocation, and provider-specific operational behavior remain external qualification gates.

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

The local Git ref adapter accepts only `credentialMode=NONE`. The remote Git Smart HTTP adapter accepts only its explicitly configured `NONE` or CIEAV-injected credential binding. Proof configuration remains separate from mutation configuration.

## Protocol status

| Protocol | In-repository implementation status | Remaining qualification boundary |
|---|---|---|
| HTTP | exact-origin hardened transport | live external endpoint qualification where used |
| CLOUD_API | hardened HTTP-family transport | provider-specific production credentials/endpoints |
| MCP | stdio + Streamable HTTP | external server/runtime qualification |
| A2A | protocol-aware task execution | external agent/runtime qualification |
| BROWSER | NAVIGATE/CLICK/TYPE with ticket/replay binding | physical Chromium + independent external witness qualification |
| CLI | digest-pinned no-shell adapter | per-tool executable/environment qualification |
| **GIT** | local fixed-ref CAS + exact-leased Smart HTTP publication + separate exact-ref proof | physical cross-platform Git plus real hosting/TLS/credential qualification |
| FILESYSTEM | fixed-target replace/delete | platform filesystem/atomicity qualification |
| DATABASE | fixed SQLite mutation + proof | production database/storage qualification |
| ROS2 | one-shot + continuing action | real ROS2/robot/hardware qualification |
| MQTT | QoS1 publish | real broker/device consequence qualification |

"Implemented" means the deterministic source path, negative tests, and repository-local qualification contract exist. It does **not** mean external production acceptance gates such as signed installers, physical hardware, real remote infrastructure, disaster recovery, or independent security review have passed.
