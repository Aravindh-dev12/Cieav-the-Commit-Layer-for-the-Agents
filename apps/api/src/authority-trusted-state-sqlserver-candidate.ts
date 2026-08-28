import crypto from "node:crypto";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {attachSqlServerTrustedState,CieavSqlServerTrustedStatePersistence} from "./authority-trusted-state-sqlserver.js";

export async function createAtomicSqlServerTrustedKernelCandidate(input:{kernel:CieavAgentKernelStore;persistence:CieavSqlServerTrustedStatePersistence}){
  await input.persistence.start();
  const migration=attachSqlServerTrustedState(input.kernel,input.persistence);
  await input.persistence.runAtomicTrustedStateTransaction(`startup-migration-${crypto.randomUUID()}`,()=>migration.initializeAll());
  await input.kernel.recoverOnStartup();
  return{kernel:input.kernel,persistence:input.persistence,migration};
}
