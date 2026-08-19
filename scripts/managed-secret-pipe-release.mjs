#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const fail=m=>{console.error(`CIEAV managed-secret pipe gate FAIL: ${m}`);process.exit(2)};
const expect=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`);return body};
const gateway=expect("python/latch_platform/gateway.py",[
  'dist" / "managed-entry.js"','env["CIEAV_MANAGED_SECRET_PIPE"] = "1"',"stdin=subprocess.PIPE","_semantic_bootstrap","semantic_router_token","secrets.compare_digest","child.stdin.write(bootstrap)","bootstrap[:]=b\"\\0\"*len(bootstrap)","bootstrap=private-pipe"
]);
for(const forbidden of ['env["JWT_SECRET"]','env["RECEIPT_SIGNING_SECRET"]','env["CIEAV_GATEWAY_TOKEN"]'])if(gateway.includes(forbidden))fail(`Gateway reintroduced inherited semantic secret: ${forbidden}`);
const entrySource=expect("apps/api/src/managed-entry.ts",["MAX_BOOTSTRAP_BYTES=16*1024","process.stdin.isTTY","cieav_managed_secret_bootstrap_missing","installBootstrapFromPrivatePipe","installManagedSecrets(parsed)","encoded?.fill(0)","chunk.fill(0)",'await import("./server.js")']);
if(entrySource.includes("const bootstrap=await"))fail("managed API reintroduced a module-lifetime bootstrap object");
expect("apps/api/src/managed-secrets.ts",["semanticRouterToken","scopes_must_be_distinct","bootstrap_already_installed","bootstrap_fields_invalid","roots_must_be_distinct","pending=undefined"]);
expect("apps/api/src/config.ts",["consumeManagedSecrets()","gatewayBearerDigest(gatewayToken)","semanticRouterToken","managed semantic router capability must be distinct","managed local authority requires private bootstrap secrets","must not be duplicated in process environment"]);
expect("apps/api/src/gateway-auth.ts",["gatewayBearerDigest","timingSafeEqual","verifyGatewayAuthorization"]);
const server=expect("apps/api/src/server.ts",["verifyGatewayAuthorization(req.headers.authorization,config.gatewayTokenDigest)","config.semanticRouterToken"]);
if(server.includes("config.gatewayToken"))fail("Node server reintroduced long-lived raw privileged Gateway bearer");
const npm=process.platform==="win32"?"npm.cmd":"npm";
function runNpm(args){const exe=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args,r=spawnSync(exe,finalArgs,{cwd:ROOT,encoding:"utf8",stdio:"pipe",shell:false});if(r.error)fail(`${npm} ${args.join(" ")} failed: ${r.error.message}`);if(r.status!==0)fail(`${npm} ${args.join(" ")} exited ${r.status}:\n${r.stdout??""}\n${r.stderr??""}`)}
runNpm(["run","build:api"]);
runNpm(["run","test","-w","@cieav/api","--","managed-secrets.test.ts","gateway-auth.test.ts"]);
const entry=path.join(ROOT,"apps/api/dist/managed-entry.js"),baseEnv={...process.env,CIEAV_MANAGED_SECRET_PIPE:"1"};
for(const key of ["JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN"])delete baseEnv[key];
const empty=spawnSync(process.execPath,[entry],{cwd:ROOT,env:baseEnv,input:"",encoding:"utf8",timeout:5000});
if(empty.error)fail(`empty-bootstrap process failed to execute: ${empty.error.message}`);
if(empty.status===0)fail("managed API accepted an empty bootstrap pipe");
const weak=spawnSync(process.execPath,[entry],{cwd:ROOT,env:baseEnv,input:JSON.stringify({jwtSecret:"x",receiptSigningSecret:"y",gatewayToken:"z",semanticRouterToken:"q"}),encoding:"utf8",timeout:5000});
if(weak.error)fail(`weak-bootstrap process failed to execute: ${weak.error.message}`);
if(weak.status===0)fail("managed API accepted weak bootstrap secrets");
console.log(`CIEAV managed-secret pipe gate PASS · platform=${process.platform} · private bootstrap is scrubbed, privileged Gateway bearer is verifier-only in Node, and semantic routing uses a distinct scoped capability`);
