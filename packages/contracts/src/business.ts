import {z} from "zod";

export const BusinessEntityKindSchema=z.enum(["PERSON","AGENT","CUSTOMER","VENDOR","APPLICATION","ACCOUNT","ASSET","RESOURCE","WORKFLOW","PAYMENT","SUBSCRIPTION","CONTRACT","ORDER","DEPLOYMENT","OTHER"]);
export type BusinessEntityKind=z.infer<typeof BusinessEntityKindSchema>;
export const BusinessEntityRefSchema=z.object({kind:BusinessEntityKindSchema,id:z.string().min(1).max(300),displayName:z.string().min(1).max(300).optional()}).strict();
export type BusinessEntityRef=z.infer<typeof BusinessEntityRefSchema>;
export const StateValueSchema=z.union([z.string().max(4000),z.number().finite(),z.boolean(),z.null()]);
export type StateValue=z.infer<typeof StateValueSchema>;
export const StateOperatorSchema=z.enum(["EQUALS","NOT_EQUALS","EXISTS","ABSENT","AT_MOST","AT_LEAST","CONTAINS"]);
export const BusinessFactProvenanceSchema=z.enum(["CIEAV_OBSERVER","TRUSTED_CONNECTOR","EXTERNAL_SIGNED","HUMAN_ATTESTATION","AGENT_REPORT","UNVERIFIED"]);
export type BusinessFactProvenance=z.infer<typeof BusinessFactProvenanceSchema>;

export const DesiredStateAssertionSchema=z.object({id:z.string().uuid(),entity:BusinessEntityRefSchema,field:z.string().min(1).max(240),operator:StateOperatorSchema,expected:StateValueSchema.optional(),severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),description:z.string().max(1000).optional(),expectedBy:z.string().datetime().optional()}).strict();
export type DesiredStateAssertion=z.infer<typeof DesiredStateAssertionSchema>;
export const DesiredStateAssertionCreateSchema=DesiredStateAssertionSchema.omit({id:true});
export const ObservedBusinessFactSchema=z.object({entity:BusinessEntityRefSchema,field:z.string().min(1).max(240),value:StateValueSchema.optional(),exists:z.boolean().default(true),observedAt:z.string().datetime(),source:z.string().min(1).max(300),confidence:z.number().min(0).max(1).default(1),provenance:BusinessFactProvenanceSchema.optional()}).strict();
export type ObservedBusinessFact=z.infer<typeof ObservedBusinessFactSchema>;
export const ObservedBusinessFactCreateSchema=ObservedBusinessFactSchema.omit({observedAt:true,provenance:true});

export const BusinessRealityPlanSchema=z.object({id:z.string().uuid(),organizationId:z.string().min(1).max(300),name:z.string().min(1).max(300),createdAt:z.string().datetime(),intentId:z.string().uuid().optional(),assertions:z.array(DesiredStateAssertionSchema).min(1).max(5000)}).strict();
export type BusinessRealityPlan=z.infer<typeof BusinessRealityPlanSchema>;
export const BusinessRealityPlanCreateSchema=z.object({organizationId:z.string().min(1).max(300),name:z.string().min(1).max(300),intentId:z.string().uuid(),assertions:z.array(DesiredStateAssertionCreateSchema).min(1).max(5000)}).strict();
export type BusinessRealityPlanCreate=z.infer<typeof BusinessRealityPlanCreateSchema>;
export const ReconciliationStatusSchema=z.enum(["MATCH","MISMATCH","MISSING_EVIDENCE","OVERDUE"]);
export const ReconciliationDifferenceSchema=z.object({assertionId:z.string().uuid(),status:ReconciliationStatusSchema,severity:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),expected:z.string().max(2000),observed:z.string().max(2000),explanation:z.string().max(2000)}).strict();
export type ReconciliationDifference=z.infer<typeof ReconciliationDifferenceSchema>;
export const BusinessReconciliationSchema=z.object({planId:z.string().uuid(),organizationId:z.string(),evaluatedAt:z.string().datetime(),healthy:z.boolean(),matched:z.number().int().nonnegative(),mismatched:z.number().int().nonnegative(),missingEvidence:z.number().int().nonnegative(),overdue:z.number().int().nonnegative(),differences:z.array(ReconciliationDifferenceSchema).max(5000)}).strict();
export type BusinessReconciliation=z.infer<typeof BusinessReconciliationSchema>;
export const BusinessRealityRecordSchema=z.object({plan:BusinessRealityPlanSchema,facts:z.array(ObservedBusinessFactSchema).max(20_000),reconciliation:BusinessReconciliationSchema,openLoops:z.record(z.string().uuid()).default({}),updatedAt:z.string().datetime()}).strict();
export type BusinessRealityRecord=z.infer<typeof BusinessRealityRecordSchema>;
