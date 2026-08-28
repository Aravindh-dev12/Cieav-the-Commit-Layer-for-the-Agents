import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseEnv} from "node:util";

export interface EnvFileLoadResult {loaded:boolean;path?:string;keys:string[]}
let loadedOnce:EnvFileLoadResult|undefined;

function candidates(){const explicit=String(process.env.CIEAV_ENV_FILE??"").trim();if(explicit)return{explicit:true,paths:[path.resolve(explicit)]};const here=path.dirname(fileURLToPath(import.meta.url));return{explicit:false,paths:[path.resolve(process.cwd(),".env"),path.resolve(here,"../../../.env")]}}

export function loadOptionalEnvFile():EnvFileLoadResult{
  if(loadedOnce)return loadedOnce;const source=candidates();let selected:string|undefined;for(const candidate of [...new Set(source.paths)]){if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()){selected=candidate;break}}
  if(!selected){if(source.explicit)throw new Error(`CIEAV_ENV_FILE does not exist: ${source.paths[0]}`);return loadedOnce={loaded:false,keys:[]}}
  const stat=fs.statSync(selected);if(process.platform!=="win32"&&process.env.NODE_ENV==="production"&&(stat.mode&0o077)!==0)throw new Error(`CIEAV production env file permissions are too broad: ${selected}; require chmod 600 or stricter`);
  const parsed:Record<string,string>={};try{const raw=parseEnv(fs.readFileSync(selected,"utf8"));for(const [key,value] of Object.entries(raw))if(typeof value==="string")parsed[key]=value}catch(error){throw new Error(`CIEAV env file is invalid: ${error instanceof Error?error.message:String(error)}`)}
  const keys=Object.keys(parsed).sort();for(const key of keys){if(process.env[key]===undefined)process.env[key]=parsed[key]}
  return loadedOnce={loaded:true,path:selected,keys}
}
