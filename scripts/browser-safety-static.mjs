#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const injected=await readFile(new URL("../apps/browser/injected.js",import.meta.url),"utf8");
const browser=await readFile(new URL("../apps/browser/main.mjs",import.meta.url),"utf8");
const adapters=await readFile(new URL("../apps/browser/adapters.mjs",import.meta.url),"utf8");
const server=await readFile(new URL("../apps/api/src/server.ts",import.meta.url),"utf8");
const config=await readFile(new URL("../apps/api/src/config.ts",import.meta.url),"utf8");
const receipt=await readFile(new URL("../apps/api/src/receipt.ts",import.meta.url),"utf8");
const deviceSigning=await readFile(new URL("../apps/api/src/device-signing.ts",import.meta.url),"utf8");
const privacy=await readFile(new URL("../apps/api/src/model/privacy.ts",import.meta.url),"utf8");
const cloudProvider=await readFile(new URL("../python/latch_platform/cloud_provider.py",import.meta.url),"utf8");
if(/p\.fallback[^\n;]*t\.click\(|p\.fallback[^\n;]*requestSubmit/.test(injected))throw new Error("consequential action still contains fail-open fallback");
if(!injected.includes("action not executed"))throw new Error("fail-closed user feedback missing");
if(!injected.includes("Commit control unavailable"))throw new Error("commit-control failure is not fail-closed");
if(!injected.includes("async function register(e,m,rid){if(!AUTO)return;"))throw new Error("generic DOM-label inverse discovery is enabled outside explicit test mode");
if(!injected.includes("No trusted live-page inverse adapter is available"))throw new Error("production Undo trust-boundary message missing");
if(!browser.includes('verifyAdapterProposal({')||!browser.includes('m.kind==="UNDO_READY"')||!browser.includes("liveAdapter(u)"))throw new Error("browser host does not validate trusted adapter proposals and expiry");
if(!browser.includes('current.outcome?.status!=="OBSERVED_SUCCESS"'))throw new Error("host Undo path does not independently require observed success");
if(!adapters.includes('error:"ambiguous_trusted_adapter"')||!adapters.includes('error:"no_trusted_adapter_match"'))throw new Error("adapter registry does not fail closed on zero/ambiguous matches");
if(!adapters.includes('testOnly:true'))throw new Error("test adapters are not explicitly marked test-only");
if(!adapters.includes('kind:"ADAPTER_RESOURCE"')||!adapters.includes("resourceKey")||!adapters.includes("sameAdapterCapability"))throw new Error("trusted adapter capabilities are not bound to exact resource fingerprints");
if(!adapters.includes('fingerprint:hash([adapter.id,String(adapter.version),actionType,resourceKey].join("\\n"))'))throw new Error("resource fingerprint is not bound to adapter ID/version/action/resource");
if(!injected.includes('if(!["HIGH","CRITICAL"].includes(risk))'))throw new Error("HIGH/CRITICAL actions may still accept DOM-only success evidence");
if(/t==="financial\.commit"\?\/\(payment successful/.test(injected))throw new Error("financial success text is still treated as sufficient DOM proof");
if(!server.includes("new FileReceiptStore")||!server.includes('"local-durable"'))throw new Error("managed API is not configured for durable local receipts");
if(!server.includes('"cieav-dev-api"'))throw new Error("managed/dev API service identity is not separated");
if(!server.includes("loadDeviceReceiptSigner")||!server.includes('algorithm:"Ed25519"'))throw new Error("managed local receipts are not using Ed25519 device identity");
if(!receipt.includes("verifyReceiptPublic")||!receipt.includes('signatureAlgorithm:"Ed25519"'))throw new Error("independent receipt signature verification is missing");
if(!deviceSigning.includes('generateKeyPairSync("ed25519")')||!deviceSigning.includes("receipt-ed25519-private.pem"))throw new Error("persistent per-user Ed25519 key lifecycle is missing");
if(!config.includes("!localAuthority&&process.env.DATABASE_URL"))throw new Error("local authority may inherit DATABASE_URL");
for(const token of ["privacyReduceContext","assertCloudPrivacyIngress","assertCloudPrivacyBaseline","privacy_page_text_forbidden","privacy_raw_filename_forbidden"]){if(!privacy.includes(token))throw new Error(`model privacy invariant missing: ${token}`)}
if(!server.includes("assertCloudPrivacyIngress(raw?.context)")||!server.includes("assertCloudPrivacyBaseline(raw?.baseline"))throw new Error("CIEAV Cloud server trusts client privacy declarations without ingress validation");
for(const token of ["_privacy_reduce_context","_privacy_reduce_baseline","_NoRedirect","must use HTTPS except for loopback tests"]){if(!cloudProvider.includes(token))throw new Error(`CIEAV Cloud egress invariant missing: ${token}`)}
console.log("CIEAV browser/control, privacy, trusted-adapter, outcome-evidence, and receipt-identity checks passed");
