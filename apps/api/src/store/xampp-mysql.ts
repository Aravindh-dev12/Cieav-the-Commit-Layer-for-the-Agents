import {spawn} from "node:child_process";
import path from "node:path";
import type {Receipt} from "@cieav/contracts";
import {ReceiptSchema} from "@cieav/contracts";
import {signReceipt,verifyReceipt,type ReceiptSigner} from "../receipt.js";
import type {ReceiptStore} from "./types.js";

type BridgeResponse={ok?:boolean;error?:string;message?:string;receipt?:unknown;receipts?:unknown[]};

function phpExecutable(){
  const configured=String(process.env.CIEAV_PHP_BIN??"").trim();
  if(configured)return configured;
  return process.platform==="win32"?"C:\\xampp\\php\\php.exe":"php";
}
function bridgeFile(){
  const configured=String(process.env.CIEAV_XAMPP_MYSQL_BRIDGE??"").trim();
  if(configured)return path.resolve(configured);
  const home=String(process.env.CIEAV_HOME??process.env.LATCH_HOME??process.cwd()).trim();
  return path.resolve(home,"scripts","xampp-mysql-receipts.php");
}

export class XamppMysqlReceiptStore implements ReceiptStore{
  constructor(private readonly signer:ReceiptSigner){}

  private call(command:string,input:unknown={}):Promise<BridgeResponse>{
    return new Promise((resolve,reject)=>{
      const child=spawn(phpExecutable(),[bridgeFile(),command],{stdio:["pipe","pipe","pipe"],windowsHide:true,env:{...process.env}});
      const stdout:Buffer[]=[],stderr:Buffer[]=[];
      child.stdout.on("data",chunk=>stdout.push(Buffer.from(chunk)));
      child.stderr.on("data",chunk=>stderr.push(Buffer.from(chunk)));
      child.on("error",err=>reject(new Error(`XAMPP MySQL bridge could not start: ${err.message}`)));
      child.on("close",code=>{
        const out=Buffer.concat(stdout).toString("utf8").trim(),err=Buffer.concat(stderr).toString("utf8").trim();
        let parsed:BridgeResponse|undefined;
        try{parsed=JSON.parse(out||err||"{}") as BridgeResponse}catch{}
        if(code!==0||!parsed?.ok)return reject(new Error(`XAMPP MySQL bridge failed: ${parsed?.error??"unknown_error"}${parsed?.message?`: ${parsed.message}`:""}${!parsed&&err?`: ${err.slice(-1200)}`:""}`));
        resolve(parsed);
      });
      child.stdin.end(JSON.stringify(input));
    });
  }

  async init(){await this.call("bootstrap")}
  private verified(raw:unknown):Receipt{
    const receipt=ReceiptSchema.parse(raw);
    if(!verifyReceipt(receipt,this.signer))throw new Error(`XAMPP MySQL receipt signature verification failed: ${receipt.id}`);
    return receipt;
  }
  async save(receipt:Receipt){
    if(!verifyReceipt(receipt,this.signer))throw new Error("refusing to persist receipt with invalid signature");
    await this.call("save",{receipt});
  }
  async list(deviceId:string,limit:number){
    const result=await this.call("list",{deviceId,limit});
    return (result.receipts??[]).map(x=>this.verified(x));
  }
  async get(deviceId:string,id:string){
    const result=await this.call("get",{deviceId,id});
    return result.receipt==null?null:this.verified(result.receipt);
  }
  async updateStatus(deviceId:string,id:string,status:Receipt["status"]){
    const current=await this.get(deviceId,id);if(!current)return null;
    const next=signReceipt({...current,status},this.signer);await this.save(next);return next;
  }
  async close(){}
}
