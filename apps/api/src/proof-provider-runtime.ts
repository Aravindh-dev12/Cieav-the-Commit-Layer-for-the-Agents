import path from "node:path";
import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult,type ProviderHealth} from "@cieav/contracts";
import {ProofProviderRegistry} from "@cieav/core/provider-runtime";
import {FilesystemProofProvider} from "./proof-providers/filesystem.js";
import {HttpProofProvider} from "./proof-providers/http.js";
import {GitProofProvider} from "./proof-providers/git.js";
import {SqliteProofProvider} from "./proof-providers/sqlite.js";
import {BrowserProofProvider} from "./proof-providers/browser.js";

export type LocalProofProviderConfig={
  filesystemRoots?:string[];
  httpOrigins?:string[];
  gitRepositories?:string[];
  sqliteCatalogFile?:string;
  httpAllowPrivateNetworks?:boolean;
  maxFilesystemReadBytes?:number;
  maxHttpBodyBytes?:number;
  maxGitOutputBytes?:number;
  browserControlBase?:string;
  browserAllowedOrigins?:string[];
  browserObserveTokenEnv?:string;
};

function envList(name:string){return String(process.env[name]??"").split(",").map(x=>x.trim()).filter(Boolean)}

export class CieavLocalProofProviderRuntime{
  readonly registry=new ProofProviderRegistry();
  constructor(config:LocalProofProviderConfig={}){
    if(config.filesystemRoots?.length)this.registry.register(new FilesystemProofProvider(config.filesystemRoots,config.maxFilesystemReadBytes));
    if(config.httpOrigins?.length)this.registry.register(new HttpProofProvider(config.httpOrigins,config.maxHttpBodyBytes,config.httpAllowPrivateNetworks===true));
    if(config.gitRepositories?.length)this.registry.register(new GitProofProvider(config.gitRepositories,"git",config.maxGitOutputBytes));
    const sqliteCatalog=String(config.sqliteCatalogFile??process.env.CIEAV_PROOF_SQLITE_CATALOG??"").trim();
    if(sqliteCatalog){const provider=SqliteProofProvider.fromCatalogFile(path.resolve(sqliteCatalog));if(provider)this.registry.register(provider)}
    const browserControlBase=String(config.browserControlBase??process.env.CIEAV_PROOF_BROWSER_CONTROL_BASE??"").trim(),browserAllowedOrigins=config.browserAllowedOrigins?.length?config.browserAllowedOrigins:envList("CIEAV_PROOF_BROWSER_ORIGINS"),browserObserveTokenEnv=String(config.browserObserveTokenEnv??process.env.CIEAV_PROOF_BROWSER_OBSERVE_TOKEN_ENV??"CIEAV_BROWSER_OBSERVE_TOKEN").trim();
    if(browserControlBase||browserAllowedOrigins.length){if(!browserControlBase||!browserAllowedOrigins.length)throw new Error("browser_proof_configuration_incomplete");this.registry.register(new BrowserProofProvider({controlBase:browserControlBase,allowedOrigins:browserAllowedOrigins,observeTokenEnv:browserObserveTokenEnv},process.env))}
  }
  list(){return this.registry.list()}
  health():Promise<ProviderHealth[]>{return this.registry.health()}
  observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);return this.registry.observe(request)}
}
