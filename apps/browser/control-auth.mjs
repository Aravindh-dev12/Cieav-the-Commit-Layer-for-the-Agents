import crypto from "node:crypto";

const COOKIE="cieav_control";
const safeEqual=(a,b)=>{const x=Buffer.from(String(a??"")),y=Buffer.from(String(b??""));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const bearer=req=>{const h=String(req?.headers?.authorization??"");return h.startsWith("Bearer ")?h.slice(7):""};
const cookies=req=>Object.fromEntries(String(req?.headers?.cookie??"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),x.slice(i+1)]}));

export class ControlAuth{
  constructor(token,{bootstrapTtlMs=30_000}={}){
    this.token=typeof token==="string"&&token.length>=43?token:crypto.randomBytes(48).toString("base64url");
    this.bootstrapTtlMs=Math.max(5_000,Math.min(120_000,Number(bootstrapTtlMs)||30_000));
    this.bootstrap=new Map();
  }
  authorized(req){return safeEqual(bearer(req),this.token)||safeEqual(cookies(req)[COOKIE],this.token)}
  issueBootstrap(){
    const value=crypto.randomBytes(32).toString("base64url"),expires=Date.now()+this.bootstrapTtlMs;
    this.bootstrap.set(value,expires);
    for(const [k,v] of this.bootstrap)if(v<Date.now())this.bootstrap.delete(k);
    return value;
  }
  consumeBootstrap(value){
    const expires=this.bootstrap.get(String(value??""));
    if(!expires){return false}
    this.bootstrap.delete(String(value));
    return expires>=Date.now();
  }
  cookie(){return `${COOKIE}=${this.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`}
  clearCookie(){return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`}
}

export function controlBearer(token){return{authorization:`Bearer ${token}`}}
