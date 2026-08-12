import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {LatchClient} from "@latch/sdk";
import type {Receipt, RiskLevel} from "@latch/contracts";
import "./styles.css";
function App(){
  const [apiBase,setApiBase]=useState(localStorage.getItem("latchApi")||"http://localhost:8787");
  const [token,setToken]=useState(localStorage.getItem("latchToken")||"");
  const [receipts,setReceipts]=useState<Receipt[]>([]);const [filter,setFilter]=useState<RiskLevel|"ALL">("ALL");const [error,setError]=useState("");
  const client=useMemo(()=>new LatchClient(apiBase,token||undefined),[apiBase,token]);
  async function load(){try{setError("");setReceipts(await client.receipts(200));}catch(e:any){setError(e.message)}}
  useEffect(()=>{if(token)void load()},[]);
  const visible=receipts.filter(r=>filter==="ALL"||r.manifest.risk===filter);
  return <main><header><div className="brand"><span>L</span><div><h1>LATCH</h1><p>Digital action timeline</p></div></div><button onClick={load}>Refresh</button></header>
    <section className="connection"><label>API<input value={apiBase} onChange={e=>setApiBase(e.target.value)}/></label><label>Device token<input type="password" value={token} onChange={e=>setToken(e.target.value)}/></label><button onClick={()=>{localStorage.setItem("latchApi",apiBase);localStorage.setItem("latchToken",token);void load()}}>Connect</button></section>
    {error&&<div className="error">{error}</div>}
    <nav>{(["ALL","LOW","MEDIUM","HIGH","CRITICAL"] as const).map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</nav>
    <section className="timeline">{visible.length===0?<div className="empty">No actions found.</div>:visible.map(r=><article key={r.id} className={`item ${r.manifest.risk}`}><div className="rail"><span></span></div><div className="content"><div className="row"><h2>{r.manifest.summary}</h2><b>{r.manifest.risk}</b></div><p className="meta">{new Date(r.createdAt).toLocaleString()} · {new URL(r.source.url).hostname} · {r.status}</p><div className="facts"><span>Reversibility <strong>{r.manifest.reversibility}</strong></span><span>Confidence <strong>{Math.round(r.manifest.confidence*100)}%</strong></span><span>Type <strong>{r.manifest.actionType}</strong></span></div>{r.manifest.effects.length>0&&<ul>{r.manifest.effects.map((x,i)=><li key={i}>{x}</li>)}</ul>}{r.manifest.warnings.length>0&&<div className="warnings">{r.manifest.warnings.map((x,i)=><p key={i}>⚠ {x}</p>)}</div>}<details><summary>Receipt details</summary><pre>{JSON.stringify(r,null,2)}</pre></details></div></article>)}</section>
  </main>
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
