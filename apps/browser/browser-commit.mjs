const MAX_SELECTOR_BYTES=2048;
const MAX_TEXT_BYTES=64*1024;

function exactWebUrl(value){let url;try{url=new URL(String(value??""))}catch{throw new Error("browser_commit_page_url_invalid")}if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("browser_commit_page_url_invalid");return url.href}
function selectorValue(value){const selector=String(value??"");if(!selector||Buffer.byteLength(selector,"utf8")>MAX_SELECTOR_BYTES||selector.includes("\0"))throw new Error("browser_commit_selector_invalid");return selector}
function textValue(value){if(typeof value!=="string")throw new Error("browser_commit_text_invalid");if(Buffer.byteLength(value,"utf8")>MAX_TEXT_BYTES||value.includes("\0"))throw new Error("browser_commit_text_invalid");return value}
async function pageFor(sessions,pageUrl){const wanted=exactWebUrl(pageUrl),matches=[];for(const session of sessions??[]){if(!session||session.closed||session.pipe?.closed||typeof session.send!=="function")continue;try{const result=await session.send("Page.getFrameTree"),url=exactWebUrl(result?.frameTree?.frame?.url);if(url===wanted)matches.push(session)}catch{}}if(matches.length===0)throw new Error("browser_commit_page_unavailable");if(matches.length!==1)throw new Error("browser_commit_page_ambiguous");return{session:matches[0],pageUrl:wanted}}
async function nodeFor(session,selector){const document=await session.send("DOM.getDocument",{depth:0,pierce:false}),root=document?.root;if(!root||!Number.isInteger(root.nodeId))throw new Error("browser_commit_document_root_missing");const result=await session.send("DOM.querySelector",{nodeId:root.nodeId,selector}),nodeId=result?.nodeId;if(!Number.isInteger(nodeId)||nodeId<=0)throw new Error("browser_commit_selector_not_found");return nodeId}
function centerFromBox(box){for(const name of ["content","padding","border","margin"]){const quad=box?.model?.[name];if(Array.isArray(quad)&&quad.length===8&&quad.every(Number.isFinite)){let x=0,y=0;for(let i=0;i<8;i+=2){x+=quad[i];y+=quad[i+1]}return{x:x/4,y:y/4}}}throw new Error("browser_commit_element_box_unavailable")}
function effectUnknown(error){const message=String(error?.message??error).slice(0,400);const wrapped=new Error(`browser_commit_effect_unknown:${message}`);wrapped.cause=error;return wrapped}

export async function commitBrowserActionFromSessions(sessions,raw={}){
  const operation=String(raw.operation??"").toUpperCase();if(!["CLICK","TYPE"].includes(operation))throw new Error("browser_commit_operation_invalid");
  const selector=selectorValue(raw.selector),{session,pageUrl}=await pageFor(sessions,raw.pageUrl),nodeId=await nodeFor(session,selector);
  if(operation==="CLICK"){
    const box=await session.send("DOM.getBoxModel",{nodeId}),point=centerFromBox(box);let effectStarted=false;
    try{for(const type of ["mousePressed","mouseReleased"]){effectStarted=true;await session.send("Input.dispatchMouseEvent",{type,x:point.x,y:point.y,button:"left",clickCount:1,modifiers:0})}}catch(error){if(effectStarted)throw effectUnknown(error);throw error}
    return{operation,pageUrl,selectorBytes:Buffer.byteLength(selector,"utf8"),textBytes:0,authority:false};
  }
  const text=textValue(raw.text);let effectStarted=false;
  try{effectStarted=true;await session.send("DOM.focus",{nodeId});await session.send("Input.insertText",{text})}catch(error){if(effectStarted)throw effectUnknown(error);throw error}
  return{operation,pageUrl,selectorBytes:Buffer.byteLength(selector,"utf8"),textBytes:Buffer.byteLength(text,"utf8"),authority:false};
}

export const BrowserCommitConstants={MAX_SELECTOR_BYTES,MAX_TEXT_BYTES};
