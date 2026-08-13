#!/usr/bin/env node
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname),SIGN=path.join(ROOT,"scripts/release-sign.mjs"),tmp=await mkdtemp(path.join(os.tmpdir(),"cieav-sign-"));
const priv=path.join(tmp,"release-private.pem"),pub=path.join(tmp,"release-public.pem"),out=path.join(tmp,"sig"),manifest=path.join(tmp,"manifest.json");
const run=args=>spawnSync(process.execPath,[SIGN,...args],{cwd:ROOT,encoding:"utf8"});
const ok=(args,label)=>{const r=run(args);if(r.status!==0)throw new Error(`${label}: ${r.stderr||r.stdout}`);return r};
const bad=(args,label)=>{const r=run(args);if(r.status===0)throw new Error(`${label}: expected failure`);return r};
try{
  await writeFile(manifest,JSON.stringify({schemaVersion:3,brand:"CIEAV",version:"0.7.0"})+"\n");
  ok(["generate","--private-key",priv,"--public-key",pub],"generate");
  ok(["sign","--private-key",priv,"--public-key",pub,"--output-dir",out,manifest],"sign");
  ok(["verify","--public-key",pub,"--output-dir",out,manifest],"verify");
  await writeFile(manifest,JSON.stringify({schemaVersion:3,brand:"CIEAV",version:"9.9.9"})+"\n");
  bad(["verify","--public-key",pub,"--output-dir",out,manifest],"tampered manifest");
  const envelopePath=path.join(out,"manifest.json.sig.json"),envelope=JSON.parse(await readFile(envelopePath,"utf8"));envelope.signature="A"+String(envelope.signature).slice(1);await writeFile(envelopePath,JSON.stringify(envelope,null,2)+"\n");
  bad(["verify","--public-key",pub,"--output-dir",out,manifest],"tampered signature");
  bad(["generate","--private-key",priv,"--public-key",pub],"key overwrite");
  console.log("CIEAV signed release provenance E2E passed");
}finally{await rm(tmp,{recursive:true,force:true})}
