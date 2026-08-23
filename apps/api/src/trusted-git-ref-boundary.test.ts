import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const read=(relative:string)=>readFileSync(path.join(ROOT,relative),"utf8");

describe("production Git consequence boundary",()=>{
  it("keeps Git a first-class protocol rather than generic CLI",()=>{const contracts=read("packages/contracts/src/execution-fabric.ts"),adapter=read("apps/api/src/trusted-git-ref-adapter.ts"),cli=read("apps/api/src/trusted-cli-adapter.ts");expect(contracts).toContain('"GIT"');expect(adapter).toContain('readonly protocol="GIT" as const');expect(adapter).toContain('context.tool.protocol!=="GIT"');expect(cli).toContain('loadTrustedGitRefAdaptersSync');expect(adapter).not.toContain('readonly protocol="CLI"')});
  it("allows only fixed CAS branch-ref mutation with hooks and ambient config disabled",()=>{const source=read("apps/api/src/trusted-git-ref-adapter.ts");for(const token of ['config.ref.startsWith("refs/heads/")','"update-ref","--no-deref"','input.newCommitOid,input.expectedOldOid','core.hooksPath=','GIT_CONFIG_NOSYSTEM:"1"','GIT_CONFIG_GLOBAL:','GIT_TERMINAL_PROMPT:"0"','GIT_NO_REPLACE_OBJECTS:"1"','shell:false','"rev-parse","--absolute-git-dir"','"rev-parse","--show-object-format"','"show-ref","--verify","--hash"','"cat-file","-t"','"merge-base","--is-ancestor"'])expect(source).toContain(token);for(const forbidden of ["git push","fetch(","curl ","shell:true","exec(","execSync(","credentialMode!==\"CIEAV_INJECTED\""])expect(source).not.toContain(forbidden)});
  it("keeps exact-ref proof code independent and authority-free",()=>{const proof=read("apps/api/src/proof-providers/git-ref.ts"),runtime=read("apps/api/src/proof-provider-runtime.ts");for(const token of ['PROVIDER_ID="cieav.git-ref-proof.v1"','authority:false as const','mayMintExecutionAuthority:false','"show-ref","--verify","--hash"','"cat-file","-t"','CIEAV_PROOF_GIT_REF_CATALOG','GitRefProofProvider.fromCatalogFile'])expect(`${proof}\n${runtime}`).toContain(token);for(const forbidden of ["trusted-git-ref-adapter","update-ref","mintExecutionTicket(","consumeTicket(","issueCredentialLease(","signCommit(","shell:true"])expect(proof).not.toContain(forbidden)});
  it("requires work-tree, git-dir, binary, ref and OID bindings in the execution contract",()=>{const source=read("apps/api/src/trusted-git-ref-adapter.ts");for(const token of ["repository:","gitDir:","gitBinary:","gitBinarySha256:","expectedOldOid","newCommitOid","gitRefTarget","gitRefDownstreamRef","execution_git_proposal_target_mismatch","execution_git_downstream_ref_mismatch"])expect(source).toContain(token)});
});
