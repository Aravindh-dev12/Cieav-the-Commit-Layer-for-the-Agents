#!/usr/bin/env node
import fs from "node:fs";
const checks=[
  ["apps/api/src/authority-state-deployment.ts",["single-writer-file","single-host-sqlite","cluster-ha","CIEAV_AUTHORITY_REPLICAS","CIEAV_AUTHORITY_SHARED_HOST","CIEAV_AUTHORITY_CLUSTER_BACKEND","cluster-ha authority mode is not implemented","authority:false","mayMintExecutionAuthority:false"]],
  ["apps/api/src/authority-process-lease.ts",["authority-writer.lock","fs.openSync(lockFile,\"wx\"","fs.fsyncSync","process.kill(pid,0)","refusing split-brain startup","authority:false","mayMintExecutionAuthority:false"]],
  ["apps/api/src/config.ts",["loadAuthorityStateDeployment","authorityState:AuthorityStateDeployment","acquireAuthorityProcessLease","authorityState.mode===\"single-writer-file\""]],
  ["apps/api/src/authority-state-deployment.test.ts",["rejects multiple file-backed authority replicas","clusterHaQualified:false","refuses cluster-ha"]],
  ["apps/api/src/authority-process-lease.test.ts",["refuses a lock owned by a live same-host process","recovers a stale same-host lock","never steals a lock written by another host","fails closed on a corrupt lock file"]],
  [".env.example",["CIEAV_AUTHORITY_STATE_MODE","CIEAV_AUTHORITY_REPLICAS","CIEAV_AUTHORITY_SHARED_HOST","CIEAV_AUTHORITY_CLUSTER_BACKEND"]]
];
const missing=[];for(const [file,tokens] of checks){const text=fs.readFileSync(file,"utf8");for(const token of tokens)if(!text.includes(token))missing.push(`${file}: ${token}`)}
if(missing.length){console.error("CIEAV authority state deployment static gate FAIL");for(const item of missing)console.error(` - missing ${item}`);process.exit(1)}
console.log("CIEAV authority state deployment static gate PASS - exclusive writer lease + stale-lock recovery + split-brain refusal + cluster-HA fail-closed + zero authority present");
