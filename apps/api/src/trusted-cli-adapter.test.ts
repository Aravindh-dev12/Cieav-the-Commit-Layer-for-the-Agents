import crypto from "node:crypto";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {TrustedCliAdapter,cliDownstreamRef,type TrustedCliToolConfig} from "./trusted-cli-adapter.js";
const sha=(v:Buffer|string)=>crypto.createHash("sha256").update(v).digest("hex");
async function config(source:string):Promise<TrustedCliToolConfig>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-cli-")),script=path.join(dir,"tool.mjs");await writeFile(script,source,"utf8");return{toolId:"ops.tool",command:process.execPath,commandSha256:sha(await readFile(process.execPath)),pinnedScript:{path:script,sha256:sha(source)},args:[],staticEnv:{},envBindings:{},timeoutMs:2000,maxInputBytes:4096,maxStdoutBytes:4096,maxStderrBytes:4096}}
function context(cfg:TrustedCliToolConfig){return{ticket:{id:"11111111-1111-4111-8111-111111111111"},proposal:{normalizedArgumentsDigest:"a".repeat(64)},tool:{id:cfg.toolId,protocol:"CLI",downstreamRef:cliDownstreamRef(cfg.toolId),credentialMode:"NONE",executionMode:"ONESHOT"},normalizedArguments:{b:2,a:1}} as any}
describe("TrustedCliAdapter",()=>{
  it("sends dynamic arguments on stdin rather than argv",async()=>{const cfg=await config(`let s='';for await(const c of process.stdin)s+=c;if(process.argv.length!==2)process.exit(9);if(s.trim()!=='{"a":1,"b":2}')process.exit(8);process.exit(0);`),adapter=new TrustedCliAdapter([cfg],{}),result=await adapter.execute(context(cfg));expect(result.transport).toBe("ACCEPTED");expect(result.metadata).toMatchObject({exitCode:0,started:true})});
  it("preserves UNKNOWN when a started command exits nonzero",async()=>{const cfg=await config(`for await(const _ of process.stdin){}process.exit(5);`),adapter=new TrustedCliAdapter([cfg],{}),result=await adapter.execute(context(cfg));expect(result.transport).toBe("UNKNOWN");expect(result.metadata).toMatchObject({exitCode:5,started:true})});
  it("rejects mutable script replacement",async()=>{const cfg=await config(`process.exit(0);`);await writeFile(cfg.pinnedScript!.path,"process.exit(1);","utf8");expect(()=>new TrustedCliAdapter([cfg],{})).toThrow("execution_cli_script_digest_mismatch")});
  it("refuses continuing commands without a guaranteed cancellation/checkpoint protocol",async()=>{const cfg=await config(`process.exit(0);`),adapter=new TrustedCliAdapter([cfg],{}),ctx=context(cfg);ctx.tool.executionMode="CONTINUING";expect(()=>adapter.preflight(ctx)).toThrow("execution_cli_continuing_not_supported")});
});
