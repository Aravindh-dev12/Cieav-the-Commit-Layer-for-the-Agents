# CIEAV Production Operations and Disaster Recovery Runbook

This runbook defines the minimum operational controls required before CIEAV production qualification. It does not itself prove that an exercise occurred; production qualification separately binds an external operations-exercise report to the exact release commit and version.

## Release authority boundary

Only an exact `main` commit that has passed the production evidence chain may be promoted. Production qualification must bind the exact release-runtime, physical hardware, real CUDA, live installer success/rollback, public deployment, supply-chain/SBOM, independent security-review, and operations-readiness evidence. A failed or missing evidence class blocks promotion.

No model, Cloud service, installer, or operator convenience path may mint CIEAV commit authority. Production operations preserve the same approval → permit → commit → receipt → observed outcome → undo boundary used by the product.

## Deployment and rollback

1. Build and sign the exact release from protected `main`.
2. Stage the signed publish layout without replacing the known-good public layout.
3. Verify Windows signatures, macOS notarization, release-manifest RSA signature, artifact SHA-256 and expected sizes.
4. Deploy immutable versioned runtime objects first.
5. Deploy signed manifest/signatures/installers only after all referenced objects are available.
6. Run `public-deployment-qualification` against the real Cloud and CDN.
7. If qualification fails, restore the previous signed manifest/installers and keep immutable prior runtime objects available.
8. Never roll forward from partially verified artifacts. A new attempt requires a newly qualified exact commit or a restoration of the previously qualified release.

## Cloud service incident response

For Cloud health degradation, TLS failure, privacy-contract failure, authentication failure, or inference corruption:

1. Declare the incident and freeze production promotion.
2. Preserve audit/log evidence while redacting credentials and user secrets.
3. Disable or isolate the failing Cloud revision through the hosting control plane.
4. Restore the last known-good Cloud revision and configuration.
5. Verify `/health`, enrollment, privacy-minimized inference and the synthetic critical-risk safety probe.
6. Re-run public deployment qualification before clearing the incident.
7. If Cloud remains unavailable, CIEAV clients must remain fail-closed/conservative according to deterministic local authority; Cloud interpretation must not become a bypass.

## CDN / release distribution incident response

If a public manifest, signature, installer, or runtime object differs from qualified evidence:

1. Freeze downloads and promotion where the CDN/provider allows it.
2. Restore the last known-good immutable release objects and signed manifest.
3. Purge mutable CDN cache entries for manifest/installers only after origin restoration.
4. Re-run the public deployment qualifier, which must verify exact bytes, SHA-256 and release RSA signature.
5. Treat unexplained artifact mutation as a security incident and rotate affected release credentials if compromise cannot be excluded.

## Backup and restore boundary

Production state that must have an independently restorable copy includes hosting configuration, deployment manifests, release metadata, signing public material, secret-manager configuration metadata, operational configuration, audit/incident evidence, and any server-side state required by the deployed Cloud service. Private signing keys and credentials must remain in approved secret/HSM systems and must not be copied into repository artifacts or ordinary backups.

A restore exercise must use an isolated recovery target where feasible, prove integrity of restored configuration/state, re-establish TLS and secret-manager bindings, and pass Cloud health plus public deployment qualification before being accepted.

## RTO and RPO

Production owners must declare release-specific RTO and RPO in the operations exercise evidence. The values are deployment obligations, not hard-coded product claims. An exercise passes only when measured recovery time is within the declared RTO and measured recoverable-data gap is within the declared RPO.

## Secret and signing-key rotation

Rotate credentials after suspected exposure, provider compromise, personnel/access changes requiring rotation, or according to the organization’s rotation policy.

Release-signing key rotation requires a deliberate trust-root transition. Never silently replace `CIEAV_RELEASE_SIGNING_KEY_ID`. Windows publisher identity and Apple Developer ID changes likewise require an explicit release trust update and fresh qualification. Cloud/API credentials, runner credentials and deployment credentials must be rotated through the provider secret store and must never be pasted into reports, logs, GitHub variables, or source files when they are secrets.

## Self-hosted runner operations

Physical qualification runners are production security infrastructure. Keep them patched, access-controlled, dedicated or strongly isolated, and free from unreviewed persistent jobs. Before qualification, verify required labels and online state. After sensitive jobs, scrub worktrees and ephemeral credentials. A hosted runner may validate syntax/policy but cannot substitute for TPM, Secure Enclave, CUDA, or live-installer physical evidence.

## Monitoring and alerting minimums

Monitor at least Cloud health/error rate, TLS/certificate expiry, deployment failures, CDN origin errors, artifact availability, release qualification failures, self-hosted runner availability, and signing/notarization failures. Alert routing and ownership must be defined by the production operator.

## Incident evidence and post-incident review

Record incident start/end, affected release/commit, detection source, operator actions, restored revision, evidence hashes where relevant, customer impact, and follow-up actions. Do not include raw secrets. A security-relevant incident requires post-incident review before the next production promotion.

## Production operations exercise acceptance

Before final production qualification, perform a real exercise against the intended production or production-equivalent infrastructure that demonstrates at minimum:

- Cloud rollback or restore to a known-good revision;
- CDN/release-layout restoration and exact-byte verification;
- backup/restore validation for required operational state;
- declared and measured RTO/RPO;
- secret-rotation procedure validation without exposing secret values;
- monitoring/alert delivery to the responsible operator;
- post-recovery public deployment qualification.

The exercise report must identify the exact CIEAV commit and version, date/time, responsible operator/organization, environment, declared and measured RTO/RPO, scenarios executed, result, unresolved risks, and a SHA-256-verifiable immutable report location. Final production qualification consumes the attested binding to that report; it does not infer exercise success from this runbook alone.
