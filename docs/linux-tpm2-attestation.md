# Linux TPM2 attestation foundation

CIEAV's Linux TPM path is deliberately separate from the existing PKCS#11 signing bridge. PKCS#11 reachability and signing capability are not, by themselves, evidence that a key is TPM-resident or that the host boot state is trusted.

## Trust model

The Linux TPM2 path is designed around TPM 2.0 attestation primitives:

- `TPM2_Certify` / `Esys_Certify` binds a TPM object Name to an attestation-key signature and caller nonce.
- `TPM2_Quote` / `Esys_Quote` binds selected PCR values to an attestation-key signature and caller nonce.
- the PC Client crypto-agile firmware event log provides measurement evidence that can be replayed against quoted PCR state.

The current increment implements bounded quote/certify parsing, trusted-AK RSASSA/ECDSA signature verification, exact TPM public-area Name recomputation, subject signing-key JWK extraction, and signed-quote/event-log replay binding. It still does **not** create a durable `VERIFIED` hardware attestation.

## Implemented foundation

`apps/api/src/linux-tpm2-attestation.ts`:

1. accepts raw `TPMS_ATTEST` or `TPM2B_ATTEST` framing;
2. requires `TPM_GENERATED_VALUE` and supports quote/certify attestations only;
3. verifies RSASSA/ECDSA AK signatures over the exact signed attestation bytes;
4. binds `extraData` to a verifier nonce;
5. validates quote `pcrDigest` against ordered selected PCR values;
6. computes object Name as `nameAlg || H(TPMT_PUBLIC)` from the exact serialized public area;
7. binds `TPM2_Certify` evidence to that recomputed Name.

`apps/api/src/linux-tpm2-public.ts` enforces the subject signing-key profile:

- RSA or ECC only;
- requires `fixedTPM`, `fixedParent`, `sensitiveDataOrigin`, and `sign`;
- rejects `decrypt` and `restricted` for the subject key;
- requires NULL symmetric parameters;
- ECC is restricted to NIST P-256 and extracted as an exact P-256 JWK;
- RSA is restricted to 2048–4096 bits with validated exponent and exact modulus/JWK extraction.

`apps/api/src/linux-tpm2-measured-boot.ts` binds firmware measurements to the signed quote:

- authenticates the quote with the trusted AK public key;
- parses the TCG crypto-agile `Spec ID Event03` event log using the existing bounded TCG2 parser;
- replays only quote-selected SRTM PCRs/banks;
- rejects selected PCRs outside the currently qualified 0–15 SRTM range;
- requires replayed PCR values to reproduce the signed quote's `pcrDigest`.

This proves consistency between the supplied firmware log and the AK-signed PCR state. It does **not** decide whether that state is secure or acceptable.

`TPM_ALG_RSAPSS` attestation signatures remain deliberately rejected until CIEAV pins and tests salt-policy semantics across supported TPM stacks.

## Deliberately not qualified yet

Before Linux TPM-backed keys may enter the durable CIEAV hardware registry as `VERIFIED`, a production verifier must additionally provide all of the following:

- AK identity rooted in an explicitly configured EK/manufacturer or deployment trust policy, including credential activation or equivalent proof that the AK belongs to the endorsed TPM;
- verifier-owned nonce issuance, replay tracking and evidence lifetime policy;
- a versioned boot acceptance policy defining acceptable Secure Boot, firmware, PCR and reference-integrity state;
- a physical Linux collector/verifier with pinned binary/configuration provenance;
- qualification on supported distributions, firmware implementations and TPM vendors;
- a dedicated durable Linux TPM attestation kind and registry/API activation only after those trust requirements are satisfied.

Until then, `/v1/agent-kernel/hardware-key-providers/linux/attest` remains fail-closed with `linux_hardware_attestation_verifier_required`, and PKCS#11 remains a signing adapter rather than trusted hardware evidence.
