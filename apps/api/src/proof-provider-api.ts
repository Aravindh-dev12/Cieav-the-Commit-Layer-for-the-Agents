import type * as http from "node:http";
import {ProofObservationRequestSchema} from "@cieav/contracts";
import {CieavLocalProofProviderRuntime} from "./proof-provider-runtime.js";

export type ProofProviderApiResult={status:number;body:unknown};
async function readBody(req:http.IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>256000)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }

export class CieavProofProviderApi{
  constructor(readonly runtime:CieavLocalProofProviderRuntime){}
  async handleGateway(req:http.IncomingMessage,pathname:string):Promise<ProofProviderApiResult|null>{
    if(req.method==="GET"&&pathname==="/v1/proof-providers")return{status:200,body:{providers:this.runtime.list(),authority:false,mayMintExecutionAuthority:false}};
    if(req.method==="GET"&&pathname==="/v1/proof-providers/health")return{status:200,body:{providers:await this.runtime.health(),authority:false,mayMintExecutionAuthority:false}};
    if(req.method==="POST"&&pathname==="/v1/proof-providers/observe"){
      const request=ProofObservationRequestSchema.parse(await readBody(req));
      return{status:200,body:await this.runtime.observe(request)};
    }
    return null;
  }
}
