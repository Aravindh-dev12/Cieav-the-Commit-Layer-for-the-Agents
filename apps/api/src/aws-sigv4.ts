import crypto from "node:crypto";
import {z} from "zod";

const EnvName=z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/);
export const AwsCredentialBindingSchema=z.object({accessKeyIdEnv:EnvName,secretAccessKeyEnv:EnvName,sessionTokenEnv:EnvName.optional()}).strict();
export type AwsCredentialBinding=z.infer<typeof AwsCredentialBindingSchema>;
export type AwsCredentials={accessKeyId:string;secretAccessKey:string;sessionToken?:string};
const sha256=(v:string|Buffer)=>crypto.createHash("sha256").update(v).digest("hex");
const hmac=(key:string|Buffer,value:string)=>crypto.createHmac("sha256",key).update(value).digest();

export function awsCredentials(binding:AwsCredentialBinding,env:NodeJS.ProcessEnv):AwsCredentials{
  const accessKeyId=env[binding.accessKeyIdEnv],secretAccessKey=env[binding.secretAccessKeyEnv],sessionToken=binding.sessionTokenEnv?env[binding.sessionTokenEnv]:undefined;
  if(!accessKeyId||!secretAccessKey)throw new Error("aws_credentials_missing");
  if(!/^[A-Z0-9]{16,128}$/.test(accessKeyId)||secretAccessKey.length<16||secretAccessKey.length>4096||/[\r\n\0]/.test(secretAccessKey))throw new Error("aws_credentials_invalid");
  if(binding.sessionTokenEnv&&(!sessionToken||sessionToken.length>8192||/[\r\n\0]/.test(sessionToken)))throw new Error("aws_session_token_invalid");
  return{accessKeyId,secretAccessKey,...(sessionToken?{sessionToken}:{})};
}

export function awsQueryBody(parameters:Record<string,string>){return Object.entries(parameters).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encodeURIComponent(k).replace(/%20/g,"+")}=${encodeURIComponent(v).replace(/%20/g,"+")}`).join("&")}
function amzTimestamp(now:Date){const iso=now.toISOString().replace(/[:-]|\.\d{3}/g,"");return{amzDate:iso,date:iso.slice(0,8)}}
export function signAwsPost(input:{host:string;region:string;service:string;body:string;credentials:AwsCredentials;now?:Date}){
  if(!/^[a-z0-9.-]+$/.test(input.host)||!input.host.includes("."))throw new Error("aws_sigv4_host_invalid");
  if(!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(input.region))throw new Error("aws_sigv4_region_invalid");
  if(!/^[a-z0-9-]{2,32}$/.test(input.service))throw new Error("aws_sigv4_service_invalid");
  const {amzDate,date}=amzTimestamp(input.now??new Date()),contentType="application/x-www-form-urlencoded; charset=utf-8",payloadHash=sha256(input.body);
  const canonicalPairs:Array<[string,string]>=[["content-type",contentType],["host",input.host],["x-amz-date",amzDate]];
  if(input.credentials.sessionToken)canonicalPairs.push(["x-amz-security-token",input.credentials.sessionToken]);
  canonicalPairs.sort(([a],[b])=>a.localeCompare(b));
  const canonicalHeaders=canonicalPairs.map(([k,v])=>`${k}:${v.trim().replace(/\s+/g," ")}\n`).join(""),signedHeaders=canonicalPairs.map(([k])=>k).join(";");
  const canonicalRequest=`POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`,scope=`${date}/${input.region}/${input.service}/aws4_request`,stringToSign=`AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const kDate=hmac(`AWS4${input.credentials.secretAccessKey}`,date),kRegion=hmac(kDate,input.region),kService=hmac(kRegion,input.service),kSigning=hmac(kService,"aws4_request"),signature=crypto.createHmac("sha256",kSigning).update(stringToSign).digest("hex");
  const authorization=`AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return{headers:{"content-type":contentType,"x-amz-date":amzDate,...(input.credentials.sessionToken?{"x-amz-security-token":input.credentials.sessionToken}:{}),authorization,"content-length":String(Buffer.byteLength(input.body))},payloadHash,canonicalRequestHash:sha256(canonicalRequest),signedHeaders};
}
