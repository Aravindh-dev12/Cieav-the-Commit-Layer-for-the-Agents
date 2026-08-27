import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";

const created:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();delete process.env.CIEAV_ENV_TEST_A;delete process.env.CIEAV_ENV_TEST_B;for(const p of created.splice(0))fs.rmSync(p,{recursive:true,force:true})});

async function loader(){vi.resetModules();return import("./env-file.js")}
function tempEnv(text:string){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cieav-env-")),file=path.join(dir,".env");created.push(dir);fs.writeFileSync(file,text,{mode:0o600});return file}

describe("CIEAV env file loader",()=>{
  it("fails when an explicitly requested env file is missing",async()=>{vi.stubEnv("CIEAV_ENV_FILE",path.join(os.tmpdir(),`missing-cieav-${Date.now()}.env`));const {loadOptionalEnvFile}=await loader();expect(()=>loadOptionalEnvFile()).toThrow(/does not exist/)});
  it("loads a local env file without overriding injected process secrets",async()=>{const file=tempEnv("CIEAV_ENV_TEST_A=from-file\nCIEAV_ENV_TEST_B=from-file\n");vi.stubEnv("CIEAV_ENV_FILE",file);vi.stubEnv("CIEAV_ENV_TEST_B","from-process");const {loadOptionalEnvFile}=await loader(),result=loadOptionalEnvFile();expect(result.loaded).toBe(true);expect(result.path).toBe(file);expect(process.env.CIEAV_ENV_TEST_A).toBe("from-file");expect(process.env.CIEAV_ENV_TEST_B).toBe("from-process");expect(result.keys).toContain("CIEAV_ENV_TEST_A")});
  it("caches one load so later file mutation cannot silently change runtime configuration",async()=>{const file=tempEnv("CIEAV_ENV_TEST_A=first\n");vi.stubEnv("CIEAV_ENV_FILE",file);const {loadOptionalEnvFile}=await loader();loadOptionalEnvFile();fs.writeFileSync(file,"CIEAV_ENV_TEST_A=second\n");delete process.env.CIEAV_ENV_TEST_A;const second=loadOptionalEnvFile();expect(second.loaded).toBe(true);expect(process.env.CIEAV_ENV_TEST_A).toBeUndefined()});
});
