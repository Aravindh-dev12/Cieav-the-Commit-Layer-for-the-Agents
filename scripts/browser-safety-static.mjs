#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const injected=await readFile(new URL("../apps/browser/injected.js",import.meta.url),"utf8");
const server=await readFile(new URL("../apps/api/src/server.ts",import.meta.url),"utf8");
const config=await readFile(new URL("../apps/api/src/config.ts",import.meta.url),"utf8");
const receipt=await readFile(new URL("../apps/api/src/receipt.ts",import.meta.url),"utf8");
const deviceSigning=await readFile(new URL("../apps/api/src/device-signing.ts",import.meta.url),"utf8");
if(/p\.fallback[^\n;]*t\.click\(|p\.fallback[^\n;]*requestSubmit/.test(injected))throw new Error("consequential action still contains fail-open fallback");
if(!injected.includes("action not executed"))throw new Error("fail-closed user feedback missing");
if(!injected.includes("Commit control unavailable"))throw new Error("commit-control failure is not fail-closed");
if(!injected.includes("async function register(e,m,rid){if(!AUTO)return;"))throw new Error("generic DOM-label inverse discovery is enabled outside explicit test mode");
if(!injected.includes("No trusted live-page inverse adapter is available"))throw new Error("production Undo trust-boundary message missing");
if(!server.includes("new FileReceiptStore")||!server.includes('"local-durable"'))throw new Error("managed API is not configured for durable local receipts");
if(!server.includes('"cieav-dev-api"'))throw new Error("managed/dev API service identity is not separated");
if(!server.includes("loadDeviceReceiptSigner")||!server.includes('algorithm:"Ed25519"'))throw new Error("managed local receipts are not using Ed25519 device identity");
if(!receipt.includes("verifyReceiptPublic")||!receipt.includes('signatureAlgorithm:"Ed25519"'))throw new Error("independent receipt signature verification is missing");
if(!deviceSigning.includes('generateKeyPairSync("ed25519")')||!deviceSigning.includes("receipt-ed25519-private.pem"))throw new Error("persistent per-user Ed25519 key lifecycle is missing");
if(!config.includes("!localAuthority&&process.env.DATABASE_URL"))throw new Error("local authority may inherit DATABASE_URL");
console.log("CIEAV browser/control fail-closed, trusted-Undo, and receipt-identity checks passed");
