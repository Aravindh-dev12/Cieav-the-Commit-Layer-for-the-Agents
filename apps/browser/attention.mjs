import {readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";
import {AuditLog} from "./audit.mjs";

const REGRET_WINDOW_MS=7*24*60*60*1000;
const ADVERSE_OUTCOME_WINDOW_MS=7*24*60*60*1000;
const SAFETY_MEMORY_MS=30*24*60*60*1000;
const DEBT_EPOCH_IDLE_MS=30*24*60*60*1000;
const RECOVERY_SUCCESSES=3;
const FAST_APPROVAL_MS=650;
const REFOCUS_STREAK=3;
const MEDIUM_WARMUP_PROMPTS=2;
const sensitive=new Set(["CREDENTIAL","FINANCIAL","IDENTITY","HEALTH","BIOMETRIC"]);
const now=()=>Date.now();
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const ts=v=>Date.parse(v||0)||0;

function history(){return{seen:0,committed:0,cancelled:0,undone:0,undoFailed:0,outcomeSuccess:0,outcomeFailure:0,outcomeUnknown:0,hardShown:0,softShown:0,passiveShown:0,safeCommitStreak:0,recoveryCommits:0,fastApprovalStreak:0,promptedDecisions:0,fastApprovals:0,decisionMsTotal:0,lastFriction:null,lastDecisionMs:null,lastAt:null,lastCancelledAt:null,lastUndoneAt:null,lastOutcomeAt:null,lastOutcomeStatus:null}}
function stats(){return{analyzed:0,hard:0,soft:0,passive:0,promptedDecisions:0,committed:0,cancelled:0,undone:0,undoFailed:0,outcomeSuccess:0,outcomeFailure:0,outcomeUnknown:0,fastApprovals:0,repeatedSoft:0,decisionMsTotal:0}}
function normalizedHistory(x){return{...history(),...(x??{})}}
function splitKey(key){const i=key.lastIndexOf("::");return i<0?{origin:key,actionType:"unknown"}:{origin:key.slice(0,i),actionType:key.slice(i+2)}}

export class Attention{
  constructor(stateDir,{clock=now}={}){this.stateDir=stateDir;this.f=path.join(stateDir,"attention.json");this.tmp=`${this.f}.tmp`;this.clock=clock;this.audit=new AuditLog(stateDir);this._saveChain=Promise.resolve();this.s={version:5,mode:"balanced",origins:{},stats:stats(),lastActivityAt:null}}
  async load(){
    await this.audit.load();
    try{
      const x=JSON.parse(await readFile(this.f,"utf8")),origins={};
      if(!x||typeof x!=="object"||Array.isArray(x)||!x.origins||typeof x.origins!=="object"||Array.isArray(x.origins))throw new Error("invalid attention state shape");
      for(const[k,v]of Object.entries(x.origins??{}))origins[k]=normalizedHistory(v);
      const migrated=Number(x.version??0)<5||!x.lastActivityAt;
      this.s={...this.s,...x,version:5,origins,stats:{...stats(),...(x.stats??{})},lastActivityAt:x.lastActivityAt??null,...(migrated?{migratedDebtEpoch:true}:{})};
      if(migrated)this._resetDebtEpoch({forgetSafety:true});
    }catch(err){
      if(err?.code!=="ENOENT"){
        const corrupt=path.join(this.stateDir,`attention.corrupt.${new Date(this.clock()).toISOString().replace(/[:.]/g,"-")}.json`);
        try{await rename(this.f,corrupt)}catch{}
        this.s={version:5,mode:"strict",origins:{},stats:stats(),lastActivityAt:null,recoveredFromCorruptState:true};
      }
    }
    this._expireEpochIfIdle();
    return this;
  }
  save(){const body=JSON.stringify(this.s,null,2),work=async()=>{await writeFile(this.tmp,body,{mode:0o600});await rename(this.tmp,this.f)};const task=this._saveChain.then(work,work);this._saveChain=task.then(()=>undefined,()=>undefined);return task}
  _resetDebtEpoch({forgetSafety=false}={}){
    this.s.stats=stats();
    for(const raw of Object.values(this.s.origins)){
      const h=raw;
      h.hardShown=0;h.softShown=0;h.passiveShown=0;h.fastApprovalStreak=0;h.promptedDecisions=0;h.fastApprovals=0;h.decisionMsTotal=0;h.lastDecisionMs=null;h.lastFriction=null;
      if(forgetSafety){h.safeCommitStreak=0;h.recoveryCommits=0}
    }
    this.s.lastActivityAt=null;
  }
  _touch(){this._expireEpochIfIdle();this.s.lastActivityAt=new Date(this.clock()).toISOString()}
  _expireEpochIfIdle(){const last=ts(this.s.lastActivityAt);if(last&&this.clock()-last>DEBT_EPOCH_IDLE_MS)this._resetDebtEpoch({forgetSafety:true})}
  _expirePatternMemory(h){
    const last=ts(h.lastAt),outcomeAt=ts(h.lastOutcomeAt);
    if(last&&this.clock()-last>SAFETY_MEMORY_MS){h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0}
    if(outcomeAt&&this.clock()-outcomeAt>ADVERSE_OUTCOME_WINDOW_MS&&["UNKNOWN","OBSERVED_FAILURE"].includes(h.lastOutcomeStatus))h.lastOutcomeStatus=null;
  }
  h(origin,type){const k=`${origin}::${type}`,h=this.s.origins[k]??(this.s.origins[k]=history());this._expirePatternMemory(h);return h}
  recentRegret(h){const latest=Math.max(ts(h.lastCancelledAt),ts(h.lastUndoneAt));return latest>0&&(this.clock()-latest)<REGRET_WINDOW_MS&&h.recoveryCommits<RECOVERY_SUCCESSES}
  budget(){const sites=new Map(),actions=[];for(const[key,raw]of Object.entries(this.s.origins)){const h=normalizedHistory(raw);this._expirePatternMemory(h);const{origin,actionType}=splitKey(key),prompts=h.hardShown+h.softShown,regrets=h.cancelled+h.undone,stableMedium=h.safeCommitStreak>=2&&!this.recentRegret(h),avoidableSoft=stableMedium?Math.max(0,h.softShown-MEDIUM_WARMUP_PROMPTS):0,fastRate=h.promptedDecisions?h.fastApprovals/h.promptedDecisions:0,decisionMs=h.decisionMsTotal||0;let recommendation="healthy",score=0;if(h.fastApprovalStreak>=REFOCUS_STREAK){recommendation="refocus_hard";score=90+Math.min(10,h.fastApprovalStreak)}else if(avoidableSoft>=2){recommendation="reduce_soft";score=55+Math.min(35,avoidableSoft*8)}else if(fastRate>=.4&&prompts>=3){recommendation="watch_habituation";score=50+Math.min(30,Math.round(fastRate*30))}else if(prompts>=5){recommendation="watch_prompt_load";score=35+Math.min(20,prompts)}actions.push({origin,actionType,prompts,hard:h.hardShown,soft:h.softShown,passive:h.passiveShown,avoidableSoft,regretSignals:regrets,verifiedSuccesses:h.outcomeSuccess,unknownOutcomes:h.outcomeUnknown,failedOutcomes:h.outcomeFailure,fastApprovalRate:fastRate,averageDecisionMs:h.promptedDecisions?Math.round(decisionMs/h.promptedDecisions):null,recommendation,score});const site=sites.get(origin)??{origin,actions:0,prompts:0,hard:0,soft:0,passive:0,avoidableSoft:0,decisionMsTotal:0,promptedDecisions:0,fastApprovals:0,regretSignals:0};site.actions++;site.prompts+=prompts;site.hard+=h.hardShown;site.soft+=h.softShown;site.passive+=h.passiveShown;site.avoidableSoft+=avoidableSoft;site.decisionMsTotal+=decisionMs;site.promptedDecisions+=h.promptedDecisions||0;site.fastApprovals+=h.fastApprovals||0;site.regretSignals+=regrets;sites.set(origin,site)}const siteBudgets=[...sites.values()].map(s=>({...s,attentionSeconds:Math.round(s.decisionMsTotal/1000),avoidablePromptRate:s.soft?s.avoidableSoft/s.soft:0,fastApprovalRate:s.promptedDecisions?s.fastApprovals/s.promptedDecisions:0})).sort((a,b)=>(b.avoidableSoft*10+b.fastApprovalRate*5+b.prompts)-(a.avoidableSoft*10+a.fastApprovalRate*5+a.prompts));const hotspots=actions.filter(x=>x.recommendation!=="healthy").sort((a,b)=>b.score-a.score).slice(0,8);return{estimatedAvoidablePrompts:actions.reduce((n,x)=>n+x.avoidableSoft,0),siteBudgets:siteBudgets.slice(0,12),hotspots}}
  report(){this._expireEpochIfIdle();const s=this.s.stats,an=Math.max(1,s.analyzed),prompted=Math.max(1,s.promptedDecisions),soft=Math.max(1,s.soft),outcomes=Math.max(1,s.outcomeSuccess+s.outcomeFailure+s.outcomeUnknown);const softLoad=s.soft/an,fast=s.fastApprovals/prompted,repeat=s.repeatedSoft/soft,uncertain=s.outcomeUnknown/outcomes;const score=Math.round(30*clamp(softLoad/.25)+40*clamp(fast/.40)+15*clamp(repeat/.35)+15*clamp(uncertain/.35));const refocusActions=Object.values(this.s.origins).filter(h=>{const x=normalizedHistory(h);this._expirePatternMemory(x);return x.fastApprovalStreak>=REFOCUS_STREAK}).length,budget=this.budget();return{score,level:score>=75?"CRITICAL":score>=50?"HIGH":score>=25?"WATCH":"LOW",promptRate:(s.hard+s.soft)/an,softPromptRate:softLoad,hardPromptRate:s.hard/an,fastApprovalRate:fast,repeatSoftRate:repeat,unknownOutcomeRate:s.outcomeUnknown/outcomes,averageDecisionMs:s.promptedDecisions?Math.round(s.decisionMsTotal/s.promptedDecisions):null,refocusActions,interruptionsAvoided:s.passive,estimatedAvoidablePrompts:budget.estimatedAvoidablePrompts}}
  snapshot(){return{...this.s,report:this.report(),budget:this.budget()}}
  decide(origin,m){this._touch();const h=this.h(origin,m.actionType),isSensitive=(m.dataCategories??[]).some(x=>sensitive.has(x)),regret=this.recentRegret(h),known=m.reversibility!=="UNKNOWN",conf=Number(m.confidence??0),stable=h.safeCommitStreak>=2&&conf>=.82&&known&&!regret;let level="PASSIVE",reasons=[];
    if(this.s.mode==="strict"){level="HARD";reasons.push("strict_mode")}
    else if(["HIGH","CRITICAL"].includes(m.risk)||isSensitive){level="HARD";reasons.push(isSensitive?"sensitive_data":"high_consequence")}
    else if(m.risk==="MEDIUM"&&!stable){level="SOFT";if(h.seen<2||h.safeCommitStreak===0)reasons.push("new_or_stale_pattern");if(regret)reasons.push("recent_regret");if(!known)reasons.push("unknown_reversibility");if(conf<.78)reasons.push("low_confidence");if(h.lastOutcomeStatus==="UNKNOWN")reasons.push("recent_unknown_outcome");if(h.lastOutcomeStatus==="OBSERVED_FAILURE")reasons.push("recent_failed_outcome");if(!reasons.length)reasons.push(this.s.mode==="quiet"?"quiet_mode_safety_floor":"not_yet_learned")}
    const repeatedSoft=level==="SOFT"&&h.softShown>=MEDIUM_WARMUP_PROMPTS&&!regret&&known&&conf>=.82;
    if(repeatedSoft)this.s.stats.repeatedSoft++;
    if(level==="HARD")h.hardShown++,this.s.stats.hard++;else if(level==="SOFT")h.softShown++,this.s.stats.soft++;else h.passiveShown++,this.s.stats.passive++;
    this.s.stats.analyzed++;h.lastFriction=level;
    const refocus=level==="HARD"&&h.fastApprovalStreak>=REFOCUS_STREAK;if(refocus)reasons.push("habituation_signal");
    void this.audit.append("ACTION_DETECTED",{requestId:m.requestId,origin,actionType:m.actionType,risk:m.risk,detail:`friction=${level}`}).catch(()=>{});void this.save();
    return{level,refocus,reasons,debt:this.report()}
  }
  async record(origin,type,status,{friction,decisionMs,automated=false,receiptId,requestId,risk}={}){this._touch();const h=this.h(origin,type),when=new Date(this.clock()).toISOString();h.seen++;h.lastAt=when;
    if(status==="COMMITTED"){h.committed++;this.s.stats.committed++;await this.audit.append("ACTION_COMMITTED",{origin,actionType:type,receiptId,requestId,risk,detail:friction?`friction=${friction}`:undefined})}
    if(status==="CANCELLED"){h.cancelled++;this.s.stats.cancelled++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastCancelledAt=when;await this.audit.append("ACTION_CANCELLED",{origin,actionType:type,receiptId,requestId,risk})}
    if(status==="UNDONE"){h.undone++;this.s.stats.undone++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastUndoneAt=when;await this.audit.append("UNDO_EXECUTED",{origin,actionType:type,receiptId,requestId,risk})}
    if(status==="UNDO_FAILED"){h.undoFailed++;this.s.stats.undoFailed++;h.safeCommitStreak=0;await this.audit.append("UNDO_FAILED",{origin,actionType:type,receiptId,requestId,risk})}
    if(!automated&&(friction==="HARD"||friction==="SOFT")&&Number.isFinite(decisionMs)){const ms=Math.max(0,Number(decisionMs));h.lastDecisionMs=ms;h.promptedDecisions++;h.decisionMsTotal+=ms;this.s.stats.promptedDecisions++;this.s.stats.decisionMsTotal+=ms;if(status==="COMMITTED"&&ms<=FAST_APPROVAL_MS){h.fastApprovalStreak++;h.fastApprovals++;this.s.stats.fastApprovals++}else if(status==="COMMITTED")h.fastApprovalStreak=0}
    await this.save();return this.snapshot()
  }
  async outcome(origin,type,outcome,{receiptId,requestId,risk}={}){this._touch();const h=this.h(origin,type),when=new Date(this.clock()).toISOString(),status=outcome?.status;h.lastOutcomeAt=when;h.lastOutcomeStatus=status;
    if(status==="OBSERVED_SUCCESS"){h.outcomeSuccess++;this.s.stats.outcomeSuccess++;h.safeCommitStreak++;if(this.recentRegret(h))h.recoveryCommits++}
    else if(status==="OBSERVED_FAILURE"){h.outcomeFailure++;this.s.stats.outcomeFailure++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0}
    else{h.outcomeUnknown++;this.s.stats.outcomeUnknown++;h.safeCommitStreak=0;h.recoveryCommits=0}
    await this.audit.append("OUTCOME_OBSERVED",{origin,actionType:type,receiptId,requestId,risk,outcomeStatus:["OBSERVED_SUCCESS","OBSERVED_FAILURE"].includes(status)?status:"UNKNOWN"});await this.save();return this.snapshot()
  }
  async replay(origin,type,{receiptId,requestId,risk}={}){await this.audit.append("ACTION_REPLAYED",{origin,actionType:type,receiptId,requestId,risk})}
  async undoAvailable(origin,type,{receiptId,requestId,risk}={}){await this.audit.append("UNDO_AVAILABLE",{origin,actionType:type,receiptId,requestId,risk})}
  async mode(m){if(!["balanced","strict","quiet"].includes(m))throw new Error("invalid mode");this._touch();this.s.mode=m;await this.save();return this.snapshot()}
}

export const CognitiveDebtConstants={REGRET_WINDOW_MS,ADVERSE_OUTCOME_WINDOW_MS,SAFETY_MEMORY_MS,DEBT_EPOCH_IDLE_MS,RECOVERY_SUCCESSES,FAST_APPROVAL_MS,REFOCUS_STREAK,MEDIUM_WARMUP_PROMPTS};
