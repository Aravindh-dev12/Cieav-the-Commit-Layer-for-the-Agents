import crypto from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {TrustedRos2CliAdapter,ros2CliDownstreamRef,type TrustedRos2ToolConfig} from "./trusted-ros2-adapter.js";

const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
function config(overrides:Partial<TrustedRos2ToolConfig>={}):TrustedRos2ToolConfig{return{toolId:"ros.service",mode:"SERVICE_CALL",rosName:"/robot/set_mode",rosType:"example_interfaces/srv/SetBool",command:process.execPath,commandSha256:sha256(readFileSync(process.execPath)),prefixArgs:["-e","process.exit(0)","--"],staticEnv:{},timeoutMs:2_000,maxStdoutBytes:8_192,maxStderrBytes:8_192,maxArgumentBytes:8_192,...overrides}}
function context(c=config(),overrides:Record<string,unknown>={}){return{ticket:{},proposal:{},tool:{id:c.toolId,protocol:"ROS2",operation:"set_mode",downstreamRef:ros2CliDownstreamRef(c),credentialMode:"NONE",risk:"HIGH",consequenceCapable:true,proofSources:[],enabled:true},normalizedArguments:{data:true},...overrides} as any}

describe("TrustedRos2CliAdapter",()=>{
  it("executes a digest-pinned one-shot ROS2 service transport",async()=>{const c=config(),adapter=new TrustedRos2CliAdapter([c]),ctx=context(c);expect(()=>adapter.preflight(ctx)).not.toThrow();const result=await adapter.execute(ctx);expect(result).toMatchObject({transport:"ACCEPTED",metadata:{toolId:c.toolId,mode:"SERVICE_CALL",exitCode:0,timedOut:false}})});
  it("fails closed if the configured ROS2 executable digest is wrong",async()=>{const c=config({commandSha256:"0".repeat(64)}),adapter=new TrustedRos2CliAdapter([c]);expect(()=>adapter.preflight(context(c))).toThrow("execution_ros2_command_digest_mismatch")});
  it("refuses CONTINUING execution because the CLI transport cannot guarantee goal cancellation",async()=>{const c=config(),adapter=new TrustedRos2CliAdapter([c]);expect(()=>adapter.preflight(context(c,{tool:{...context(c).tool,executionMode:"CONTINUING"}}))).toThrow("execution_ros2_cli_continuing_action_not_supported")});
  it("treats a nonzero exit after process start as UNKNOWN rather than failure",async()=>{const c=config({prefixArgs:["-e","process.exit(7)","--"]}),adapter=new TrustedRos2CliAdapter([c]),result=await adapter.execute(context(c));expect(result).toMatchObject({transport:"UNKNOWN",metadata:{exitCode:7,timedOut:false}})});
  it("rejects downstream reference substitution before process execution",async()=>{const c=config(),adapter=new TrustedRos2CliAdapter([c]);expect(()=>adapter.preflight(context(c,{tool:{...context(c).tool,downstreamRef:"ros2+cli:service_call:%2Fother#bad"}}))).toThrow("execution_ros2_downstream_ref_mismatch")});
});
