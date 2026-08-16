import * as http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import {probePrivateInferenceHealth} from "./health.js";
import {privateInferenceReliability,providerKey} from "./reliability.js";

const servers:http.Server[]=[];
afterEach(async()=>{privateInferenceReliability.reset();await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>s.close(()=>resolve()))))});
async function listen(handler:http.RequestListener){const server=http.createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const a=server.address();if(!a||typeof a==="string")throw new Error("address");return`http://127.0.0.1:${a.port}/v1`}

describe("private inference health probe",()=>{
  it("records healthy OpenAI-compatible model service",async()=>{
    const baseUrl=await listen((req,res)=>{expect(req.url).toBe("/v1/models");expect(req.headers["x-cieav-inference-protocol"]).toBe("cieav-private-inference-v1");res.setHeader("content-type","application/json");res.end(JSON.stringify({data:[{id:"Qwen/Qwen3.6-35B-A3B"}]}))});
    const result=await probePrivateInferenceHealth({baseUrl,model:"Qwen/Qwen3.6-35B-A3B",timeoutMs:2000});
    expect(result).toMatchObject({ok:true,listed:true});
    expect(result.health.state).toBe("CLOSED");
  });
  it("records failed health responses conservatively",async()=>{
    const baseUrl=await listen((_req,res)=>{res.statusCode=503;res.end("down")});
    const result=await probePrivateInferenceHealth({baseUrl,model:"primary",timeoutMs:2000});
    expect(result.ok).toBe(false);
    expect(result.health.consecutiveFailures).toBe(1);
    expect(privateInferenceReliability.snapshot(providerKey(baseUrl,"primary")).lastError).toContain("503");
  });
});
