#!/usr/bin/env node
import http from "node:http";
import {
  scoreRlvrDecision,
  scoreTrajectory,
  evaluateMlPromotion,
  evaluateMlVerifierBank,
  evaluateMlRewardGap,
  prioritizeMlFailures,
  classifyMlCurriculumBand,
  verifyMlPerturbation,
  summarizeMlPerturbations,
} from "../packages/core/dist/index.js";

const port=Number(process.env.CIEAV_ML_VERIFIER_PORT??"8765");
const token=process.env.CIEAV_ML_VERIFIER_TOKEN;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("invalid CIEAV_ML_VERIFIER_PORT");
if(!token||token.length<32)throw new Error("CIEAV_ML_VERIFIER_TOKEN must be at least 32 characters");

async function body(req){const chunks=[];let n=0;for await(const c of req){const b=Buffer.from(c);n+=b.length;if(n>2_000_000)throw new Error("body_too_large");chunks.push(b)}return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}")}function send(res,status,value){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(value))}
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.authorization!==`Bearer ${token}`)return send(res,401,{error:"unauthorized"});
  if(req.method==="GET"&&req.url==="/health")return send(res,200,{ok:true,authority:false,protocol:"CIEAV_ML_VERIFIER_V1",capabilities:["decision_reward","trajectory_reward","promotion","verifier_bank","reward_gap","failure_mining","perturbation_verification"]});
  if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});
  const x=await body(req);
  if(req.url==="/v1/reward/decision")return send(res,200,scoreRlvrDecision(x.expectation,x.candidate,x.process));
  if(req.url==="/v1/reward/trajectory")return send(res,200,scoreTrajectory(x.steps,x.policy));
  if(req.url==="/v1/promotion")return send(res,200,evaluateMlPromotion(x.samples,x.thresholds));
  if(req.url==="/v1/verifier-bank")return send(res,200,evaluateMlVerifierBank(x.rows,x.maxGeneralizationGap));
  if(req.url==="/v1/reward-gap")return send(res,200,evaluateMlRewardGap(x.samples,x.maxMeanGap,x.maxSingleGap));
  if(req.url==="/v1/failures/prioritize"){
    const priorities=prioritizeMlFailures(x.rows,x.limit).map(row=>({...row,curriculumBand:classifyMlCurriculumBand(row)}));
    return send(res,200,{priorities});
  }
  if(req.url==="/v1/perturbations/verify"){
    const rows=Array.isArray(x.rows)?x.rows:[];
    const results=rows.map(row=>verifyMlPerturbation(row.base,row.mutated,row.test));
    return send(res,200,{results,summary:summarizeMlPerturbations(results)});
  }
  return send(res,404,{error:"not_found"});
}catch(e){send(res,400,{error:String(e?.message??e)})}});
server.listen(port,"127.0.0.1",()=>console.log(`CIEAV ML verifier listening on 127.0.0.1:${port}`));
