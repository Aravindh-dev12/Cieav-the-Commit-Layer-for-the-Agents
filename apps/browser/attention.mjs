import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {AuditLog} from "./audit.mjs";

const REGRET_WINDOW_MS=7*24*60*60*1000;
const RECOVERY_COMMITS=3;
const FAST_APPROVAL_MS=650;
const REFOCUS_STREAK=3;
const MEDIUM_WARMUP_PROMPTS=2;
const sensitive=new Set(["CREDENTIAL","FINANCIAL","IDENTITY","HEALTH","BIOMETRIC"]);
const now=()=>Date.now();
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));

function history(){return{seen:0,committed:0,cancelled:0,undone:0,undoFailed:0,hardShown:0,softShown:0,passiveShown:0,safeCommitStreak:0,recoveryCommits:0,fastApprovalStreak:0,promptedDecisions:0,fastApprovals:0,decisionMsTotal:0,lastFriction:null,lastDecisionMs:null,lastAt:null,lastCancelledAt:null,lastUndoneAt:null}}
function stats(){return{analyzed:0,hard:0,soft:0,passive:0,promptedDecisions:0,committed:0,cancelled:0,undone:0,undoFailed:0,fastApprovals:0,repeatedSoft:0,decisionMsTotal:0}}
function normalizedHistory(x){return{...history(),...(x??{})}}
function splitKey(key){const i=key.lastIndexOf("::");return i<0?{origin:key,actionType:"unknown"}:{origin:key.slice(0,i),actionType:key.slice(i+2)}}

export class Attention{
  constructor(stateDir,{clock=now}={}){this.f=path.join(stateDir,"attention.json");this.clock=clock;this.audit=new AuditLog(stateDir);this.s={version:3,mode:"balanced",origins:{},stats:stats()}}
  async load(){await this.audit.load();try{const x=JSON.parse(await readFile(this.f,"utf8")),origins={};for(const[k,v]of Object.entries(x.origins??{}))origins[k]=normalizedHistory(v);this.s={...this.s,...x,version:3,origins,stats:{...stats(),...(x.stats??{})}}}catch{}return this}
  async save(){await writeFile(this.f,JSON.stringify(this.s,null,2),{mode:0o600})}
  h(origin,type){const k=`${origin}::${type}`;return this.s.origins[k]??(this.s.origins[k]=history())}
  recentRegret(h){const latest=Math.max(Date.parse(h.lastCancelledAt||0)||0,Date.parse(h.lastUndoneAt||0)||0);return latest>0&&(this.clock()-latest)<REGRET_WINDOW_MS&&h.recoveryCommits<RECOVERY_COMMITS}
  budget(){const sites=new Map(),actions=[];for(const[key,raw]of Object.entries(this.s.origins)){const h=normalizedHistory(raw),{origin,actionType}=splitKey(key),prompts=h.hardShown+h.softShown,regrets=h.cancelled+h.undone,stableMedium=h.softShown>MEDIUM_WARMUP_PROMPTS&&!this.recentRegret(h)&&regrets===0,avoidableSoft=stableMedium?Math.max(0,h.softShown-MEDIUM_WARMUP_PROMPTS):0,fastRate=h.promptedDecisions?h.fastApprovals/h.promptedDecisions:0,decisionMs=h.decisionMsTotal||0;let recommendation="healthy",score=0;if(h.fastApprovalStreak>=REFOCUS_STREAK){recommendation="refocus_hard";score=90+Math.min(10,h.fastApprovalStreak)}else if(avoidableSoft>=2){recommendation="reduce_soft";score=55+Math.min(35,avoidableSoft*8)}else if(fastRate>=.4&&prompts>=3){recommendation="watch_habituation";score=50+Math.min(30,Math.round(fastRate*30))}else if(prompts>=5){recommendation="watch_prompt_load";score=35+Math.min(20,prompts)}actions.push({origin,actionType,prompts,hard:h.hardShown,soft:h.softShown,passive:h.passiveShown,avoidableSoft,regretSignals:regrets,fastApprovalRate:fastRate,averageDecisionMs:h.promptedDecisions?Math.round(decisionMs/h.promptedDecisions):null,recommendation,score});const site=sites.get(origin)??{origin,actions:0,prompts:0,hard:0,soft:0,passive:0,avoidableSoft:0,decisionMsTotal:0,promptedDecisions:0,fastApprovals:0,regretSignals:0};site.actions++;site.prompts+=prompts;site.hard+=h.hardShown;site.soft+=h.softShown;site.passive+=h.passiveShown;site.avoidableSoft+=avoidableSoft;site.decisionMsTotal+=decisionMs;site.promptedDecisions+=h.promptedDecisions||0;site.fastApprovals+=h.fastApprovals||0;site.regretSignals+=regrets;sites.set(origin,site)}const siteBudgets=[...sites.values()].map(s=>({...s,attentionSeconds:Math.round(s.decisionMsTotal/1000),avoidablePromptRate:s.soft?s.avoidableSoft/s.soft:0,fastApprovalRate:s.promptedDecisions?s.fastApprovals/s.promptedDecisions:0})).sort((a,b)=>(b.avoidableSoft*10+b.fastApprovalRate*5+b.prompts)-(a.avoidableSoft*10+a.fastApprovalRate*5+a.prompts));const hotspots=actions.filter(x=>x.recommendation!=="healthy").sort((a,b)=>b.score-a.score).slice(0,8);return{estimatedAvoidablePrompts:actions.reduce((n,x)=>n+x.avoidableSoft,0),siteBudgets:siteBudgets.slice(0,12),hotspots}}
  report(){const s=this.s.stats,an=Math.max(1,s.analyzed),prompted=Math.max(1,s.promptedDecisions),soft=Math.max(1,s.soft);const softLoad=s.soft/an,fast=s.fastApprovals/prompted,repeat=s.repeatedSoft/soft;const softBurden=clamp(softLoad/.25),habituation=clamp(fast/.40),repeatBurden=clamp(repeat/.35);const score=Math.round(35*softBurden+45*habituation+20*repeatBurden);const refocusActions=Object.values(this.s.origins).filter(h=>normalizedHistory(h).fastApprovalStreak>=REFOCUS_STREAK).length,budget=this.budget();return{score,level:score>=75?"CRITICAL":score>=50?"HIGH":score>=25?"WATCH":"LOW",promptRate:(s.hard+s.soft)/an,softPromptRate:softLoad,hardPromptRate:s.hard/an,fastApprovalRate:fast,repeatSoftRate:repeat,averageDecisionMs:s.promptedDecisions?Math.round(s.decisionMsTotal/s.promptedDecisions):null,refocusActions,interruptionsAvoided:s.passive,estimatedAvoidablePrompts:budget.estimatedAvoidablePrompts}}
  snapshot(){return{...this.s,report:this.report(),budget:this.budget()}}
  decide(origin,m){const h=this.h(origin,m.actionType),isSensitive=(m.dataCategories??[]).some(x=>sensitive.has(x)),regret=this.recentRegret(h),known=m.reversibility!=="UNKNOWN",conf=Number(m.confidence??0),stable=h.safeCommitStreak>=2&&conf>=.82&&known&&!regret;let level="PASSIVE",reasons=[];
    if(this.s.mode==="strict"){level="HARD";reasons.push("strict_mode")}
    else if(["HIGH","CRITICAL"].includes(m.risk)||isSensitive){level="HARD";reasons.push(isSensitive?"sensitive_data":"high_consequence")}
    else if(this.s.mode==="quiet"){
      if(m.risk==="MEDIUM"&&(regret||!known||conf<.70)){level="SOFT";reasons.push(regret?"recent_regret":!known?"unknown_reversibility":"low_confidence")}
    }else if(m.risk==="MEDIUM"&&!stable){level="SOFT";if(h.seen<2)reasons.push("new_pattern");if(regret)reasons.push("recent_regret");if(!known)reasons.push("unknown_reversibility");if(conf<.78)reasons.push("low_confidence");if(!reasons.length)reasons.push("not_yet_learned")}
    const repeatedSoft=level==="SOFT"&&h.softShown>=MEDIUM_WARMUP_PROMPTS&&!regret&&known&&conf>=.82;
    if(repeatedSoft)this.s.stats.repeatedSoft++;
    if(level==="HARD")h.hardShown++,this.s.stats.hard++;
    else if(level==="SOFT")h.softShown++,this.s.stats.soft++;
    else h.passiveShown++,this.s.stats.passive++;
    this.s.stats.analyzed++;h.lastFriction=level;
    const refocus=level==="HARD"&&h.fastApprovalStreak>=REFOCUS_STREAK;
    if(refocus)reasons.push("habituation_signal");
    void this.audit.append("ACTION_DETECTED",{requestId:m.requestId,origin,actionType:m.actionType,risk:m.risk,detail:`friction=${level}`}).catch(()=>{});
    void this.save();
    return{level,refocus,reasons,debt:this.report()}
  }
  async record(origin,type,status,{friction,decisionMs,automated=false}={}){const h=this.h(origin,type),ts=new Date(this.clock()).toISOString();h.seen++;h.lastAt=ts;
    if(status==="COMMITTED"){h.committed++;this.s.stats.committed++;h.safeCommitStreak++;if(this.recentRegret(h))h.recoveryCommits++;await this.audit.append("ACTION_COMMITTED",{origin,actionType:type,detail:friction?`friction=${friction}`:undefined}).catch(()=>{});}
    if(status==="CANCELLED"){h.cancelled++;this.s.stats.cancelled++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastCancelledAt=ts;await this.audit.append("ACTION_CANCELLED",{origin,actionType:type}).catch(()=>{});}
    if(status==="UNDONE"){h.undone++;this.s.stats.undone++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastUndoneAt=ts;await this.audit.append("UNDO_EXECUTED",{origin,actionType:type}).catch(()=>{});}
    if(status==="UNDO_FAILED"){h.undoFailed++;this.s.stats.undoFailed++;await this.audit.append("UNDO_FAILED",{origin,actionType:type}).catch(()=>{});}
    if(!automated&&(friction==="HARD"||friction==="SOFT")&&Number.isFinite(decisionMs)){
      const ms=Math.max(0,Number(decisionMs));h.lastDecisionMs=ms;h.promptedDecisions++;h.decisionMsTotal+=ms;this.s.stats.promptedDecisions++;this.s.stats.decisionMsTotal+=ms;
      if(status==="COMMITTED"&&ms<=FAST_APPROVAL_MS){h.fastApprovalStreak++;h.fastApprovals++;this.s.stats.fastApprovals++}else if(status==="COMMITTED")h.fastApprovalStreak=0;
    }
    await this.save();return this.snapshot()
  }
  async mode(m){if(!["balanced","strict","quiet"].includes(m))throw new Error("invalid mode");this.s.mode=m;await this.save();return this.snapshot()}
}

export const CognitiveDebtConstants={REGRET_WINDOW_MS,RECOVERY_COMMITS,FAST_APPROVAL_MS,REFOCUS_STREAK,MEDIUM_WARMUP_PROMPTS};