#!/usr/bin/env node
import assert from "node:assert/strict";
import {adapterHealth,sameAdapterCapability,verifyAdapterProposal} from "../apps/browser/adapters.mjs";

const good=verifyAdapterProposal({url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(good.ok,true);assert.equal(good.adapterId,"cieav.synthetic.access");assert.equal(good.operationId,"disconnect");assert.equal(good.resourceBinding?.kind,"ADAPTER_RESOURCE");assert.match(good.resourceBinding?.fingerprint??"",/^[A-Za-z0-9_-]{40,}$/);assert.ok(Date.parse(good.expiresAt)>Date.now());

const repeat=verifyAdapterProposal({adapterId:good.adapterId,operationId:good.operationId,url:"about:blank",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(repeat.ok,true);assert.equal(sameAdapterCapability(good,repeat),true,"same trusted resource must reproduce the same capability binding");
const forgedBinding={...repeat,resourceBinding:{kind:"ADAPTER_RESOURCE",fingerprint:"forged"}};
assert.equal(sameAdapterCapability(good,forgedBinding),false,"resource fingerprint mismatch must invalidate capability equality");

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
const labQuery=verifyAdapterProposal({url:"http://127.0.0.1:8791/test-lab?resource=other",actionType:"access.grant",label:"Disconnect",testMode:true});
assert.equal(labQuery.ok,false,"test-lab adapter must not accept query-based resource substitution");
assert.notEqual(lab.resourceBinding?.fingerprint,good.resourceBinding?.fingerprint,"different trusted resources must have different fingerprints");

const health=adapterHealth();assert.equal(health.registryVersion,2);assert.ok(health.adapters.every(a=>a.testOnly===true),"no production site adapter should be implied yet");
console.log("CIEAV trusted adapter registry/resource-binding checks passed");
