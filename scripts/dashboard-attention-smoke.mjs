#!/usr/bin/env node
import {readFile} from "node:fs/promises";
const html=await readFile(new URL("../apps/browser/dashboard.html",import.meta.url),"utf8");
const required=["Attention health","debtScore","promptRate","fastRate","decisionTime","refocusCount","softRate","interruptionsAvoided","A low debt score never weakens HIGH, CRITICAL"];
for(const token of required)if(!html.includes(token))throw new Error(`dashboard attention smoke failed: missing ${token}`);
if(!html.includes("healthCopy(level,r)"))throw new Error("dashboard attention smoke failed: missing level explanation");
console.log("LATCH Attention Health dashboard smoke passed");
