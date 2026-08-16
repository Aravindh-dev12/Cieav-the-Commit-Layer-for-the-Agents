import * as http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import type {ActionContext,ActionManifest} from "@cieav/contracts";
import {analyzeWithCloudModel,selectPrivateModelRole} from "./cloud.js";
import {privateInferenceReliability} from "./reliability.js";

const servers:http.Server[]=[];
afterEach(async()=>{privateInferenceReliability.reset();await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});

async function listen(handler:http.RequestListener){
  const server=http.createServer(handler);servers.push(server);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();if(!address||typeof address==="string")throw new Error("test_server_address");
  return `http://127.0.0.1:${address.port}/v1`;
}

const context:ActionContext={requestId:"router-test-0001",url:"https://example.test/action",origin:"https://example.test",element:{tag:"button",text:"Continue"},timestamp:"2026-08-16T10:00:00.000Z",clientVersion:"0.7.0"};
function manifest(overrides:Partial<ActionManifest>={}):ActionManifest{return{requestId:context.requestId,actionType:"navigation.open",summary:"Open page",actor:"You",target:"example.test",recipients:[],dataCategories:["NONE"],effects:["Navigation occurs."],reversibility:"REVERSIBLE",undo:{kind:"BROWSER_BACK"},risk:"LOW",confidence:.95,modelUsed:false,warnings:[],evidence:["Deterministic baseline."],policyVersion:"test",...overrides}}
function response(result:any){return JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})}

describe("CIEAV Model Router v1",()=>{
  it("routes simple reversible actions to the fast role",()=>{
    expect(selectPrivateModelRole(manifest())).toBe("fast");
    expect(selectPrivateModelRole(manifest({risk:"HIGH"}))).toBe("primary");
    expect(selectPrivateModelRole(manifest({dataCategories:["FINANCIAL"]}))).toBe("primary");
  });

  it("uses primary plus independent verifier for consequential actions and keeps the stricter result",async()=>{
    const seen:string[]=[];
    const baseUrl=await listen(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));seen.push(`${req.headers["x-cieav-model-role"]}:${body.model}`);
      const model=body.model;
      res.setHeader("content-type","application/json");
      if(model==="primary-test")return res.end(response({actionType:"financial.commit",risk:"HIGH",reversibility:"COMPENSABLE",confidence:.9,needsDeepReview:true,promptInjectionSuspected:false,reasons:["Primary interpretation"]}));
      return res.end(response({actionType:"financial.commit",risk:"CRITICAL",reversibility:"IRREVERSIBLE",confidence:.88,needsDeepReview:true,promptInjectionSuspected:false,reasons:["Verifier sees irreversible financial consequence"]}));
    });
    const base=manifest({actionType:"financial.commit",risk:"HIGH",reversibility:"COMPENSABLE",dataCategories:["FINANCIAL"]});
    const out=await analyzeWithCloudModel(context,base,{baseUrl,model:"primary-test",fastModel:"fast-test",verifierModel:"verifier-test",timeoutMs:4000});
    expect(seen).toEqual(["primary:primary-test","verifier:verifier-test"]);
    expect(out.meta.verifierUsed).toBe(true);
    expect(out.meta.disagreement).toBeGreaterThan(0);
    expect(out.meta.receipts).toHaveLength(2);
    expect(out.meta.receipts.every(x=>x.executionAuthority===false&&x.zeroRetention===true)).toBe(true);
    expect(out.result.risk).toBe("CRITICAL");
    expect(out.result.reversibility).toBe("IRREVERSIBLE");
    expect(out.result.needsDeepReview).toBe(true);
  });

  it("falls back conservatively when the selected primary role fails",async()=>{
    const seen:string[]=[];
    const baseUrl=await listen(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));seen.push(`${req.headers["x-cieav-model-role"]}:${body.model}`);
      if(body.model==="primary-broken"){res.statusCode=503;return res.end("unavailable")}
      res.setHeader("content-type","application/json");
      return res.end(response({actionType:"financial.commit",risk:"HIGH",reversibility:"COMPENSABLE",confidence:.95,needsDeepReview:false,promptInjectionSuspected:false,reasons:["Fallback interpretation"]}));
    });
    const base=manifest({actionType:"financial.commit",risk:"HIGH",reversibility:"COMPENSABLE",dataCategories:["FINANCIAL"]});
    const out=await analyzeWithCloudModel(context,base,{baseUrl,model:"primary-broken",fastModel:"fast-test",verifierModel:"verifier-test",timeoutMs:4000});
    expect(seen[0]).toBe("primary:primary-broken");
    expect(out.meta.fallbackUsed).toBe(true);
    expect(out.meta.degraded).toBe(true);
    expect(out.meta.receipts.some(x=>!x.ok)).toBe(true);
    expect(out.result.risk).toBe("HIGH");
    expect(out.result.confidence).toBeLessThanOrEqual(.65);
    expect(out.result.needsDeepReview).toBe(true);
  });

  it("never lets a model reduce the deterministic baseline",async()=>{
    const baseUrl=await listen(async(_req,res)=>{
      res.setHeader("content-type","application/json");
      res.end(response({actionType:"navigation.open",risk:"LOW",reversibility:"REVERSIBLE",confidence:.99,needsDeepReview:false,promptInjectionSuspected:false,reasons:["Model says safe"]}));
    });
    const base=manifest({actionType:"financial.commit",risk:"CRITICAL",reversibility:"IRREVERSIBLE",dataCategories:["FINANCIAL"]});
    const out=await analyzeWithCloudModel(context,base,{baseUrl,model:"same-test",fastModel:"same-test",verifierModel:"same-test",timeoutMs:4000});
    expect(out.result.actionType).toBe("financial.commit");
    expect(out.result.risk).toBe("CRITICAL");
    expect(out.result.reversibility).toBe("IRREVERSIBLE");
    expect(out.result.needsDeepReview).toBe(true);
    expect(out.meta.degraded).toBe(true);
    expect(out.meta.verifierUsed).toBe(false);
  });
});
