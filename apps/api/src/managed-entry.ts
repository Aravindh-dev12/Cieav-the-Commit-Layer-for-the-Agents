import {installManagedSecrets} from "./managed-secrets.js";

const MAX_BOOTSTRAP_BYTES=16*1024;

async function installBootstrapFromPrivatePipe():Promise<void>{
  if(process.env.CIEAV_MANAGED_SECRET_PIPE!=="1")throw new Error("cieav_managed_secret_pipe_required");
  if(process.stdin.isTTY)throw new Error("cieav_managed_secret_pipe_must_not_be_tty");
  const chunks:Buffer[]=[];let size=0,encoded:Buffer|undefined;
  try{
    for await(const chunk of process.stdin){
      const b=Buffer.from(chunk);size+=b.length;
      if(size>MAX_BOOTSTRAP_BYTES)throw new Error("cieav_managed_secret_bootstrap_too_large");
      chunks.push(b);
    }
    if(size===0)throw new Error("cieav_managed_secret_bootstrap_missing");
    encoded=Buffer.concat(chunks,size);
    let parsed:unknown;
    try{parsed=JSON.parse(encoded.toString("utf8"))}catch{throw new Error("cieav_managed_secret_bootstrap_invalid_json")}
    installManagedSecrets(parsed);
    parsed=undefined;
  }finally{
    encoded?.fill(0);
    for(const chunk of chunks)chunk.fill(0);
  }
}

await installBootstrapFromPrivatePipe();
await import("./server.js");
