#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const injected=await readFile(new URL("../apps/browser/injected.js",import.meta.url),"utf8");
const server=await readFile(new URL("../apps/api/src/server.ts",import.meta.url),"utf8");
const config=await readFile(new URL("../apps/api/src/config.ts",import.meta.url),"utf8");
if(/p\.fallback[^\n;]*t\.click\(|p\.fallback[^\n;]*requestSubmit/.test(injected))throw new Error("consequential action still contains fail-open fallback");
if(!injected.includes("action not executed"))throw new Error("fail-closed user feedback missing");
if(!injected.includes("Commit control unavailable"))throw new Error("commit-control failure is not fail-closed");
if(!server.includes("new FileReceiptStore")||!server.includes('"local-durable"'))throw new Error("managed API is not configured for durable local receipts");
if(!server.includes('"cieav-dev-api"'))throw new Error("managed/dev API service identity is not separated");
if(!config.includes("!localAuthority&&process.env.DATABASE_URL"))throw new Error("local authority may inherit DATABASE_URL");
console.log("CIEAV browser/control fail-closed static safety checks passed");
