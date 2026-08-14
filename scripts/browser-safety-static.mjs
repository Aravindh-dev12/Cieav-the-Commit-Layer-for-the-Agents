#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const injected=await readFile(new URL("../apps/browser/injected.js",import.meta.url),"utf8");
const wrapper=await readFile(new URL("../apps/browser/main.mjs",import.meta.url),"utf8");
const core=await readFile(new URL("../apps/browser/main-core.mjs",import.meta.url),"utf8");
const browser=`${wrapper}\n${core}`;
const cdpPipe=await readFile(new URL("../apps/browser/cdp-pipe.mjs",import.meta.url),"utf8");
const controlAuth=await readFile(new URL("../apps/browser/control-auth.mjs",import.meta.url),"utf8");
const adapters=await readFile(new URL("../apps/browser/adapters.mjs",import.meta.url),"utf8");
const server=await readFile(new URL("../apps/api/src/server.ts",import.meta.url),"utf8");
const config=await readFile(new URL("../apps/api/src/config.ts",import.meta.url),"utf8");
const receipt=await readFile(new URL("../apps/api/src/receipt.ts",import.meta.url),"utf8");
const deviceSigning=await readFile(new URL("../apps/api/src/device-signing.ts",import.meta.url),"utf8");
const privacy=await readFile(new URL("../apps/api/src/model/privacy.ts",import.meta.url),"utf8");
const cloudProvider=await readFile(new URL("../python/latch_platform/cloud_provider.py",import.meta.url),"utf8");
const secretStore=await readFile(new URL("../python/latch_platform/secret_store.py",import.meta.url),"utf8");
const platformConfig=await readFile(new URL("../python/latch_platform/config.py",import.meta.url),"utf8");
const gateway=await readFile(new URL("../python/latch_platform/gateway.py",import.meta.url),"utf8");
const cli=await readFile(new URL("../python/latch_platform/cli.py",import.meta.url),"utf8");
const releaseSign=await readFile(new URL("./release-sign.mjs",import.meta.url),"utf8");
const releaseWorkflow=await readFile(new URL("../.github/workflows/release-runtime.yml",import.meta.url),"utf8");
if(!wrapper.includes('await import("./main-core.mjs")'))throw new Error("Control Center wrapper does not delegate to hardened browser core");
if(/p\.fallback[^\n;]*t\.click\(|p\.fallback[^\n;]*requestSubmit/.test(injected))throw new Error("consequential action still contains fail-open fallback");
if(!injected.includes("action not executed"))throw new Error("fail-closed user feedback missing");
if(!injected.includes("Commit control unavailable"))throw new Error("commit-control failure is not fail-closed");
if(!injected.includes("async function register(e,m,rid){if(!AUTO)return;"))throw new Error("generic DOM-label inverse discovery is enabled outside explicit test mode");
if(!injected.includes("No trusted live-page inverse adapter is available"))throw new Error("production Undo trust-boundary message missing");
if(!browser.includes('verifyAdapterProposal({')||!browser.includes('m.kind==="UNDO_READY"')||!browser.includes("liveAdapter(u)"))throw new Error("browser host does not validate trusted adapter proposals and expiry");
if(!browser.includes('current.outcome?.status!=="OBSERVED_SUCCESS"'))throw new Error("host Undo path does not independently require observed success");
if(!browser.includes('"--remote-debugging-pipe"')||!browser.includes('browserControlTransport:"private-pipe"')||!browser.includes("Target.setDiscoverTargets")||!browser.includes("Target.attachToTarget")||!browser.includes("flatten:true"))throw new Error("browser authority is not using browser-wide flat private CDP pipe sessions");
for(const forbidden of ["--remote-debugging-port","/json/list","/json/new","webSocketDebuggerUrl"]){if(browser.includes(forbidden))throw new Error(`browser authority reintroduced TCP DevTools surface: ${forbidden}`)}
if(!cdpPipe.includes('JSON.stringify(msg)+"\\0"')||!cdpPipe.includes("indexOf(0)")||!cdpPipe.includes("MAX_MESSAGE_BYTES")||!cdpPipe.includes("sessionId"))throw new Error("private CDP pipe framing/session limits are incomplete");
if(!browser.includes('if(AUTO&&req.method==="POST"&&u.pathname==="/api/test/eval"')||!browser.includes('if(AUTO&&req.method==="POST"&&u.pathname==="/api/test/click"'))throw new Error("synthetic browser controls are not explicitly test-only");
if(!controlAuth.includes("timingSafeEqual")||!controlAuth.includes("HttpOnly")||!controlAuth.includes("SameSite=Strict")||!controlAuth.includes("consumeBootstrap"))throw new Error("browser control session is not constant-time/HttpOnly/one-time bootstrapped");
if(!browser.includes("if(!controlAuth.authorized(req))return send(401")||!browser.includes('u.pathname==="/api/bootstrap"'))throw new Error("Control Center API is not authenticated");
if(!browser.includes("delete browserEnv.CIEAV_BROWSER_CONTROL_TOKEN")||!browser.includes("delete browserEnv.LATCH_BROWSER_CONTROL_TOKEN"))throw new Error("browser-control capability may leak into Chromium environment");
if(!gateway.includes("surface_control_token")||!gateway.includes("secrets.token_urlsafe(48)")||!gateway.includes('env["CIEAV_BROWSER_CONTROL_TOKEN"]'))throw new Error("Gateway does not own a fresh per-surface browser-control capability");
if(!gateway.includes('"CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN"')||!gateway.includes("self.surface_control_token=None"))throw new Error("Gateway does not scrub/destroy inherited browser-control authority");
if(!cli.includes('"/v1/dashboard","POST"')||cli.includes('return _open_url(f"http://127.0.0.1:{settings.control_port}")'))throw new Error("CLI dashboard bypasses authenticated Gateway bootstrap");
if(!browser.includes("persistOutcome")||!browser.includes("p.persistenceFailures")||!browser.includes("if(p.finalizing)return p.finalizing")||!browser.includes("await attention.flush()"))throw new Error("outcome/audit persistence is not retry-safe and gracefully flushed");
if(!adapters.includes('error:"ambiguous_trusted_adapter"')||!adapters.includes('error:"no_trusted_adapter_match"'))throw new Error("adapter registry does not fail closed on zero/ambiguous matches");
if(!adapters.includes('testOnly:true'))throw new Error("test adapters are not explicitly marked test-only");
if(!adapters.includes('kind:"ADAPTER_RESOURCE"')||!adapters.includes("resourceKey")||!adapters.includes("sameAdapterCapability"))throw new Error("trusted adapter capabilities are not bound to exact resource fingerprints");
if(!adapters.includes('fingerprint:hash([adapter.id,String(adapter.version),actionType,resourceKey].join("\\n"))'))throw new Error("resource fingerprint is not bound to adapter ID/version/action/resource");
if(!injected.includes('if(!["HIGH","CRITICAL"].includes(risk))'))throw new Error("HIGH/CRITICAL actions may still accept DOM-only success evidence");
if(/t==="financial\.commit"\?\/\(payment successful/.test(injected))throw new Error("financial success text is still treated as sufficient DOM proof");
if(!server.includes("new FileReceiptStore")||!server.includes('"local-durable"'))throw new Error("managed API is not configured for durable local receipts");
if(!server.includes('config.cloudServer?new MemoryReceiptStore():config.localAuthority?new FileReceiptStore'))throw new Error("local authority does not take precedence over optional external persistence");
if(config.includes("process.env.DATABASE_URL"))throw new Error("API config still imports DATABASE_URL into local/runtime authority selection");
if(!server.includes('"cieav-dev-api"'))throw new Error("managed/dev API service identity is not separated");
if(!server.includes("loadDeviceReceiptSigner")||!server.includes('algorithm:"Ed25519"'))throw new Error("managed local receipts are not using Ed25519 device identity");
if(!receipt.includes("verifyReceiptPublic")||!receipt.includes('signatureAlgorithm:"Ed25519"'))throw new Error("independent receipt signature verification is missing");
for(const token of ["receipt-ed25519-private.enc.json","AES-256-GCM","scryptSync","setAAD","getAuthTag","atomicEncryptedWrite","unlink(legacyPrivateFile)"]){if(!deviceSigning.includes(token))throw new Error(`encrypted receipt identity invariant missing: ${token}`)}
if(deviceSigning.includes('writeFile(privateFile')||deviceSigning.includes('receipt-ed25519-private.pem\",privateKey.export'))throw new Error("receipt private key may still be written as plaintext");
for(const token of ["CryptProtectData","CryptUnprotectData","SecKeychainFindGenericPassword","SecKeychainAddGenericPassword","secret-tool","encrypted_at_rest=True","secret migration verification failed"]){if(!secretStore.includes(token))throw new Error(`OS secret-storage invariant missing: ${token}`)}
if(!platformConfig.includes("SecretStore")||!platformConfig.includes("secret_storage_status")||!platformConfig.includes("store.status.encrypted_at_rest"))throw new Error("Gateway secrets are not routed through explicit OS secret storage/fallback policy");
for(const token of ["privacyReduceContext","assertCloudPrivacyIngress","assertCloudPrivacyBaseline","privacy_page_text_forbidden","privacy_raw_filename_forbidden"]){if(!privacy.includes(token))throw new Error(`model privacy invariant missing: ${token}`)}
if(!server.includes("assertCloudPrivacyIngress(raw?.context)")||!server.includes("assertCloudPrivacyBaseline(raw?.baseline"))throw new Error("CIEAV Cloud server trusts client privacy declarations without ingress validation");
for(const token of ["_privacy_reduce_context","_privacy_reduce_baseline","_NoRedirect","must use HTTPS except for loopback tests"]){if(!cloudProvider.includes(token))throw new Error(`CIEAV Cloud egress invariant missing: ${token}`)}
for(const token of ["generateKeyPairSync(\"ed25519\")","crypto.sign(null","crypto.verify(null","keyId","sha256"]){if(!releaseSign.includes(token))throw new Error(`release provenance signing invariant missing: ${token}`)}
for(const token of ["CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64","CIEAV_RELEASE_SIGNING_PUBLIC_KEY_B64","CIEAV_RELEASE_SIGNING_KEY_ID","release-sign.mjs sign","release-sign.mjs verify","signatures/*.sig.json"]){if(!releaseWorkflow.includes(token))throw new Error(`release workflow provenance invariant missing: ${token}`)}
console.log("CIEAV production security checks passed: private-pipe + authenticated control + privacy + encrypted authority + signed provenance");
