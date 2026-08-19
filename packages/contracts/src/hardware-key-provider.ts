import {z} from "zod";
import {KeyProviderSchema,KeyPurposeSchema} from "./credential-authority.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
export const HardwareProviderSchema=KeyProviderSchema.exclude(["LOCAL_WRAPPED_P256","SPIFFE"]);
export type HardwareProvider=z.infer<typeof HardwareProviderSchema>;
export const ProviderPlatformSchema=z.enum(["WINDOWS","MACOS","LINUX","ANY"]);
export type ProviderPlatform=z.infer<typeof ProviderPlatformSchema>;
export const ProviderCapabilitySchema=z.enum(["CREATE_P256","CREATE_RSA_2048","SIGN_ES256","SIGN_RS256","MTLS_CLIENT_AUTH","ATTEST_KEY"]);
export type ProviderCapability=z.infer<typeof ProviderCapabilitySchema>;
export const ProviderBridgeManifestSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),version:z.literal(1),provider:HardwareProviderSchema,platform:ProviderPlatformSchema,
  executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,protocol:z.literal("CIEAV_KEY_PROVIDER_V1"),
  capabilities:z.array(ProviderCapabilitySchema).min(1).max(16),allowedPurposes:z.array(KeyPurposeSchema).min(1).max(16),
  providerLocator:z.string().min(1).max(1000),enabled:z.boolean(),createdAt:z.string().datetime(),expiresAt:z.string().datetime().optional()
}).strict();
export type ProviderBridgeManifest=z.infer<typeof ProviderBridgeManifestSchema>;

export const HardwareAttestationKindSchema=z.enum(["WINDOWS_TPM_KEY_ATTESTATION","APPLE_SECURE_ENCLAVE_KEY","PKCS11_TOKEN_KEY","EXTERNAL_KMS_KEY"]);
export const HardwareKeyAttestationSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),providerManifestId:z.string().min(1).max(160),provider:HardwareProviderSchema,
  kind:HardwareAttestationKindSchema,publicKeyFingerprint:DigestSchema,evidenceDigest:DigestSchema,claimsDigest:DigestSchema,
  verification:z.enum(["VERIFIED","REJECTED","UNVERIFIED"]),verifiedBy:z.string().min(1).max(300),verifiedAt:z.string().datetime(),expiresAt:z.string().datetime().optional(),reason:z.string().max(1000).optional()
}).strict();
export type HardwareKeyAttestation=z.infer<typeof HardwareKeyAttestationSchema>;

export const HardwarePublicJwkSchema=z.discriminatedUnion("kty",[
  z.object({kty:z.literal("EC"),crv:z.literal("P-256"),x:z.string().min(1),y:z.string().min(1)}).strict(),
  z.object({kty:z.literal("RSA"),n:z.string().min(32),e:z.string().min(1)}).strict()
]);
export type HardwarePublicJwk=z.infer<typeof HardwarePublicJwkSchema>;
export const HardwareKeyAlgorithmSchema=z.enum(["ES256","RS256"]);
export const HardwareKeyRegistrationSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),alias:z.string().regex(/^[A-Za-z0-9._-]{1,120}$/),provider:HardwareProviderSchema,providerManifestId:z.string().min(1).max(160),attestationId:z.string().uuid(),
  providerKeyLocator:z.string().min(1).max(1000).optional(),algorithm:HardwareKeyAlgorithmSchema.default("ES256"),publicJwk:HardwarePublicJwkSchema,publicKeyFingerprint:DigestSchema,
  purposes:z.array(KeyPurposeSchema).min(1).max(16),hardwareBacked:z.literal(true),exportable:z.literal(false),createdAt:z.string().datetime(),expiresAt:z.string().datetime().optional(),revokedAt:z.string().datetime().optional()
}).strict().superRefine((value,ctx)=>{if(value.algorithm==="ES256"&&value.publicJwk.kty!=="EC")ctx.addIssue({code:z.ZodIssueCode.custom,message:"ES256 hardware key requires EC P-256 public JWK"});if(value.algorithm==="RS256"&&value.publicJwk.kty!=="RSA")ctx.addIssue({code:z.ZodIssueCode.custom,message:"RS256 hardware key requires RSA public JWK"})});
export type HardwareKeyRegistration=z.infer<typeof HardwareKeyRegistrationSchema>;
