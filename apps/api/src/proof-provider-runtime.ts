import path from "node:path";
import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult,type ProviderHealth} from "@cieav/contracts";
import {ProofProviderRegistry} from "@cieav/core/provider-runtime";
import {FilesystemProofProvider} from "./proof-providers/filesystem.js";
import {HttpProofProvider} from "./proof-providers/http.js";
import {GitProofProvider} from "./proof-providers/git.js";
import {GitRefProofProvider} from "./proof-providers/git-ref.js";
import {GitRemoteRefProofProvider} from "./proof-providers/git-remote-ref.js";
import {SqliteProofProvider} from "./proof-providers/sqlite.js";
import {Ros2ProofProvider} from "./proof-providers/ros2.js";
import {BrowserProofProvider} from "./proof-providers/browser.js";

export type LocalProofProviderConfig={
  filesystemRoots?:string[];
  httpOrigins?:string[];
  gitRepositories?:string[];
  gitRefCatalogFile?:string;
  gitRemoteRefCatalogFile?:string;
  sqliteCatalogFile?:string;
  ros2CatalogFile?:string;
  browserCatalogFile?:string;
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
    const gitRefCatalog=String(config.gitRefCatalogFile??process.env.CIEAV_PROOF_GIT_REF_CATALOG??"").trim();
    if(gitRefCatalog){const provider=GitRefProofProvider.fromCatalogFile(path.resolve(gitRefCatalog));if(provider)this.registry.register(provider)}
    const gitRemoteRefCatalog=String(config.gitRemoteRefCatalogFile??process.env.CIEAV_PROOF_GIT_REMOTE_REF_CATALOG??"").trim();
    if(gitRemoteRefCatalog){const provider=GitRemoteRefProofProvider.fromCatalogFile(path.resolve(gitRemoteRefCatalog));if(provider)this.registry.register(provider)}
    const sqliteCatalog=String(config.sqliteCatalogFile??process.env.CIEAV_PROOF_SQLITE_CATALOG??"").trim();
    if(sqliteCatalog){const provider=SqliteProofProvider.fromCatalogFile(path.resolve(sqliteCatalog));if(provider)this.registry.register(provider)}
    const ros2Catalog=String(config.ros2CatalogFile??process.env.CIEAV_PROOF_ROS2_CATALOG??"").trim();
    if(ros2Catalog){const provider=Ros2ProofProvider.fromCatalogFile(path.resolve(ros2Catalog));if(provider)this.registry.register(provider)}
    const browserCatalog=String(config.browserCatalogFile??process.env.CIEAV_PROOF_BROWSER_CATALOG??"").trim();
    if(browserCatalog){const provider=BrowserProofProvider.fromCatalogFile(path.resolve(browserCatalog));if(provider)this.registry.register(provider)}
  }
  list(){return this.registry.list()}
  health():Promise<ProviderHealth[]>{return this.registry.health()}
  observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);return this.registry.observe(request)}
}
