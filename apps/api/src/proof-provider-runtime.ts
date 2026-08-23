import path from "node:path";
import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult,type ProviderHealth} from "@cieav/contracts";
import {ProofProviderRegistry} from "@cieav/core/provider-runtime";
import {FilesystemProofProvider} from "./proof-providers/filesystem.js";
import {HttpProofProvider} from "./proof-providers/http.js";
import {GitProofProvider} from "./proof-providers/git.js";
import {SqliteProofProvider} from "./proof-providers/sqlite.js";

export type LocalProofProviderConfig={
  filesystemRoots?:string[];
  httpOrigins?:string[];
  gitRepositories?:string[];
  sqliteCatalogFile?:string;
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
    const sqliteCatalog=String(config.sqliteCatalogFile??process.env.CIEAV_PROOF_SQLITE_CATALOG??"").trim();
    if(sqliteCatalog){const provider=SqliteProofProvider.fromCatalogFile(path.resolve(sqliteCatalog));if(provider)this.registry.register(provider)}
  }
  list(){return this.registry.list()}
  health():Promise<ProviderHealth[]>{return this.registry.health()}
  observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);return this.registry.observe(request)}
}
