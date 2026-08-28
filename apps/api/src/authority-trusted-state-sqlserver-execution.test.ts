import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavSqlServerAuthorityStateBackend,type AuthorityClusterDatabase,type AuthorityClusterTransaction} from "./authority-cluster-sqlserver.js";
import {SQL_TRUSTED_STATE_KEYS,CieavSqlServerTrustedStatePersistence,createSqlServerTrustedKernelCandidate} from "./authority-trusted-state-sqlserver.js";
import {makeRealityWitness,sha256} from "./intent-reality-engine.js";

type Lease={namespace:string;ownerId:string;fenceToken:string;leaseUntilMs:number};
type State={namespace:string;key:string;revision:string;value:string;valueDigest:string;fenceToken:string;updatedAtMs:number};
type Receipt={namespace:string;transactionId:string;requestDigest:string;resultJson:string;committedAtMs:number};
class MemorySqlAuthorityDatabase implements AuthorityClusterDatabase{
  now=1_800_000_000_000;leases=new Map<string,Lease>();states=new Map<string,State>();receipts=new Map<string,Receipt>();
  async initialize(){}
  private transaction(leases:Map<string,Lease>,states:Map<string,State>,receipts:Map<string,Receipt>):AuthorityClusterTransaction{return{nowMs:async()=>this.now,getLeaseForUpdate:async namespace=>structuredClone(leases.get(namespace)??null),putLease:async row=>{leases.set(row.namespace,structuredClone(row))},getStateForUpdate:async(namespace,key)=>structuredClone(states.get(`${namespace}\n${key}`)??null),getState:async(namespace,key)=>structuredClone(states.get(`${namespace}\n${key}`)??null),putState:async row=>{states.set(`${row.namespace}\n${row.key}`,structuredClone(row))},getReceipt:async(namespace,transactionId)=>structuredClone(receipts.get(`${namespace}\n${transactionId}`)??null),putReceipt:async row=>{receipts.set(`${row.namespace}\n${row.transactionId}`,structuredClone(row))}}}
  async serializable<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{const leases=new Map([...this.leases].map(([k,v])=>[k,structuredClone(v)])),states=new Map([...this.states].map(([k,v])=>[k,structuredClone(v)])),receipts=new Map([...this.receipts].map(([k,v])=>[k,structuredClone(v)]));const result=await fn(this.transaction(leases,states,receipts));this.leases=leases;this.states=states;this.receipts=receipts;return result}
  async read<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{return fn(this.transaction(this.leases,this.states,this.receipts))}
}

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
const secret="s".repeat(64),intentId="33333333-3333-4333-8333-333333333333",deviceId="dev_sql_exec_12345678",sessionId="55555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};
const commitment={id:"22222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",summary:"Send governed update",desiredState:"Update sent",createdAt:"2026-08-19T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"send",kind:"COMMUNICATE" as const,summary:"Send update",affectedEntities:[],dataCategories:["MESSAGE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"delivery",kind:"EMAIL" as const,description:"Trusted delivery observation",required:true,minimumConfidence:.8,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Escalate unresolved delivery"]},metadata:{}};
const effect={kind:"COMMUNICATE" as const,target:"customer@example.com",objectRef:"customer-update-42",attributes:{channel:"email"}};
const normalizedArguments={to:"customer@example.com",subject:"Invoice reminder",template:"approved-v4"};
const preState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"NOT_SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const postState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");

async function tempDir(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-sql-execution-atomic-"));dirs.push(dir);return dir}

async function setupSqlExecution(){
  const database=new MemorySqlAuthorityDatabase(),backend=new CieavSqlServerAuthorityStateBackend(database,"cluster-execution-atomic",10_000),stateDir=await tempDir(),kernel=new CieavAgentKernelStore(path.join(stateDir,"kernel.json"),secret),persistence=new CieavSqlServerTrustedStatePersistence(backend,"authority-node-a");
  await createSqlServerTrustedKernelCandidate({kernel,persistence});
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send governed update"}),taskId=created.task.id;
  await kernel.transition(taskId,"QUEUED");await kernel.transition(taskId,"PLANNING");await kernel.requireCommitment(taskId);await kernel.bindCommitmentTrusted(taskId,commitment);
  const fabric=kernel.executionFabric,now=Date.now();
  const attestation=await fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"sql-atomic-test",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600_000).toISOString()});
  await fabric.putTool({id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true});
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"tool:gmail.send",allowedIntentIds:[intentId],allowedToolIds:["gmail.send"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),maxUses:2};
  const lease=await fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Governed customer communication is within root Intent."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const proposal={id:crypto.randomUUID(),version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,toolId:"gmail.send",protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:digest(normalizedArguments),semanticEffect:effect,realityWitness:preState,expectedPostStateDigest:postState.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  const realityCommit=await kernel.intentReality.issueRealityBoundCommit({taskId,intentId,commitment,proposal,effect,preState,expectedPostState:postState,ttlSeconds:60});
  await kernel.bindRealityCommitTrusted(taskId,realityCommit.id,realityCommit.effectKey);
  await fabric.authorize(proposal);
  await kernel.intentReality.consumeRealityBoundCommit(realityCommit.id,preState);await kernel.consumeRealityCommitTrusted(taskId,realityCommit.id);
  return{database,backend,kernel,persistence,fabric,proposal,realityCommit,taskId};
}

function newJournalReceipt(database:MemorySqlAuthorityDatabase,before:Set<string>){
  const created=[...database.receipts.entries()].filter(([key])=>!before.has(key)&&key.includes("\njournal-"));
  expect(created).toHaveLength(1);
  return created[0]![1];
}
function receiptKeys(receipt:Receipt){return (JSON.parse(receipt.resultJson) as Array<{key:string}>).map(record=>record.key).sort()}

const threeStoreKeys=[SQL_TRUSTED_STATE_KEYS.authorityTransactions,SQL_TRUSTED_STATE_KEYS.consequenceAlgebra,SQL_TRUSTED_STATE_KEYS.executionFabric].sort();
const fiveStoreKeys=Object.values(SQL_TRUSTED_STATE_KEYS).slice().sort();

describe("CIEAV SQL trusted-state execution-path atomicity",()=>{
  it("commits ISSUE_TICKET through one SQL receipt covering journal, algebra, and execution fabric",async()=>{
    const x=await setupSqlExecution(),before=new Set(x.database.receipts.keys());
    const ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);expect(ticket.status).toBe("ISSUED");
    const receipt=newJournalReceipt(x.database,before);expect(receipt.transactionId).toMatch(/^journal-/);expect(receiptKeys(receipt)).toEqual(threeStoreKeys);
    await x.kernel.close();await x.persistence.close();
  });

  it("commits CONSUME_TICKET through one SQL receipt covering journal, algebra, and execution fabric",async()=>{
    const x=await setupSqlExecution(),ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id),before=new Set(x.database.receipts.keys());
    const consumed=await x.fabric.consumeTicket(ticket.id,normalizedArguments);expect(consumed.ticket.status).toBe("CONSUMED");
    const receipt=newJournalReceipt(x.database,before);expect(receipt.transactionId).toMatch(/^journal-/);expect(receiptKeys(receipt)).toEqual(threeStoreKeys);
    await x.kernel.close();await x.persistence.close();
  });

  it("commits UNKNOWN execution quarantine through one SQL receipt covering all five trusted stores",async()=>{
    const x=await setupSqlExecution(),ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);await x.fabric.consumeTicket(ticket.id,normalizedArguments);const before=new Set(x.database.receipts.keys());
    const result=await x.fabric.recordExecutionAttempt(ticket.id,"UNKNOWN","Transport outcome could not be observed",{transport:"timeout"});expect(result.audit.outcome).toBe("UNKNOWN");expect(result.quarantine?.status).toBe("OPEN");
    const receipt=newJournalReceipt(x.database,before);expect(receipt.transactionId).toMatch(/^journal-/);expect(receiptKeys(receipt)).toEqual(fiveStoreKeys);
    expect((await x.kernel.get(x.taskId))?.effectQuarantined).toBe(true);
    await x.kernel.close();await x.persistence.close();
  });
});
