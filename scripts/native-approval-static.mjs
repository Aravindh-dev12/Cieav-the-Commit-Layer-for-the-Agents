#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const source=read(p);for(const token of tokens)if(!source.includes(token))throw new Error(`${p} missing native-approval invariant: ${token}`);return source};

const contracts=requireTokens("packages/contracts/src/approval.ts",[
  "CIEAV_NATIVE_APPROVAL_ACTIVATION_V1","challengeId","deviceId","requestId","proposalId","proposalDigest","principalId","resource","risk","decision","expiresAt","nonce","authority:z.literal(false)","executionAuthorityIssued:z.literal(false)"
]);
const capability=requireTokens("apps/api/src/native-approval-capability.ts",[
  "approvalProposalDigest","createApprovalActivationCapability","verifyApprovalActivationCapability","timingSafeEqual","cieav-native-approval-nonce-v1","cieav-native-approval-activation-v1","native_approval_activation_binding_mismatch","native_approval_activation_expired"
]);
const reality=requireTokens("apps/api/src/reality-api.ts",[
  "activationConsumedAt","nativeCapabilities(deviceId","activateNative(raw","native_approval_activation_already_consumed","native_approval_activation_not_pending","/v1/reality/native-approval-activation","native_approval_device_scope_mismatch","/native-capabilities","claimApprovedProposal","issueCommitPermit"
]);
const mediator=requireTokens("apps/browser/main.mjs",[
  "loopbackPeer","req.headers.origin","/api/native-approval","allowNativeActivation","64_000","/v1/reality/native-approval-activation","pollApprovals","native-capabilities","notifyNativeApproval","CIEAV action blocked pending approval"
]);
const transport=requireTokens("apps/browser/native-notify.mjs",[
  "notifyNativeApproval","CIEAV_NATIVE_APPROVAL_HELPER","spawn(helper,[]","stdio:[\"pipe\",\"ignore\",\"ignore\"]","child.stdin?.end(JSON.stringify(payload))","invalid_native_approval_callback","if(process.platform!==\"win32\")return false","if(!helper)return false"
]);
const windows=requireTokens("native/windows/cieav-native-approval/Program.cs",[
  "AppNotificationManager.IsSupported()","AppNotificationManager.Default","NotificationInvoked","manager.Register()","AppNotificationButton(\"Allow once\")","AppNotificationButton(\"Block\")","AddArgument(\"decision\", \"approve\")","AddArgument(\"decision\", \"deny\")","AddArgument(\"challenge\", challengeId)","notification.Expiration = expiresAt","notification.ExpiresOnReboot = true","AllowAutoRedirect = false","UseProxy = false","/api/native-approval","Task.Delay(remaining)"
]);
requireTokens("native/windows/cieav-native-approval/Cieav.NativeApproval.csproj",[
  "net8.0-windows10.0.19041.0","WindowsPackageType>None","Microsoft.WindowsAppSDK","1.8.260710003"
]);
requireTokens("scripts/build-windows-native-approval.mjs",[
  "process.platform!==\"win32\"","sourceHash","cieav-native-approval-${sourceHash}","dotnet","--no-self-contained","ContinuousIntegrationBuild"
]);
requireTokens("scripts/configure-xampp-receipt-store.ps1",[
  "build-windows-native-approval.mjs","CIEAV_NATIVE_APPROVAL_HELPER","Native approval host:"
]);
requireTokens("python/latch_platform/service.py",["CIEAV_NATIVE_APPROVAL_HELPER"]);
requireTokens("apps/api/src/native-approval-capability.test.ts",[
  "rejects forged decision digest device and nonce values","different exact proposal","rejects expired activation capability"
]);
requireTokens("apps/api/src/native-approval-flow.test.ts",[
  "approves exactly once and still requires separate permit claim","denial consumes","persists one-use activation across restart","callback never arrives","fails closed when challenge expires","another device"
]);

for(const [name,source] of [["capability",capability],["transport",transport],["windows",windows]]){
  for(const forbidden of ["issueCommitPermit(","mintPermit(","mintExecutionTicket(","CIEAV_GATEWAY_TOKEN","CIEAV_AGENT_TOKEN","executionAuthorityIssued:true"]){
    if(source.includes(forbidden))throw new Error(`${name} native approval component contains forbidden authority/credential primitive: ${forbidden}`);
  }
}
if(!transport.includes("spawn(helper,[]"))throw new Error("native approval host receives command-line arguments");
if(!mediator.includes("if(!loopbackPeer(req)||req.headers.origin)"))throw new Error("native approval mediator is not loopback/no-Origin fail-closed");
if(!reality.includes("capability.payload.deviceId!==deviceId"))throw new Error("native approval API is not bound to authenticated device scope");
if(!contracts.includes("executionAuthorityIssued:z.literal(false)"))throw new Error("native approval activation may claim execution authority");

console.log("CIEAV native approval static gate PASS - exact proposal/device/decision binding + one-use durable activation + loopback mediator + stdin-only capability transport + supported Windows actionable notification + separate permit issuance");
