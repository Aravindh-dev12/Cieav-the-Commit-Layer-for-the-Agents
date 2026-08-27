import path from "node:path";
import type {AIProfile} from "./model/openai.js";
import {loadAIProviderRegistry,type AIProviderRegistryConfig} from "./model/provider-registry.js";
import {loadOptionalEnvFile} from "./env-file.js";
import {consumeManagedSecrets} from "./managed-secrets.js";
import {gatewayBearerDigest} from "./gateway-auth.js";
import {loadAuthorityStateDeployment,type AuthorityStateDeployment} from "./authority-state-deployment.js";
import {acquireAuthorityProcessLease} from "./authority-process-lease.js";

export interface Config {
  port:number;databaseUrl?:string;jwtSecret:string;receiptSigningSecret:string;
  openaiApiKey?:string;openaiBaseUrl:string;aiProfile:AIProfile;fastModel:string;primaryModel:string;verifierModel:string;aiTimeoutMs:number;
  aiProviderRegistry:AIProviderRegistryConfig;
  hfEnabled:boolean;gatewayUrl:string;gatewayTokenDigest?:string;semanticRouterToken?:string;hfTimeoutMs:number;
  cloudServer:boolean;localAuthority:boolean;localStateDir?:string;authorityState:AuthorityStateDeployment;
  cloudModelBaseUrl:string;cloudModel:string;cloudFastModel:string;cloudVerifierModel:string;cloudModelRevision?:string;cloudModelDigest?:string;cloudModelApiKey?:string;cloudModelTimeoutMs:number;
  allowedOrigins:string[];proofFilesystemRoots:string[];proofHttpOrigins:string[];proofGitRepositories:string[];proofHttpAllowPrivateNetworks:boolean
}
function profile(v?:string):AIProfile{return v==="economy"||v==="maximum"?v:"balanced"}
const env=(primary:string,legacy?:string,fallback?:string)=>process.env[primary]??(legacy?process.env[legacy]:undefined)??fallback;
const listEnv=(primary:string,legacy?:string)=>String(env(primary,legacy,"")??"").split(",").map(s=>s.trim()).filter(Boolean);
const DEV_JWT="dev-only-jwt-secret-change-me",DEV_RECEIPT="dev-only-receipt-secret-change-me";

export function loadConfig():Config{
  loadOptionalEnvFile();
  const managed=consumeManagedSecrets(),managedMode=process.env.CIEAV_MANAGED_SECRET_PIPE==="1";
  if(managedMode&&!managed)throw new Error("CIEAV managed local authority requires private bootstrap secrets");
  if(managed&&(process.env.JWT_SECRET||process.env.RECEIPT_SIGNING_SECRET||process.env.CIEAV_GATEWAY_TOKEN||process.env.LATCH_GATEWAY_TOKEN))throw new Error("CIEAV managed secret bootstrap must not be duplicated in process environment");
  const jwtSecret=managed?.jwtSecret??process.env.JWT_SECRET??DEV_JWT,receiptSigningSecret=managed?.receiptSigningSecret??process.env.RECEIPT_SIGNING_SECRET??DEV_RECEIPT,gatewayToken=managed?.gatewayToken??env("CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN"),gatewayTokenDigest=gatewayToken?gatewayBearerDigest(gatewayToken):undefined,semanticRouterToken=managed?.semanticRouterToken??gatewayToken,cloudModelApiKey=env("CIEAV_CLOUD_MODEL_API_KEY","LATCH_CLOUD_MODEL_API_KEY"),cloudModelRevision=env("CIEAV_CLOUD_MODEL_REVISION","LATCH_CLOUD_MODEL_REVISION")?.trim()||undefined,cloudModelDigest=env("CIEAV_CLOUD_MODEL_DIGEST","LATCH_CLOUD_MODEL_DIGEST")?.trim()||undefined,cloudServer=env("CIEAV_CLOUD_SERVER","LATCH_CLOUD_SERVER")==="1",explicitLocal=env("CIEAV_LOCAL_AUTHORITY","LATCH_LOCAL_AUTHORITY")==="1",localAuthority=!cloudServer&&Boolean(explicitLocal||gatewayTokenDigest),stateDir=env("CIEAV_STATE_DIR","LATCH_STATE_DIR"),controlPort=env("CIEAV_CONTROL_PORT","LATCH_CONTROL_PORT","8790")!;
  if(cloudServer&&explicitLocal)throw new Error("CIEAV API cannot be both cloud-server and local-authority mode");
  if((cloudServer||localAuthority)&&(jwtSecret===DEV_JWT||receiptSigningSecret===DEV_RECEIPT||jwtSecret.length<32||receiptSigningSecret.length<32))throw new Error(`${cloudServer?"CIEAV Cloud":"CIEAV local authority"} requires strong JWT_SECRET and RECEIPT_SIGNING_SECRET values`);
  if(localAuthority&&!stateDir)throw new Error("CIEAV local authority requires CIEAV_STATE_DIR");
  if(managedMode&&semanticRouterToken===gatewayToken)throw new Error("CIEAV managed semantic router capability must be distinct from Gateway admin authority");
  if(cloudModelDigest&&!/^[A-Fa-f0-9]{64}$/.test(cloudModelDigest))throw new Error("CIEAV_CLOUD_MODEL_DIGEST must be a 64-character SHA-256 hex digest");
  const authorityState=localAuthority?loadAuthorityStateDeployment(process.env):loadAuthorityStateDeployment({});
  if(localAuthority&&stateDir&&authorityState.mode==="single-writer-file")acquireAuthorityProcessLease(path.resolve(stateDir));
  const allowedOrigins=localAuthority?[`http://127.0.0.1:${controlPort}`,`http://localhost:${controlPort}`]:env("CIEAV_ALLOW_ORIGIN","LATCH_ALLOW_ORIGIN","http://127.0.0.1:8790,http://localhost:8790,http://localhost:5173")!.split(",").map(s=>s.trim()).filter(Boolean);
  const proofFilesystemRoots=localAuthority?listEnv("CIEAV_PROOF_FILESYSTEM_ROOTS","LATCH_PROOF_FILESYSTEM_ROOTS").map(root=>path.resolve(root)):[];
  const proofHttpOrigins=localAuthority?listEnv("CIEAV_PROOF_HTTP_ORIGINS","LATCH_PROOF_HTTP_ORIGINS").map(value=>new URL(value).origin):[];
  const proofGitRepositories=localAuthority?listEnv("CIEAV_PROOF_GIT_REPOSITORIES","LATCH_PROOF_GIT_REPOSITORIES").map(repo=>path.resolve(repo)):[];
  const proofHttpAllowPrivateNetworks=localAuthority&&(env("CIEAV_PROOF_HTTP_ALLOW_PRIVATE","LATCH_PROOF_HTTP_ALLOW_PRIVATE")==="1");
  const cloudModel=env("CIEAV_CLOUD_MODEL","LATCH_CLOUD_MODEL","Qwen/Qwen3.6-35B-A3B")!;
  const cloudFastModel=env("CIEAV_CLOUD_FAST_MODEL","LATCH_CLOUD_FAST_MODEL",cloudModel)!;
  const cloudVerifierModel=env("CIEAV_CLOUD_VERIFIER_MODEL","LATCH_CLOUD_VERIFIER_MODEL",cloudModel)!;
  const aiProviderRegistry=loadAIProviderRegistry(localAuthority&&stateDir?path.resolve(stateDir):undefined);
  return{
    port:Number(process.env.PORT??env("CIEAV_API_PORT","LATCH_API_PORT","8787")),jwtSecret,receiptSigningSecret,
    ...(process.env.OPENAI_API_KEY?{openaiApiKey:process.env.OPENAI_API_KEY}:{}),openaiBaseUrl:process.env.OPENAI_BASE_URL??"https://api.openai.com/v1",aiProfile:profile(env("CIEAV_AI_PROFILE","LATCH_AI_PROFILE")),fastModel:env("CIEAV_AI_FAST_MODEL","LATCH_AI_FAST_MODEL","gpt-5.6-luna")!,primaryModel:env("CIEAV_AI_PRIMARY_MODEL","LATCH_AI_PRIMARY_MODEL",env("CIEAV_MODEL","LATCH_MODEL","gpt-5.6"))!,verifierModel:env("CIEAV_AI_VERIFIER_MODEL","LATCH_AI_VERIFIER_MODEL","gpt-5.6-terra")!,aiTimeoutMs:Math.max(2500,Math.min(60000,Number(env("CIEAV_AI_TIMEOUT_MS","LATCH_AI_TIMEOUT_MS","9500")))),aiProviderRegistry,
    hfEnabled:env("CIEAV_HF_ENABLED","LATCH_HF_ENABLED")==="1"&&Boolean(semanticRouterToken),gatewayUrl:env("CIEAV_GATEWAY_URL","LATCH_GATEWAY_URL","http://127.0.0.1:8791")!,...(gatewayTokenDigest?{gatewayTokenDigest}:{}),...(semanticRouterToken?{semanticRouterToken}:{}),hfTimeoutMs:Math.max(2000,Math.min(30000,Number(env("CIEAV_HF_TIMEOUT_MS","LATCH_HF_TIMEOUT_MS","10000")))),
    cloudServer,localAuthority,...(localAuthority&&stateDir?{localStateDir:path.resolve(stateDir)}:{}),authorityState,cloudModelBaseUrl:env("CIEAV_CLOUD_MODEL_BASE_URL","LATCH_CLOUD_MODEL_BASE_URL","http://127.0.0.1:8000/v1")!,cloudModel,cloudFastModel,cloudVerifierModel,...(cloudModelRevision?{cloudModelRevision}:{}),...(cloudModelDigest?{cloudModelDigest:cloudModelDigest.toLowerCase()}:{}),...(cloudModelApiKey?{cloudModelApiKey}:{}),cloudModelTimeoutMs:Math.max(2000,Math.min(30000,Number(env("CIEAV_CLOUD_MODEL_TIMEOUT_MS","LATCH_CLOUD_MODEL_TIMEOUT_MS","10000")))),allowedOrigins,proofFilesystemRoots,proofHttpOrigins,proofGitRepositories,proofHttpAllowPrivateNetworks
  }
}
