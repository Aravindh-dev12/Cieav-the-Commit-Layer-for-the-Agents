#!/usr/bin/env node
import {readFileSync,readdirSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const changed=[];
const replacements=[
  ["@latch/contracts","@cieav/contracts"],
  ["@latch/core","@cieav/core"],
  ["@latch/sdk","@cieav/sdk"]
];

function writeIfChanged(rel,next){const file=path.join(ROOT,rel),before=readFileSync(file,"utf8");if(before!==next){writeFileSync(file,next,"utf8");changed.push(rel)}}
function canonicalizeSource(rel){const file=path.join(ROOT,rel),before=readFileSync(file,"utf8");let next=before;for(const [legacy,canonical] of replacements)next=next.split(legacy).join(canonical);if(next.includes("@latch/"))throw new Error(`unexpected legacy package import remains in ${rel}`);if(next!==before){writeFileSync(file,next,"utf8");changed.push(rel)}}
function walk(rel){for(const name of readdirSync(path.join(ROOT,rel))){const child=path.join(rel,name),stat=statSync(path.join(ROOT,child));if(stat.isDirectory())walk(child);else if(/\.(?:ts|tsx|mts|cts)$/.test(name))canonicalizeSource(child)}}
function rewriteDependencies(rel,mapping){const file=path.join(ROOT,rel),pkg=JSON.parse(readFileSync(file,"utf8")),deps={...(pkg.dependencies??{})};for(const [legacy,canonical] of mapping){if(!(legacy in deps))continue;const value=deps[legacy];if(canonical in deps&&deps[canonical]!==value)throw new Error(`${rel}: conflicting dependency values for ${legacy} and ${canonical}`);delete deps[legacy];deps[canonical]=value}pkg.dependencies=deps;writeIfChanged(rel,JSON.stringify(pkg,null,2)+"\n")}

walk("apps/api/src");
walk("apps/dashboard/src");
rewriteDependencies("apps/api/package.json",[["@latch/contracts","@cieav/contracts"],["@latch/core","@cieav/core"]]);
rewriteDependencies("apps/dashboard/package.json",[["@latch/contracts","@cieav/contracts"],["@latch/sdk","@cieav/sdk"]]);

const dockerRel="apps/api/Dockerfile",dockerPath=path.join(ROOT,dockerRel),dockerBefore=readFileSync(dockerPath,"utf8"),dockerNext=dockerBefore.replace("# Legacy package names remain private one-way shims during the migration window.\nCOPY --from=build /app/packages/cieav-contracts ./packages/cieav-contracts\nCOPY --from=build /app/packages/cieav-core ./packages/cieav-core\n","");
if(/packages\/cieav-(?:contracts|core)/.test(dockerNext))throw new Error("API Docker image still carries legacy package shims");if(dockerNext!==dockerBefore){writeFileSync(dockerPath,dockerNext,"utf8");changed.push(dockerRel)}
for(const rel of ["apps/api/package.json","apps/dashboard/package.json"]){const pkg=JSON.parse(readFileSync(path.join(ROOT,rel),"utf8"));for(const dep of Object.keys(pkg.dependencies??{}))if(dep.startsWith("@latch/"))throw new Error(`${rel} retains legacy runtime dependency ${dep}`)}
console.log(`CIEAV app namespace codemod changed ${changed.length} file(s)`);for(const rel of changed.sort())console.log(`  ${rel}`);
