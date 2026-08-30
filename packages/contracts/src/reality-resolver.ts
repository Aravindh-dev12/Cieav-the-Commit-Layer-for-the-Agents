import {z} from "zod";
import {RealityAddressSchema} from "./consequence-algebra.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const CanonicalRealityResolverManifestSchema=z.object({
  version:z.literal("CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1"),
  id:z.string().min(1).max(200),
  resolverVersion:z.string().min(1).max(100),
  supportedNamespaces:z.array(z.string().min(1).max(120)).min(1).max(50),
  supportedResourceKinds:z.array(z.string().min(1).max(120)).min(1).max(50),
  normalizationClass:z.enum(["EMAIL_ADDRESS","HTTP_RESOURCE","FILESYSTEM_PATH","GIT_REF","OPAQUE_RESOURCE"]),
  manifestDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type CanonicalRealityResolverManifest=z.infer<typeof CanonicalRealityResolverManifestSchema>;

export const CanonicalRealityResolutionRequestSchema=z.object({
  version:z.literal("CIEAV_CANONICAL_REALITY_RESOLUTION_REQUEST_V1"),
  routeNativeIdentity:z.string().min(1).max(4000),
  namespace:z.string().min(1).max(120),
  authorityDomain:z.string().min(1).max(300),
  resourceKind:z.string().min(1).max(120),
  aliases:z.array(z.string().min(1).max(4000)).max(100).default([]),
  parentRefs:z.array(RefSchema).max(32).default([]),
  identityEvidenceRefs:z.array(RefSchema).min(1).max(100),
  context:z.record(z.string().max(120),z.string().max(4000)).default({}),
  authority:z.literal(false).default(false)
});
export type CanonicalRealityResolutionRequest=z.infer<typeof CanonicalRealityResolutionRequestSchema>;

export const CanonicalRealityResolutionSchema=z.object({
  version:z.literal("CIEAV_CANONICAL_REALITY_RESOLUTION_V1"),
  requestDigest:DigestSchema,
  resolverManifestDigest:DigestSchema,
  address:RealityAddressSchema,
  canonicalRealityRef:DigestSchema,
  verificationRefs:z.array(RefSchema).min(1).max(100),
  resolutionDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type CanonicalRealityResolution=z.infer<typeof CanonicalRealityResolutionSchema>;

export const CanonicalRealityResolverRegistrationSchema=z.object({
  manifest:CanonicalRealityResolverManifestSchema,
  enabled:z.boolean().default(true),
  registeredAt:z.string().datetime(),
  registrationDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type CanonicalRealityResolverRegistration=z.infer<typeof CanonicalRealityResolverRegistrationSchema>;
