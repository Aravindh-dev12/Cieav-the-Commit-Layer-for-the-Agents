import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  AgentIdentityAttestationSchema,
  ExecutionProposalSchema,
  FormalAuthorizationDecisionSchema,
  type ExecutionProposal,
  type FormalAuthorizationDecision
} from "@cieav/contracts/execution-fabric";
import {AuthorityGradeSettlementAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementAssessment} from "@cieav/contracts/authority-grade-settlement";
import {assessAuthorityGradeSettlement,buildAuthorizedOutcomeTrajectory,digest} from "@cieav/core";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const hmac=(secret:string,value:unknown)=>crypto.createHmac("sha256",secret).update(canonical(value)).digest("base64url");
const safeEqual=(a:string,b:string)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));

type ProposalRecord={proposal:ExecutionProposal;decision:FormalAuthorizationDecision};
type ExecutionEnvelope={payload:{version:1;proposals:unknown[]};mac:string};

export type TrustedTrajectoryExport={
  assessment:AuthorityGradeSettlementAssessment;
  trajectory:ReturnType<typeof buildAuthorizedOutcomeTrajectory>;
  authority:false;
  productionAuthority:false;
};

export class CieavAuthorityGradeExporter{
  private readonly executionFabricSecret:string;
  constructor(
    private readonly kernel:CieavAgentKernelStore,
    private readonly proofStore:CieavProofStore,
    private readonly executionFabricFile:string,
    kernelSecret:string
  ){
    if(kernelSecret.length<32)throw new Error("CIEAV authority-grade exporter kernel secret is too weak");
    this.executionFabricSecret=crypto.createHmac("sha256",kernelSecret).update("cieav-execution-fabric-state-v1").digest("base64url");
  }

  private async proposalRecord(proposalId:string):Promise<ProposalRecord>{
    const env=JSON.parse(await readFile(this.executionFabricFile,"utf8")) as ExecutionEnvelope;
    if(env?.payload?.version!==1||!Array.isArray(env.payload.proposals)||typeof env.mac!=="string")throw new Error("authority_grade_execution_envelope_invalid");
    const expected=hmac(this.executionFabricSecret,env.payload);
    if(!safeEqual(expected,env.mac))throw new Error("authority_grade_execution_envelope_integrity_failed");
    const raw=env.payload.proposals.find((x:any)=>x?.proposal?.id===proposalId);
    if(!raw)throw new Error("authority_grade_proposal_not_found");
    return{proposal:ExecutionProposalSchema.parse((raw as any).proposal),decision:FormalAuthorizationDecisionSchema.parse((raw as any).decision)};
  }

  async exportByTicket(ticketId:string,redactionProfile:string,consentScope?:string):Promise<TrustedTrajectoryExport>{
    const tickets=await this.kernel.executionFabric.listTickets();
    const ticket=tickets.find(x=>x.id===ticketId);
    if(!ticket)throw new Error("authority_grade_ticket_not_found");
    if(ticket.status!=="CONSUMED"||!ticket.consumedAt)throw new Error("authority_grade_consumed_ticket_required");

    const {proposal,decision}=await this.proposalRecord(ticket.proposalId);
    const task=await this.kernel.get(ticket.taskId);
    if(!task)throw new Error("authority_grade_task_not_found");
    const taskEvents=await this.kernel.listEvents(task.id);
    const commits=await this.kernel.intentReality.listRealityBoundCommits();
    const realityBoundCommit=commits.find(x=>x.id===ticket.realityBoundCommitId);
    if(!realityBoundCommit)throw new Error("authority_grade_reality_commit_not_found");

    const [attestations,leases,graphs,audit]=await Promise.all([
      this.kernel.executionFabric.listAttestations(),
      this.kernel.executionFabric.listLeases(),
      this.kernel.executionFabric.listPermissionGraphs(),
      this.kernel.executionFabric.listAudit()
    ]);
    const identityAttestation=attestations.find(x=>x.id===proposal.identityAttestationId);
    if(!identityAttestation)throw new Error("authority_grade_attestation_not_found");
    const credentialLease=leases.find(x=>x.id===proposal.credentialLeaseId);
    if(!credentialLease)throw new Error("authority_grade_lease_not_found");
    const permissionGraph=graphs.find(x=>x.digest===decision.graphDigest&&x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);
    if(!permissionGraph)throw new Error("authority_grade_permission_graph_not_found");
    if(!task.proofCaseId)throw new Error("authority_grade_proof_binding_missing");
    const proofCase=await this.proofStore.get(task.scopeDeviceId,task.proofCaseId);
    if(!proofCase)throw new Error("authority_grade_proof_not_found");

    // These calls force each HMAC-authenticated store through its normal load path.
    // Execution Fabric additionally verifies its audit hash chain and every local identity attestation on load.
    AgentIdentityAttestationSchema.parse(identityAttestation);
    const bundle=AuthorityGradeSettlementBundleSchema.parse({
      version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
      task,taskEvents,proposal,authorization:decision,permissionGraph,identityAttestation,credentialLease,realityBoundCommit,executionTicket:ticket,
      executionAudit:audit.filter(x=>x.proposalId===proposal.id||x.ticketId===ticket.id),
      proofCase,redactionProfile,...(consentScope?{consentScope}:{}),authority:false,productionAuthority:false
    });
    const semantic=assessAuthorityGradeSettlement(bundle);
    const cryptographicallyVerified=true;
    const authorityGrade=cryptographicallyVerified&&semantic.authorityBindingsVerified&&semantic.realityBound;
    const hardFailures=[...semantic.authorityFailures,...semantic.settlementFailures];
    const eligible=authorityGrade&&semantic.settlementBindingsVerified&&semantic.trustedOutcomeEvidence&&semantic.outcome!=="UNKNOWN";
    const assessment=AuthorityGradeSettlementAssessmentSchema.parse({
      version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",
      eligible,authorityGrade,realityBound:semantic.realityBound,cryptographicallyVerified,trustedOutcomeEvidence:semantic.trustedOutcomeEvidence,
      outcome:semantic.outcome,hardFailures,warnings:semantic.warnings,evidenceRefs:[...semantic.evidenceRefs,`bundle:${digest(bundle)}`].sort(),authority:false,productionAuthority:false
    });
    const trajectory=buildAuthorizedOutcomeTrajectory(bundle,assessment);
    return{assessment,trajectory,authority:false,productionAuthority:false};
  }
}
