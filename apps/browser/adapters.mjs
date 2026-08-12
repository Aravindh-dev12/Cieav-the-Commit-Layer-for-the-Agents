const text=(v,n)=>typeof v==="string"?v.slice(0,n):"";

const ADAPTERS=Object.freeze([
  Object.freeze({
    id:"cieav.test-lab.access",
    version:1,
    testOnly:true,
    match({url,actionType}){
      let u;try{u=new URL(url)}catch{return false}
      return u.protocol==="http:"&&u.hostname==="127.0.0.1"&&u.pathname==="/test-lab"&&actionType==="access.grant";
    },
    inverse:Object.freeze({operationId:"disconnect",labels:Object.freeze(["Disconnect"]),expiresMs:30_000})
  })
]);

export function adapterById(id){return ADAPTERS.find(a=>a.id===id)??null}

export function verifyAdapterProposal({adapterId,url,actionType,operationId,label,testMode=false}){
  const adapter=adapterById(adapterId);
  if(!adapter)return{ok:false,error:"unknown_adapter"};
  if(adapter.testOnly&&!testMode)return{ok:false,error:"test_adapter_disabled"};
  if(!adapter.match({url,actionType}))return{ok:false,error:"adapter_origin_or_action_mismatch"};
  if(operationId!==adapter.inverse.operationId)return{ok:false,error:"adapter_inverse_operation_mismatch"};
  const normalized=text(label,200).trim();
  if(!adapter.inverse.labels.includes(normalized))return{ok:false,error:"adapter_inverse_label_mismatch"};
  return{ok:true,adapterId:adapter.id,adapterVersion:adapter.version,operationId:adapter.inverse.operationId,expiresAt:new Date(Date.now()+adapter.inverse.expiresMs).toISOString()};
}

export function adapterHealth(){return{registryVersion:1,adapters:ADAPTERS.map(a=>({id:a.id,version:a.version,testOnly:a.testOnly}))}}
