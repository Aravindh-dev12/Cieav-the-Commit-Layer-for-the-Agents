import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult,type ProviderHealth} from "@cieav/contracts";
import {ProofProviderRegistry} from "@cieav/core/provider-runtime";
import {FilesystemProofProvider} from "./proof-providers/filesystem.js";
import {HttpProofProvider} from "./proof-providers/http.js";

export type LocalProofProviderConfig={
  filesystemRoots?:string[];
  httpOrigins?:string[];
  maxFilesystemReadBytes?:number;
  maxHttpBodyBytes?:number;
};

export class CieavLocalProofProviderRuntime{
  readonly registry=new ProofProviderRegistry();
  constructor(config:LocalProofProviderConfig={}){
    if(config.filesystemRoots?.length)this.registry.register(new FilesystemProofProvider(config.filesystemRoots,config.maxFilesystemReadBytes));
    if(config.httpOrigins?.length)this.registry.register(new HttpProofProvider(config.httpOrigins,config.maxHttpBodyBytes));
  }
  list(){return this.registry.list()}
  health():Promise<ProviderHealth[]>{return this.registry.health()}
  observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);return this.registry.observe(request)}
}
