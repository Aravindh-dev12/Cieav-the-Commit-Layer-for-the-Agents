# CIEAV Desktop UI Execution Contract

CIEAV desktop automation is a first-class `DESKTOP` consequence protocol. It is not routed through generic CLI authority and it does not expose arbitrary accessibility-tree traversal, keystrokes, text injection, screen coordinates, scripts, commands, or helper arguments to an agent.

The first production primitive is intentionally narrow:

```text
protocol  = DESKTOP
operation = DESKTOP_UI_INVOKE
fixed OS platform
+ fixed application identity
+ fixed window identity
+ fixed control identity
+ fixed action = INVOKE
+ digest-pinned read-only preflight helper
+ separately digest-pinned execution helper
+ exact expected pre-state digest
→ one native accessibility invoke attempt
→ separate independent desktop-state proof
```

## Authority target

The authority target is derived only from:

```text
platform
application identity
window identity
control identity
action = INVOKE
```

Changing any element creates a different target. The normalized arguments contain only:

```json
{
  "expectedStateDigest": "<64 lowercase hex>"
}
```

Agents cannot dynamically supply an application, window, control, helper path, action, command, script, accessibility selector language, payload, text value, coordinate, or key sequence.

## Execution catalog

A catalog entry has this shape:

```json
{
  "version": 1,
  "desktop": [
    {
      "toolId": "desktop-save-button",
      "platform": "win32",
      "appId": "com.example.Product",
      "windowId": "main-window",
      "controlId": "save-button",
      "action": "INVOKE",
      "executionHelper": {
        "path": "C:\\Program Files\\CIEAV\\cieav-desktop-exec.exe",
        "sha256": "<64 lowercase hex>"
      },
      "preflightHelper": {
        "path": "C:\\Program Files\\CIEAV\\cieav-desktop-observe.exe",
        "sha256": "<different 64 lowercase hex>"
      }
    }
  ]
}
```

`platform` is exactly one of `win32`, `darwin`, or `linux` and must equal the running CIEAV host platform. Helper paths must be absolute regular files and must still match their SHA-256 pins at construction and invocation time.

The execution helper and preflight observation helper must resolve to different files **and** have different digests. This prevents a mutation-capable binary from silently serving as the pre-consumption observation path.

## Preflight observation

Before the one-use execution ticket is consumed, CIEAV invokes only the pinned preflight observer. It receives one canonical JSON object on stdin:

```json
{
  "version": 1,
  "kind": "OBSERVE",
  "platform": "win32",
  "appId": "com.example.Product",
  "windowId": "main-window",
  "controlId": "save-button"
}
```

The observer must write exactly one JSON object to stdout:

```json
{
  "version": 1,
  "kind": "OBSERVATION",
  "stateDigest": "<64 lowercase hex>"
}
```

Any process failure, timeout, malformed output, multiple output lines, platform mismatch, digest mismatch, or state mismatch fails closed before the downstream invoke helper is started.

The digest must represent a canonical, helper-defined read-only view of the exact bound control state. A production helper specification must define which accessibility attributes participate in that digest and their canonical ordering.

## Consumed-ticket execution envelope

Only after CIEAV consumes the one-use ticket does it start the execution helper. The helper receives:

```json
{
  "version": 1,
  "kind": "INVOKE",
  "ticketId": "<consumed ticket UUID>",
  "proposalId": "<proposal UUID>",
  "normalizedArgumentsDigest": "<authorized argument digest>",
  "platform": "win32",
  "appId": "com.example.Product",
  "windowId": "main-window",
  "controlId": "save-button",
  "action": "INVOKE",
  "expectedStateDigest": "<64 lowercase hex>"
}
```

There is no argv-controlled target or action. CIEAV launches the absolute pinned helper directly with `shell=false`, an intentionally minimal environment, and canonical JSON on stdin.

A clean helper response is exactly one JSON object:

```json
{
  "version": 1,
  "kind": "EXECUTION_RESULT",
  "effectStarted": true,
  "transport": "ACCEPTED",
  "postStateDigest": "<optional 64 lowercase hex>",
  "detailCode": "INVOKE_DISPATCHED"
}
```

`detailCode` is bounded machine-readable metadata, not proof.

A clean `REJECTED` result is accepted as deterministic rejection only when the helper explicitly reports `effectStarted=false`. Once the helper process has started, timeout, abnormal exit, malformed output, contradictory transport/effect flags, or another ambiguous state is `UNKNOWN` unless an exact accepted result is returned. Transport `ACCEPTED` still requires independent proof.

## Independent proof

Production settlement uses `cieav.desktop-ui-proof.v1`, configured separately through `CIEAV_PROOF_DESKTOP_UI_CATALOG`.

A proof target contains the same platform/application/window/control identity but only a digest-pinned observation helper:

```json
{
  "version": 1,
  "desktopUiProof": [
    {
      "id": "desktop-save-proof",
      "platform": "win32",
      "appId": "com.example.Product",
      "windowId": "main-window",
      "controlId": "save-button",
      "observationHelper": {
        "path": "C:\\Program Files\\CIEAV\\cieav-desktop-proof.exe",
        "sha256": "<64 lowercase hex>"
      }
    }
  ]
}
```

The proof provider sends only `kind="OBSERVE"`, accepts only a `stateDigest`, exposes no execution helper, and always returns `authority=false` and `mayMintExecutionAuthority=false`.

Supported deterministic expectation syntax is:

```text
state-digest:<64 lowercase hex>
```

Unknown expectation syntax or observer failures are non-conclusive.

## Native platform requirements

The Node/TypeScript adapter is only the authority boundary and native-helper protocol. Production desktop qualification additionally requires real native helper implementations and physical OS validation:

- **Windows:** UI Automation (`IUIAutomation`) with an application/process identity binding, exact window/control identity strategy, `InvokePattern` only, signed executable, and validation under the actual interactive desktop/session model.
- **macOS:** Accessibility (`AXUIElement`) with exact application identity, window/control attribute binding, `AXPress` only, hardened runtime/code signing, Accessibility permission, and notarized distribution.
- **Linux:** AT-SPI2 over the desktop accessibility bus with exact application/window/control identity, `Action.DoAction` restricted to the configured invoke action, and qualification across supported desktop/session environments.

The native executor must reject any request whose app/window/control/action differs from the fixed identity it was built/configured to serve. It must re-observe the expected state immediately before invoking the platform accessibility primitive. It must not expose a general selector language or arbitrary accessibility action dispatcher.

The observation helper must contain no mutation primitive. A production proof helper should be separately built/signable and independently reviewed from the execution helper.

## External qualification boundary

Repository-local implementation does **not** establish physical desktop production acceptance. Required external gates include:

- real Windows UI Automation behavior across supported Windows releases and interactive-session boundaries;
- real macOS Accessibility/TCC behavior, signing, hardened runtime, notarization, and permission lifecycle;
- real Linux AT-SPI behavior across supported desktop environments and D-Bus/session topology;
- installer ownership/ACL validation for pinned helper binaries;
- binary signing/provenance and update rollback/revocation behavior;
- accessibility-tree identity stability across application versions;
- independent security review of each native helper;
- physical failure/recovery tests demonstrating that post-start ambiguity remains `UNKNOWN`.

No model, agent, router, memory system, helper, observer, or proof provider may mint authority. The native helper receives only an already-consumed CIEAV execution authority and may attempt only the exact fixed UI transition encoded by that authority.
