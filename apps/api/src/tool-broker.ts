import {ToolBrokerPolicySchema,ToolDescriptorSchema,type ToolBrokerPolicy,type ToolCatalog,type ToolDescriptor} from "@cieav/contracts";
import {buildToolCatalog,descriptorFromEffectNode} from "@cieav/core";
import {CieavEffectNodeRegistry} from "./effect-node-registry.js";

export class CieavToolBroker{
  private registrations=new Map<string,ToolDescriptor>();
  constructor(private readonly nodes:CieavEffectNodeRegistry){}

  register(raw:unknown){const descriptor=ToolDescriptorSchema.parse(raw);if(descriptor.provider==="EFFECT_NODE")throw new Error("effect_node_tools_must_come_from_verified_node_registry");const existing=this.registrations.get(descriptor.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(descriptor))throw new Error(`tool_descriptor_conflict:${descriptor.id}`);this.registrations.set(descriptor.id,descriptor);return descriptor}
  unregister(id:string){return this.registrations.delete(id)}
  listRegistered(){return[...this.registrations.values()].sort((a,b)=>a.id.localeCompare(b.id))}

  async catalog(rawPolicy:unknown,now=new Date()):Promise<ToolCatalog>{
    const policy:ToolBrokerPolicy=ToolBrokerPolicySchema.parse(rawPolicy),descriptors:ToolDescriptor[]=[...this.registrations.values()];
    const discovered=await this.nodes.discover({},now);
    for(const node of discovered)for(const capability of node.capabilities)for(const operation of capability.operations)descriptors.push(descriptorFromEffectNode(node.nodeId,capability,operation));
    return buildToolCatalog(descriptors,policy,now.toISOString());
  }
}
