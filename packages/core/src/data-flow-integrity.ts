import crypto from "node:crypto";
import {
  DataFlowAssessmentSchema,
  DataFlowHopSchema,
  DataFlowLabelSchema,
  DataSinkPolicySchema,
  ConsequenceMaterializationSchema,
  type ConsequenceMaterialization,
  type DataFlowAssessment,
  type DataFlowCategory,
  type DataFlowHop,
  type DataFlowLabel,
  type DataFlowTrust,
  type DataSinkPolicy
} from "@cieav/contracts";
import {makeConsequenceFootprint} from "./consequence-algebra.js";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";
export const dataFlowDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const uniq=<T extends string>(values:T[])=>[...new Set(values)].sort() as T[];
const trustRank:Record<DataFlowTrust,number>={TRUSTED_POLICY:0,TRUSTED_OBSERVATION:1,USER_ASSERTION:2,TOOL_OUTPUT:3,MODEL_INFERENCE:4,EXTERNAL_UNTRUSTED:5};
const leastTrusted=(values:DataFlowTrust[])=>values.reduce((current,value)=>trustRank[value]>trustRank[current]?value:current,"TRUSTED_POLICY" as DataFlowTrust);

export function createDataFlowLabel(input:{sourceRefs:string[];trust:DataFlowTrust;categories:DataFlowCategory[];instructionalContent?:boolean;secretBearing?:boolean;provenanceRefs?:string[]}):DataFlowLabel{
  const base={version:"CIEAV_DATA_FLOW_LABEL_V1" as const,labelId:crypto.randomUUID(),sourceRefs:uniq(input.sourceRefs),trust:input.trust,categories:uniq(input.categories),instructionalContent:Boolean(input.instructionalContent),secretBearing:Boolean(input.secretBearing),provenanceRefs:uniq(input.provenanceRefs??[]),authority:false as const,mayMintExecutionAuthority:false as const};
  return DataFlowLabelSchema.parse({...base,labelDigest:dataFlowDigest(base)});
}

export function verifyDataFlowLabel(label:DataFlowLabel){const parsed=DataFlowLabelSchema.parse(label),{labelDigest,...base}=parsed;return dataFlowDigest(base)===labelDigest}

export function propagateDataFlowLabels(labels:DataFlowLabel[],hopRaw:DataFlowHop,options:{sanitizedTrust?:DataFlowTrust;dropInstructionalContentWhenSanitized?:boolean}={}):DataFlowLabel{
  if(!labels.length)throw new Error("data_flow_input_label_required");const hop=DataFlowHopSchema.parse(hopRaw);for(const label of labels)if(!verifyDataFlowLabel(label))throw new Error(`data_flow_label_integrity_mismatch:${label.labelId}`);
  const trust=hop.sanitized&&options.sanitizedTrust?options.sanitizedTrust:leastTrusted(labels.map(label=>label.trust)),instructionalContent=hop.sanitized&&options.dropInstructionalContentWhenSanitized?false:labels.some(label=>label.instructionalContent),secretBearing=labels.some(label=>label.secretBearing);
  return createDataFlowLabel({sourceRefs:uniq(labels.flatMap(label=>label.sourceRefs)),trust,categories:uniq(labels.flatMap(label=>label.categories)),instructionalContent,secretBearing,provenanceRefs:uniq([...labels.flatMap(label=>[label.labelId,...label.provenanceRefs]),hop.hopId,hop.fromRef,hop.toRef])});
}

const matchesPolicy=(policy:DataSinkPolicy,sinkRef:string,sinkClass:DataFlowAssessment["sinkClass"])=>policy.enabled&&(!policy.sinkRefPrefixes.length||policy.sinkRefPrefixes.some(prefix=>sinkRef.startsWith(prefix)))&&(!policy.sinkClasses.length||policy.sinkClasses.includes(sinkClass));

export function assessDataFlowSink(input:{label:DataFlowLabel;sinkRef:string;sinkClass:DataFlowAssessment["sinkClass"];hop?:DataFlowHop;policies:DataSinkPolicy[]}):DataFlowAssessment{
  const label=DataFlowLabelSchema.parse(input.label);if(!verifyDataFlowLabel(label))throw new Error("data_flow_label_integrity_mismatch");const hop=input.hop?DataFlowHopSchema.parse(input.hop):undefined,matched=input.policies.map(value=>DataSinkPolicySchema.parse(value)).filter(policy=>matchesPolicy(policy,input.sinkRef,input.sinkClass)).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const reasons:string[]=[],privacyExternalities:string[]=[];let decision:DataFlowAssessment["decision"]="ALLOW";
  for(const policy of matched){
    if(policy.denyTrust.includes(label.trust)){decision="BLOCK";reasons.push(`sink_policy_denies_trust:${policy.id}:${label.trust}`)}
    const denied=label.categories.filter(category=>policy.denyCategories.includes(category));if(denied.length){decision="BLOCK";reasons.push(`sink_policy_denies_categories:${policy.id}:${denied.join(",")}`)}
    if(policy.requireSanitizationForUntrustedInstructions&&label.trust==="EXTERNAL_UNTRUSTED"&&label.instructionalContent&&!hop?.sanitized){decision="BLOCK";reasons.push(`untrusted_instruction_boundary:${policy.id}`)}
    if(policy.externalDisclosure){for(const category of label.categories.filter(category=>category!=="NONE"&&category!=="PUBLIC"))privacyExternalities.push(`DISCLOSE:${category}:${input.sinkRef}`);if(label.secretBearing)privacyExternalities.push(`SECRET_DISCLOSURE:${input.sinkRef}`)}
  }
  if(!matched.length){if(label.trust==="EXTERNAL_UNTRUSTED"&&label.instructionalContent&&["TOOL","MCP","API","BROWSER","FILESYSTEM","DATABASE","NETWORK"].includes(input.sinkClass)){decision="REQUIRE_REVIEW";reasons.push("untrusted_instruction_reaches_privileged_sink_without_explicit_policy")}else reasons.push("no_sink_policy_matched; zero-authority data-flow assessment only")}
  if(label.secretBearing&&["NETWORK","API","MCP","MODEL"].includes(input.sinkClass)&&decision==="ALLOW"&&!matched.some(policy=>policy.externalDisclosure)){decision="REQUIRE_REVIEW";reasons.push("secret_bearing_data_crosses_external_or_model_boundary_without_explicit_disclosure_policy")}
  const base={version:"CIEAV_DATA_FLOW_ASSESSMENT_V1" as const,sinkRef:input.sinkRef,sinkClass:input.sinkClass,decision,effectiveTrust:label.trust,categories:label.categories,instructionalContent:label.instructionalContent,secretBearing:label.secretBearing,matchedPolicyRefs:matched.map(policy=>policy.id),privacyExternalities:uniq(privacyExternalities),reasons:uniq(reasons),authority:false as const,mayMintExecutionAuthority:false as const};
  return DataFlowAssessmentSchema.parse({...base,assessmentDigest:dataFlowDigest(base)});
}

export function applyDataFlowAssessmentsToConsequence(materializationRaw:ConsequenceMaterialization,assessments:DataFlowAssessment[]):ConsequenceMaterialization{
  const materialization=ConsequenceMaterializationSchema.parse(materializationRaw);for(const assessment of assessments)DataFlowAssessmentSchema.parse(assessment);const blocked=assessments.find(assessment=>assessment.decision==="BLOCK");if(blocked)throw new Error(`data_flow_sink_blocked:${blocked.sinkRef}`);
  const externalities=uniq([...materialization.footprint.privacyExternalities,...assessments.flatMap(assessment=>assessment.privacyExternalities),...assessments.filter(assessment=>assessment.decision==="REQUIRE_REVIEW").map(assessment=>`REVIEW_REQUIRED:${assessment.sinkRef}`)]);
  const footprint=makeConsequenceFootprint({...materialization.footprint,privacyExternalities:externalities,digest:undefined} as never);
  return ConsequenceMaterializationSchema.parse({...materialization,footprint,authority:false});
}

export const DATA_FLOW_INTEGRITY_AUTHORITY=false as const;
export const DATA_FLOW_INTEGRITY_MAY_MINT_EXECUTION_AUTHORITY=false as const;
