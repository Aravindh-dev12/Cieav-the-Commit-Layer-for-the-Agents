import {Readable} from "node:stream";
import type * as http from "node:http";
import {describe,expect,it,vi} from "vitest";
import {CieavUniversalIntelligenceApi} from "./universal-intelligence-api.js";

function request(method:string,value:unknown):http.IncomingMessage{
  return Object.assign(Readable.from([JSON.stringify(value)]),{method}) as unknown as http.IncomingMessage;
}

describe("CieavUniversalIntelligenceApi trusted experience boundary",()=>{
  it("rejects caller-asserted verified trajectories without invoking the intelligence store",async()=>{
    const ingestVerifiedExperience=vi.fn();
    const store={ingestVerifiedExperience} as any;
    const trusted={ingestFromTicket:vi.fn()} as any;
    const api=new CieavUniversalIntelligenceApi(store,trusted);
    const res=await api.handleGateway(request("POST",{trajectory:{cryptographicallyVerified:true,authorityGrade:true,realityBound:true,eligibleAgenticRl:true}}),"/v1/intelligence/experience",new URL("http://127.0.0.1/v1/intelligence/experience"));
    expect(res?.status).toBe(403);
    expect(res?.body).toMatchObject({error:"caller_asserted_verified_experience_forbidden",requiredPath:"/v1/intelligence/experience/from-ticket",authority:false,mayMintExecutionAuthority:false});
    expect(ingestVerifiedExperience).not.toHaveBeenCalled();
    expect(trusted.ingestFromTicket).not.toHaveBeenCalled();
  });

  it("delegates ticket-derived experience only to the trusted ingestor",async()=>{
    const store={ingestVerifiedExperience:vi.fn()} as any;
    const result={version:"CIEAV_TRUSTED_EXPERIENCE_INGESTION_V1",authority:false,productionAuthority:false,mayMintExecutionAuthority:false};
    const trusted={ingestFromTicket:vi.fn().mockResolvedValue(result)} as any;
    const api=new CieavUniversalIntelligenceApi(store,trusted);
    const payload={executionTicketId:"11111111-1111-4111-8111-111111111111",redactionProfile:"training-v1",consentScope:"local-training"};
    const res=await api.handleGateway(request("POST",payload),"/v1/intelligence/experience/from-ticket",new URL("http://127.0.0.1/v1/intelligence/experience/from-ticket"));
    expect(res).toEqual({status:201,body:result});
    expect(trusted.ingestFromTicket).toHaveBeenCalledTimes(1);
    expect(trusted.ingestFromTicket).toHaveBeenCalledWith(payload);
    expect(store.ingestVerifiedExperience).not.toHaveBeenCalled();
  });

  it("fails closed when ticket-derived ingestion is not available",async()=>{
    const api=new CieavUniversalIntelligenceApi({} as any);
    const res=await api.handleGateway(request("POST",{}),"/v1/intelligence/experience/from-ticket",new URL("http://127.0.0.1/v1/intelligence/experience/from-ticket"));
    expect(res?.status).toBe(503);
    expect(res?.body).toMatchObject({error:"trusted_experience_ingestor_unavailable",authority:false,mayMintExecutionAuthority:false});
  });
});
