# CIEAV Desktop UI Execution Contract

CIEAV desktop automation is a first-class `DESKTOP` consequence protocol. It is not routed through generic CLI authority and does not expose arbitrary accessibility traversal, keystrokes, text injection, screen coordinates, scripts, commands, or helper arguments to an agent.

The first primitive is intentionally narrow:

```text
protocol  = DESKTOP
operation = DESKTOP_UI_INVOKE
credentialMode = CIEAV_INJECTED
fixed platform + application + window + control + action=INVOKE
+ digest-pinned read-only observer
+ separately digest-pinned executor
+ exact expected pre-state digest
+ authenticated consumed-ticket commit envelope
+ durable one-use replay claim
→ one native accessibility invoke attempt
→ independent desktop-state proof
```

## Authority target and dynamic arguments

The authority target is derived only from `platform`, application identity, window identity, control identity, and fixed `INVOKE`. Changing any field produces a different target.

Normalized arguments contain only:

```json
{"expectedStateDigest":"<64 lowercase hex>"}
```

Agents cannot dynamically supply application/window/control identity, helper paths, replay storage, actions, commands, scripts, selectors, payloads, text, coordinates, key sequences, or commit keys.

## Native platform identity

### Windows

`native/windows/cieav-desktop-observe/` and `native/windows/cieav-desktop-invoke/` are distinct .NET 8 x64 projects. `appId` is the exact absolute process image path. `windowId` and `controlId` are exact UI Automation `AutomationId` values. Missing or ambiguous matches fail closed. The only mutation is `InvokePattern.Invoke()` after exact pre-state revalidation.

### macOS

`native/macos/cieav-desktop-observe/main.swift` and `native/macos/cieav-desktop-invoke/main.swift` are distinct Swift helpers. `appId` is the exact bundle identifier. `windowId` matches exact `AXIdentifier` when present, otherwise exact `AXTitle`; `controlId` is an exact stable `AXIdentifier`. Multiple running applications or matching elements fail closed. The only mutation is:

```text
AXUIElementPerformAction(control, kAXPressAction)
```

### Linux

`native/linux/cieav-desktop-observe/main.c` and `native/linux/cieav-desktop-invoke/main.c` use libatspi directly. `appId` is the exact canonical `/proc/<pid>/exe` path. `windowId` and `controlId` are exact stable AT-SPI accessible IDs. Traversal is bounded to 10,000 objects. If stable IDs are unavailable, the target is unsupported rather than mapped to coordinates or fuzzy names. The only mutation is:

```text
atspi_action_do_action(action, 0, ...)
```

Synthetic mouse/keyboard generation is absent on all platforms.

## Trusted execution catalog

A Windows entry is representative:

```json
{
  "version":1,
  "desktop":[{
    "toolId":"desktop-save-button",
    "platform":"win32",
    "appId":"C:\\Program Files\\Example\\Product.exe",
    "windowId":"main-window",
    "controlId":"save-button",
    "action":"INVOKE",
    "executionHelper":{"path":"C:\\Program Files\\CIEAV\\cieav-desktop-invoke.exe","sha256":"<64 lowercase hex>"},
    "preflightHelper":{"path":"C:\\Program Files\\CIEAV\\cieav-desktop-observe.exe","sha256":"<different 64 lowercase hex>"},
    "commitKeyEnv":"CIEAV_DESKTOP_SAVE_COMMIT_KEY",
    "replayDir":"C:\\ProgramData\\CIEAV\\desktop-replay\\desktop-save-button"
  }]
}
```

`platform` must equal the host platform. Helper paths and `replayDir` must be absolute. Helpers must be regular files and match their SHA-256 pins every time they are used. The replay directory must already exist and resolve to a directory.

Execution and observation helpers must resolve to different files and have different digests. The observer never receives the commit key or replay-directory capability.

`commitKeyEnv` names a fixed environment binding containing exactly 32 random bytes encoded as 64 lowercase hex characters. The secret value is never part of normalized arguments, target identity, evidence, result metadata, or proof configuration.

## Preflight observation

Before the one-use ticket is consumed, CIEAV starts only the pinned observer with canonical stdin:

```json
{"version":1,"kind":"OBSERVE","platform":"win32","appId":"C:\\Program Files\\Example\\Product.exe","windowId":"main-window","controlId":"save-button"}
```

The observer must return exactly one object:

```json
{"version":1,"kind":"OBSERVATION","stateDigest":"<64 lowercase hex>"}
```

Timeout, process failure, malformed/multiline output, platform mismatch, helper digest mismatch, target ambiguity, or state mismatch fails closed before ticket consumption. Observer child environments contain neither `CIEAV_DESKTOP_COMMIT_KEY` nor `CIEAV_DESKTOP_REPLAY_DIR`.

## Authenticated consumed-ticket commit

After ticket consumption, CIEAV resolves the trusted replay directory and computes its exact path digest. The canonical HMAC material is:

```text
CIEAV_DESKTOP_COMMIT_V1
<ticketId>
<proposalId>
<normalizedArgumentsDigest>
<platform>
<appId>
<windowId>
<controlId>
<action>
<replayDirDigest>
<expectedStateDigest>
```

CIEAV computes:

```text
commitMac = HMAC-SHA-256(commitKey, UTF8(commit material))
```

and sends the executor exactly:

```json
{
  "version":1,
  "kind":"INVOKE",
  "ticketId":"<consumed ticket UUID>",
  "proposalId":"<proposal UUID>",
  "normalizedArgumentsDigest":"<authorized argument digest>",
  "platform":"win32",
  "appId":"C:\\Program Files\\Example\\Product.exe",
  "windowId":"main-window",
  "controlId":"save-button",
  "action":"INVOKE",
  "replayDirDigest":"<64 lowercase hex>",
  "expectedStateDigest":"<64 lowercase hex>",
  "commitMac":"<64 lowercase hex>"
}
```

Only the executor child receives fixed `CIEAV_DESKTOP_COMMIT_KEY` and `CIEAV_DESKTOP_REPLAY_DIR` environment values. Windows verifies HMAC-SHA-256 with `CryptographicOperations.FixedTimeEquals`; macOS uses CryptoKit HMAC-SHA-256 plus constant-time byte comparison; Linux uses GLib HMAC-SHA-256 plus constant-time comparison. MAC verification occurs before the replay claim or any accessibility target access.

## Durable one-use replay claim

A valid authenticated envelope is still one-use. Before resolving the UI target, each executor validates that `SHA-256(CIEAV_DESKTOP_REPLAY_DIR)` equals the HMAC-bound `replayDirDigest` and atomically creates:

```text
<replayDir>/<ticketId>.used
```

with create-new/exclusive semantics. The marker contains the commit MAC and is durably flushed before accessibility execution begins.

- Windows uses `FileMode.CreateNew`, `FileOptions.WriteThrough`, and `Flush(true)`.
- macOS uses `openat` with `O_CREAT|O_EXCL|O_NOFOLLOW`, then `fsync` on the marker and directory.
- Linux uses the same `openat`/`O_EXCL`/`O_NOFOLLOW` and `fsync` pattern.

An existing marker returns pre-effect `REJECTED / REPLAY_ALREADY_CONSUMED`. Replay-directory mismatch or inability to durably claim the ticket also rejects before UI access.

The claim is intentionally conservative: once the marker is successfully created, that ticket is consumed at the native boundary even if a later target/pre-state check rejects. CIEAV does not delete the claim to retry the same ticket. A new execution requires a newly authorized ticket and commit envelope.

Crash behavior is also conservative. A crash after durable claim but before mutation leaves the marker, preventing replay; the resulting transaction must be reconciled through CIEAV settlement/proof rather than reusing the ticket.

## Execution outcome

A clean deterministic rejection is allowed only before the native effect boundary (`effectStarted=false`). Once the platform mutation call begins, failure or ambiguity is `UNKNOWN`. A clean helper response with `transport=ACCEPTED` is transport evidence only and still requires independent proof.

There is no argv-controlled target/action and CIEAV launches pinned helpers directly with `shell=false` and a minimal environment.

## Independent proof

Production settlement uses `cieav.desktop-ui-proof.v1` from separate `CIEAV_PROOF_DESKTOP_UI_CATALOG` configuration. Proof receives only a digest-pinned observation helper and the fixed target identity. It never receives an execution helper, commit key, or replay directory, sends only `kind="OBSERVE"`, and always reports `authority=false` and `mayMintExecutionAuthority=false`.

Supported deterministic expectation syntax is:

```text
state-digest:<64 lowercase hex>
```

Unknown syntax or observation failures remain non-conclusive.

## Build and repository-local qualification

Canonical host builds are:

```text
npm run build:desktop:windows
npm run build:desktop:macos
npm run build:desktop:linux
```

Each emits separate observer/executor artifacts and exact SHA-256 digests suitable for trusted-catalog pins. Linux builds use PIE, RELRO/NOW, stack protector, FORTIFY and warning-as-error flags. `npm run test:desktop-native` is platform-independent and is part of `test:boundaries`.

Repository tests assert observer/executor separation, exact target binding, commit-key/replay isolation, HMAC-before-replay ordering, replay-before-accessibility ordering, one allowed mutation primitive per OS, durable exclusive ticket claims, and post-effect `UNKNOWN` semantics. These are source/architecture gates, not physical host qualification.

## Threat boundary and non-claims

Authenticated commits and durable replay markers prevent ordinary unauthenticated or captured-envelope direct helper re-use under the assumed OS process/filesystem protections. They do **not** establish isolation against a hostile same-user/administrator process that can read CIEAV secrets, tamper with process environments, alter the replay directory, debug/replace executors, or defeat operating-system isolation.

The replay marker also does not prove whether a mutation happened after a crash; proof/settlement remains authoritative for world-state outcome. The commit MAC and replay journal authenticate/attenuate already-consumed CIEAV authority and never mint permits, tickets, RBCs, credential leases, or promotion authority.

External production gates still include:

- physical Windows UIA, macOS Accessibility/TCC, and Linux AT-SPI interactive-session qualification;
- Windows binary signing and macOS hardened-runtime signing/notarization;
- installer ownership/ACLs for helper binaries, replay directories and secret-bearing CIEAV processes;
- commit-key generation, storage, rotation and revocation qualification;
- replay-directory durability, backup/restore and crash-recovery validation on supported filesystems;
- accessibility identity stability across supported target application versions;
- independent native-helper security review;
- physical failure/recovery tests demonstrating conservative `UNKNOWN` settlement.

No model, agent, router, memory system, helper, observer, or proof provider may mint authority.
