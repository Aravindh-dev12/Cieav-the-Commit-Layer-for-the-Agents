# Cognitive friction and cognitive debt

LATCH must protect without teaching the user to ignore it. If every action produces the same warning, attention becomes a depleted security resource. LATCH therefore treats **cognitive debt** as a measurable product risk, not a UX preference.

## Friction levels

### HARD
Used for HIGH/CRITICAL risk and credential, financial, identity, health, or biometric data. HARD friction never disappears because the action was seen before.

### SOFT
Used for medium-risk actions that are new, uncertain, recently cancelled/undone, low-confidence, or have unknown reversibility.

### PASSIVE
The action proceeds without a modal. Repeated, well-understood MEDIUM-risk actions can move here after safe repetition in Balanced mode.

## Recovery instead of permanent nagging

A cancellation or Undo is treated as a regret signal and immediately raises friction for the matching origin/action pattern. That signal is not permanent: after three subsequent safe commits, the action may again qualify for PASSIVE treatment if confidence and reversibility are strong. This prevents one old cancellation from creating endless warnings.

## Habituation detection

LATCH records decision latency for HARD/SOFT prompts locally. Three consecutive HARD commits completed in 650 ms or less are treated as a **habituation signal**. The next HARD warning stays HARD and activates **refocus**: Commit is briefly disabled for 900 ms with a message asking the user to read the consequence.

Refocus never suppresses or weakens a warning. It spends slightly more attention only when evidence suggests important warnings are being clicked through automatically.

## Cognitive-debt score

The local attention engine reports a 0–100 debt score using three measurable signals:

- **Soft-prompt load** — how much ordinary activity consumes interruptive attention.
- **Fast-approval rate** — how often prompted decisions are approved almost instantly.
- **Repeated-soft rate** — how often the same learned/understood action keeps receiving SOFT prompts.

The score is diagnostic, not authorization. A low score cannot weaken HIGH/CRITICAL/sensitive safeguards.

Levels:

- `LOW` — <25
- `WATCH` — 25–49
- `HIGH` — 50–74
- `CRITICAL` — 75+

The report also exposes prompt rate, hard/soft prompt rate, average decision latency, interruptions avoided, and the count of action patterns currently requiring refocus.

## Modes

- **Balanced** — default; learns safe medium-risk patterns and spends attention selectively.
- **Strict** — commit check for every intercepted consequential action.
- **Quiet** — interrupts high/critical/sensitive actions plus uncertain/regretful medium-risk actions.

## Anti-habituation invariants

1. Sensitive or HIGH/CRITICAL actions never habituate to PASSIVE.
2. Model confidence cannot weaken deterministic HIGH/CRITICAL treatment.
3. Cancellation/Undo immediately restores friction for the matching pattern.
4. Regret signals decay after verified safe recovery rather than creating permanent nagging.
5. Rapid HARD approvals increase friction through refocus; they never decrease it.
6. Repeated, understood MEDIUM actions can become PASSIVE to reduce warning fatigue.
7. Cognitive-debt metrics remain local to the LATCH browser state unless a future user explicitly opts into telemetry.
8. Trusted replay remains exact-coordinate, single-use, and short-lived.

## Regression test

Run:

```bash
npm run test:cognitive-debt
```

The test verifies safe medium-risk habituation, regret recovery, permanent HIGH/CRITICAL protection, sensitive-data protection, rapid-approval detection, and refocus activation.

The design objective is not “few warnings.” It is **maximum safety value per unit of human attention**.
