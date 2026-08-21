#!/usr/bin/env node
import https from "node:https";
import net from "node:net";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined},has=name=>process.argv.includes(name);
const run=(cmd,args,opts={})=>{const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:8*1024*1024,...opts});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed: ${String(r.stderr||r.stdout||"").trim().slice(-3000)}`);return String(r.stdout||"").trim()};
const isPrivateIp=ip=>{const raw=String(ip||"").replace(/^::ffff:/,"").toLowerCase();if(net.isIP(raw)===4){const p=raw.split(".").map(Number);return p[0]===0||p[0]===10||p[0]===127||(p[0]===100&&p[1]>=64&&p[1]<=127)||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||p[0]>=224}if(net.isIP(raw)===6)return raw==="::1"||raw==="::"||raw.startsWith("fc")||raw.startsWith("fd")||/^fe[89ab]/.test(raw);return false};
const cleanOrigin=(name,value)=>{let u;try{u=new URL(String(value||""))}catch{throw new Error(`${name} must be a valid HTTPS origin`)}if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||(u.pathname!=="/"&&u.pathname!==""))throw new Error(`${name} must be a clean HTTPS origin with no credentials, path, query, or fragment`);const host=u.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||isPrivateIp(host))throw new Error(`${name} must not target localhost/private infrastructure`);return u.origin};
const probe=origin=>new Promise((resolve,reject)=>{let remoteAddress=null,tlsProtocol=null,authorized=false,issuer=null;const req=https.request(origin,{method:"HEAD",rejectUnauthorized:true,timeout:8000,headers:{"user-agent":"CIEAV-production-endpoint-bootstrap/1"}},res=>{if(isPrivateIp(remoteAddress))return reject(new Error(`${origin} resolved to private address ${remoteAddress}`));res.resume();resolve({origin,statusCode:res.statusCode??null,remoteAddress,tlsProtocol,authorized,issuer})});req.on("socket",socket=>{socket.on("secureConnect",()=>{remoteAddress=socket.remoteAddress??null;tlsProtocol=socket.getProtocol?.()??null;authorized=socket.authorized===true;const cert=socket.getPeerCertificate?.();issuer=cert?.issuer?.O??cert?.issuer?.CN??null})});req.on("timeout",()=>req.destroy(new Error(`HTTPS probe timed out for ${origin}`)));req.on("error",reject);req.end()});

const cloud=cleanOrigin("CIEAV_CLOUD_URL",arg("--cloud-url")??process.env.CIEAV_CLOUD_URL),download=cleanOrigin("CIEAV_DOWNLOAD_BASE_URL",arg("--download-base-url")??process.env.CIEAV_DOWNLOAD_BASE_URL);
const [cloudProbe,downloadProbe]=await Promise.all([probe(cloud),probe(download)]);for(const p of [cloudProbe,downloadProbe])if(!p.authorized||!p.tlsProtocol)throw new Error(`TLS verification did not complete successfully for ${p.origin}`);
let repository=null,configured=false;
if(has("--configure-github")){
 repository=String(arg("--repository")??process.env.CIEAV_GITHUB_REPOSITORY??JSON.parse(run("gh",["repo","view","--json","nameWithOwner"])).nameWithOwner??"").trim();
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error("unable to resolve GitHub repository identity");
 run("gh",["variable","set","CIEAV_CLOUD_URL","--repo",repository,"--body",cloud]);
 run("gh",["variable","set","CIEAV_DOWNLOAD_BASE_URL","--repo",repository,"--body",download]);
 configured=true;
}
console.log(JSON.stringify({schemaVersion:1,product:"CIEAV",kind:"PRODUCTION_ENDPOINT_BOOTSTRAP",authority:false,cloud:cloudProbe,download:downloadProbe,repository,configuredGitHub:configured,next:configured?"rerun npm run release:preflight:production":"rerun with --configure-github after reviewing the verified origins"},null,2));
