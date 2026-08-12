#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromiumArgs,chromiumEnvironment} from "../apps/browser/chromium-launch.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const prod=chromiumArgs({profile:"C:/private-profile",headless:true,testMode:false});
assert(prod.includes("--headless=new"));
assert(!prod.includes("--no-sandbox"),"production launch must not disable Chromium sandboxing");
const test=chromiumArgs({profile:"C:/private-profile",headless:true,testMode:true});
assert(test.includes("--no-sandbox"),"explicit automated test mode may opt out of sandboxing");

const clean=chromiumEnvironment({PATH:"ok",CIEAV_BROWSER_CONTROL_TOKEN:"secret",JWT_SECRET:"secret",RECEIPT_SIGNING_SECRET:"secret",HF_TOKEN:"secret",OPENAI_API_KEY:"secret"});
assert.equal(clean.PATH,"ok");
for(const key of ["CIEAV_BROWSER_CONTROL_TOKEN","JWT_SECRET","RECEIPT_SIGNING_SECRET","HF_TOKEN","OPENAI_API_KEY"])assert(!(key in clean),`${key} leaked into Chromium environment`);

const native=await readFile(path.join(ROOT,"native/windows/cdp-win-bridge.cpp"),"utf8");
for(const marker of ["--remote-debugging-io-pipes=","PROC_THREAD_ATTRIBUTE_HANDLE_LIST","JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE","CREATE_SUSPENDED"])assert(native.includes(marker),`Windows bridge missing ${marker}`);
assert(!native.includes("--remote-debugging-port"),"Windows bridge must not expose TCP CDP");

const main=await readFile(path.join(ROOT,"apps/browser/main.mjs"),"utf8");
assert(main.includes("launchChromiumPrivate"),"browser mediator must use cross-platform private launcher");
assert(!main.includes("const extraPipe=process.platform"),"legacy Windows fd emulation must be removed");
assert(!main.includes('"--remote-debugging-port"'),"browser mediator must not expose TCP CDP");

console.log("CIEAV Chromium launch static security checks passed");
