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
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
function gitBinary(){const raw=process.platform==="win32"?execFileSync("where.exe",["git.exe"],{encoding:"utf8"}).split(/\r?\n/)[0]!:execFileSync("which",["git"],{encoding:"utf8"}).trim();return realpathSync(raw)}
async function sha(file:string){return crypto.createHash("sha256").update(await readFile(file)).digest("hex")}

describe("Git execution catalog discovery",()=>{
  it("registers Git as a separate first-class adapter from the shared execution catalog",async()=>{const state=await mkdtemp(path.join(os.tmpdir(),"cieav-git-catalog-state-")),repo=await mkdtemp(path.join(os.tmpdir(),"cieav-git-catalog-repo-"));dirs.push(state,repo);await run("git",["-C",repo,"init","-q"]);const gitDir=realpathSync((await run("git",["-C",repo,"rev-parse","--absolute-git-dir"],{encoding:"utf8"})).stdout.trim()),ref="refs/heads/main",bin=gitBinary(),catalog={version:1,cli:[],gitRef:[{toolId:"git-main-advance",repository:repo,gitDir,ref,gitBinary:bin,gitBinarySha256:await sha(bin),requireFastForward:true,timeoutMs:5000,maxStdoutBytes:65536,maxStderrBytes:65536}]};await writeFile(path.join(state,"execution-adapters.json"),JSON.stringify(catalog));const adapters=loadTrustedCliAdaptersSync(state,{});expect(adapters).toHaveLength(1);expect(adapters[0]?.protocol).toBe("GIT");expect(adapters[0]?.constructor.name).toBe("TrustedGitRefAdapter")});
});
