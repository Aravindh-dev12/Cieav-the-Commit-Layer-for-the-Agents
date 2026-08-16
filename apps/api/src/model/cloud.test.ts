import * as http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import type {ActionContext,ActionManifest} from "@cieav/contracts";
import {analyzeWithCloudModel,CIEAV_PRIVATE_INFERENCE_PROTOCOL} from "./cloud.js";

const context:ActionContext={
  requestId:"private-inference-test-0001",
  url:"https://shop.example.test/checkout",
  origin:"https://shop.example.test",
  title:"Checkout",
  element:{tag:"button",text:"Pay now"},
  nearbyText:"Pay for the order.",
  timestamp:"2026-08-16T08:30:00.000Z",
  clientVersion:"0.7.0"
};

const baseline:ActionManifest={
  requestId:context.requestId,
  actionType:"financial.commit",
  summary:"Pay for the order",
  actor:"You",
  target:"shop.example.test",
  recipients:[],
  dataCategories:["FINANCIAL"],
  effects:["If committed, payment is attempted."],
  reversibility:"COMPENSABLE",
  undo:{kind:"NONE"},
  risk:"CRITICAL",
  confidence:.99,
  modelUsed:false,
  warnings:[],
  evidence:["Deterministic baseline."],
  policyVersion:"test"
};

const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});

async function listen(handler:http.RequestListener){
  const server=http.createServer(handler);servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("test_server_address");
  return `http://127.0.0.1:${address.port}/v1`;
}

describe("CIEAV private inference boundary",()=>{
  it("accepts loopback OpenAI-compatible inference and emits non-authoritative provenance",async()=>{
    let observed:any;
    const baseUrl=await listen(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      observed={url:req.url,headers:req.headers,body:JSON.parse(Buffer.concat(chunks).toString("utf8"))};
      res.setHeader("content-type","application/json");
      res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({actionType:"financial.commit",risk:"CRITICAL",reversibility:"COMPENSABLE",confidence:.96,needsDeepReview:true,promptInjectionSuspected:false,reasons:["Payment changes financial state."]})}}]}));
    });
    const result=await analyzeWithCloudModel(context,baseline,{baseUrl,model:"test-private-model",modelRevision:"rev-1",modelDigest:"a".repeat(64),timeoutMs:4000});
    expect(result.result.risk).toBe("CRITICAL");
    expect(result.meta.provider).toBe("cieav-private-inference");
    expect(result.meta.protocolVersion).toBe(CIEAV_PRIVATE_INFERENCE_PROTOCOL);
    expect(result.meta.zeroRetention).toBe(true);
    expect(result.meta.executionAuthority).toBe(false);
    expect(result.meta.modelRevision).toBe("rev-1");
    expect(result.meta.modelDigest).toBe("a".repeat(64));
    expect(observed.url).toBe("/v1/chat/completions");
    expect(observed.headers["x-cieav-inference-protocol"]).toBe(CIEAV_PRIVATE_INFERENCE_PROTOCOL);
    expect(observed.body.messages[0].content).toContain("You have no execution authority");
  });

  it("rejects plaintext non-loopback inference endpoints before network access",async()=>{
    await expect(analyzeWithCloudModel(context,baseline,{baseUrl:"http://models.example.test/v1",model:"unsafe",timeoutMs:2000})).rejects.toThrow(/requires_https/i);
  });
});
