#!/usr/bin/env node
import assert from "node:assert/strict";
import {adapterHealth,verifyAdapterProposal} from "../apps/browser/adapters.mjs";

const good=verifyAdapterProposal({url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(good.ok,true);assert.equal(good.adapterId,"cieav.synthetic.access");assert.equal(good.operationId,"disconnect");assert.ok(Date.parse(good.expiresAt)>Date.now());

const disabled=verifyAdapterProposal({url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:false});
assert.equal(disabled.ok,false,"test-only adapter must be disabled outside test mode");

const spoof=verifyAdapterProposal({url:"https://evil.example/test-lab",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(spoof.ok,false,"lookalike origin must not match a trusted adapter");

const wrongAction=verifyAdapterProposal({url:"about:blank",actionType:"financial.commit",label:"Disconnect",testMode:true});
assert.equal(wrongAction.ok,false,"adapter must be bound to an exact action type");

const wrongLabel=verifyAdapterProposal({url:"about:blank",actionType:"access.grant",label:"Remove everything",testMode:true});
assert.equal(wrongLabel.ok,false,"inverse label must match the adapter contract");

const forgedId=verifyAdapterProposal({adapterId:"cieav.test-lab.access",url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(forgedId.ok,false,"page-proposed adapter ID cannot override origin binding");

const wrongOperation=verifyAdapterProposal({operationId:"delete",url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(wrongOperation.ok,false,"inverse operation must match the adapter contract");

const lab=verifyAdapterProposal({url:"http://127.0.0.1:8791/test-lab",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(lab.ok,true);assert.equal(lab.adapterId,"cieav.test-lab.access");

const health=adapterHealth();assert.equal(health.registryVersion,1);assert.ok(health.adapters.every(a=>a.testOnly===true),"no production site adapter should be implied yet");
console.log("CIEAV trusted adapter registry checks passed");
