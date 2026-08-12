# LATCH Browser architecture

LATCH is browser-native, not an extension.

```text
LATCH controller (Node)
  ├─ starts local semantic/receipt API
  ├─ launches a dedicated Chromium profile
  ├─ attaches to every page via localhost-only CDP
  ├─ creates an isolated JavaScript world named LATCH
  ├─ installs action observation/commit UI
  ├─ performs deterministic + optional model analysis
  ├─ replays approved top-frame clicks via trusted CDP Input
  └─ stores signed receipts and live undo capability
```

The page never receives LATCH device tokens or API credentials.

## Isolated-world mediation

For each page LATCH opens a dedicated DevTools websocket, enables Runtime/Page, adds the `__latchNative` binding only to execution contexts named `LATCH`, and injects the observer with `Page.addScriptToEvaluateOnNewDocument`. An isolated world is also created for an already-loaded document.

## Trusted action replay

A trusted top-frame click is stopped while LATCH analyzes consequences. After commit, `Input.dispatchMouseEvent` replays the approved coordinates. A single-use coordinate-bound replay guard prevents re-interception; it is not a global bypass timer.

## Reversal

LATCH never promises universal rollback. After commit it may discover exactly one obvious inverse in the same live semantic scope, such as `Connect` → `Disconnect`. Undo is refused if the inverse is ambiguous or the page is gone.

## Browser boundary

Standard web pages/tabs are mediated. Privileged browser pages are intentionally excluded. Top-frame clicks get trusted replay. Nested iframe/form fallbacks still have browser-specific limitations. Server-side irreversible effects cannot be made reversible by a client browser.
