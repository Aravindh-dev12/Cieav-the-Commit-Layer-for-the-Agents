import crypto from "node:crypto";

export const BROWSER_OBSERVATION_MAX_DOCUMENT_BYTES=2*1024*1024;
const MAX_FRAMES=64;
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");

export function normalizeBrowserObservationOrigin(value){
  let url;try{url=new URL(String(value??""))}catch{throw new Error("browser_observation_origin_invalid")}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("browser_observation_origin_invalid");
  return url.origin;
}

export function normalizeBrowserObservationUrl(value){
  let url;try{url=new URL(String(value??""))}catch{throw new Error("browser_observation_url_invalid")}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("browser_observation_url_invalid");
  return url.href;
}

function summarizeFrameTree(frameTree){
  let count=0;
  const visit=node=>{
    if(!node?.frame)throw new Error("browser_observation_frame_tree_invalid");
    if(++count>MAX_FRAMES)throw new Error("browser_observation_frame_limit_exceeded");
    const frame=node.frame;
    return{id:String(frame.id??""),url:String(frame.url??""),securityOrigin:String(frame.securityOrigin??""),mimeType:String(frame.mimeType??""),children:(node.childFrames??[]).map(visit)};
  };
  const summary=visit(frameTree);
  return{summary,count,digest:sha256(JSON.stringify(summary))};
}

export async function observeBrowserPageFromSessions(sessions,{origin,url,maxDocumentBytes=BROWSER_OBSERVATION_MAX_DOCUMENT_BYTES}={}){
  const allowedOrigin=normalizeBrowserObservationOrigin(origin),exactUrl=url==null||String(url)===""?null:normalizeBrowserObservationUrl(url);
  if(exactUrl&&new URL(exactUrl).origin!==allowedOrigin)throw new Error("browser_observation_url_origin_mismatch");
  if(!Number.isInteger(maxDocumentBytes)||maxDocumentBytes<1024||maxDocumentBytes>BROWSER_OBSERVATION_MAX_DOCUMENT_BYTES)throw new Error("browser_observation_document_limit_invalid");
  const matches=[];
  for(const session of sessions??[]){
    if(!session||session.closed||session.pipe?.closed||typeof session.send!=="function")continue;
    try{
      const result=await session.send("Page.getFrameTree"),frameTree=result?.frameTree,topUrl=normalizeBrowserObservationUrl(frameTree?.frame?.url);
      if(new URL(topUrl).origin!==allowedOrigin)continue;
      if(exactUrl&&topUrl!==exactUrl)continue;
      matches.push({session,frameTree,topUrl});
    }catch{}
  }
  if(matches.length===0)throw new Error("browser_observation_target_unavailable");
  if(matches.length!==1)throw new Error("browser_observation_target_ambiguous");
  const match=matches[0],frame=summarizeFrameTree(match.frameTree),document=await match.session.send("DOM.getDocument",{depth:1,pierce:false}),root=document?.root;
  if(!root||!Number.isInteger(root.nodeId))throw new Error("browser_observation_document_root_missing");
  const htmlNode=(root.children??[]).find(node=>String(node?.nodeName??"").toUpperCase()==="HTML"),nodeId=htmlNode?.nodeId??root.nodeId;
  if(!Number.isInteger(nodeId))throw new Error("browser_observation_document_node_missing");
  const outer=await match.session.send("DOM.getOuterHTML",{nodeId}),markup=String(outer?.outerHTML??""),documentBytes=Buffer.byteLength(markup,"utf8");
  if(documentBytes>maxDocumentBytes)throw new Error("browser_observation_document_too_large");
  return{url:match.topUrl,origin:allowedOrigin,documentSha256:sha256(markup),documentBytes,frameTreeSha256:frame.digest,frameCount:frame.count,observedAt:new Date().toISOString(),authority:false,mayMintExecutionAuthority:false};
}
