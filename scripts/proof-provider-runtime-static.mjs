#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const need=(source,tokens,label)=>{for(const token of tokens)if(!source.includes(token))throw new Error(`${label} invariant missing: ${token}`)};

const runtime=read("apps/api/src/proof-provider-runtime.ts");
const ros2=read("apps/api/src/proof-providers/ros2.ts");
const ros2Tests=read("apps/api/src/proof-providers/ros2.test.ts");

need(runtime,[
  'import {Ros2ProofProvider} from "./proof-providers/ros2.js"',
  "CIEAV_PROOF_ROS2_CATALOG",
  "Ros2ProofProvider.fromCatalogFile",
  "this.registry.register(provider)"
],"proof-provider runtime");

need(ros2,[
  'const PROVIDER_ID="cieav.ros2-proof.v1"',
  'evidenceKinds:["ROS2_TOPIC_SAMPLE"]',
  "authority:false as const",
  "mayMintExecutionAuthority:false",
  "shell:false",
  '"topic","echo","--once"',
  "verifyBinary(target)",
  "verifyPrefixFiles(target)",
  "ros2_proof_unpinned_prefix_file",
  "ros2_proof_prefix_file_digest_mismatch",
  "ros2_proof_operation_not_read_only",
  "proposedOutcome",
  "conclusive:Boolean(proposedOutcome)"
],"ROS2 proof provider");

for(const forbidden of ["mintPermit(","mintExecutionTicket(","signCommit(","issueCredentialLease(","consumeTicket(","exec(","execSync(","shell:true"]){
  if(ros2.includes(forbidden))throw new Error(`ROS2 proof provider contains forbidden authority/execution primitive: ${forbidden}`);
}

need(ros2Tests,[
  "ros2_proof_unpinned_prefix_file",
  "ros2_proof_prefix_file_digest_mismatch",
  "fails closed if a pinned prefix file drifts after provider construction",
  "mayMintExecutionAuthority"
],"ROS2 proof regression tests");

if(runtime.includes("BrowserProofProvider"))throw new Error("browser proof provider must not be registered until the browser host exposes a dedicated bounded read-only observation capability");
if(ros2.includes("Runtime.evaluate")||ros2.includes("javascript:"))throw new Error("proof provider may not introduce arbitrary browser/script evaluation surfaces");

console.log("CIEAV proof-provider runtime static gate PASS - ROS2 observation is digest-pinned, prefix-file drift fails closed, read-only operations only, authority=false, and browser proof remains disabled until a bounded observation host exists");
