# LATCH Action Manifest Protocol

The Action Manifest is the core semantic object in LATCH. It represents an imminent digital action independently of any specific website UI.

## ActionContext

The extension captures a privacy-reduced snapshot containing:

- URL/origin/title
- clicked/submitted element semantics
- nearby redacted text
- form method/action
- form field **names/types/labels**, never raw field values
- high-level sensitive-data categories
- redacted file descriptors
- optional site-declared action hints

## ActionManifest

```ts
interface ActionManifest {
  requestId: string;
  actionType: string;
  summary: string;
  actor: string;
  target?: string;
  recipients: string[];
  dataCategories: DataCategory[];
  effects: string[];
  reversibility: "REVERSIBLE" | "DELAYABLE" | "COMPENSABLE" | "IRREVERSIBLE" | "UNKNOWN";
  undo: UndoDescriptor;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  modelUsed: boolean;
  warnings: string[];
  evidence: string[];
  policyVersion: string;
}
```

## Security merge rule

A model may improve semantics but cannot reduce deterministic safety constraints.

```text
final risk = max(deterministic risk, model risk)
final reversibility = stricter(deterministic reversibility, model reversibility)
```

If deterministic policy identifies a credential disclosure or financial commitment as critical, a model response of `LOW` is ignored.

## Receipt

An Action Receipt records:

- manifest
- source URL/origin/title
- device pseudonym
- timestamp
- status (`PREVIEWED`, `COMMITTED`, `CANCELLED`, `UNDONE`, `UNDO_FAILED`)
- receipt version
- server signature when available

A receipt is an auditable record of LATCH's observation and user choice. It is **not** a cryptographic attestation that a remote website actually performed or reversed the action.

## Native declarations

Sites may declare semantic hints through attributes:

```html
<button
 data-latch-action="account.disconnect"
 data-latch-summary="Disconnect GitHub from this workspace"
 data-latch-reversibility="REVERSIBLE">
 Disconnect
</button>
```

LATCH always treats page declarations as untrusted input.
