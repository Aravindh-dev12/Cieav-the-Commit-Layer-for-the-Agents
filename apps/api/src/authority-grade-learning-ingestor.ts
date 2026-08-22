import {z} from "zod";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";
import type {CieavUniversalIntelligenceStore} from "./universal-intelligence-store.js";
import {exportAuthorityGradeTrajectory} from "./authority-grade-learning-export.js";

const TrustedExperienceFromTicketSchema=z.object({
  executionTicketId:z.string().uuid(),
  redactionProfile:z.string().min(1).max(300),
  consentScope:z.string().min(1).max(300).optional()
}).strict();

export class CieavAuthorityGradeLearningIngestor{
  constructor(
    private readonly kernel:CieavAgentKernelStore,
    private readonly proofStore:CieavProofStore,
    private readonly intelligenceStore:CieavUniversalIntelligenceStore
  ){}

  async ingestFromTicket(raw:unknown){
    const input=TrustedExperienceFromTicketSchema.parse(raw);
    const exported=await exportAuthorityGradeTrajectory(this.kernel,this.proofStore,input.executionTicketId,{redactionProfile:input.redactionProfile,...(input.consentScope?{consentScope:input.consentScope}:{})});
    const learning=await this.intelligenceStore.ingestVerifiedExperience(exported.trajectory);
    return{
      version:"CIEAV_TRUSTED_EXPERIENCE_INGESTION_V1" as const,
      assessment:exported.assessment,
      trajectory:exported.trajectory,
      learning,
      authority:false as const,
      productionAuthority:false as const,
      mayMintExecutionAuthority:false as const
    };
  }
}

export const TRUSTED_EXPERIENCE_INGESTOR_AUTHORITY=false as const;
export const TRUSTED_EXPERIENCE_INGESTOR_MAY_MINT_EXECUTION_AUTHORITY=false as const;
