#!/usr/bin/env node
import {readFileSync,readdirSync,statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),pkg=p=>JSON.parse(read(p));

const implementations=[
  ["packages/contracts/package.json","@cieav/contracts"],
  ["packages/core/package.json","@cieav/core"],
  ["packages/sdk/package.json","@cieav/sdk"],
  ["apps/api/package.json","@cieav/api"],
  ["apps/dashboard/package.json","@cieav/dashboard"]
];
for(const [file,name] of implementations){const p=pkg(file);if(p.name!==name)throw new Error(`${file} must be canonical ${name}, found ${p.name}`);if(name!=="@cieav/dashboard"&&p.private===true)throw new Error(`${name} implementation unexpectedly marked private`)}

for(const file of ["packages/core/package.json","packages/sdk/package.json","apps/api/package.json","apps/dashboard/package.json"]){const p=pkg(file);for(const dep of Object.keys(p.dependencies??{}))if(dep.startsWith("@latch/"))throw new Error(`${p.name} retains legacy dependency ${dep}`)}
function typescriptSources(dir){const out=[];for(const name of readdirSync(path.join(ROOT,dir))){const rel=`${dir}/${name}`,st=statSync(path.join(ROOT,rel));if(st.isDirectory())out.push(...typescriptSources(rel));else if(/\.(?:ts|tsx|mts|cts)$/.test(name))out.push(rel)}return out}
for(const dir of ["packages/core/src","packages/sdk/src","apps/api/src","apps/dashboard/src"]){for(const file of typescriptSources(dir)){const src=read(file);if(src.includes("@latch/"))throw new Error(`${file} retains legacy package import`)}}

const shims=[
  {dir:"packages/cieav-contracts",name:"@latch/contracts",canonical:"@cieav/contracts",subs:["reality","approval","proof","business","policy","recovery"]},
  {dir:"packages/cieav-core",name:"@latch/core",canonical:"@cieav/core",subs:["reality","proof","reconciliation","policy"]},
  {dir:"packages/cieav-sdk",name:"@latch/sdk",canonical:"@cieav/sdk",subs:[]}
];
for(const s of shims){
  const p=pkg(`${s.dir}/package.json`);
  if(p.name!==s.name)throw new Error(`${s.dir} must own legacy compatibility name ${s.name}`);
  if(p.private!==true)throw new Error(`${s.name} compatibility shim must remain private`);
  if(p.dependencies?.[s.canonical]!=="*")throw new Error(`${s.name} must depend one-way on ${s.canonical}`);
  const files=["index.js","index.d.ts",...s.subs.flatMap(x=>[`${x}.js`,`${x}.d.ts`])];
  for(const file of files){const src=read(`${s.dir}/${file}`),target=file.startsWith("index")?s.canonical:`${s.canonical}/${file.replace(/\.(?:js|d\.ts)$/,'')}`;if(!src.includes(`export * from \"${target}\"`))throw new Error(`${s.name}/${file} does not re-export ${target}`)}
}

const root=pkg("package.json");
for(const scriptName of ["build","build:api","test:core","typecheck","dev:api","dev:dashboard"]){const script=String(root.scripts?.[scriptName]??"");if(!script)throw new Error(`root package script missing: ${scriptName}`);if(script.includes("@latch/"))throw new Error(`${scriptName} still targets legacy package ownership`)}

const docker=read("apps/api/Dockerfile");
for(const token of ["@cieav/contracts","@cieav/core","@cieav/api","/app/packages/contracts","/app/packages/core"])if(!docker.includes(token))throw new Error(`API Docker canonical topology missing: ${token}`);
for(const legacy of ["packages/cieav-contracts","packages/cieav-core","@latch/"])if(docker.includes(legacy))throw new Error(`API Docker image still carries legacy compatibility topology: ${legacy}`);

console.log("CIEAV package namespace checks passed: production packages/apps and ordinary tests own @cieav/*; Docker is legacy-free; private @latch/* packages remain one-way compatibility shims only");
