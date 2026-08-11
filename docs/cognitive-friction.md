# Cognitive friction: protect without exhausting the user

If every ordinary action creates a warning, LATCH becomes cognitive debt and trains users to approve blindly. The product therefore separates semantic observation from interruption.

## HARD

Used for HIGH/CRITICAL risk and credential, financial, identity, health, or biometric data. HARD friction never disappears because the user has done the action before.

## SOFT

Used for medium-risk actions that are new, uncertain, previously cancelled, low-confidence, or have unknown reversibility.

## PASSIVE

The action proceeds without a modal. LATCH still creates a receipt and can show a short non-blocking confirmation. Repeated, understood medium-risk actions can move here in Balanced mode.

## Modes

- **Balanced** — default; spends attention only where it changes safety.
- **Strict** — commit check for every intercepted consequential action.
- **Quiet** — interrupts only high/critical/sensitive plus uncertain medium-risk actions.

## Anti-habituation invariants

1. Sensitive or HIGH/CRITICAL actions never habituate to PASSIVE.
2. A prior cancellation increases future friction.
3. Low model confidence cannot reduce friction.
4. Model semantics cannot override deterministic minimum risk.
5. Trusted replay exemption is exact-coordinate, single-use, and short-lived.

The goal is not merely fewer warnings. It is to spend the user's attention only when the decision actually matters.
