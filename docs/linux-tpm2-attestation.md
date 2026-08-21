# Linux TPM2 attestation foundation

CIEAV's Linux TPM path is deliberately separate from the existing PKCS#11 signing bridge. PKCS#11 reachability and signing capability are not, by themselves, evidence that a key is TPM-resident or that the host boot state is trusted.

## Trust model

The Linux TPM2 path is designed around TPM 2.0 attestation primitives:

- `TPM2_Certify` / `Esys_Certify` binds a TPM object Name to an attestation-key signature and caller nonce.
- `TPM2_Quote` / `Esys_Quote` binds selected PCR values to an attestation-key signature and caller nonce.
- firmware measurement logs provide event evidence that can be replayed against quoted PCR state.

The current increment implements bounded quote/certify parsing, trusted-AK RSASSA/ECDSA signature verification, exact TPM public-area Name recomputation, and a narrow subject-signing-key policy that extracts the public key for exact JWK binding. It still does **not** create a durable `VERIFIED` hardware attestation.

## Implemented foundation

`apps/api/src/linux-tpm2-attestation.ts`:

1. accepts either raw `TPMS_ATTEST` bytes or `TPM2B_ATTEST` framing;
2. requires `TPM_GENERATED_VALUE` and supports quote/certify attestations only;
3. parses bounded TPM2B fields, clock metadata, PCR selections, quote digest, certified Name and qualified Name;
4. parses TPM-format RSASSA and ECDSA signatures and verifies them over the exact signed `TPMS_ATTEST` bytes using a supplied trusted AK public key;
5. binds `extraData` to a verifier nonce with constant-time comparison;
6. validates quote `pcrDigest` against the ordered selected PCR values;
7. computes the object Name as `nameAlg || H(TPMT_PUBLIC)` from the exact serialized public-area bytes;
8. binds `TPM2_Certify` evidence to that recomputed Name.

`apps/api/src/linux-tpm2-public.ts` adds the subject-key policy used for CIEAV signing keys:

- accepts only RSA or ECC public areas;
- requires `fixedTPM`, `fixedParent`, `sensitiveDataOrigin`, and `sign`;
- rejects subject keys marked `decrypt` or `restricted`;
- requires a NULL symmetric definition for the unrestricted signing-key profile;
- for ECC, accepts only NIST P-256 and extracts exact X/Y coordinates into a P-256 JWK;
- for RSA, accepts 2048–4096-bit moduli, validates the exponent, and extracts the exact RSA JWK;
- rejects unsupported schemes, curves, malformed unique fields and trailing bytes.

`TPM_ALG_RSAPSS` attestation signatures remain deliberately rejected until CIEAV pins and tests salt-policy semantics across supported TPM stacks.

## Deliberately not qualified yet

Before Linux TPM-backed keys may enter the durable CIEAV hardware registry as `VERIFIED`, a production verifier must additionally provide all of the following:

- a trusted attestation-key identity rooted in an explicitly configured endorsement/manufacturer or deployment trust policy, rather than merely accepting a caller-supplied AK JWK;
- verifier-owned fresh nonce generation, replay tracking and evidence lifetime policy;
- collection of live PCR values plus firmware event-log replay for the selected banks;
- a versioned boot-state policy defining acceptable Secure Boot, firmware and PCR state;
- a physical Linux TPM collector/verifier with pinned binary/configuration provenance;
- qualification on supported Linux distributions and TPM implementations;
- a dedicated durable Linux TPM attestation kind and registry/API activation only after the above evidence is satisfied.

Until those conditions are met, `/v1/agent-kernel/hardware-key-providers/linux/attest` remains fail-closed with `linux_hardware_attestation_verifier_required`, and PKCS#11 remains a signing adapter rather than trusted hardware evidence.
