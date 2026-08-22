import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult,type ProviderHealth} from "@cieav/contracts";
import {ProofProviderRegistry} from "@cieav/core/provider-runtime";
import {FilesystemProofProvider} from "./proof-providers/filesystem.js";
import {HttpProofProvider} from "./proof-providers/http.js";
import {GitProofProvider} from "./proof-providers/git.js";

export type LocalProofProviderConfig={
  filesystemRoots?:string[];
  httpOrigins?:string[];
  gitRepositories?:string[];
  httpAllowPrivateNetworks?:boolean;
  maxFilesystemReadBytes?:number;
  maxHttpBodyBytes?:number;
  maxGitOutputBytes?:number;
};

export class CieavLocalProofProviderRuntime{
  readonly registry=new ProofProviderRegistry();
  constructor(config:LocalProofProviderConfig={}){
    if(config.filesystemRoots?.length)this.registry.register(new FilesystemProofProvider(config.filesystemRoots,config.maxFilesystemReadBytes));
    if(config.httpOrigins?.length)this.registry.register(new HttpProofProvider(config.httpOrigins,config.maxHttpBodyBytes,config.httpAllowPrivateNetworks===true));
    if(config.gitRepositories?.length)this.registry.register(new GitProofProvider(config.gitRepositories,"git",config.maxGitOutputBytes));
  }
  list(){return this.registry.list()}
  health():Promise<ProviderHealth[]>{return this.registry.health()}
  observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);return this.registry.observe(request)}
}
