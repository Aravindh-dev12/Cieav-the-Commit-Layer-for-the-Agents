import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";

const REGRET_WINDOW_MS=7*24*60*60*1000;
const RECOVERY_COMMITS=3;
const FAST_APPROVAL_MS=650;
const REFOCUS_STREAK=3;
const sensitive=new Set(["CREDENTIAL","FINANCIAL","IDENTITY","HEALTH","BIOMETRIC"]);
const now=()=>Date.now();
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));

function history(){return{seen:0,committed:0,cancelled:0,undone:0,undoFailed:0,hardShown:0,softShown:0,passiveShown:0,safeCommitStreak:0,recoveryCommits:0,fastApprovalStreak:0,lastFriction:null,lastDecisionMs:null,lastAt:null,lastCancelledAt:null,lastUndoneAt:null}}
function stats(){return{analyzed:0,hard:0,soft:0,passive:0,promptedDecisions:0,committed:0,cancelled:0,undone:0,undoFailed:0,fastApprovals:0,repeatedSoft:0,decisionMsTotal:0}}

export class Attention{
  constructor(stateDir,{clock=now}={}){this.f=path.join(stateDir,"attention.json");this.clock=clock;this.s={version:2,mode:"balanced",origins:{},stats:stats()}}
  async load(){try{const x=JSON.parse(await readFile(this.f,"utf8"));this.s={...this.s,...x,version:2,origins:x.origins??{},stats:{...stats(),...(x.stats??{})}}}catch{}return this}
  async save(){await writeFile(this.f,JSON.stringify(this.s,null,2),{mode:0o600})}
  h(origin,type){const k=`${origin}::${type}`;return this.s.origins[k]??(this.s.origins[k]=history())}
  recentRegret(h){const latest=Math.max(Date.parse(h.lastCancelledAt||0)||0,Date.parse(h.lastUndoneAt||0)||0);return latest>0&&(this.clock()-latest)<REGRET_WINDOW_MS&&h.recoveryCommits<RECOVERY_COMMITS}
  report(){const s=this.s.stats,an=Math.max(1,s.analyzed),prompted=Math.max(1,s.promptedDecisions),soft=Math.max(1,s.soft);const softLoad=s.soft/an,fast=s.fastApprovals/prompted,repeat=s.repeatedSoft/soft;const softBurden=clamp(softLoad/.25),habituation=clamp(fast/.40),repeatBurden=clamp(repeat/.35);const score=Math.round(35*softBurden+45*habituation+20*repeatBurden);const refocusActions=Object.values(this.s.origins).filter(h=>h.fastApprovalStreak>=REFOCUS_STREAK).length;return{score,level:score>=75?"CRITICAL":score>=50?"HIGH":score>=25?"WATCH":"LOW",promptRate:(s.hard+s.soft)/an,softPromptRate:softLoad,hardPromptRate:s.hard/an,fastApprovalRate:fast,repeatSoftRate:repeat,averageDecisionMs:s.promptedDecisions?Math.round(s.decisionMsTotal/s.promptedDecisions):null,refocusActions,interruptionsAvoided:s.passive}}
  snapshot(){return{...this.s,report:this.report()}}
  decide(origin,m){const h=this.h(origin,m.actionType),isSensitive=(m.dataCategories??[]).some(x=>sensitive.has(x)),regret=this.recentRegret(h),known=m.reversibility!=="UNKNOWN",conf=Number(m.confidence??0),stable=h.safeCommitStreak>=2&&conf>=.82&&known&&!regret;let level="PASSIVE",reasons=[];
    if(this.s.mode==="strict"){level="HARD";reasons.push("strict_mode")}
    else if(["HIGH","CRITICAL"].includes(m.risk)||isSensitive){level="HARD";reasons.push(isSensitive?"sensitive_data":"high_consequence")}
    else if(this.s.mode==="quiet"){
      if(m.risk==="MEDIUM"&&(regret||!known||conf<.70)){level="SOFT";reasons.push(regret?"recent_regret":!known?"unknown_reversibility":"low_confidence")}
    }else if(m.risk==="MEDIUM"&&!stable){level="SOFT";if(h.seen<2)reasons.push("new_pattern");if(regret)reasons.push("recent_regret");if(!known)reasons.push("unknown_reversibility");if(conf<.78)reasons.push("low_confidence");if(!reasons.length)reasons.push("not_yet_learned")}
    const repeatedSoft=level==="SOFT"&&h.softShown>=2&&!regret&&known&&conf>=.82;
    if(repeatedSoft)this.s.stats.repeatedSoft++;
    if(level==="HARD")h.hardShown++,this.s.stats.hard++;
    else if(level==="SOFT")h.softShown++,this.s.stats.soft++;
    else h.passiveShown++,this.s.stats.passive++;
    this.s.stats.analyzed++;h.lastFriction=level;
    const refocus=level==="HARD"&&h.fastApprovalStreak>=REFOCUS_STREAK;
    if(refocus)reasons.push("habituation_signal");
    void this.save();
    return{level,refocus,reasons,debt:this.report()}
  }
  async record(origin,type,status,{friction,decisionMs,automated=false}={}){const h=this.h(origin,type),ts=new Date(this.clock()).toISOString();h.seen++;h.lastAt=ts;
    if(status==="COMMITTED"){h.committed++;this.s.stats.committed++;h.safeCommitStreak++;if(this.recentRegret(h))h.recoveryCommits++;}
    if(status==="CANCELLED"){h.cancelled++;this.s.stats.cancelled++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastCancelledAt=ts;}
    if(status==="UNDONE"){h.undone++;this.s.stats.undone++;h.safeCommitStreak=0;h.recoveryCommits=0;h.fastApprovalStreak=0;h.lastUndoneAt=ts;}
    if(status==="UNDO_FAILED"){h.undoFailed++;this.s.stats.undoFailed++;}
    if(!automated&&(friction==="HARD"||friction==="SOFT")&&Number.isFinite(decisionMs)){
      const ms=Math.max(0,Number(decisionMs));h.lastDecisionMs=ms;this.s.stats.promptedDecisions++;this.s.stats.decisionMsTotal+=ms;
      if(status==="COMMITTED"&&ms<=FAST_APPROVAL_MS){h.fastApprovalStreak++;this.s.stats.fastApprovals++}else if(status==="COMMITTED")h.fastApprovalStreak=0;
    }
    await this.save();return this.snapshot()
  }
  async mode(m){if(!["balanced","strict","quiet"].includes(m))throw new Error("invalid mode");this.s.mode=m;await this.save();return this.snapshot()}
}

export const CognitiveDebtConstants={REGRET_WINDOW_MS,RECOVERY_COMMITS,FAST_APPROVAL_MS,REFOCUS_STREAK};
