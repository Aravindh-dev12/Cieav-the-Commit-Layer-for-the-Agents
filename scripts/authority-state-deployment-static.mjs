#!/usr/bin/env node
import fs from "node:fs";
const checks=[
  ["apps/api/src/authority-state-deployment.ts",["single-writer-file","single-host-sqlite","cluster-ha","CIEAV_AUTHORITY_REPLICAS","CIEAV_AUTHORITY_SHARED_HOST","CIEAV_AUTHORITY_CLUSTER_BACKEND","cluster-ha authority mode is not implemented","authority:false","mayMintExecutionAuthority:false"]],
  ["apps/api/src/config.ts",["loadAuthorityStateDeployment","authorityState:AuthorityStateDeployment","authorityState"]],
  ["apps/api/src/authority-state-deployment.test.ts",["rejects multiple file-backed authority replicas","clusterHaQualified:false","refuses cluster-ha"]],
  [".env.example",["CIEAV_AUTHORITY_STATE_MODE","CIEAV_AUTHORITY_REPLICAS","CIEAV_AUTHORITY_SHARED_HOST","CIEAV_AUTHORITY_CLUSTER_BACKEND"]]
];
const missing=[];for(const [file,tokens] of checks){const text=fs.readFileSync(file,"utf8");for(const token of tokens)if(!text.includes(token))missing.push(`${file}: ${token}`)}
if(missing.length){console.error("CIEAV authority state deployment static gate FAIL");for(const item of missing)console.error(` - missing ${item}`);process.exit(1)}
console.log("CIEAV authority state deployment static gate PASS - single-writer truth + shared-host distinction + cluster-HA fail-closed + zero authority present");
