import type {AuthorityGradeSettlementAssessment} from "@cieav/contracts/authority-grade-settlement";
import type {AuthorizedOutcomeTrajectory} from "@cieav/contracts/consequence-intelligence";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";
import {exportAuthorityGradeTrajectory} from "./authority-grade-learning-export.js";

export type TrustedTrajectoryExport={
  assessment:AuthorityGradeSettlementAssessment;
  trajectory:AuthorizedOutcomeTrajectory;
  authority:false;
  productionAuthority:false;
};

/**
 * Compatibility façade for callers that used the original exporter class.
 * All authority-grade construction now flows through the single authenticated
 * store-backed exporter in authority-grade-learning-export.ts. This class does
 * not duplicate integrity assertions or settlement semantics.
 */
export class CieavAuthorityGradeExporter{
  constructor(private readonly kernel:CieavAgentKernelStore,private readonly proofStore:CieavProofStore){}

  async exportByTicket(ticketId:string,redactionProfile:string,consentScope?:string):Promise<TrustedTrajectoryExport>{
    // Preserve the original class contract: a ticket must already have been
    // consumed at the one-use routing boundary before any settlement export.
    const ticket=(await this.kernel.executionFabric.listTickets()).find(x=>x.id===ticketId);
    if(!ticket)throw new Error("authority_grade_ticket_not_found");
    if(ticket.status!=="CONSUMED"||!ticket.consumedAt)throw new Error("authority_grade_consumed_ticket_required");

    const exported=await exportAuthorityGradeTrajectory(this.kernel,this.proofStore,ticketId,{redactionProfile,...(consentScope?{consentScope}:{})});
    return{assessment:exported.assessment,trajectory:exported.trajectory,authority:false,productionAuthority:false};
  }
}
