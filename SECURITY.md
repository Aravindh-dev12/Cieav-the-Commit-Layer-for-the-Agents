# Security policy and threat model

LATCH is a high-trust browser component. A compromised extension could observe or interfere with arbitrary websites, so security boundaries are part of the product architecture rather than optional hardening.

## Threats considered

### Hostile page content / prompt injection

All DOM text is attacker-controlled. The model is never allowed to execute instructions found on a page. It receives a bounded semantic snapshot and must return a strict JSON schema. Model output cannot downgrade deterministic risk or reversibility.

### Secret exfiltration

The content script does not include raw form values in `ActionContext`. It sends field names, labels, types, required flags, and inferred data categories. Nearby text is redacted before transmission. File names are converted into generic extension-only descriptors before model analysis.

This reduces exposure but is not perfect: visible page text may itself contain sensitive information that redaction heuristics miss. Users can select local-only mode to disable backend/model analysis entirely.

### Over-broad browser privileges

The current global mode requests access to `http://*/*` and `https://*/*` because universal interception is the product's core behavior. This must be treated as a sensitive permission. A production Chrome Web Store release should evaluate optional host permissions and staged site enablement where product UX permits it.

### False reversibility

Never promise an undo path that cannot be proven. Generic actions should remain `UNKNOWN` or `COMPENSABLE` unless an inverse can be established. Native adapters may upgrade guarantees only when the adapter can verify the inverse operation.

### Malicious site declarations

`data-latch-*` declarations are hints only. They cannot lower risk or make an unknown action safely reversible.

### Local API abuse

The standalone service accepts only Chrome-extension and localhost development origins by default, rejects other browser origins, caps request bodies, and applies basic in-memory rate limits. Production deployments should additionally bind access to real accounts/device registration and infrastructure-grade rate limiting.

### API compromise

Production deployment should:

- terminate TLS at a trusted proxy/load balancer;
- replace development secrets;
- rotate receipt/JWT secrets;
- rate-limit device registration and analysis;
- isolate model credentials server-side;
- encrypt database volumes/backups;
- implement structured security logging without raw page contents;
- deploy CSP and origin restrictions for dashboards;
- use a real account/identity layer before multi-device syncing.

## Reporting

Do not publish exploitable vulnerabilities before maintainers have had a reasonable chance to remediate them.
