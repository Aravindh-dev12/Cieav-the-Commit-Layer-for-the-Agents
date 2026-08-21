#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildPhysicalQualificationEvidence,verifyPhysicalQualificationEvidence} from "./physical-qualification-evidence.mjs";

const previous=process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION;process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION="1";
try{
  const now=Date.now(),createdAt=new Date(now-1000).toISOString(),commit="a".repeat(40),version="0.8.0";
  const evidence=buildPhysicalQualificationEvidence({mechanism:"LINUX_TPM2_ESAPI_EK_AK_MEASURED_BOOT",claims:{hardwareBacked:true,verification:"VERIFIED"},target:"linux-x64",createdAt,commit,productVersion:version});
  assert.equal(evidence.authority,false);assert.equal(evidence.physical,true);assert.equal(evidence.verdict,"PASS");
  assert.equal(verifyPhysicalQualificationEvidence(evidence,{commit,productVersion:version,now,maxAgeMs:60_000}).ok,true);
  assert.equal(verifyPhysicalQualificationEvidence({...evidence,claims:{hardwareBacked:false}},{commit,productVersion:version,now,maxAgeMs:60_000}).ok,false,"tampering must invalidate digest");
  assert.equal(verifyPhysicalQualificationEvidence(evidence,{commit:"b".repeat(40),productVersion:version,now,maxAgeMs:60_000}).ok,false,"wrong release commit must fail");
  assert.equal(verifyPhysicalQualificationEvidence(evidence,{commit,productVersion:"9.9.9",now,maxAgeMs:60_000}).ok,false,"wrong version must fail");
  assert.equal(verifyPhysicalQualificationEvidence(evidence,{commit,productVersion:version,now:now+120_000,maxAgeMs:60_000}).ok,false,"stale evidence must fail");
  console.log("CIEAV physical qualification evidence smoke PASS - digest + exact commit/version + freshness + tamper rejection + authority=false");
} finally {if(previous===undefined)delete process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION;else process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION=previous}
