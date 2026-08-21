#!/usr/bin/env node
import {PassThrough} from "node:stream";
import {CDPPipe,CDPPipeConstants} from "../apps/browser/cdp-pipe.mjs";

const browserToHost=new PassThrough(),hostToBrowser=new PassThrough(),pipe=new CDPPipe(browserToHost,hostToBrowser,{timeoutMs:200});
let commandBuffer=Buffer.alloc(0),commands=[];
hostToBrowser.on("data",chunk=>{commandBuffer=Buffer.concat([commandBuffer,chunk]);for(;;){const i=commandBuffer.indexOf(0);if(i<0)break;const raw=commandBuffer.subarray(0,i);commandBuffer=commandBuffer.subarray(i+1);if(raw.length)commands.push(JSON.parse(raw.toString("utf8")))}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const response=(value)=>browserToHost.write(Buffer.from(JSON.stringify(value)+"\0"));

const p=pipe.send("Browser.getVersion");await wait(5);if(commands.length!==1||commands[0].method!=="Browser.getVersion")throw new Error("command framing failed");response({id:commands[0].id,result:{product:"CIEAV-Test"}});if((await p).product!=="CIEAV-Test")throw new Error("response routing failed");

const session=pipe.session("session-1");let eventSeen=false;session.on(e=>{if(e.method==="Runtime.bindingCalled")eventSeen=true});response({sessionId:"session-1",method:"Runtime.bindingCalled",params:{name:"x"}});await wait(5);if(!eventSeen)throw new Error("session event routing failed");

const sp=session.send("Runtime.enable");await wait(5);const sc=commands.at(-1);if(sc.sessionId!=="session-1"||sc.method!=="Runtime.enable")throw new Error("session command routing failed");response({id:sc.id,sessionId:"session-1",result:{}});await sp;

let timedOut=false;try{await pipe.send("Never.responds")}catch(e){timedOut=/timeout/i.test(String(e.message))}if(!timedOut)throw new Error("missing command timeout");

const startupRead=new PassThrough(),startupWrite=new PassThrough(),startupPipe=new CDPPipe(startupRead,startupWrite,{timeoutMs:10,firstCommandTimeoutMs:20,firstCommandRetries:1});
let startupBuffer=Buffer.alloc(0),startupCommands=[];
startupWrite.on("data",chunk=>{startupBuffer=Buffer.concat([startupBuffer,chunk]);for(;;){const i=startupBuffer.indexOf(0);if(i<0)break;const raw=startupBuffer.subarray(0,i);startupBuffer=startupBuffer.subarray(i+1);if(raw.length){const command=JSON.parse(raw.toString("utf8"));startupCommands.push(command);if(startupCommands.length===2)startupRead.write(Buffer.from(JSON.stringify({id:command.id,result:{product:"CIEAV-Retry"}})+"\0"))}}});
const startupResult=await startupPipe.send("Browser.getVersion");if(startupResult.product!=="CIEAV-Retry"||startupCommands.length!==2||startupCommands[0].method!=="Browser.getVersion"||startupCommands[1].method!=="Browser.getVersion")throw new Error("bounded first-command retry failed");
let steadyRetries=0;startupWrite.on("data",()=>steadyRetries++);let steadyTimedOut=false;try{await startupPipe.send("Never.responds.after.startup")}catch(e){steadyTimedOut=/timeout/i.test(String(e.message))}if(!steadyTimedOut)throw new Error("steady-state timeout failed closed");

const r2=new PassThrough(),w2=new PassThrough(),limited=new CDPPipe(r2,w2);r2.write(Buffer.alloc(CDPPipeConstants.MAX_MESSAGE_BYTES+1,1));await wait(5);let closed=false;try{await limited.send("Browser.getVersion")}catch{closed=true}if(!closed)throw new Error("oversized pipe buffer did not fail closed");

session.close();pipe.close();startupPipe.close();limited.close();
console.log("CIEAV private CDP pipe transport passed: ASCIIZ framing + flat session routing + bounded cold-start retry + fail-closed steady-state limits");
