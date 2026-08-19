import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import * as z from "zod4";

serveStdio(()=>{
  const server=new McpServer({name:"cieav-test-downstream",version:"1.0.0"});
  server.registerTool("echo",{description:"Echo a test value",inputSchema:z.object({value:z.string().max(1000)})},async({value})=>({content:[{type:"text",text:`echo:${value}`}] }));
  server.registerTool("reported-error",{description:"Return MCP isError after a tool invocation",inputSchema:z.object({value:z.string().optional()})},async()=>({isError:true,content:[{type:"text",text:"reported failure"}]}));
  return server;
});
