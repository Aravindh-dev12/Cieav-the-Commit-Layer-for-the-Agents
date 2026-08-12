# CIEAV trusted site adapters

CIEAV does not treat a button label such as **Disconnect**, **Delete**, **Restore**, or **Unpublish** as proof that an action has a safe inverse. Production one-click Undo is available only through a trusted adapter whose contract is bundled with the local CIEAV runtime and validated by the browser host.

## Trust boundary

Page content is untrusted. A website may propose labels, attributes, action names, or adapter identifiers, but none of those values grant trust. The local browser host selects or validates an adapter from its own registry using the signed receipt and current runtime state.

A trusted inverse requires all of the following:

1. exactly one bundled adapter matches;
2. the receipt source matches the adapter's exact origin/path rules;
3. the receipt action type matches the adapter contract;
4. the adapter derives a non-empty resource key for the exact account/object/capability being changed;
5. CIEAV hashes the adapter ID, adapter version, action type, and resource key into a resource fingerprint;
6. the inverse operation and candidate control match the adapter contract;
7. the adapter capability has not expired;
8. the receipt is still `COMMITTED`;
9. the signed outcome is `OBSERVED_SUCCESS`;
10. the inverse is still live in the protected page when Undo is invoked;
11. revalidation at Undo time reproduces the same adapter/resource capability.

Zero matches, multiple matches, missing resource binding, or resource-fingerprint changes fail closed.

## Adapter shape

The current registry lives in `apps/browser/adapters.mjs`. A production adapter should have a stable ID and version and define narrow match, resource, and inverse rules. Conceptually:

```js
{
  id: "cieav.example.access",
  version: 2,
  match({url, actionType}) {
    // exact trusted origin/path + exact action class
  },
  resourceKey({url, actionType}) {
    // host-verifiable stable resource identifier; never a secret
    return "account:...";
  },
  inverse: {
    operationId: "disconnect",
    labels: ["Disconnect"],
    expiresMs: 30000
  }
}
```

The resource key must identify the narrowest practical affected object without containing credentials, raw form values, tokens, or other secrets. Do not create wildcard adapters for arbitrary domains. Do not use page-provided JavaScript as an adapter. Do not grant an adapter because an LLM says an inverse probably exists.

## Outcome evidence

An adapter may provide action-specific evidence rules, but model/page text still cannot lower the deterministic evidence floor. HIGH/CRITICAL actions require stronger evidence than generic DOM success text. If the required evidence is unavailable, the result remains `UNKNOWN` and Undo is not exposed.

For a production adapter, the preferred evidence order is service-native deterministic evidence, authenticated API state, or an adapter-specific local state transition that is bound to the same resource fingerprint. Generic success strings are supporting evidence only.

## Test adapters

`cieav.test-lab.access` and `cieav.synthetic.access` are test-only contracts used to exercise the adapter lifecycle. Test-only adapters are rejected unless the browser is explicitly running in CIEAV test-auto mode. They must never be presented as support for a real external service.

## Adding a real adapter

Before enabling a production adapter:

- bind it to the smallest practical origin/path scope;
- define an exact action type and inverse operation;
- define a stable resource key and prove different resources produce different fingerprints;
- add positive and spoofed-origin tests;
- test wrong-action, wrong-label, wrong-resource, expiry, page-closure and ambiguous-match cases;
- add outcome verification specific to the service where possible;
- confirm an inverse cannot be used against another receipt or another account/resource;
- verify revalidation reproduces the original adapter version/operation/resource fingerprint;
- run `npm run test:adapters`, `npm run test:browser`, and `npm run release:verify`.

A compensating action is not necessarily a true reversal. CIEAV must continue to describe revocation, deletion, refunds, or unpublishing accurately when copies, external side effects, fees, or third-party access may persist.
