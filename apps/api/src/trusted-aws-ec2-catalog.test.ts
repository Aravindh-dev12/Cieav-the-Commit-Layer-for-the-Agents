import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {loadTrustedCliAdaptersSync} from "./trusted-cli-adapter.js";
import {TrustedAwsEc2Adapter,awsEc2DownstreamRef,awsEc2InstanceTarget,AwsEc2StopArgsSchema} from "./trusted-aws-ec2-adapter.js";

const dirs:string[]=[];afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true})});
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-aws-catalog-"));dirs.push(dir);const config={toolId:"stop-production-worker",partition:"AWS",region:"us-east-1",instanceId:"i-1234567890abcdef0",credentials:{accessKeyIdEnv:"CIEAV_AWS_ACCESS_KEY_ID",secretAccessKeyEnv:"CIEAV_AWS_SECRET_ACCESS_KEY",sessionTokenEnv:"CIEAV_AWS_SESSION_TOKEN"},timeoutMs:1000,maxResponseBytes:65536} as const,catalog=path.join(dir,"execution-adapters.json");writeFileSync(catalog,JSON.stringify({version:1,awsEc2:[config]}));const env={CIEAV_EXECUTION_ADAPTERS_FILE:catalog,CIEAV_AWS_ACCESS_KEY_ID:"ASIA1234567890ABCDEF",CIEAV_AWS_SECRET_ACCESS_KEY:"0123456789abcdefghijklmnopqrstuvwxyzABCD",CIEAV_AWS_SESSION_TOKEN:"session-token"};return{dir,config,catalog,env}}

describe("AWS EC2 execution catalog",()=>{
  it("discovers a first-class AWS adapter through the shared trusted catalog",()=>{const f=fixture(),adapters=loadTrustedCliAdaptersSync(f.dir,f.env);expect(adapters).toHaveLength(1);expect(adapters[0]).toBeInstanceOf(TrustedAwsEc2Adapter);expect(adapters[0]!.protocol).toBe("AWS")});
  it("binds partition, region, instance and credential principal but never credential values",()=>{const f=fixture(),c=f.config as any,target=awsEc2InstanceTarget(c),downstream=awsEc2DownstreamRef(c);expect(target).toBe("aws-ec2-instance:AWS:us-east-1:i-1234567890abcdef0");expect(awsEc2InstanceTarget({...c,instanceId:"i-abcdef01234567890"})).not.toBe(target);expect(awsEc2DownstreamRef({...c,credentials:{...c.credentials,secretAccessKeyEnv:"OTHER_SECRET"}})).not.toBe(downstream);expect(downstream).not.toContain(f.env.CIEAV_AWS_SECRET_ACCESS_KEY);expect(downstream).not.toContain(f.env.CIEAV_AWS_SESSION_TOKEN)});
  it("permits no dynamic stop options",()=>{expect(AwsEc2StopArgsSchema.parse({expectedState:"running"})).toEqual({expectedState:"running"});for(const input of [{expectedState:"stopped"},{expectedState:"running",force:true},{expectedState:"running",instanceId:"i-abcdef01234567890"}])expect(AwsEc2StopArgsSchema.safeParse(input).success).toBe(false)});
});
