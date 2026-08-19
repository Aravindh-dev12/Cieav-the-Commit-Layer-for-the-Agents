import {describe,expect,it} from "vitest";
import {gatewayBearerDigest,verifyGatewayAuthorization} from "./gateway-auth.js";

describe("Gateway bearer verifier",()=>{
  it("accepts only the exact bearer while retaining a fixed verifier",()=>{
    const token="gateway-"+"g".repeat(64),digest=gatewayBearerDigest(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(verifyGatewayAuthorization(`Bearer ${token}`,digest)).toBe(true);
    expect(verifyGatewayAuthorization(`Bearer ${token}x`,digest)).toBe(false);
  });
  it("rejects malformed authorization and verifier values",()=>{
    const digest=gatewayBearerDigest("g".repeat(64));
    expect(verifyGatewayAuthorization(undefined,digest)).toBe(false);
    expect(verifyGatewayAuthorization("Basic abc",digest)).toBe(false);
    expect(verifyGatewayAuthorization("Bearer ",digest)).toBe(false);
    expect(verifyGatewayAuthorization("Bearer "+"x".repeat(4097),digest)).toBe(false);
    expect(verifyGatewayAuthorization("Bearer token","not-a-digest")).toBe(false);
  });
});
