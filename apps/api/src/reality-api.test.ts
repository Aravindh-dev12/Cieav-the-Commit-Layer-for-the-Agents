import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {createIntentContract} from "@latch/core/reality";
import {CieavRealityStore} from "./reality-api.js";

const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true})});
const owner={id:"human-1",kind:"HUMAN" as const};
function intent(){return createIntentContract({owner,goal:"Test isolated intent",constraints:{allowedActionTypes:[],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"HIGH",allowedDataCategories:["NONE"],allowExternalRecipients:false,maxDelegationDepth:0,requireIndependentVerification:true},completionCriteria:["Expected state is true"]})}

describe("CIEAV reality store",()=>{
  it("isolates intents and permit consumption by device",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-reality-"));dirs.push(dir);const store=new CieavRealityStore(path.join(dir,"state.json"),"s".repeat(48)),x=intent();await store.saveIntent("device-a",x);expect(await store.getIntent("device-a",x.id)).not.toBeNull();expect(await store.getIntent("device-b",x.id)).toBeNull();expect(await store.consumePermit("device-a","permit-1")).toBe(true);expect(await store.consumePermit("device-a","permit-1")).toBe(false);expect(await store.consumePermit("device-b","permit-1")).toBe(true);await store.close()});
  it("fails closed when durable reality state is tampered",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-reality-"));dirs.push(dir);const file=path.join(dir,"state.json"),secret="s".repeat(48),store=new CieavRealityStore(file,secret);await store.saveIntent("device-a",intent());await store.close();const raw=await readFile(file,"utf8");await writeFile(file,raw.replace("Test isolated intent","Tampered intent"),"utf8");const reopened=new CieavRealityStore(file,secret);await expect(reopened.listIntents("device-a")).rejects.toThrow(/integrity|unauthenticated|corrupt/i)});
});
