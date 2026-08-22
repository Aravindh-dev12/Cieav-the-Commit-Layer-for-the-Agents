#!/usr/bin/env node
import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2);
const valueOf=(name,fallback="")=>String(args.find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||fallback).trim();
const php=valueOf("--php",process.env.CIEAV_PHP_BIN||(process.platform==="win32"?"C:\\xampp\\php\\php.exe":"php"));
const bridge=path.resolve(valueOf("--bridge",process.env.CIEAV_XAMPP_MYSQL_BRIDGE||path.join(ROOT,"scripts","xampp-mysql-receipts.php")));
const command=args.includes("--status")?"status":"bootstrap";
if(process.platform==="win32"&&!existsSync(php)){
  console.error(JSON.stringify({authority:false,ok:false,error:"xampp_php_missing",php,hint:"Set CIEAV_PHP_BIN to the full path of XAMPP php.exe."},null,2));
  process.exit(2);
}
if(!existsSync(bridge)){
  console.error(JSON.stringify({authority:false,ok:false,error:"xampp_mysql_bridge_missing",bridge},null,2));
  process.exit(2);
}
const run=spawnSync(php,[bridge,command],{cwd:ROOT,encoding:"utf8",shell:false,env:{...process.env}});
if(run.error){console.error(JSON.stringify({authority:false,ok:false,error:"xampp_php_start_failed",message:run.error.message},null,2));process.exit(2)}
const text=(run.stdout||run.stderr||"").trim();
if(text)console.log(text);
if(run.status!==0)process.exit(run.status??2);
console.log(JSON.stringify({
  authority:false,
  productionAuthority:false,
  receiptStore:"xampp-mysql",
  env:{
    CIEAV_RECEIPT_STORE:"xampp-mysql",
    CIEAV_MYSQL_HOST:process.env.CIEAV_MYSQL_HOST||"127.0.0.1",
    CIEAV_MYSQL_PORT:process.env.CIEAV_MYSQL_PORT||"3306",
    CIEAV_MYSQL_DATABASE:process.env.CIEAV_MYSQL_DATABASE||"cieav",
    CIEAV_MYSQL_USER:process.env.CIEAV_MYSQL_USER||"root",
    CIEAV_MYSQL_PASSWORD:process.env.CIEAV_MYSQL_PASSWORD?"[CONFIGURED]":"[BLANK]"
  }
},null,2));
