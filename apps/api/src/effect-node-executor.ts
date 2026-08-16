import {executeEffectNodeTool} from "@cieav/core";
import type {EffectExecutionAdapter,EffectExecutionResult} from "./effect-dispatch.js";

export class CieavLocalEffectNodeExecutor implements EffectExecutionAdapter{
  async execute({proposal,tool}:Parameters<EffectExecutionAdapter["execute"]>[0]):Promise<EffectExecutionResult>{return executeEffectNodeTool(proposal,tool)}
}
