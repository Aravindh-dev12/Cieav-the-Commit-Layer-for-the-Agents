# CIEAV trusted site adapters

CIEAV does not treat a button label such as **Disconnect**, **Delete**, **Restore**, or **Unpublish** as proof that an action has a safe inverse. Production one-click Undo is available only through a trusted adapter whose contract is bundled with the local CIEAV runtime and validated by the browser host.

## Trust boundary

Page content is untrusted. A website may propose labels, attributes, action names, or adapter identifiers, but none of those values grant trust. The local browser host selects or validates an adapter from its own registry using the signed receipt and current runtime state.

A trusted inverse requires all of the following:

1. exactly one bundled adapter matches;
2. the receipt source matches the adapter's exact origin/path rules;
3. the receipt action type matches the adapter contract;
4. the inverse operation and candidate control match the adapter contract;
5. the adapter capability has not expired;
6. the receipt is still `COMMITTED`;
7. the signed outcome is `OBSERVED_SUCCESS`;
8. the inverse is still live in the protected page when Undo is invoked.

Zero matches or multiple matches fail closed.

## Adapter shape

The current registry lives in `apps/browser/adapters.mjs`. A production adapter should have a stable ID and version and define narrow match and inverse rules. Conceptually:

```js
{
  id: "cieav.example.access",
  version: 1,
  match({url, actionType}) {
    // exact trusted origin/path + exact action class
  },
  inverse: {
    operationId: "disconnect",
    labels: ["Disconnect"],
    expiresMs: 30000
  }
}
```

Do not create wildcard adapters for arbitrary domains. Do not use page-provided JavaScript as an adapter. Do not grant an adapter because an LLM says an inverse probably exists.

## Outcome evidence

An adapter may eventually provide action-specific evidence rules, but model/page text still cannot lower the deterministic evidence floor. HIGH/CRITICAL actions require stronger evidence than generic DOM success text. If the required evidence is unavailable, the result remains `UNKNOWN` and Undo is not exposed.

## Test adapters

`cieav.test-lab.access` and `cieav.synthetic.access` are test-only contracts used to exercise the adapter lifecycle. Test-only adapters are rejected unless the browser is explicitly running in CIEAV test-auto mode. They must never be presented as support for a real external service.

## Adding a real adapter

Before enabling a production adapter:

- bind it to the smallest practical origin/path scope;
- define an exact action type and inverse operation;
- add positive and spoofed-origin tests;
- test wrong-action, wrong-label, expiry, page-closure and ambiguous-match cases;
- add outcome verification specific to the service where possible;
- confirm an inverse cannot be used against another receipt or another account/resource;
- run `npm run test:adapters`, `npm run test:browser`, and `npm run release:verify`.

A compensating action is not necessarily a true reversal. CIEAV must continue to describe revocation, deletion, refunds, or unpublishing accurately when copies, external side effects, fees, or third-party access may persist.
