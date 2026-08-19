#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV OS secret-root gate FAIL: ${m}`);process.exit(2)},expect=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)};
expect("python/latch_platform/secret_store.py",[
  "windows-dpapi-current-user","CryptProtectData","CryptUnprotectData","encrypted_at_rest=True",
  "macos-keychain","SecKeychainFindGenericPassword","SecKeychainAddGenericPassword",
  "linux-secret-service","secret-tool","DBUS_SESSION_BUS_ADDRESS",
  "production CIEAV refuses plaintext secret storage","CIEAV_ALLOW_INSECURE_SECRET_STORE",
  "secure secret-storage policy resolved to an unencrypted backend","secret migration verification failed"
]);
expect("python/latch_platform/config.py",[
  "SecretStore(self.state_dir)","receipt_signing_secret","local_api_secret","audit_integrity_secret",
  "if store.status.encrypted_at_rest","store.get(account,legacy_file)","store.set(account,value)"
]);
expect("python/latch_platform/gateway.py",[
  '"HF_TOKEN","HUGGING_FACE_HUB_TOKEN","JWT_SECRET","RECEIPT_SIGNING_SECRET"',
  'env["RECEIPT_SIGNING_SECRET"] = self.s.receipt_signing_secret()',
  'for key in ("JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN")'
]);
expect("apps/api/src/config.ts",["RECEIPT_SIGNING_SECRET","receiptSigningSecret"]);
console.log(`CIEAV OS secret-root gate PASS · platform=${process.platform} · DPAPI/Keychain/Secret-Service at-rest backends + production plaintext refusal + Gateway-to-Node secret isolation verified`);
