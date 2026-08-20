# Windows TPM measured-boot implementation research — 2026-08-21

Status: **parser/replay foundation implemented; platform collector and measured-boot qualification remain pending**.

This note records the Windows ABI and TCG/WBCL details used to implement CIEAV's first measured-boot parsing/replay increment. It does not promote Windows measured boot to `VERIFIED`.

## Authoritative Windows ABI findings

Microsoft's generated Win32 metadata for `ncrypt.h` confirms:

- `NCRYPTBUFFER_TPM_PLATFORM_CLAIM_PCR_MASK = 80`
- `NCRYPTBUFFER_TPM_PLATFORM_CLAIM_NONCE = 81`
- `NCRYPTBUFFER_TPM_PLATFORM_CLAIM_STATIC_CREATE = 82`
- `NCRYPT_PLATFORM_ATTEST_MAGIC = 1146110288`, hexadecimal `0x44504150`
- `NCRYPT_TPM_PLATFORM_ATTESTATION_STATEMENT_CURRENT_VERSION = 0`
- `NCRYPT_TPM_PLATFORM_ATTESTATION_STATEMENT` is exactly six consecutive 32-bit fields:
  1. `Magic`
  2. `Version`
  3. `pcrAlg`
  4. `cbSignature`
  5. `cbQuote`
  6. `cbPcrs`

The current parser therefore treats the fixed statement header as 24 bytes, validates the exact magic/version, validates section lengths before slicing, rejects empty sections, and rejects trailing bytes.

An earlier scratch implementation used a placeholder magic value. It was caught during ABI review and was never attached to the branch. The committed parser uses only `0x44504150`.

## Azure Attestation protocol findings

Microsoft's Azure Attestation VBS protocol describes the TPM evidence envelope independently of CIEAV's local verifier:

- `srtm_boot_log` comes from `Tbsi_Get_TCG_Log_Ex` with `TBS_TCGLOG_SRTM_BOOT`;
- `srtm_resume_log` comes from `TBS_TCGLOG_SRTM_RESUME`;
- DRTM boot/resume logs have separate TBS log types;
- the AIK certificate is returned through `NCRYPT_CERTIFICATE_PROPERTY`;
- `current_claim` is returned by `NCryptCreateClaim` with `dwClaimType = NCRYPT_CLAIM_PLATFORM` and a PCR-mask parameter, and must incorporate the service challenge;
- `boot_claim` also uses `NCRYPT_CLAIM_PLATFORM`, but represents the boot PCR state rather than the freshly challenged current state.

This supports CIEAV's decision to treat current freshness, boot evidence and event logs as distinct evidence fields rather than collapsing them into one opaque "TPM passed" boolean.

## Microsoft TSS.MSR findings

Microsoft's TSS.MSR `PCPTool.v11` reference code provides useful parser/verification behavior:

- a TCG2/WBCL log begins with one legacy-format TCG event;
- that first event carries the `Spec ID Event03` descriptor;
- the descriptor declares the algorithm ID and digest size table;
- later TCG2 events carry a digest count followed by per-algorithm digests;
- the number of digests in an individual event may be a subset of the algorithms declared by firmware;
- the reference parser applies explicit boundary checks around descriptor, digest and event-data lengths;
- SHA-256 is preferred when available in the reference implementation;
- platform-attestation validation uses an AIK public key and nonce when the attestation is freshness-bound;
- the reference implementation can recompute software PCR values from a filtered WBCL and compare/validate platform attestation evidence.

CIEAV deliberately applies a stricter replay rule for its policy-selected bank: if an event extending a selected PCR does not carry the selected digest algorithm, replay fails closed instead of silently skipping that extension.

## CIEAV parser/replay scope implemented in this increment

`apps/api/src/windows-tpm-measured-boot.ts` now implements:

- exact Windows platform-attestation header parsing;
- maximum platform-claim size;
- TCG2-only WBCL parsing for the initial increment;
- exact `Spec ID Event03` recognition;
- descriptor version and algorithm-count checks;
- duplicate descriptor-algorithm rejection;
- exact digest sizes for SHA-1/SHA-256/SHA-384/SHA-512;
- bounded unknown descriptor digest sizes without pretending those algorithms are replay-supported;
- per-event digest-count bounds;
- duplicate event-digest rejection;
- rejection of event algorithms not declared by the descriptor;
- bounded event-data size and total event count;
- exact end-of-buffer consumption;
- SRTM replay for explicitly selected PCRs 0..15;
- `PCR := HASH(PCR || eventDigest)` replay;
- `EV_NO_ACTION` exclusion from PCR extension;
- fail-closed selected-bank behavior when the selected PCR event lacks that bank's digest;
- deterministic serialization of the selected reconstructed PCR table.

The initial PCR replay mask is intentionally restricted to 0..15 because the next collector increment is scoped to SRTM evidence. Extending the mask or adding DRTM requires an explicit policy/version change.

## What is intentionally not implemented yet

The following are still required before measured boot can become `VERIFIED`:

1. A native Windows collector for the raw `NCRYPT_CLAIM_PLATFORM` statement and TBS logs.
2. Confirmation of the exact `NCryptCreateClaim` subject/authority-key handle contract for `NCRYPT_CLAIM_PLATFORM`. Microsoft's public protocol specifies the claim type, PCR mask and challenge but does not state those two generic API arguments. CIEAV will not guess them.
3. Strict TPM 2.0 parsing of `TPMS_ATTEST` and `TPMT_SIGNATURE` inside the platform statement.
4. AIK signature verification over the quote using the already pinned AIK identity.
5. Exact challenge/nonce extraction and equality verification from the quote's `extraData` / qualifying-data field.
6. Exact `TPML_PCR_SELECTION` parsing and comparison against the policy-selected PCR mask/bank.
7. Validation that the quoted PCR digest corresponds to the reconstructed selected PCR values.
8. Collection and policy treatment of SRTM boot/current/resume logs without conflating their semantics.
9. Secure Boot/code-integrity policy derived from measured events rather than an unrelated OS boolean.
10. Adversarial/fuzz coverage for TPM quote/signature parsing in addition to WBCL parsing.
11. A physical measured-boot qualification run on the release TPM.

Until all required verification layers are implemented and the physical gate passes, CIEAV must continue to report Windows measured boot as **not qualified**.

## Assurance boundary

The previously qualified native Windows key-attestation lane remains unchanged. It proves exact TPM-bound key identity under the pinned AIK trust policy. This measured-boot work is additive and cannot retroactively change that qualification.

A future local measured-boot PASS would still be local attestation. It would add cryptographically verified PCR/event-log boot state, but it would not become equivalent to an independent remote verifier merely because more local TPM evidence is checked.
