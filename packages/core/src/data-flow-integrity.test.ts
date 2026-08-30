import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {DataFlowHopSchema,type DataSinkPolicy} from "@cieav/contracts";
import {assessDataFlowSink,createDataFlowLabel,propagateDataFlowLabels,verifyDataFlowLabel} from "./data-flow-integrity.js";

const hop=(fromRef:string,toRef:string,boundary:"MODEL"|"MEMORY"|"TOOL"|"MCP"|"API"|"BROWSER"|"FILESYSTEM"|"DATABASE"|"NETWORK"|"HUMAN"|"OTHER",sanitized=false)=>DataFlowHopSchema.parse({version:"CIEAV_DATA_FLOW_HOP_V1",hopId:crypto.randomUUID(),fromRef,toRef,boundary,operation:"propagate",inputLabelRefs:[crypto.randomUUID()],sanitized,sanitizationEvidenceRefs:sanitized?["sanitizer:deterministic-v1"]:[],createdAt:new Date().toISOString(),authority:false,mayMintExecutionAuthority:false});
const policy=(overrides:Partial<DataSinkPolicy>={}):DataSinkPolicy=>({id:crypto.randomUUID(),version:"CIEAV_DATA_SINK_POLICY_V1",enabled:true,priority:100,sinkRefPrefixes:[],sinkClasses:[],denyTrust:[],denyCategories:[],requireSanitizationForUntrustedInstructions:true,externalDisclosure:false,evidenceRefs:["policy:test"],reason:"test sink policy",authority:false,mayMintExecutionAuthority:false,...overrides});

describe("CIEAV cross-tool data-flow integrity",()=>{
  it("blocks malicious email instructions propagated through CRM before external send",()=>{
    const email=createDataFlowLabel({sourceRefs:["email:malicious-1"],trust:"EXTERNAL_UNTRUSTED",categories:["MESSAGE","CONTACT"],instructionalContent:true});
    const crmHop=hop("email:malicious-1","crm:lead-7","DATABASE"),crm=propagateDataFlowLabels([email],crmHop);expect(verifyDataFlowLabel(crm)).toBe(true);expect(crm.trust).toBe("EXTERNAL_UNTRUSTED");expect(crm.instructionalContent).toBe(true);
    const sendHop=hop("crm:lead-7","smtp:external","NETWORK"),assessment=assessDataFlowSink({label:crm,sinkRef:"smtp://external/vendor",sinkClass:"NETWORK",hop:sendHop,policies:[policy({sinkRefPrefixes:["smtp://external/"],sinkClasses:["NETWORK"],externalDisclosure:true})]});
    expect(assessment.decision).toBe("BLOCK");expect(assessment.reasons.some(reason=>reason.startsWith("untrusted_instruction_boundary:"))).toBe(true);expect(assessment.privacyExternalities).toContain("DISCLOSE:MESSAGE:smtp://external/vendor");
  });

  it("blocks malicious webpage instructions from driving filesystem secret access",()=>{
    const page=createDataFlowLabel({sourceRefs:["https://evil.example/prompt"],trust:"EXTERNAL_UNTRUSTED",categories:["PUBLIC"],instructionalContent:true});const fsHop=hop("browser:page","filesystem:/home/user/.ssh","FILESYSTEM");
    const assessment=assessDataFlowSink({label:page,sinkRef:"file:///home/user/.ssh/id_ed25519",sinkClass:"FILESYSTEM",hop:fsHop,policies:[policy({sinkRefPrefixes:["file:///home/user/.ssh"],sinkClasses:["FILESYSTEM"],denyTrust:["EXTERNAL_UNTRUSTED"]})]});expect(assessment.decision).toBe("BLOCK");
  });

  it("blocks untrusted MCP result from escalating into credential-bearing tool execution",()=>{
    const mcp=createDataFlowLabel({sourceRefs:["mcp:server/tool-result/1"],trust:"EXTERNAL_UNTRUSTED",categories:["CREDENTIAL"],instructionalContent:true,secretBearing:true});const toolHop=hop("mcp:server/tool-result/1","tool:cloud-admin","TOOL");
    const assessment=assessDataFlowSink({label:mcp,sinkRef:"tool://cloud-admin/assume-role",sinkClass:"TOOL",hop:toolHop,policies:[policy({sinkRefPrefixes:["tool://cloud-admin"],sinkClasses:["TOOL"],denyCategories:["CREDENTIAL"]})]});expect(assessment.decision).toBe("BLOCK");expect(assessment.secretBearing).toBe(true);
  });

  it("allows explicit deterministic sanitization to remove untrusted instructional authority while preserving provenance",()=>{
    const input=createDataFlowLabel({sourceRefs:["web:untrusted"],trust:"EXTERNAL_UNTRUSTED",categories:["PUBLIC","MESSAGE"],instructionalContent:true});const sanitizedHop=hop("web:untrusted","sanitizer:output","TOOL",true),sanitized=propagateDataFlowLabels([input],sanitizedHop,{sanitizedTrust:"TOOL_OUTPUT",dropInstructionalContentWhenSanitized:true});expect(sanitized.trust).toBe("TOOL_OUTPUT");expect(sanitized.instructionalContent).toBe(false);expect(sanitized.provenanceRefs).toContain(input.labelId);
  });

  it("requires review when secret-bearing data crosses a model boundary without explicit disclosure policy",()=>{const secret=createDataFlowLabel({sourceRefs:["vault:secret/1"],trust:"TRUSTED_OBSERVATION",categories:["CREDENTIAL"],secretBearing:true});const assessment=assessDataFlowSink({label:secret,sinkRef:"model://frontier",sinkClass:"MODEL",policies:[]});expect(assessment.decision).toBe("REQUIRE_REVIEW")});
});
