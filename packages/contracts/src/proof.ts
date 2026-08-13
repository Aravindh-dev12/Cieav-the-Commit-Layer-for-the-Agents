import {z} from "zod";
import {ProofEvidenceKindSchema} from "./reality.js";

export const ProofSignalSchema=z.enum(["SUPPORTS","CONTRADICTS","NEUTRAL"]);
export type ProofSignal=z.infer<typeof ProofSignalSchema>;
export const ProofProvenanceSchema=z.enum(["CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION","AGENT_REPORT","UNVERIFIED"]);
export type ProofProvenance=z.infer<typeof ProofProvenanceSchema>;

export const ProofRequirementSchema=z.object({kind:ProofEvidenceKindSchema,required:z.boolean().default(true),minConfidence:z.number().min(0).max(1).default(.7)}).strict();
export type ProofRequirement=z.infer<typeof ProofRequirementSchema>;
export const ProofPlanSchema=z.object({expectedState:z.array(z.string().min(1).max(1000)).min(1).max(40),requirements:z.array(ProofRequirementSchema).max(30).default([]),deadline:z.string().datetime().optional()}).strict();
export type ProofPlan=z.infer<typeof ProofPlanSchema>;
export const ProofObservationSchema=z.object({id:z.string().uuid(),kind:ProofEvidenceKindSchema,signal:ProofSignalSchema,summary:z.string().min(1).max(1000),observedAt:z.string().datetime(),source:z.string().min(1).max(300).optional(),digest:z.string().max(256).optional(),confidence:z.number().min(0).max(1),provenance:ProofProvenanceSchema.optional()}).strict();
export type ProofObservation=z.infer<typeof ProofObservationSchema>;
export const ProofObservationCreateSchema=z.object({kind:ProofEvidenceKindSchema,signal:ProofSignalSchema,summary:z.string().min(1).max(1000),source:z.string().min(1).max(300).optional(),digest:z.string().max(256).optional(),confidence:z.number().min(0).max(1)}).strict();
export type ProofObservationCreate=z.infer<typeof ProofObservationCreateSchema>;
export const ProofSettlementStatusSchema=z.enum(["PROVEN","PARTIAL","PENDING","CONTRADICTED","UNKNOWN","FAILED"]);
export type ProofSettlementStatus=z.infer<typeof ProofSettlementStatusSchema>;
export const ProofAssessmentSchema=z.object({status:ProofSettlementStatusSchema,confidence:z.number().min(0).max(1),evaluatedAt:z.string().datetime(),supporting:z.array(ProofObservationSchema).max(100),contradicting:z.array(ProofObservationSchema).max(100),neutral:z.array(ProofObservationSchema).max(100),missingRequired:z.array(ProofEvidenceKindSchema).max(30),warnings:z.array(z.string().max(700)).max(30).default([])}).strict();
export type ProofAssessment=z.infer<typeof ProofAssessmentSchema>;

export const ProofCaseSchema=z.object({id:z.string().uuid(),intentId:z.string().uuid(),receiptId:z.string().uuid().optional(),openLoopId:z.string().uuid().optional(),plan:ProofPlanSchema,observations:z.array(ProofObservationSchema).max(200).default([]),assessment:ProofAssessmentSchema,createdAt:z.string().datetime(),updatedAt:z.string().datetime()}).strict();
export type ProofCase=z.infer<typeof ProofCaseSchema>;
export const ProofCaseCreateSchema=z.object({intentId:z.string().uuid(),receiptId:z.string().uuid().optional(),openLoopId:z.string().uuid().optional(),plan:ProofPlanSchema}).strict();
export type ProofCaseCreate=z.infer<typeof ProofCaseCreateSchema>;
