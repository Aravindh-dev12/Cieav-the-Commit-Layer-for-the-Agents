import {afterEach,describe,expect,it} from "vitest";
import crypto from "node:crypto";
import {execFile,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {loadTrustedCliAdaptersSync} from "./trusted-cli-adapter.js";

const run=promisify(execFile),dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
function gitBinary(){const raw=process.platform==="win32"?execFileSync("where.exe",["git.exe"],{encoding:"utf8"}).split(/\r?\n/)[0]!:execFileSync("which",["git"],{encoding:"utf8"}).trim();return realpathSync(raw)}
async function sha(file:string){return crypto.createHash("sha256").update(await readFile(file)).digest("hex")}

describe("remote Git execution catalog discovery",()=>{
  it("registers Smart HTTP push as a distinct first-class GIT adapter",async()=>{const state=await mkdtemp(path.join(os.tmpdir(),"cieav-git-remote-catalog-state-")),repo=await mkdtemp(path.join(os.tmpdir(),"cieav-git-remote-catalog-repo-"));dirs.push(state,repo);await run("git",["-C",repo,"init","-q"]);const gitDir=realpathSync((await run("git",["-C",repo,"rev-parse","--absolute-git-dir"],{encoding:"utf8"})).stdout.trim()),objectDir=realpathSync((await run("git",["-C",repo,"rev-parse","--path-format=absolute","--git-path","objects"],{encoding:"utf8"})).stdout.trim()),bin=gitBinary(),catalog={version:1,cli:[],gitRef:[],gitRemoteRef:[{toolId:"git-publish-main",repository:repo,gitDir,objectDir,remoteUrl:"http://127.0.0.1:65534/repo.git",remoteRef:"refs/heads/main",gitBinary:bin,gitBinarySha256:await sha(bin),credential:{kind:"NONE"},requireFastForward:true,allowLoopback:true,timeoutMs:5000,maxStdoutBytes:65536,maxStderrBytes:65536}]};await writeFile(path.join(state,"execution-adapters.json"),JSON.stringify(catalog));const adapters=loadTrustedCliAdaptersSync(state,{});expect(adapters).toHaveLength(1);expect(adapters[0]?.protocol).toBe("GIT");expect(adapters[0]?.constructor.name).toBe("TrustedGitRemoteRefAdapter")});
});
