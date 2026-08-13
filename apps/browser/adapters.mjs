import crypto from "node:crypto";

const text=(v,n)=>typeof v==="string"?v.slice(0,n):"";
const hash=value=>crypto.createHash("sha256").update(value,"utf8").digest("base64url");

const ADAPTERS=Object.freeze([
  Object.freeze({
    id:"cieav.test-lab.access",
    version:2,
    testOnly:true,
    match({url,actionType}){
      let u;try{u=new URL(url)}catch{return false}
      return u.protocol==="http:"&&u.hostname==="127.0.0.1"&&u.pathname==="/test-lab"&&!u.search&&!u.hash&&actionType==="access.grant";
    },
    resourceKey(){return"test-lab:drive-connection"},
    inverse:Object.freeze({operationId:"disconnect",labels:Object.freeze(["Disconnect"]),expiresMs:30_000})
  }),
  Object.freeze({
    id:"cieav.synthetic.access",
    version:2,
    testOnly:true,
    match({url,actionType}){return url==="about:blank"&&actionType==="access.grant"},
    resourceKey(){return"synthetic:connection"},
    inverse:Object.freeze({operationId:"disconnect",labels:Object.freeze(["Disconnect"]),expiresMs:10_000})
  })
]);

function bindingFor(adapter,{url,actionType}){
  const resourceKey=text(adapter.resourceKey?.({url,actionType}),500);
  if(!resourceKey)return null;
  return{
    kind:"ADAPTER_RESOURCE",
    fingerprint:hash([adapter.id,String(adapter.version),actionType,resourceKey].join("\n"))
  };
}

export function adapterById(id){return ADAPTERS.find(a=>a.id===id)??null}

export function verifyAdapterProposal({adapterId,url,actionType,operationId,label,testMode=false}){
  const normalized=text(label,200).trim();
  let candidates=ADAPTERS.filter(a=>(testMode||!a.testOnly)&&a.match({url,actionType})&&a.inverse.labels.includes(normalized));
  if(adapterId)candidates=candidates.filter(a=>a.id===adapterId);
  if(operationId)candidates=candidates.filter(a=>a.inverse.operationId===operationId);
  if(candidates.length===0)return{ok:false,error:"no_trusted_adapter_match"};
  if(candidates.length!==1)return{ok:false,error:"ambiguous_trusted_adapter"};
  const adapter=candidates[0],resourceBinding=bindingFor(adapter,{url,actionType});
  if(!resourceBinding)return{ok:false,error:"adapter_resource_binding_failed"};
  return{
    ok:true,
    adapterId:adapter.id,
    adapterVersion:adapter.version,
    operationId:adapter.inverse.operationId,
    resourceBinding,
    expiresAt:new Date(Date.now()+adapter.inverse.expiresMs).toISOString()
  };
}

export function sameAdapterCapability(a,b){
  return Boolean(a?.ok&&b?.ok&&a.adapterId===b.adapterId&&a.adapterVersion===b.adapterVersion&&a.operationId===b.operationId&&a.resourceBinding?.kind==="ADAPTER_RESOURCE"&&a.resourceBinding?.fingerprint===b.resourceBinding?.fingerprint);
}

export function adapterHealth(){return{registryVersion:2,adapters:ADAPTERS.map(a=>({id:a.id,version:a.version,testOnly:a.testOnly}))}}
