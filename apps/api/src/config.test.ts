import {afterEach,describe,expect,it} from "vitest";
import {loadConfig} from "./config.js";

const keys=["CIEAV_GATEWAY_TOKEN","CIEAV_STATE_DIR","CIEAV_CONTROL_PORT","CIEAV_CLOUD_SERVER","CIEAV_LOCAL_AUTHORITY","DATABASE_URL","JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_ALLOW_ORIGIN"] as const;
const saved=new Map(keys.map(k=>[k,process.env[k]]));
afterEach(()=>{for(const k of keys){const v=saved.get(k);if(v===undefined)delete process.env[k];else process.env[k]=v}});

describe("managed local authority config",()=>{
  it("uses local-only persistence semantics and pins origins",()=>{
    process.env.CIEAV_GATEWAY_TOKEN="g".repeat(48);
    process.env.CIEAV_STATE_DIR="/tmp/cieav-user-a";
    process.env.CIEAV_CONTROL_PORT="19090";
    process.env.JWT_SECRET="j".repeat(48);
    process.env.RECEIPT_SIGNING_SECRET="r".repeat(48);
    process.env.DATABASE_URL="postgres://remote.example.test/cieav";
    process.env.CIEAV_ALLOW_ORIGIN="https://evil.example.test";
    delete process.env.CIEAV_CLOUD_SERVER;
    const c=loadConfig();
    expect(c.localAuthority).toBe(true);
    expect(c.databaseUrl).toBeUndefined();
    expect(c.localStateDir).toContain("cieav-user-a");
    expect(c.allowedOrigins).toEqual(["http://127.0.0.1:19090","http://localhost:19090"]);
  });

  it("requires strong secrets for managed local authority",()=>{
    process.env.CIEAV_GATEWAY_TOKEN="g".repeat(48);
    process.env.CIEAV_STATE_DIR="/tmp/cieav-user-a";
    process.env.JWT_SECRET="weak";
    process.env.RECEIPT_SIGNING_SECRET="weak";
    delete process.env.CIEAV_CLOUD_SERVER;
    expect(()=>loadConfig()).toThrow(/requires strong/i);
  });
});
