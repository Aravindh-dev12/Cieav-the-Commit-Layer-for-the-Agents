#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"scripts/local-production-rehearsal.mjs"),"utf8");
const pkg=readFileSync(path.join(ROOT,"package.json"),"utf8");
const fail=m=>{console.error(`CIEAV local production rehearsal static gate FAIL: ${m}`);process.exit(2)};
const need=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};

need(source,[
  'kind:"LOCAL_PRODUCTION_REHEARSAL"',
  'authority:false',
  'production:false',
  'productionQualification:"BLOCKED"',
  '"REHEARSAL_PASS"',
  'simulationCannotSatisfyProduction:true',
  'externalReviewCannotBeSelfDeclared:true',
  'publicDeploymentCannotUseLoopback:true',
  'productionSigningIdentityCannotBeReplacedByLocalTestIdentity:true',
  'finalProductionPassCannotBeEmittedByThisTool:true',
  'public-cloud-cdn',
  'windows-production-publisher',
  'apple-developer-id-notarization',
  'registered-physical-runners',
  'independent-security-review',
  'operations-dr',
  'final-production-workflow',
  'release-gate.mjs","--plan"',
  'production-orchestration-static.mjs',
  'production-qualification-static.mjs',
  'generate-production-sbom.mjs',
  'audit-level=high',
  'audit-level=critical',
  '--physical',
  '--gpu-constraints',
  '--require-cuda',
  '--mutate',
  'local-live-windows-qualification.ps1',
  '--full',
  'git","status","--porcelain',
  'latest-local-production-rehearsal.json',
],"rehearsal orchestrator");
if(/productionQualification\s*:\s*["']PASS["']/.test(source))fail("local rehearsal must never emit productionQualification PASS");
if(/authority\s*:\s*true/.test(source))fail("local rehearsal must never emit authority=true");
if(/production\s*:\s*true/.test(source))fail("local rehearsal must never emit production=true");
need(pkg,['release:rehearse:local','local-production-rehearsal.mjs'],"package scripts");
console.log("CIEAV local production rehearsal static gate PASS · local evidence cannot satisfy production authority");
