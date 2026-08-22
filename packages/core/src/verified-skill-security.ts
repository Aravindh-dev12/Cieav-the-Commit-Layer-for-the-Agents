import {VerifiedSkillCandidateSchema,VerifiedSkillSecurityAssessmentSchema,type VerifiedSkillCandidate,type VerifiedSkillSecurityAssessment,type VerifiedSkillSecurityFinding} from "@cieav/contracts";
import {verifiedSkillDigest} from "./verified-skill.js";

const normalize=(value:string)=>value.normalize("NFKC").toLowerCase();
const hiddenUnicode=/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const rules:Array<{id:string;category:VerifiedSkillSecurityFinding["category"];severity:VerifiedSkillSecurityFinding["severity"];pattern:RegExp;summary:string}>=[
  {id:"SEC-AUTH-001",category:"AUTHORITY_BYPASS",severity:"CRITICAL",pattern:/\b(bypass|skip|ignore|disable)\b.{0,80}\b(authori[sz]ation|execution ticket|permit|credential lease)\b/i,summary:"Attempts to bypass CIEAV execution authority."},
  {id:"SEC-APPROVAL-001",category:"APPROVAL_SUPPRESSION",severity:"CRITICAL",pattern:/\b(skip|auto.?approve|suppress|ignore|fake)\b.{0,80}\b(approval|confirmation|human)\b/i,summary:"Attempts to suppress or forge approval."},
  {id:"SEC-POLICY-001",category:"POLICY_BYPASS",severity:"HIGH",pattern:/\b(ignore|bypass|override|disable)\b.{0,80}\b(policy|guardrail|restriction|safety)\b/i,summary:"Attempts to bypass deterministic policy."},
  {id:"SEC-PROOF-001",category:"PROOF_SUPPRESSION",severity:"HIGH",pattern:/\b(skip|ignore|fabricate|fake|suppress)\b.{0,80}\b(proof|evidence|verification|readback)\b/i,summary:"Attempts to suppress or fabricate proof."},
  {id:"SEC-SECRET-001",category:"SECRET_EXFILTRATION",severity:"CRITICAL",pattern:/\b(send|upload|post|exfiltrate|copy|print|log)\b.{0,120}\b(secret|token|api key|password|credential|private key)\b/i,summary:"Attempts to expose credentials or secrets."},
  {id:"SEC-PROMOTE-001",category:"SELF_PROMOTION",severity:"CRITICAL",pattern:/\b(self.?promote|promote myself|mark.{0,30}(qualified|active)|activate myself)\b/i,summary:"Attempts to self-promote into an active capability."},
  {id:"SEC-REGISTRY-001",category:"REGISTRY_MUTATION",severity:"HIGH",pattern:/\b(modify|rewrite|delete|tamper|reset)\b.{0,100}\b(skill registry|verified skill registry|registry head|registry state)\b/i,summary:"Attempts to mutate verified-skill trust state."},
  {id:"SEC-MEMORY-001",category:"MEMORY_POISONING",severity:"HIGH",pattern:/\b(write|store|remember|persist|inject)\b.{0,100}\b(false|fabricated|hidden|secret|override)\b.{0,60}\b(memory|belief|claim|instruction)\b/i,summary:"Attempts to poison durable cognitive state."},
  {id:"SEC-INSTR-001",category:"INSTRUCTION_OVERRIDE",severity:"HIGH",pattern:/\b(ignore previous|ignore system|override system|new system prompt|developer message says)\b/i,summary:"Contains instruction-hierarchy override language."},
  {id:"SEC-BOOT-001",category:"ARBITRARY_CODE_BOOTSTRAP",severity:"HIGH",pattern:/\b(curl|wget|powershell|bash|sh|cmd|python|node)\b.{0,80}\b(http|https|base64|eval|exec|invoke-expression)\b/i,summary:"Contains arbitrary code/bootstrap execution pattern."},
  {id:"SEC-PRIVACY-001",category:"PRIVACY_BOUNDARY_BYPASS",severity:"HIGH",pattern:/\b(send|upload|share|forward)\b.{0,100}\b(local.?only|private|redacted|sensitive)\b/i,summary:"Attempts to cross declared privacy boundaries."}
];
const riskPoints={LOW:5,MEDIUM:15,HIGH:35,CRITICAL:60} as const;

function fields(candidate:VerifiedSkillCandidate):Array<{ref:string;text:string}>{
  const out=[{ref:"name",text:candidate.name},{ref:"capability",text:candidate.capability},{ref:"operation",text:candidate.operation}];
  if(candidate.routing){out.push({ref:"routing.description",text:candidate.routing.description});candidate.routing.keywords.forEach((text,i)=>out.push({ref:`routing.keywords[${i}]`,text}))}
  candidate.program.steps.forEach((step,i)=>out.push({ref:`program.steps[${i}].purpose`,text:step.purpose}));
  return out;
}

export function assessVerifiedSkillSecurity(raw:VerifiedSkillCandidate,evaluatedAt=new Date().toISOString()):VerifiedSkillSecurityAssessment{
  const candidate=VerifiedSkillCandidateSchema.parse(raw),findings:VerifiedSkillSecurityFinding[]=[];
  for(const field of fields(candidate)){
    const normalized=normalize(field.text);
    if(hiddenUnicode.test(field.text))findings.push({ruleId:"SEC-OBF-001",category:"OBFUSCATION",severity:"HIGH",fieldRef:field.ref,evidenceDigest:verifiedSkillDigest({ref:field.ref,text:field.text}),summary:"Contains invisible or directional Unicode control characters."});
    for(const rule of rules)if(rule.pattern.test(normalized))findings.push({ruleId:rule.id,category:rule.category,severity:rule.severity,fieldRef:field.ref,evidenceDigest:verifiedSkillDigest({ref:field.ref,text:field.text,rule:rule.id}),summary:rule.summary});
  }
  const unique=[...new Map(findings.map(item=>[`${item.ruleId}\0${item.fieldRef}\0${item.evidenceDigest}`,item])).values()].sort((a,b)=>a.ruleId.localeCompare(b.ruleId)||a.fieldRef.localeCompare(b.fieldRef));
  const riskScore=Math.min(100,unique.reduce((sum,item)=>sum+riskPoints[item.severity],0)),disposition=unique.some(item=>item.severity==="HIGH"||item.severity==="CRITICAL")?"QUARANTINE":"PASS";
  const base={version:"CIEAV_VERIFIED_SKILL_SECURITY_ASSESSMENT_V1" as const,scannerVersion:"CIEAV_VERIFIED_SKILL_SEMANTIC_SCANNER_V1" as const,candidateId:candidate.id,candidateDigest:verifiedSkillDigest(candidate),evaluatedAt,disposition,riskScore,findings:unique,authority:false as const,productionAuthority:false as const,mayMintExecutionAuthority:false as const};
  return VerifiedSkillSecurityAssessmentSchema.parse({...base,assessmentDigest:verifiedSkillDigest(base)});
}

export const VERIFIED_SKILL_SECURITY_AUTHORITY=false as const;
export const VERIFIED_SKILL_SECURITY_MAY_MINT_EXECUTION_AUTHORITY=false as const;
