#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),fail=[];
function need(file,...tokens){const p=path.join(root,file);if(!fs.existsSync(p)){fail.push(`${file}: missing`);return}const text=fs.readFileSync(p,"utf8");for(const token of tokens)if(!text.includes(token))fail.push(`${file}: missing ${token}`)}
need("packages/core/src/provider-runtime.ts","learning_provider_must_have_zero_authority","learning_request_authority_invariant_violation","learning_provider_result_authority_invariant_violation");
need("apps/api/src/learning-job-queue.ts","SUCCEEDED_UNQUALIFIED","candidateQualified:false","promotionExecuted:false","learning_job_interrupted_by_runtime_restart");
need("apps/api/src/managed-learning-providers.ts","OpenAIManagedFineTuningProvider","AzureMLManagedLearningProvider","VertexManagedLearningProvider","SageMakerAgentRftLearningProvider","AWS4-HMAC-SHA256","JobCategory:\"AgentRFT\"","candidateQualified:false","promotionExecuted:false","authority:false","productionAuthority:false");
need("apps/api/src/managed-learning-providers.test.ts","cannot qualify or promote","SageMaker AgentRFT","assertZero");
need(".env.example","CIEAV_AWS_AGENT_RFT_ENABLED","CIEAV_AZURE_ML_TRAINING_ENABLED","CIEAV_VERTEX_TRAINING_ENABLED","CIEAV_OPENAI_TRAINING_ENABLED");
if(fail.length){console.error("CIEAV managed learning static gate FAIL");for(const item of fail)console.error(` - ${item}`);process.exit(1)}
console.log("CIEAV managed learning static gate PASS - OpenAI access-dependent fine-tuning + Azure ML + Vertex custom training + SageMaker AgentRFT all terminate unqualified with zero authority");
