import {describe,expect,it} from "vitest";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CieavAgentSessionStore} from "./agent-sessions.js";
import {verifyToken} from "./auth.js";

const stateSecret="S".repeat(64),jwtSecret="J".repeat(64),intentId="11111111-1111-4111-8111-111111111111";
describe("CIEAV agent sessions",()=>{
  it("issues a short-lived owner-scoped agent token and validates its durable session",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-agent-session-")),store=new CieavAgentSessionStore(path.join(dir,"sessions.json"),stateSecret,jwtSecret);
    const issued=await store.issue({installId:"install-123456789012",agent:{id:"travel-agent",displayName:"Travel Agent",provider:"mcp"},allowedIntentIds:[intentId],allowedActionTypes:["financial.commit"],maxRisk:"HIGH",ttlSeconds:300});
    const payload=verifyToken(issued.token,jwtSecret);
    expect(payload?.tokenType).toBe("agent");
    if(!payload||payload.tokenType!=="agent")throw new Error("agent token expected");
    expect(payload.agentId).toBe("travel-agent");
    expect(payload.allowedIntentIds).toEqual([intentId]);
    expect(payload.scopeDeviceId.startsWith("dev_")).toBe(true);
    expect(await store.validate(payload)).not.toBeNull();
    await store.close();
  });

  it("revokes an already-issued token at the durable session layer",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-agent-revoke-")),file=path.join(dir,"sessions.json"),store=new CieavAgentSessionStore(file,stateSecret,jwtSecret);
    const issued=await store.issue({installId:"install-123456789012",agent:{id:"ops-agent"},allowedIntentIds:[intentId],allowedActionTypes:["access.grant"],maxRisk:"MEDIUM",ttlSeconds:300});
    const payload=verifyToken(issued.token,jwtSecret);if(!payload||payload.tokenType!=="agent")throw new Error("agent token expected");
    await store.revoke(payload.sessionId);
    expect(await store.validate(payload)).toBeNull();
    const reopened=new CieavAgentSessionStore(file,stateSecret,jwtSecret);
    expect((await reopened.list()).find(x=>x.id===payload.sessionId)?.revokedAt).toBeTruthy();
    expect(await reopened.validate(payload)).toBeNull();
    await store.close();await reopened.close();
  });
});
