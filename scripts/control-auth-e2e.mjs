#!/usr/bin/env node
import assert from "node:assert/strict";
import {ControlAuth,controlBearer} from "../apps/browser/control-auth.mjs";

const token="T".repeat(64),auth=new ControlAuth(token,{bootstrapTtlMs:5_000});
assert.equal(auth.authorized({headers:{}}),false,"missing local control credential must fail closed");
assert.equal(auth.authorized({headers:{authorization:"Bearer wrong"}}),false,"wrong bearer must be rejected");
assert.equal(auth.authorized({headers:controlBearer(token)}),true,"correct bearer must authorize Gateway-to-browser control");
assert.equal(auth.authorized({headers:{cookie:`other=1; cieav_control=${token}`}}),true,"HttpOnly session cookie value must authorize Control Center requests");
const nonce=auth.issueBootstrap();
assert.ok(nonce.length>=40,"bootstrap nonce must have sufficient entropy");
assert.equal(auth.consumeBootstrap(nonce),true,"fresh bootstrap must be accepted once");
assert.equal(auth.consumeBootstrap(nonce),false,"bootstrap must be single-use");
const cookie=auth.cookie();
assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Strict/i);assert.match(cookie,/Path=\//i);
assert.ok(!cookie.includes(nonce),"bootstrap nonce and authenticated session token must be distinct");
const generated=new ControlAuth();
assert.ok(generated.token.length>=43,"generated browser control token must have strong entropy");
assert.notEqual(generated.token,auth.token,"independent browser-control sessions must not share authority");
console.log("CIEAV browser control authentication checks passed");
