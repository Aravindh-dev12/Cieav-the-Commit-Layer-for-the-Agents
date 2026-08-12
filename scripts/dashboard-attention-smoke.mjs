#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const html=await readFile(new URL("../apps/browser/dashboard.html",import.meta.url),"utf8");
const required=["Attention health","debtScore","promptRate","fastRate","unknownRate","decisionTime","refocusCount","softRate","protectedPages","apiMode","Unknown outcomes","Local API","A low debt score never weakens HIGH, CRITICAL","Unknown/failed outcomes do not teach CIEAV"];
for(const token of required)if(!html.includes(token))throw new Error(`dashboard attention smoke failed: missing ${token}`);
if(!html.includes("healthCopy(level,r)"))throw new Error("dashboard attention smoke failed: missing level explanation");
if(!html.includes("unknownOutcomeRate"))throw new Error("dashboard attention smoke failed: outcome uncertainty not surfaced");
if(!html.includes("cieav-local-api"))throw new Error("dashboard attention smoke failed: managed API identity not surfaced");
console.log("CIEAV Attention Health dashboard smoke passed");
