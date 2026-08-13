#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),TOOL=path.join(ROOT,"scripts/release-sign.mjs"),tmp=await mkdtemp(path.join(os.tmpdir(),"cieav-sign-test-"));
const run=args=>spawnSync(process.execPath,[TOOL,...args],{cwd:ROOT,encoding:"utf8"});
try{
 const keyA=path.join(tmp,"a.pem"),pubA=path.join(tmp,"a.pub.pem"),keyB=path.join(tmp,"b.pem"),pubB=path.join(tmp,"b.pub.pem"),out=path.join(tmp,"out"),manifest=path.join(tmp,"manifest.json");
 for(const [k,p] of [[keyA,pubA],[keyB,pubB]]){const r=run(["generate","--private-key",k,"--public-key",p]);if(r.status!==0)throw new Error(r.stderr||r.stdout)}
 await writeFile(manifest,'{"brand":"CIEAV","version":"0.7.0"}\n');
 let r=run(["sign","--private-key",keyA,"--public-key",pubA,"--output-dir",out,manifest]);if(r.status!==0)throw new Error(r.stderr||r.stdout);
 r=run(["verify","--public-key",pubA,"--output-dir",out,manifest]);if(r.status!==0)throw new Error("valid signature rejected");
 await writeFile(manifest,'{"brand":"CIEAV","version":"0.7.1"}\n');r=run(["verify","--public-key",pubA,"--output-dir",out,manifest]);if(r.status===0)throw new Error("changed metadata verified");
 await writeFile(manifest,'{"brand":"CIEAV","version":"0.7.0"}\n');r=run(["verify","--public-key",pubB,"--output-dir",out,manifest]);if(r.status===0)throw new Error("wrong key verified");
 console.log("CIEAV release signing smoke passed");
}finally{await rm(tmp,{recursive:true,force:true})}
