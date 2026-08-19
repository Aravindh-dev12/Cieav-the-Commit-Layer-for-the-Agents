const MAX_MESSAGE_BYTES=32*1024*1024;

export class CDPPipe{
  constructor(readable,writable,{timeoutMs=12_000,firstCommandTimeoutMs=15_000}={}){
    if(!readable||typeof readable.on!=="function"||!writable||typeof writable.write!=="function")throw new Error("CDP pipe requires readable and writable streams");
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(firstCommandTimeoutMs)||firstCommandTimeoutMs<timeoutMs)throw new Error("CDP pipe timeout policy is invalid");
    this.readable=readable;this.writable=writable;this.timeoutMs=timeoutMs;this.firstCommandTimeoutMs=firstCommandTimeoutMs;this.nextId=0;this.pending=new Map();this.listeners=new Set();this.buffer=Buffer.alloc(0);this.closed=false;
    readable.on("data",chunk=>this._data(chunk));
    readable.on("error",err=>this._close(err));
    readable.on("end",()=>this._close(new Error("CDP pipe ended")));
    readable.on("close",()=>this._close(new Error("CDP pipe closed")));
    writable.on?.("error",err=>this._close(err));
  }
  _data(chunk){
    if(this.closed)return;
    const next=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    if(this.buffer.length+next.length>MAX_MESSAGE_BYTES){this._close(new Error("CDP pipe message buffer exceeded limit"));return}
    this.buffer=Buffer.concat([this.buffer,next]);
    for(;;){const i=this.buffer.indexOf(0);if(i<0)break;const raw=this.buffer.subarray(0,i);this.buffer=this.buffer.subarray(i+1);if(!raw.length)continue;this._message(raw.toString("utf8"))}
  }
  _message(raw){
    let msg;try{msg=JSON.parse(raw)}catch{return this._close(new Error("Invalid JSON from CDP pipe"))}
    if(msg&&Number.isInteger(msg.id)){
      const pending=this.pending.get(msg.id);if(!pending)return;
      this.pending.delete(msg.id);clearTimeout(pending.timer);
      if(msg.error)pending.reject(new Error(String(msg.error.message??"CDP command failed")));else pending.resolve(msg.result??{});
      return;
    }
    for(const listener of this.listeners){try{listener(msg)}catch{}}
  }
  _close(error=new Error("CDP pipe closed")){
    if(this.closed)return;this.closed=true;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error)}this.pending.clear();
  }
  on(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  send(method,params={},sessionId){
    if(this.closed)return Promise.reject(new Error("CDP pipe is closed"));
    const id=++this.nextId,msg={id,method,params};if(sessionId)msg.sessionId=sessionId;
    return new Promise((resolve,reject)=>{
      const timeoutMs=id===1?this.firstCommandTimeoutMs:this.timeoutMs;
      const timer=setTimeout(()=>{if(this.pending.delete(id))reject(new Error(`CDP timeout: ${method}`))},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      const data=Buffer.from(JSON.stringify(msg)+"\0","utf8");
      this.writable.write(data,err=>{if(err){const pending=this.pending.get(id);if(pending){this.pending.delete(id);clearTimeout(timer);pending.reject(err)}}});
    });
  }
  session(sessionId){return new CDPSession(this,sessionId)}
  close(){if(this.closed)return;this._close();try{this.writable.end?.()}catch{}try{this.readable.destroy?.()}catch{}}
}

export class CDPSession{
  constructor(pipe,sessionId){this.pipe=pipe;this.sessionId=sessionId;this.listeners=new Set();this.unsubscribe=pipe.on(msg=>{if(msg?.sessionId!==sessionId)return;for(const f of this.listeners){try{f(msg)}catch{}}})}
  send(method,params={}){return this.pipe.send(method,params,this.sessionId)}
  on(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener)}
  close(){this.listeners.clear();this.unsubscribe?.()}
}

export const CDPPipeConstants={MAX_MESSAGE_BYTES};
