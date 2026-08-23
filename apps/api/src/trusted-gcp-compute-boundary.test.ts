import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const read=(relative:string)=>readFileSync(path.join(ROOT,relative),"utf8");

describe("production GCP Compute consequence boundary",()=>{
 it("keeps GCP first-class and exact instance bound",()=>{const contracts=read("packages/contracts/src/execution-fabric.ts"),source=read("apps/api/src/trusted-gcp-compute-adapter.ts"),loader=read("apps/api/src/trusted-cli-adapter.ts");for(const token of ['"GCP"','readonly protocol="GCP" as const','GCP_COMPUTE_STOP_INSTANCE','gcpComputeTarget','gcpComputeDownstreamRef','project','zone','instance','loadTrustedGcpComputeAdaptersSync'])expect(`${contracts}\n${source}\n${loader}`).toContain(token);expect(source).not.toContain('readonly protocol="CLOUD_API"')});
 it("permits only get plus graceful stop with ticket-bound idempotency",()=>{const source=read("apps/api/src/trusted-gcp-compute-adapter.ts");for(const token of ['method:"GET"|"POST"','/stop?discardLocalSsd=false&noGracefulShutdown=false&requestId=','call(c,this.env,"POST",ctx.ticket.id)','expectedStatus:z.literal("RUNNING")','s==="STOPPING"||s==="TERMINATED"'])expect(source).toContain(token);for(const forbidden of ['noGracefulShutdown=true','discardLocalSsd=true','/delete','/reset','/start','/suspend','child_process','spawn(','execFile('])expect(source).not.toContain(forbidden)});
 it("keeps bearer value out of target/downstream/evidence",()=>{const source=read("apps/api/src/trusted-gcp-compute-adapter.ts");for(const token of ['bearerTokenEnv','authorization:`Bearer ${token(c,env)}`','credentialMode!=="CIEAV_INJECTED"'])expect(source).toContain(token);for(const forbidden of ['metadata:{token','tokenValue','gcpComputeTarget(c)}:${token'])expect(source).not.toContain(forbidden)});
 it("keeps post-effect ambiguity UNKNOWN unless STOPPING or TERMINATED is observed",()=>{const source=read("apps/api/src/trusted-gcp-compute-adapter.ts");for(const token of ['effectAttempted=r.started','transport:"UNKNOWN"','s==="STOPPING"||s==="TERMINATED"'])expect(source).toContain(token)});
 it("keeps GCP proof GET-only and authority-free",()=>{const proof=read("apps/api/src/proof-providers/gcp-compute.ts"),runtime=read("apps/api/src/proof-provider-runtime.ts");for(const token of ['cieav.gcp-compute-proof.v1','method:"GET"','authority:false as const','mayMintExecutionAuthority:false','CIEAV_PROOF_GCP_COMPUTE_CATALOG','GcpComputeProofProvider.fromCatalogFile'])expect(`${proof}\n${runtime}`).toContain(token);for(const forbidden of ['method:"POST"','/stop','mintExecutionTicket(','consumeTicket(','issueCredentialLease(','trusted-gcp-compute-adapter'])expect(proof).not.toContain(forbidden)});
});
