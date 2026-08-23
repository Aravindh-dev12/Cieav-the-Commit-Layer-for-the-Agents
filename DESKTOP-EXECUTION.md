# CIEAV Desktop UI Execution Contract

CIEAV desktop automation is a first-class `DESKTOP` consequence protocol. It is not routed through generic CLI authority and it does not expose arbitrary accessibility-tree traversal, keystrokes, text injection, screen coordinates, scripts, commands, or helper arguments to an agent.

The first primitive is intentionally narrow:

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

The authority target is derived only from `platform`, application identity, window identity, control identity, and fixed `action = INVOKE`. Changing any element creates a different target.

Normalized arguments contain only:

```json
{
  "expectedStateDigest": "<64 lowercase hex>"
}
```

Agents cannot dynamically supply an application, window, control, helper path, action, command, script, accessibility selector language, payload, text value, coordinate, or key sequence.

## Concrete platform identity

The repository contains separate native observer and executor sources for all three supported desktop hosts.

### Windows

Sources:

```text
native/windows/cieav-desktop-observe/
native/windows/cieav-desktop-invoke/
```

`appId` is the exact absolute process image path. `windowId` and `controlId` are exact UI Automation `AutomationId` values. The helper rejects missing or ambiguous matches. Both helpers hash the same canonical state material from exact process/window/control identity plus selected read-only UIA state. The executor re-resolves the same target and checks `expectedStateDigest` immediately before the only mutation primitive, `InvokePattern.Invoke()`.

The projects target `net8.0-windows10.0.19041.0` and build as distinct `cieav-desktop-observe` and `cieav-desktop-invoke` artifacts. Production binaries still require Windows signing and physical interactive-session qualification.

### macOS

Sources:

```text
native/macos/cieav-desktop-observe/main.swift
native/macos/cieav-desktop-invoke/main.swift
```

`appId` is the exact bundle identifier. `windowId` matches exact `AXIdentifier` when the window exposes one; otherwise it is an exact `AXTitle` fallback. `controlId` must be an exact stable `AXIdentifier`. Multiple running instances or multiple matching accessibility objects are rejected.

Both helpers require the process to be trusted for Accessibility. The executor re-observes the exact target and pre-state immediately before the sole mutation primitive:

```text
AXUIElementPerformAction(control, kAXPressAction)
```

It does not expose `AXUIElementSetAttributeValue`, keyboard injection, arbitrary actions, or selector expressions. Production artifacts still require hardened-runtime signing, Accessibility/TCC qualification, and notarization.

### Linux

Sources:

```text
native/linux/cieav-desktop-observe/main.c
native/linux/cieav-desktop-invoke/main.c
```

`appId` is the exact canonical `/proc/<pid>/exe` path. `windowId` and `controlId` are exact AT-SPI accessible IDs (`atspi_accessible_get_accessible_id`), which are intended as stable application-development identifiers. If a toolkit does not expose stable IDs, the target is unsupported rather than mapped to a coordinate/name fallback.

Traversal is bounded to 10,000 accessibility objects and ambiguity fails closed. The state digest includes the default AT-SPI action name. The executor revalidates the exact state and invokes only AT-SPI action index 0, the default action by AT-SPI convention:

```text
atspi_action_do_action(action, 0, ...)
```

Synthetic mouse/keyboard generation is absent. The helpers use libatspi2, GLib, and json-glib and must be compiled and qualified inside the supported graphical session/AT-SPI bus topology.

## Execution catalog

A Windows catalog entry is:

```json
{
  "version": 1,
  "desktop": [
    {
      "toolId": "desktop-save-button",
      "platform": "win32",
      "appId": "C:\\Program Files\\Example\\Product.exe",
      "windowId": "main-window",
      "controlId": "save-button",
      "action": "INVOKE",
      "executionHelper": {
        "path": "C:\\Program Files\\CIEAV\\cieav-desktop-invoke.exe",
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

The execution and preflight helpers must resolve to different files **and** have different digests. This prevents a mutation-capable binary from silently serving as the pre-consumption observation path.

## Preflight observation

Before the one-use execution ticket is consumed, CIEAV invokes only the pinned observer. It receives one canonical JSON object on stdin:

```json
{
  "version": 1,
  "kind": "OBSERVE",
  "platform": "win32",
  "appId": "C:\\Program Files\\Example\\Product.exe",
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

Any process failure, timeout, malformed output, multiple output lines, platform mismatch, helper digest mismatch, target ambiguity, or state mismatch fails closed before the downstream invoke helper is started.

## Consumed-ticket execution envelope

Only after CIEAV consumes the one-use ticket does it start the executor. The helper receives:

```json
{
  "version": 1,
  "kind": "INVOKE",
  "ticketId": "<consumed ticket UUID>",
  "proposalId": "<proposal UUID>",
  "normalizedArgumentsDigest": "<authorized argument digest>",
  "platform": "win32",
  "appId": "C:\\Program Files\\Example\\Product.exe",
  "windowId": "main-window",
  "controlId": "save-button",
  "action": "INVOKE",
  "expectedStateDigest": "<64 lowercase hex>"
}
```

There is no argv-controlled target or action. CIEAV launches the absolute pinned helper directly with `shell=false`, an intentionally minimal environment, and canonical JSON on stdin.

A successful transport response is exactly one JSON object:

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

Platform helpers use platform-specific detail codes, but those codes are bounded metadata, not proof. A clean `REJECTED` is deterministic only when `effectStarted=false`. Once the native mutation call crosses its effect boundary, failure or ambiguity is `UNKNOWN`. Transport `ACCEPTED` still requires independent proof.

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
      "appId": "C:\\Program Files\\Example\\Product.exe",
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

The proof provider sends only `kind="OBSERVE"`, accepts only a `stateDigest`, exposes no executor, and always returns `authority=false` and `mayMintExecutionAuthority=false`.

Supported deterministic expectation syntax is:

```text
state-digest:<64 lowercase hex>
```

Unknown expectation syntax or observer failures are non-conclusive.

## Repository-local qualification

The API test suite contains constitutional/native source gates for Windows, macOS, and Linux. They assert that observer sources contain no mutation primitive, executors expose only the one platform invoke primitive, no shell/synthetic input fallback is present, targets are exact, ambiguity is rejected, and pre-state revalidation precedes mutation.

These tests qualify architecture/source boundaries only. They do not replace compiling and running each helper on its physical target OS.

## External qualification boundary

Repository-local implementation does **not** establish physical desktop production acceptance. Required external gates include:

- compile/publish the Windows x64 observer and executor and validate UI Automation across supported Windows releases and interactive-session boundaries;
- compile/sign/notarize the macOS Swift helpers and validate Accessibility/TCC permission lifecycle;
- compile the Linux helpers against supported libatspi2/GLib/json-glib versions and validate supported Wayland/X11 desktop-session accessibility buses;
- installer ownership/ACL validation for pinned helper binaries;
- binary signing/provenance and update rollback/revocation behavior;
- accessibility-tree identity stability across target application versions;
- independent security review of each native helper;
- physical failure/recovery tests demonstrating that post-start ambiguity remains `UNKNOWN`.

No model, agent, router, memory system, helper, observer, or proof provider may mint authority. Native executors receive only already-consumed CIEAV execution authority and may attempt only the exact fixed UI transition encoded by that authority.
