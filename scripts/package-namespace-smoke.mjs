#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),pkg=p=>JSON.parse(read(p));
const aliases=[
  {dir:"packages/cieav-contracts",name:"@cieav/contracts",legacy:"@latch/contracts",subs:["reality","approval","proof","business","policy","recovery"]},
  {dir:"packages/cieav-core",name:"@cieav/core",legacy:"@latch/core",subs:["reality","proof","reconciliation","policy"]},
  {dir:"packages/cieav-sdk",name:"@cieav/sdk",legacy:"@latch/sdk",subs:[]}
];
for(const a of aliases){const p=pkg(`${a.dir}/package.json`);if(p.name!==a.name)throw new Error(`${a.dir} has wrong canonical name`);if(p.private!==true)throw new Error(`${a.name} compatibility package must remain private until publish qualification`);if(p.dependencies?.[a.legacy]!=="*")throw new Error(`${a.name} must depend one-way on ${a.legacy}`);for(const file of ["index.js","index.d.ts",...a.subs.flatMap(s=>[`${s}.js`,`${s}.d.ts`])]){const src=read(`${a.dir}/${file}`),expected=file.startsWith("index")?a.legacy:`${a.legacy}/${file.replace(/\.(?:js|d\.ts)$/,'')}`;if(!src.includes(`export * from "${expected}"`))throw new Error(`${a.name}/${file} does not re-export ${expected}`)}}
for(const legacy of ["packages/contracts/package.json","packages/core/package.json","packages/sdk/package.json"]){const p=pkg(legacy);for(const dep of Object.keys(p.dependencies??{}))if(dep.startsWith("@cieav/"))throw new Error(`${p.name} depends back on canonical alias ${dep}; compatibility graph must remain acyclic`)}
console.log("CIEAV package namespace checks passed: canonical @cieav/* aliases are one-way and backwards-compatible");
