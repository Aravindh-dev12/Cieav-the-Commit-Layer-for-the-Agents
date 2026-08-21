#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
const has=name=>process.argv.includes(name);
const root=path.resolve(arg("--root")??"");
const pfxPath=path.resolve(arg("--pfx")??"");
const port=Number(arg("--port")??0);
const password=process.env.CIEAV_LOCAL_LIVE_PFX_PASSWORD??"";
if(!root||!fs.statSync(root).isDirectory())throw new Error("--root must be a local live layout directory");
if(!pfxPath||!fs.statSync(pfxPath).isFile())throw new Error("--pfx must be a TLS PFX file");
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("--port must be 1024-65535");
if(password.length<16)throw new Error("CIEAV_LOCAL_LIVE_PFX_PASSWORD is required");
const failAfterArtifact=has("--fail-cloud-after-artifact");
let cloudUnavailable=false;
let issuedToken=null;
const json=(res,status,value)=>{const body=Buffer.from(JSON.stringify(value));res.writeHead(status,{"content-type":"application/json","content-length":body.length,"cache-control":"no-store"});res.end(body)};
const readJson=req=>new Promise((resolve,reject)=>{const chunks=[];let n=0;req.on("data",c=>{n+=c.length;if(n>1024*1024){reject(new Error("request too large"));req.destroy();return}chunks.push(c)});req.on("end",()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"))}catch(e){reject(e)}});req.on("error",reject)});
const safeFile=urlPath=>{let decoded;try{decoded=decodeURIComponent(urlPath)}catch{return null}if(decoded.includes("\\")||decoded.includes("\0"))return null;const relative=decoded.replace(/^\/+/,"");const file=path.resolve(root,relative);const rel=path.relative(root,file);if(rel===""||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))return null;return file};
const server=https.createServer({pfx:fs.readFileSync(pfxPath),passphrase:password,minVersion:"TLSv1.2"},async(req,res)=>{
  try{
    const url=new URL(req.url??"/","https://localhost");
    if(url.pathname==="/health"&&req.method==="GET"){
      if(cloudUnavailable)return json(res,503,{ok:false,error:"local live controlled cloud outage"});
      return json(res,200,{ok:true,model:"cieav-local-live-fixture",privacyMode:"loopback-test-only"});
    }
    if(url.pathname==="/v1/devices/register"&&req.method==="POST"){
      if(cloudUnavailable)return json(res,503,{error:"local live controlled cloud outage"});
      const body=await readJson(req);if(typeof body.installId!=="string"||!body.installId)return json(res,400,{error:"installId required"});
      issuedToken=crypto.randomBytes(32).toString("base64url");return json(res,200,{token:issuedToken,deviceId:"local-live-device",expiresAt:"2099-01-01T00:00:00Z"});
    }
    if(url.pathname==="/v1/inference/analyze"&&req.method==="POST"){
      if(cloudUnavailable)return json(res,503,{error:"local live controlled cloud outage"});
      if(!issuedToken||req.headers.authorization!==`Bearer ${issuedToken}`)return json(res,401,{error:"unauthorized"});
      const body=await readJson(req),privacy=body?.privacy;if(privacy?.rawFormValuesIncluded!==false||privacy?.rawSecretsIncluded!==false||privacy?.fullPageTextIncluded!==false||privacy?.durableStorageRequested!==false)return json(res,400,{error:"privacy contract violation"});
      return json(res,200,{result:{actionType:"financial.commit",risk:"CRITICAL",reversibility:"IRREVERSIBLE",confidence:0.99,dataCategories:["FINANCIAL"]},meta:{model:"cieav-local-live-fixture"}});
    }
    if(req.method!=="GET"&&req.method!=="HEAD")return json(res,405,{error:"method not allowed"});
    const file=safeFile(url.pathname);if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:"not found"});
    const stat=fs.statSync(file),ext=path.extname(file).toLowerCase(),type=ext===".json"?"application/json":ext===".zip"?"application/zip":"application/octet-stream";
    res.writeHead(200,{"content-type":type,"content-length":stat.size,"cache-control":"no-store"});
    if(req.method==="HEAD"){res.end();return}
    const stream=fs.createReadStream(file);stream.on("error",e=>res.destroy(e));stream.on("end",()=>{if(failAfterArtifact&&ext===".zip")cloudUnavailable=true});stream.pipe(res);
  }catch(err){if(!res.headersSent)json(res,500,{error:String(err?.message??err).slice(0,300)});else res.destroy(err)}
});
server.listen(port,"localhost",()=>console.log(`CIEAV local live HTTPS fixture ready · https://localhost:${port} · failAfterArtifact=${failAfterArtifact}`));
const stop=()=>server.close(()=>process.exit(0));process.on("SIGINT",stop);process.on("SIGTERM",stop);
