# Linux TPM2 attestation foundation

CIEAV's Linux TPM path is deliberately separate from the existing PKCS#11 signing bridge. PKCS#11 reachability and signing capability are not, by themselves, evidence that a key is TPM-resident or that the host boot state is trusted.

## Trust model

The Linux TPM2 path is designed around TPM 2.0 attestation primitives:

- `TPM2_Certify` / `Esys_Certify` binds a TPM object Name to an attestation-key signature and caller nonce.
- `TPM2_Quote` / `Esys_Quote` binds selected PCR values to an attestation-key signature and caller nonce.
- the PC Client crypto-agile firmware event log provides measurement evidence that can be replayed against quoted PCR state.
- `MakeCredential` / `ActivateCredential` proves that the credentialed AK is resident in the same TPM as the EK used to wrap the credential secret.
- an EK certificate is only meaningful after an explicit certificate-path trust policy approves its issuer/root; CIEAV does not trust arbitrary EK certificates or network-fetched roots.

The current increment implements bounded quote/certify parsing, trusted-AK RSASSA/ECDSA signature verification, exact TPM public-area Name recomputation, subject signing-key JWK extraction, signed-quote/event-log replay binding, credential-activation enrollment mechanics, and versioned reference-PCR policy evaluation. It still does **not** create a durable `VERIFIED` Linux hardware attestation.

## Implemented foundation

`apps/api/src/linux-tpm2-attestation.ts`:

1. accepts raw `TPMS_ATTEST` or `TPM2B_ATTEST` framing;
2. requires `TPM_GENERATED_VALUE` and supports quote/certify attestations only;
3. verifies RSASSA/ECDSA AK signatures over the exact signed attestation bytes;
4. binds `extraData` to a verifier nonce;
5. validates quote `pcrDigest` against ordered selected PCR values;
6. computes object Name as `nameAlg || H(TPMT_PUBLIC)` from the exact serialized public area;
7. binds `TPM2_Certify` evidence to that recomputed Name.

`apps/api/src/linux-tpm2-public.ts` has separate subject-key and AK profiles:

- subject signing keys require `fixedTPM`, `fixedParent`, `sensitiveDataOrigin`, and `sign`, and reject `decrypt` and `restricted`;
- AKs require the same TPM-generated/fixed/signing properties and additionally require `restricted`;
- RSA or ECC only;
- ECC is restricted to NIST P-256 and extracted as an exact P-256 JWK;
- RSA is restricted to 2048–4096 bits with validated exponent and exact modulus/JWK extraction.

`apps/api/src/linux-tpm2-measured-boot.ts` binds firmware measurements to the signed quote:

- authenticates the quote with the trusted AK public key;
- parses the TCG crypto-agile `Spec ID Event03` event log using the existing bounded TCG2 parser;
- replays only quote-selected SRTM PCRs/banks;
- rejects selected PCRs outside the currently qualified 0–15 SRTM range;
- requires replayed PCR values to reproduce the signed quote's `pcrDigest`.

This proves consistency between the supplied firmware log and the AK-signed PCR state. It does **not** by itself decide whether that state is secure or acceptable.

`apps/api/src/linux-tpm2-ak-enrollment.ts` adds the verifier-side enrollment state machine:

- parses the EK X.509 certificate and enforces current validity, non-CA usage, supported RSA/P-256 key type, and the TCG EK Certificate EKU `2.23.133.8.1` when EKU is present;
- requires an injected EK trust verifier to approve the certificate path/policy;
- computes the exact AK Name from the restricted AK public area;
- generates a fresh 32-byte enrollment secret;
- issues a MakeCredential challenge bound to the EK public key and AK Name;
- accepts the activation secret once, with expiry and replay protection;
- zeroes the in-memory enrollment secret after successful activation.

`apps/api/src/linux-tpm2-make-credential.ts` and `apps/api/src/linux-tpm2-activate-credential.ts` provide a pinned tpm2-tools execution path:

- `tpm2_makecredential` runs offline with `TPM2TOOLS_TCTI=none`, a validated EK PEM, exact AK Name and a private secret file;
- current tpm2-tools combined credential-blob format is used end to end;
- `tpm2_activatecredential` consumes that combined blob using configured persistent AK/EK handles;
- both executables must be absolute, regular, non-symlink files with exact SHA-256 pins;
- both runners use `shell:false`, bounded stdout/stderr, private temporary files and strict timeouts.

`apps/api/src/linux-tpm2-boot-policy.ts` separates cryptographic consistency from policy acceptance:

- policies have stable IDs, explicit validity windows and exact PCR reference sets;
- policy-required PCRs must be part of the signed quote selection;
- digest comparison is constant-time;
- a UEFI Secure Boot reference profile requires PCR 7 coverage;
- success is reported as `REFERENCE_PCR_POLICY_VERIFIED`, not as a blanket Secure Boot or platform-trust claim.

`TPM_ALG_RSAPSS` attestation signatures remain deliberately rejected until CIEAV pins and tests salt-policy semantics across supported TPM stacks.

## Deliberately not qualified yet

Before Linux TPM-backed keys may enter the durable CIEAV hardware registry as `VERIFIED`, a production verifier must additionally provide all of the following:

- an explicitly configured and audited EK manufacturer/deployment root and intermediate certificate policy, including certificate-path validation and a defined revocation strategy;
- verifier-owned nonce issuance/replay persistence across process restarts and evidence lifetime policy;
- approved reference-integrity data for each supported hardware/firmware/boot profile, ideally sourced from vendor RIMs or an independently managed qualification pipeline rather than copied from an untrusted host;
- a physical Linux collector/verifier with pinned binary/configuration provenance and exact EK/AK persistent-handle verification;
- qualification on supported distributions, boot loaders, firmware implementations and TPM vendors;
- a dedicated durable Linux TPM attestation kind and registry/API activation only after those trust requirements are satisfied.

Until then, `/v1/agent-kernel/hardware-key-providers/linux/attest` remains fail-closed with `linux_hardware_attestation_verifier_required`, and PKCS#11 remains a signing adapter rather than trusted hardware evidence.
