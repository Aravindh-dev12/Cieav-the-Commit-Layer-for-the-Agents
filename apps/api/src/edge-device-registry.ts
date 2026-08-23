import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";

const Hex64=z.string().regex(/^[a-f0-9]{64}$/);
const DeviceSchema=z.object({
  id:z.string().min(1).max(500),version:z.literal(1),identityDigest:Hex64,platform:z.string().min(1).max(120),
  registeredAt:z.string().datetime(),lastSeenAt:z.string().datetime(),maxStalenessMs:z.number().int().positive().max(7*24*60*60*1000),
  state:z.enum(["ACTIVE","STALE","REVOKED"]),revokedAt:z.string().datetime().optional(),revocationReason:z.string().max(1000).optional(),
  watchdog:z.object({required:z.boolean(),healthy:z.boolean(),lastHeartbeatAt:z.string().datetime().optional(),maxHeartbeatAgeMs:z.number().int().positive().max(86_400_000),safeState:z.string().min(1).max(500)}).strict()
}).strict();
export type EdgeDeviceRecord=z.infer<typeof DeviceSchema>;
type Payload={version:1;devices:EdgeDeviceRecord[]};type Envelope={payload:Payload;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
async function durableReplace(file:string,contents:string){const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);try{await chmod(file,0o600)}catch{}if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}}

export class CieavEdgeDeviceRegistry{
  private loaded=false;private devices=new Map<string,EdgeDeviceRecord>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV edge-device registry secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(`cieav-edge-device-registry-v1\n${canonical(payload)}`).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.devices)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const raw of env.payload.devices){const device=DeviceSchema.parse(raw);this.devices.set(device.id,device)}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV edge-device registry is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private async persist(){const devices=[...this.devices.values()].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,100_000),payload:Payload={version:1,devices};await durableReplace(this.file,JSON.stringify({payload,mac:this.mac(payload)},null,2)+"\n");this.devices=new Map(devices.map(x=>[x.id,x]))}
  register(raw:unknown){return this.enqueue(async()=>{await this.load();const now=new Date().toISOString(),input=DeviceSchema.pick({id:true,identityDigest:true,platform:true,maxStalenessMs:true,watchdog:true}).parse(raw),current=this.devices.get(input.id);if(current&&current.identityDigest!==input.identityDigest)throw new Error("edge_device_identity_changed");if(current?.state==="REVOKED")throw new Error("edge_device_revoked");const device=DeviceSchema.parse({...input,version:1,registeredAt:current?.registeredAt??now,lastSeenAt:now,state:"ACTIVE"});this.devices.set(device.id,device);await this.persist();return device})}
  heartbeat(id:string,identityDigest:string,watchdogHealthy?:boolean){return this.enqueue(async()=>{await this.load();const current=this.devices.get(id);if(!current)throw new Error("edge_device_not_registered");if(current.identityDigest!==identityDigest)throw new Error("edge_device_identity_mismatch");if(current.state==="REVOKED")throw new Error("edge_device_revoked");const now=new Date().toISOString(),watchdog={...current.watchdog,...(watchdogHealthy===undefined?{}:{healthy:watchdogHealthy,lastHeartbeatAt:now})},next=DeviceSchema.parse({...current,lastSeenAt:now,state:"ACTIVE",watchdog});this.devices.set(id,next);await this.persist();return next})}
  revoke(id:string,reason="edge device revoked"){return this.enqueue(async()=>{await this.load();const current=this.devices.get(id);if(!current)throw new Error("edge_device_not_registered");const next=DeviceSchema.parse({...current,state:"REVOKED",revokedAt:current.revokedAt??new Date().toISOString(),revocationReason:reason.slice(0,1000),watchdog:{...current.watchdog,healthy:false}});this.devices.set(id,next);await this.persist();return next})}
  get(id:string){return this.enqueue(async()=>{await this.load();return this.devices.get(id)??null})}
  list(){return this.enqueue(async()=>{await this.load();return[...this.devices.values()].sort((a,b)=>a.id.localeCompare(b.id))})}
  assertUsable(id:string,now=new Date()){return this.enqueue(async()=>{await this.load();const current=this.devices.get(id);if(!current)throw new Error("edge_device_not_registered");if(current.state==="REVOKED")throw new Error("edge_device_revoked");const nowMs=now.getTime(),seenAge=nowMs-Date.parse(current.lastSeenAt);if(!Number.isFinite(seenAge)||seenAge< -60_000||seenAge>current.maxStalenessMs){const stale=DeviceSchema.parse({...current,state:"STALE"});this.devices.set(id,stale);await this.persist();throw new Error("edge_device_stale")};if(current.watchdog.required){const hb=current.watchdog.lastHeartbeatAt?Date.parse(current.watchdog.lastHeartbeatAt):NaN,age=nowMs-hb;if(!current.watchdog.healthy||!Number.isFinite(age)||age< -60_000||age>current.watchdog.maxHeartbeatAgeMs)throw new Error(`edge_watchdog_unhealthy:safe_state=${current.watchdog.safeState}`)}return current})}
  async close(){await this.chain}
}
