import {AuthorizedOutcomeTrajectorySchema,type AuthorizedOutcomeTrajectory} from "@cieav/contracts/consequence-intelligence";
import {AuthorityGradeSettlementAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementAssessment,type AuthorityGradeSettlementBundle} from "@cieav/contracts/authority-grade-settlement";
import {digest} from "./execution-fabric.js";

const trustedProof=new Set(["CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION"]);
const recoveryEventTypes=new Set(["EFFECT_QUARANTINED","QUARANTINE_RESOLVED","RETRY_SCHEDULED","RECOVERY_REQUIRED","OPEN_LOOP_DETECTED"]);

export function buildAuthorizedOutcomeTrajectory(raw:AuthorityGradeSettlementBundle,rawAssessment:AuthorityGradeSettlementAssessment):AuthorizedOutcomeTrajectory{
  const bundle=AuthorityGradeSettlementBundleSchema.parse(raw) as AuthorityGradeSettlementBundle;
  const assessment=AuthorityGradeSettlementAssessmentSchema.parse(rawAssessment);
  const proofEvidence=bundle.proofCase.observations.map(observation=>({
    kind:observation.kind,
    source:observation.source??observation.provenance??"unknown",
    observedAt:observation.observedAt,
    summary:observation.summary,
    ...(observation.digest?{digest:observation.digest}:{})
  }));
  const executionEvents=bundle.executionAudit
    .filter(event=>event.proposalId===bundle.proposal.id||event.ticketId===bundle.executionTicket.id)
    .map(event=>`${event.phase}:${event.outcome}:${event.id}:${event.eventHash}`);
  const recovery=bundle.taskEvents
    .filter(event=>recoveryEventTypes.has(event.type))
    .map(event=>`${event.type}:${event.reason}`.slice(0,1500))
    .slice(-100);
  const trustedDirectionalProof=bundle.proofCase.observations.some(observation=>
    trustedProof.has(observation.provenance??"UNVERIFIED")&&(observation.signal==="SUPPORTS"||observation.signal==="CONTRADICTS")
  );
  const eligibleAgenticRl=assessment.authorityGrade&&assessment.realityBound&&assessment.cryptographicallyVerified&&assessment.outcome!=="UNKNOWN"&&trustedDirectionalProof;

  return AuthorizedOutcomeTrajectorySchema.parse({
    version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
    trajectoryId:`authority-grade:${bundle.executionTicket.id}`,
    objective:bundle.task.goal,
    principalIdentityRef:`principal:${digest({kind:bundle.task.owner.kind,id:bundle.task.owner.id})}`,
    agentIdentityRef:`attestation:${bundle.identityAttestation.id}`,
    worldBeforeDigest:bundle.proposal.realityWitness.digest,
    credentialLeaseRef:`lease:${bundle.credentialLease.id}`,
    operation:bundle.proposal.operation,
    exactArgumentsDigest:bundle.proposal.normalizedArgumentsDigest,
    policyDecisionRef:`authorization:${digest(bundle.authorization)}`,
    realityBoundCommitRef:`reality-bound-commit:${bundle.realityBoundCommit.id}`,
    executionTicketRef:`execution-ticket:${bundle.executionTicket.id}`,
    executionEvents,
    evidence:proofEvidence,
    outcome:assessment.outcome,
    recovery,
    cryptographicallyVerified:assessment.cryptographicallyVerified,
    authorityGrade:assessment.authorityGrade,
    realityBound:assessment.realityBound,
    eligibleAgenticRl,
    ...(bundle.consentScope?{consentScope:bundle.consentScope}:{}),
    redactionProfile:bundle.redactionProfile,
    authority:false,
    productionAuthority:false
  });
}

export const AUTHORITY_GRADE_TRAJECTORY_AUTHORITY=false as const;
export const AUTHORITY_GRADE_TRAJECTORY_MAY_MINT_EXECUTION_AUTHORITY=false as const;
