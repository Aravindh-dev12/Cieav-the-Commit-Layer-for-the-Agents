#!/usr/bin/env node
import assert from "node:assert/strict";
import {executePreparedBrowserAction,prepareBrowserActionFromSessions} from "../apps/browser/browser-commit.mjs";

function session({url="https://example.test/form",selectorFound=true,failEffect=false}={}){
  const calls=[];
  const value={
    closed:false,
    pipe:{closed:false},
    calls,
    async send(method,params={}){
      calls.push({method,params});
      if(method==="Page.getFrameTree")return{frameTree:{frame:{url}}};
      if(method==="DOM.getDocument")return{root:{nodeId:1}};
      if(method==="DOM.querySelector")return{nodeId:selectorFound?2:0};
      if(method==="DOM.getBoxModel")return{model:{content:[10,20,30,20,30,40,10,40]}};
      if(method==="Input.dispatchMouseEvent"&&failEffect)throw new Error("simulated_cdp_transport_loss");
      if(method==="DOM.focus"&&failEffect)throw new Error("simulated_cdp_transport_loss");
      return{};
    }
  };
  return value;
}

const effectMethods=new Set(["Input.dispatchMouseEvent","Input.insertText","DOM.focus"]);
const preflightOnly=calls=>calls.every(call=>!effectMethods.has(call.method));

{
  const s=session();
  const prepared=await prepareBrowserActionFromSessions([s],{operation:"CLICK",pageUrl:"https://example.test/form",selector:"#pay"});
  assert.equal(prepared.operation,"CLICK");
  assert.equal(preflightOnly(s.calls),true,"CLICK preparation crossed the effect boundary");
  const result=await executePreparedBrowserAction(prepared);
  assert.equal(result.operation,"CLICK");
  assert.deepEqual(s.calls.filter(call=>call.method==="Input.dispatchMouseEvent").map(call=>call.params.type),["mousePressed","mouseReleased"]);
}

{
  const s=session({selectorFound:false});
  await assert.rejects(()=>prepareBrowserActionFromSessions([s],{operation:"CLICK",pageUrl:"https://example.test/form",selector:"#missing"}),/browser_commit_selector_not_found/);
  assert.equal(preflightOnly(s.calls),true,"failed selector preflight crossed the effect boundary");
}

{
  const s=session({failEffect:true});
  const prepared=await prepareBrowserActionFromSessions([s],{operation:"CLICK",pageUrl:"https://example.test/form",selector:"#pay"});
  assert.equal(preflightOnly(s.calls),true);
  await assert.rejects(()=>executePreparedBrowserAction(prepared),/browser_commit_effect_unknown:simulated_cdp_transport_loss/);
}

{
  const s=session();
  const prepared=await prepareBrowserActionFromSessions([s],{operation:"TYPE",pageUrl:"https://example.test/form",selector:"#memo",text:"invoice 42"});
  assert.equal(preflightOnly(s.calls),true,"TYPE preparation crossed the effect boundary");
  const result=await executePreparedBrowserAction(prepared);
  assert.equal(result.operation,"TYPE");
  assert.deepEqual(s.calls.filter(call=>effectMethods.has(call.method)).map(call=>call.method),["DOM.focus","Input.insertText"]);
}

console.log("CIEAV browser commit-point qualification passed: preflight is side-effect free and post-boundary failures become UNKNOWN");
