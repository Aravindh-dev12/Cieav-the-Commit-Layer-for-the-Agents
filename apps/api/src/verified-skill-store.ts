import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import {
  VerifiedSkillArtifactV2Schema,
  VerifiedSkillProvenanceSchema,
  VerifiedSkillRegistryHeadSchema,
  VerifiedSkillRegistryPersistedStateSchema,
  VerifiedSkillRegistryRecordSchema,
  type CognitiveCellDescriptor,
  type VerifiedSkillArtifactV2,
  type VerifiedSkillProvenance,
  type VerifiedSkillRegistryHead,
  type VerifiedSkillRegistryPersistedState,
  type VerifiedSkillRegistryRecord
} from "@cieav/contracts";
import {CognitiveCellRegistry} from "@cieav/core/cognitive-runtime";
import {activateVerifiedSkillV2,revokeVerifiedSkillV2,verifiedSkillDigest} from "@cieav/core/verified-skill";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const hmac=(key:Buffer,value:unknown)=>crypto.createHmac("sha256",key).update(canonical(value)).digest("base64url");
const safeEqual=(a:string,b:string)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function durableReplace(file:string,contents:string){const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await mkdir(dir,{recursive:true,mode:0o700});await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);try{await chmod(file,0o600)}catch{}if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}}

type StateEnvelope={payload:VerifiedSkillRegistryPersistedState;mac:string};
type HeadEnvelope={payload:VerifiedSkillRegistryHead;mac:string};
type ProvenanceInput=Omit<VerifiedSkillProvenance,"subjectDigest"|"candidateDigest"|"sourceQualificationDigest"|"validationDigest"|"authority"|"productionAuthority"|"mayMintExecutionAuthority">;

const capabilitiesDigest=(cell:CognitiveCellDescriptor)=>verifiedSkillDigest([...cell.capabilities].sort());
const dependencyIds=(skill:VerifiedSkillArtifactV2)=>[...new Set(skill.candidate.program.steps.map(step=>step.engineId).filter((id):id is string=>Boolean(id)))].sort();

export class CieavVerifiedSkillStore{
  private readonly headFile:string,stateKey:Buffer,headKey:Buffer;
  private loaded=false;private chain:Promise<void>=Promise.resolve();private state:VerifiedSkillRegistryPersistedState={version:"CIEAV_VERIFIED_SKILL_REGISTRY_STATE_V1",generation:0,records:[],updatedAt:new Date(0).toISOString(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false};
  constructor(private readonly file:string,secret:string){
    if(secret.length<32)throw new Error("CIEAV verified-skill registry secret is too weak");
    this.headFile=`${file}.head`;
    this.stateKey=crypto.createHmac("sha256",secret).update("cieav-verified-skill-registry-state-v1").digest();
    this.headKey=crypto.createHmac("sha256",secret).update("cieav-verified-skill-registry-head-v1").digest();
  }
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private snapshotDigest(state:VerifiedSkillRegistryPersistedState){return verifiedSkillDigest(state)}
  private parseState(raw:string):VerifiedSkillRegistryPersistedState{const env=JSON.parse(raw) as StateEnvelope;if(!env||typeof env.mac!=="string")throw new Error("verified_skill_registry_invalid_state_envelope");const payload=VerifiedSkillRegistryPersistedStateSchema.parse(env.payload),expected=hmac(this.stateKey,payload);if(!safeEqual(expected,env.mac))throw new Error("verified_skill_registry_state_integrity_check_failed");return payload}
  private parseHead(raw:string):VerifiedSkillRegistryHead{const env=JSON.parse(raw) as HeadEnvelope;if(!env||typeof env.mac!=="string")throw new Error("verified_skill_registry_invalid_head_envelope");const payload=VerifiedSkillRegistryHeadSchema.parse(env.payload),expected=hmac(this.headKey,payload);if(!safeEqual(expected,env.mac))throw new Error("verified_skill_registry_head_integrity_check_failed");return payload}
  private serializeState(payload:VerifiedSkillRegistryPersistedState){const parsed=VerifiedSkillRegistryPersistedStateSchema.parse(payload);return JSON.stringify({payload:parsed,mac:hmac(this.stateKey,parsed)},null,2)+"\n"}
  private serializeHead(payload:VerifiedSkillRegistryHead){const parsed=VerifiedSkillRegistryHeadSchema.parse(payload);return JSON.stringify({payload:parsed,mac:hmac(this.headKey,parsed)},null,2)+"\n"}
  private validateRecords(state:VerifiedSkillRegistryPersistedState){
    const ids=new Set<string>();for(const record of state.records){VerifiedSkillRegistryRecordSchema.parse(record);if(ids.has(record.skillId))throw new Error(`verified_skill_registry_duplicate_skill_id:${record.skillId}`);ids.add(record.skillId);this.verifyRecordDigests(record)}
  }
  private verifyRecordDigests(record:VerifiedSkillRegistryRecord){
    const artifact=VerifiedSkillArtifactV2Schema.parse(record.artifact),artifactDigest=verifiedSkillDigest(artifact),candidateDigest=verifiedSkillDigest(artifact.candidate),sourceQualificationDigest=verifiedSkillDigest(artifact.qualification.sourceQualification);
    if(record.artifactDigest!==artifactDigest)throw new Error(`verified_skill_registry_artifact_digest_mismatch:${record.skillId}`);
    if(record.provenance.subjectDigest!==artifactDigest)throw new Error(`verified_skill_registry_provenance_subject_mismatch:${record.skillId}`);
    if(record.provenance.candidateDigest!==candidateDigest)throw new Error(`verified_skill_registry_provenance_candidate_mismatch:${record.skillId}`);
    if(record.provenance.sourceQualificationDigest!==sourceQualificationDigest)throw new Error(`verified_skill_registry_provenance_source_qualification_mismatch:${record.skillId}`);
    if(record.provenance.validationDigest!==artifact.qualification.validationDigest)throw new Error(`verified_skill_registry_provenance_validation_mismatch:${record.skillId}`);
  }
  private async load(){
    if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    let state:VerifiedSkillRegistryPersistedState|null=null,head:VerifiedSkillRegistryHead|null=null;
    try{state=this.parseState(await readFile(this.file,"utf8"))}catch(error:any){if(error?.code!=="ENOENT")throw new Error(`CIEAV verified-skill registry state unreadable/corrupt/unauthenticated: ${String(error?.message??error)}`)}
    try{head=this.parseHead(await readFile(this.headFile,"utf8"))}catch(error:any){if(error?.code!=="ENOENT")throw new Error(`CIEAV verified-skill registry head unreadable/corrupt/unauthenticated: ${String(error?.message??error)}`)}
    if(!state&&!head){this.loaded=true;return}
    if(!state||!head)throw new Error("verified_skill_registry_state_head_pair_incomplete");
    this.validateRecords(state);const digest=this.snapshotDigest(state);
    if(state.generation<head.generation)throw new Error("verified_skill_registry_rollback_detected");
    if(state.generation===head.generation){if(digest!==head.snapshotDigest)throw new Error("verified_skill_registry_head_snapshot_mismatch")}
    else if(state.generation===head.generation+1&&state.previousSnapshotDigest===head.snapshotDigest){
      // Crash recovery: state fsync/rename completed but the independently authenticated head did not.
      const repaired:VerifiedSkillRegistryHead={version:"CIEAV_VERIFIED_SKILL_REGISTRY_HEAD_V1",generation:state.generation,snapshotDigest:digest,updatedAt:state.updatedAt};await durableReplace(this.headFile,this.serializeHead(repaired));
    }else throw new Error("verified_skill_registry_generation_gap_or_fork");
    this.state=state;this.loaded=true;
  }
  private async persist(records:VerifiedSkillRegistryRecord[],updatedAt:string){
    const previousDigest=this.state.generation>0?this.snapshotDigest(this.state):undefined,next=VerifiedSkillRegistryPersistedStateSchema.parse({version:"CIEAV_VERIFIED_SKILL_REGISTRY_STATE_V1",generation:this.state.generation+1,...(previousDigest?{previousSnapshotDigest:previousDigest}:{}),records:records.slice().sort((a,b)=>a.skillId.localeCompare(b.skillId)),updatedAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
    this.validateRecords(next);const digest=this.snapshotDigest(next),head=VerifiedSkillRegistryHeadSchema.parse({version:"CIEAV_VERIFIED_SKILL_REGISTRY_HEAD_V1",generation:next.generation,snapshotDigest:digest,updatedAt});
    await durableReplace(this.file,this.serializeState(next));await durableReplace(this.headFile,this.serializeHead(head));this.state=next;return next;
  }
  private buildProvenance(skill:VerifiedSkillArtifactV2,input:ProvenanceInput):VerifiedSkillProvenance{
    const artifactDigest=verifiedSkillDigest(skill);return VerifiedSkillProvenanceSchema.parse({...input,subjectDigest:artifactDigest,candidateDigest:verifiedSkillDigest(skill.candidate),sourceQualificationDigest:verifiedSkillDigest(skill.qualification.sourceQualification),validationDigest:skill.qualification.validationDigest,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
  }
  private lockDependencies(skill:VerifiedSkillArtifactV2,registry:CognitiveCellRegistry,at:string){return dependencyIds(skill).map(cellId=>{const cell=registry.get(cellId);if(!cell)throw new Error(`verified_skill_dependency_not_found:${cellId}`);if(cell.health!=="HEALTHY"&&cell.health!=="DEGRADED")throw new Error(`verified_skill_dependency_unavailable:${cellId}`);return{cellId,...(cell.identityRef?{identityRef:cell.identityRef}:{}),provider:cell.provider,local:cell.local,privacyBoundary:cell.privacyBoundary,capabilitiesDigest:capabilitiesDigest(cell),lockedAt:at}})}
  private validateDependencyLock(record:VerifiedSkillRegistryRecord,registry:CognitiveCellRegistry){for(const lock of record.dependencyLock){const cell=registry.get(lock.cellId);if(!cell)throw new Error(`verified_skill_dependency_not_found:${lock.cellId}`);if(cell.health!=="HEALTHY"&&cell.health!=="DEGRADED")throw new Error(`verified_skill_dependency_unavailable:${lock.cellId}`);if((cell.identityRef??null)!==(lock.identityRef??null)||cell.provider!==lock.provider||cell.local!==lock.local||cell.privacyBoundary!==lock.privacyBoundary||capabilitiesDigest(cell)!==lock.capabilitiesDigest)throw new Error(`verified_skill_dependency_lock_drift:${lock.cellId}`)}}
  registerQualified(raw:VerifiedSkillArtifactV2,provenanceInput:ProvenanceInput,at=new Date().toISOString()){return this.enqueue(async()=>{await this.load();const skill=VerifiedSkillArtifactV2Schema.parse(raw);if(skill.state!=="QUALIFIED")throw new Error("verified_skill_registry_requires_qualified_v2_artifact");const artifactDigest=verifiedSkillDigest(skill),existing=this.state.records.find(record=>record.skillId===skill.id);if(existing){if(existing.artifactDigest!==artifactDigest)throw new Error("verified_skill_registry_skill_id_content_mismatch");return structuredClone(existing)}const provenance=this.buildProvenance(skill,provenanceInput),record=VerifiedSkillRegistryRecordSchema.parse({version:"CIEAV_VERIFIED_SKILL_REGISTRY_RECORD_V1",skillId:skill.id,artifact:skill,artifactDigest,provenance,dependencyLock:[],registryState:"QUALIFIED",generation:this.state.generation+1,createdAt:at,updatedAt:at,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});await this.persist([...this.state.records,record],at);return structuredClone(record)})}
  activate(skillId:string,registry:CognitiveCellRegistry,input:{approvalRef:string;activatedBy:string;at?:string}){return this.enqueue(async()=>{await this.load();const current=this.state.records.find(record=>record.skillId===skillId);if(!current)throw new Error("verified_skill_registry_skill_not_found");if(current.registryState!=="QUALIFIED")throw new Error("verified_skill_registry_skill_not_qualified");const at=input.at??new Date().toISOString(),artifact=activateVerifiedSkillV2(current.artifact,{approvalRef:input.approvalRef,activatedBy:input.activatedBy,activatedAt:at}),artifactDigest=verifiedSkillDigest(artifact),provenance=this.buildProvenance(artifact,{version:current.provenance.version,predicateType:current.provenance.predicateType,builderId:current.provenance.builderId,buildType:current.provenance.buildType,sourceRefs:current.provenance.sourceRefs,compilerVersion:current.provenance.compilerVersion,createdAt:current.provenance.createdAt,...(current.provenance.externalAttestationRef?{externalAttestationRef:current.provenance.externalAttestationRef}:{}),...(current.provenance.externalAttestationDigest?{externalAttestationDigest:current.provenance.externalAttestationDigest}:{})}),dependencyLock=this.lockDependencies(artifact,registry,at),next=VerifiedSkillRegistryRecordSchema.parse({...current,artifact,artifactDigest,provenance,dependencyLock,registryState:"ACTIVE",generation:this.state.generation+1,updatedAt:at});await this.persist(this.state.records.map(record=>record.skillId===skillId?next:record),at);return structuredClone(next)})}
  quarantine(skillId:string,reason:string,at=new Date().toISOString()){return this.enqueue(async()=>{await this.load();if(!reason.trim())throw new Error("verified_skill_quarantine_reason_required");const current=this.state.records.find(record=>record.skillId===skillId);if(!current)throw new Error("verified_skill_registry_skill_not_found");if(current.registryState==="REVOKED")throw new Error("verified_skill_registry_skill_revoked");const next=VerifiedSkillRegistryRecordSchema.parse({...current,registryState:"QUARANTINED",quarantineReason:reason.trim(),generation:this.state.generation+1,updatedAt:at});await this.persist(this.state.records.map(record=>record.skillId===skillId?next:record),at);return structuredClone(next)})}
  revoke(skillId:string,reason:string,at=new Date().toISOString()){return this.enqueue(async()=>{await this.load();if(!reason.trim())throw new Error("verified_skill_revocation_reason_required");const current=this.state.records.find(record=>record.skillId===skillId);if(!current)throw new Error("verified_skill_registry_skill_not_found");if(current.registryState==="REVOKED")return structuredClone(current);const artifact=revokeVerifiedSkillV2(current.artifact,{reason:reason.trim(),revokedAt:at}),artifactDigest=verifiedSkillDigest(artifact),provenance=this.buildProvenance(artifact,{version:current.provenance.version,predicateType:current.provenance.predicateType,builderId:current.provenance.builderId,buildType:current.provenance.buildType,sourceRefs:current.provenance.sourceRefs,compilerVersion:current.provenance.compilerVersion,createdAt:current.provenance.createdAt,...(current.provenance.externalAttestationRef?{externalAttestationRef:current.provenance.externalAttestationRef}:{}),...(current.provenance.externalAttestationDigest?{externalAttestationDigest:current.provenance.externalAttestationDigest}:{})}),next=VerifiedSkillRegistryRecordSchema.parse({...current,artifact,artifactDigest,provenance,registryState:"REVOKED",revokedAt:at,revocationReason:reason.trim(),generation:this.state.generation+1,updatedAt:at});await this.persist(this.state.records.map(record=>record.skillId===skillId?next:record),at);return structuredClone(next)})}
  reconcileDependencies(registry:CognitiveCellRegistry,at=new Date().toISOString()){return this.enqueue(async()=>{await this.load();const drifted:string[]=[];let records=this.state.records;for(const record of this.state.records.filter(record=>record.registryState==="ACTIVE")){try{this.validateDependencyLock(record,registry)}catch(error:any){drifted.push(record.skillId);records=records.map(item=>item.skillId===record.skillId?VerifiedSkillRegistryRecordSchema.parse({...item,registryState:"QUARANTINED",quarantineReason:`dependency_drift:${String(error?.message??error).slice(0,900)}`,generation:this.state.generation+1,updatedAt:at}):item)}}if(drifted.length)await this.persist(records,at);return{drifted,authority:false as const,mayMintExecutionAuthority:false as const}})}
  get(skillId:string){return this.enqueue(async()=>{await this.load();const record=this.state.records.find(item=>item.skillId===skillId);return record?structuredClone(record):null})}
  list(){return this.enqueue(async()=>{await this.load();return this.state.records.map(record=>structuredClone(record))})}
  active(registry?:CognitiveCellRegistry){return this.enqueue(async()=>{await this.load();const records=this.state.records.filter(record=>record.registryState==="ACTIVE");if(registry)for(const record of records)this.validateDependencyLock(record,registry);return records.map(record=>structuredClone(record))})}
  exportState(){return this.enqueue(async()=>{await this.load();return structuredClone(this.state)})}
  health(){return this.enqueue(async()=>{await this.load();let bytes=0,headBytes=0;try{bytes=(await stat(this.file)).size}catch{}try{headBytes=(await stat(this.headFile)).size}catch{}return{ok:true,version:this.state.version,generation:this.state.generation,records:this.state.records.length,active:this.state.records.filter(record=>record.registryState==="ACTIVE").length,quarantined:this.state.records.filter(record=>record.registryState==="QUARANTINED").length,revoked:this.state.records.filter(record=>record.registryState==="REVOKED").length,bytes,headBytes,softwareRollbackLimit:"Simultaneous rollback of both authenticated state and head cannot be detected without a hardware/remote monotonic anchor.",authority:false as const,productionAuthority:false as const,mayMintExecutionAuthority:false as const}})}
  async close(){await this.chain}
}
