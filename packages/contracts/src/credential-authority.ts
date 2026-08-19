import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);

export const KeyProviderSchema=z.enum(["LOCAL_WRAPPED_P256","TPM","SECURE_ENCLAVE","SPIFFE","EXTERNAL_KMS"]);
export const KeyPurposeSchema=z.enum(["OAUTH_CLIENT_ASSERTION","DPOP","HTTP_MESSAGE_SIGNATURE","MTLS_CLIENT_AUTH","PROVIDER_SIGNING"]);
export const KeyHandleSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),alias:z.string().regex(/^[A-Za-z0-9._-]{1,120}$/),provider:KeyProviderSchema,algorithm:z.literal("ES256"),
  publicJwk:z.object({kty:z.literal("EC"),crv:z.literal("P-256"),x:z.string().min(1),y:z.string().min(1)}).strict(),publicKeyFingerprint:DigestSchema,
  hardwareBacked:z.boolean(),exportable:z.literal(false),purposes:z.array(KeyPurposeSchema).min(1).max(10),createdAt:z.string().datetime(),expiresAt:z.string().datetime().optional(),revokedAt:z.string().datetime().optional()
}).strict();
export type KeyHandle=z.infer<typeof KeyHandleSchema>;

export const OAuthGrantTypeSchema=z.enum(["CLIENT_CREDENTIALS","TOKEN_EXCHANGE"]);
export const SenderConstraintSchema=z.enum(["NONE","DPOP","MTLS"]);
export const CredentialDerivationContractSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),proposalId:z.string().uuid(),taskId:z.string().uuid(),intentId:z.string().uuid(),executionTicketId:z.string().uuid(),realityBoundCommitId:z.string().uuid(),credentialLeaseId:z.string().uuid(),
  toolId:z.string().min(1).max(240),operation:z.string().min(1).max(240),routeDigest:DigestSchema,normalizedArgumentsDigest:DigestSchema,
  profileId:z.string().min(1).max(160),grantType:OAuthGrantTypeSchema,resource:z.string().min(1).max(2000),audience:z.string().min(1).max(2000),scopes:z.array(z.string().min(1).max(240)).max(100),
  senderConstraint:SenderConstraintSchema,keyHandleId:z.string().uuid().optional(),maxTokenLifetimeSeconds:z.number().int().min(5).max(3600),maxUses:z.literal(1),risk:RiskSchema,
  authorizationDetailsDigest:DigestSchema.optional(),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),bindingDigest:DigestSchema
}).strict();
export type CredentialDerivationContract=z.infer<typeof CredentialDerivationContractSchema>;

export const CredentialDerivationReceiptSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),contractId:z.string().uuid(),proposalId:z.string().uuid(),executionTicketId:z.string().uuid(),toolId:z.string().min(1).max(240),profileId:z.string().min(1).max(160),grantType:OAuthGrantTypeSchema,
  tokenEndpointDigest:DigestSchema,resourceDigest:DigestSchema,scopeDigest:DigestSchema,senderConstraint:SenderConstraintSchema,keyHandleId:z.string().uuid().optional(),
  tokenType:z.enum(["Bearer","DPoP"]),accessTokenDigest:DigestSchema,requestDigest:DigestSchema,normalizedArgumentsDigest:DigestSchema,derivedAt:z.string().datetime(),expiresAt:z.string().datetime()
}).strict();
export type CredentialDerivationReceipt=z.infer<typeof CredentialDerivationReceiptSchema>;
