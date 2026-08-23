import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavUniversalIntelligenceStore} from "./universal-intelligence-store.js";
import type {CieavLocalProofProviderRuntime} from "./proof-provider-runtime.js";

const counts=<T>(items:T[],key:(item:T)=>string)=>items.reduce<Record<string,number>>((acc,item)=>{const value=key(item);acc[value]=(acc[value]??0)+1;return acc},{});
export type CieavOperationalSnapshot=ReturnType<CieavOperationalObservability["snapshot"]> extends Promise<infer T>?T:never;

/** Aggregate-only telemetry: no identities, resources, prompts, arguments or evidence bodies. */
export class CieavOperationalObservability{
  constructor(private readonly kernel:CieavAgentKernelStore,private readonly intelligence:CieavUniversalIntelligenceStore,private readonly proofProviders:CieavLocalProofProviderRuntime){}
  async snapshot(now=new Date().toISOString()){
    const [tasks,openLoops,tickets,audit,continuing,policies,devices,envelopes,journal,cells,intelligenceHealth,models,modelHealth,learningJobs,learningHealth,providerHealth]=await Promise.all([
      this.kernel.list(),this.kernel.openLoops(new Date(now)),this.kernel.executionFabric.listTickets(),this.kernel.executionFabric.listAudit(),this.kernel.continuingAuthority.list(),this.kernel.reflexLayer.listPolicies(),this.kernel.edgeDevices.list(),this.kernel.edgeRuntime.listEnvelopes(),this.kernel.edgeRuntime.listJournal(),this.intelligence.listCells(),this.intelligence.health(),this.intelligence.modelQualifications.list(),this.intelligence.modelQualifications.health(),this.intelligence.learningJobs.list(),this.intelligence.learningJobs.health(),this.proofProviders.health()
    ]);
    const settlements=counts(tasks,t=>String(t.settlement??"UNSETTLED")),taskStates=counts(tasks,t=>t.state),loopReasons=counts(openLoops.flatMap(loop=>loop.reasons),reason=>reason),ticketStates=counts(tickets,t=>String(t.status)),continuingStates=counts(continuing,s=>String(s.state)),cellHealth=counts(cells,c=>String(c.health)),modelStates=counts(models,m=>String(m.state)),learningStates=counts(learningJobs,j=>String(j.state)),providerStates=counts(providerHealth,p=>p.ok?"HEALTHY":"UNHEALTHY"),deviceStates=counts(devices,d=>String((d as any).state??((d as any).revokedAt?"REVOKED":"ACTIVE")));
    const unknown=settlements.UNKNOWN??0,recoveryRequired=taskStates.RECOVERY_REQUIRED??0,effectQuarantined=tasks.filter(t=>t.effectQuarantined).length,unhealthyProviders=providerStates.UNHEALTHY??0,unhealthyCells=(cellHealth.UNHEALTHY??0)+(cellHealth.REVOKED??0),revokedDevices=devices.filter(d=>String((d as any).state??"")==="REVOKED"||Boolean((d as any).revokedAt)).length,watchdogUnhealthy=devices.filter(d=>(d as any).watchdogHealthy===false).length,continuationStops=(continuingStates.STOP_REQUIRED??0)+(continuingStates.REVOKED??0)+(continuingStates.EXPIRED??0);
    const signals={unknownSettlements:unknown,recoveryRequired,effectQuarantined,openLoops:openLoops.length,unhealthyProviders,unhealthyCells,revokedDevices,watchdogUnhealthy,continuationStops};
    return{
      version:"CIEAV_OPERATIONAL_OBSERVABILITY_V1" as const,generatedAt:now,
      gateway:{runtime:"local-authority",operational:unhealthyProviders===0,authority:false as const},
      tasks:{total:tasks.length,byState:taskStates,settlements,effectQuarantined,openLoops:openLoops.length,openLoopReasons:loopReasons},
      execution:{tickets:tickets.length,ticketStates,auditEntries:audit.length,registeredProtocols:this.kernel.executionRouter.registeredProtocols(),continuingSessions:continuing.length,continuingStates},
      safety:{reflexPolicies:policies.length,edgeDevices:devices.length,deviceStates,watchdogUnhealthy,edgeEnvelopes:envelopes.length,edgeJournalEntries:journal.length},
      intelligence:{cells:cells.length,cellHealth,models:models.length,modelStates,modelRegistry:modelHealth,learningJobs:learningJobs.length,learningStates,learningQueue:learningHealth,runtime:{cells:intelligenceHealth.cells,claims:intelligenceHealth.claims,workspaces:intelligenceHealth.workspaces,graphEdges:intelligenceHealth.graphEdges}},
      proof:{providers:providerHealth.length,providerStates,providersHealthy:unhealthyProviders===0},
      signals,attentionRequired:Object.values(signals).some(value=>value>0),authority:false as const,productionAuthority:false as const,mayMintExecutionAuthority:false as const
    };
  }
}
