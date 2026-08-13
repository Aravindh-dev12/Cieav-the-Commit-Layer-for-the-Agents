# CIEAV privacy architecture

CIEAV follows **cloud interpretation, local authority**. Durable user state, execution capability, receipts, browser profile, cognitive history, audit history, and signing material stay on the device. Remote inference receives only a reconstructed, privacy-reduced semantic packet.

## Remote model boundary

Before any supported remote model call, CIEAV rebuilds the action context from an explicit allowlist rather than forwarding the caller's object. The reduced packet may contain:

- origin and URL path, with credentials, query strings, and fragments removed;
- bounded/redacted title, clicked-control semantics, and nearby text;
- form field names, labels, types, required flags, and inferred data categories;
- generic file descriptors such as `[selected-file.pdf]`;
- deterministic baseline metadata such as action type, risk, reversibility, confidence, and data categories.

It intentionally excludes raw form values, passwords, OTP values, card values, file contents, raw filenames, full-page text, browsing history, receipt history, and local signing/control secrets. Common email, phone, card-like, OTP, API-key, and bearer-token patterns are redacted from permitted text fields.

The OpenAI-compatible and Hugging Face paths use the shared reducer. The Python CIEAV Cloud provider independently reconstructs its own minimized packet as a second egress boundary.

## Cloud ingress enforcement

CIEAV Cloud does not trust the client's privacy declaration alone. It independently rejects packets containing forbidden/unknown context fields, `pageText`, URL queries/fragments, raw filenames, unredacted form fields, unexpected baseline fields, or recognizable secret literals in permitted text fields.

Remote `CIEAV_CLOUD_URL` endpoints must use HTTPS. Plain HTTP is accepted only for loopback test servers. Authenticated Cloud requests do not follow redirects, so a configured CIEAV origin cannot silently redirect the device token or semantic packet to another origin.

## What the model can still learn

Privacy minimization is not anonymity. An origin/path, action type, nearby semantics, field metadata, and data-category labels can still reveal what service or type of action the user is interacting with. CIEAV therefore does not claim that every byte or every semantic fact stays on-device.

The precise promise is: **raw secrets and durable private state remain local; only minimized action evidence is transmitted transiently for configured semantic interpretation.**

## Post-action verification

Outcome verification runs locally. Bounded before/after DOM snapshots used for comparison are not persisted or sent to cloud inference. Receipts persist only generic evidence summaries. Inconclusive evidence becomes `UNKNOWN`, not success.

## Local state

Fresh installations use `~/.cieav/` or the per-user platform application directory. Existing `.latch` state may be reused during migration. Local state includes the dedicated Chromium profile, device identity, Action Receipts, Attention Health/cognitive-debt state, Gateway credentials, audit history and integrity material, and receipt-signing keys.

Action Receipts are sensitive browsing/action history. New managed receipts use receipt v3 and a persistent per-user Ed25519 device key. The private key stays local; receipts carry public verification material. Legacy v1/v2 HMAC receipts remain readable for migration.

Filesystem permissions are not equivalent to hardware-backed key protection. A fully compromised OS account may access CIEAV local state. OS keychain/TPM/Secure Enclave style storage remains an additional hardening layer.

## Local audit data

Audit records are metadata-oriented and exclude raw form values and raw page text. New events use a per-user HMAC-SHA256 chain, are fsync-backed before replay acknowledgement, and can be checked locally with `cieav audit verify`. Audit history is not cloud telemetry.
