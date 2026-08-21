# Linux TPM2 attestation foundation

CIEAV's Linux TPM path is deliberately separate from the existing PKCS#11 signing bridge. PKCS#11 reachability and signing capability are not, by themselves, evidence that a key is TPM-resident or that the host boot state is trusted.

## Trust model

The Linux TPM2 path is designed around TPM 2.0 attestation primitives:

- `TPM2_Certify` / `Esys_Certify` binds a TPM object Name to an attestation-key signature and caller nonce.
- `TPM2_Quote` / `Esys_Quote` binds selected PCR values to an attestation-key signature and caller nonce.
- firmware measurement logs provide event evidence that can be replayed against quoted PCR state.

The current increment implements a bounded parser, quote/certify binding checks, and trusted-AK cryptographic signature verification for RSASSA and ECDSA. It still does **not** create a durable `VERIFIED` hardware attestation.

## Implemented foundation

`apps/api/src/linux-tpm2-attestation.ts`:

1. accepts either raw `TPMS_ATTEST` bytes or the common `TPM2B_ATTEST` size-prefixed form;
2. requires `TPM_GENERATED_VALUE` and supports only `TPM_ST_ATTEST_QUOTE` and `TPM_ST_ATTEST_CERTIFY`;
3. parses bounded TPM2B fields, clock/reset/restart/safe/firmware metadata, PCR selections, quote PCR digest, certified Name and qualified Name;
4. parses TPM-format `TPMT_SIGNATURE` for `TPM_ALG_RSASSA` and `TPM_ALG_ECDSA`;
5. verifies the attestation signature over the exact `TPMS_ATTEST` bytes using a supplied trusted AK public JWK;
6. converts TPM ECDSA `signatureR`/`signatureS` to DER before OpenSSL/Node verification;
7. binds `extraData` to a caller nonce using constant-time comparison;
8. verifies a quote's `pcrDigest` against the ordered concatenation of the selected PCR values using the attestation signing hash algorithm;
9. verifies certify evidence against the expected TPM Name and optional qualified Name;
10. rejects truncation, unsupported hash banks, duplicate banks, empty PCR selections, missing PCR values, digest-size mismatches, trailing data, wrong key types, bad signatures and unsupported signature schemes.

`TPM_ALG_RSAPSS` is deliberately rejected with `linux_tpm2_signature_rsapss_unqualified` until CIEAV pins and tests its TPM/host verification salt-policy semantics across supported TPM stacks.

## Deliberately not qualified yet

Before Linux TPM-backed keys may enter the durable CIEAV hardware registry as `VERIFIED`, a production verifier must additionally provide all of the following:

- a trusted attestation-key identity or an explicitly configured endorsement/manufacturer trust policy;
- TPM object public-area validation and recomputation of the certified TPM Name rather than accepting an externally supplied expected Name;
- fresh nonce generation and replay protection owned by the verifier;
- PCR collection and firmware event-log replay for the configured PCR banks;
- a versioned boot-state policy defining which PCR/Secure-Boot/firmware states are acceptable;
- RSAPSS support if required by the supported AK policy;
- physical Linux TPM qualification on supported distributions and TPM implementations;
- evidence provenance tying verifier binary/configuration hashes to the qualification result.

Until those conditions are met, `/v1/agent-kernel/hardware-key-providers/linux/attest` remains fail-closed with `linux_hardware_attestation_verifier_required`, and PKCS#11 continues to be treated as a signing adapter rather than trusted hardware evidence.
