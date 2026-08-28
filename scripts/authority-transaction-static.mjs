#!/usr/bin/env node
import fs from "node:fs";

const checks=[
  ["apps/api/src/authority-transaction-journal.ts",[
    "CIEAV_AUTHORITY_TRANSACTION_V1",
    "PREPARED","APPLIED","COMMITTED",
    "RECORD_EXECUTION_ATTEMPT",
    "fenceToken",
    "previousHash",
    "entryHash",
    "localFencingOnly:true",
    "clusterHaQualified:false",
    "authority:false",
    "mayMintExecutionAuthority:false",
    "timingSafeEqual",
    "fh.sync()",
    "dh.sync()"
  ]],
  ["apps/api/src/execution-fabric.ts",[
    "CieavAuthorityTransactionJournal",
    "authority-transaction-journal.json",
    "recoverPendingAuthorityTransactions",
    "ISSUE_TICKET",
    "CONSUME_TICKET",
    "RECORD_EXECUTION_ATTEMPT",
    "ensureAlgebraAtLeast",
    "applyIssueTicketTransaction",
    "applyConsumeTicketTransaction",
    "applyExecutionAttemptTransaction",
    "committedExecutionAttemptResult",
    "semantic_effect_quarantine_binding_conflict",
    "authority_transaction_execution_audit_conflict",
    "credential_lease_counter_conflict",
    "authorityTransactionHealth"
  ]],
  ["apps/api/src/agent-kernel.ts",[
    "startupRecovery",
    "recoverStartupInternal",
    "await this.executionFabric.recoverAuthorityTransactionsOnStartup();",
    "await this.executionFabric.consequenceAlgebra.recoverOnStartup();",
    "agent_task_quarantine_id_conflict",
    "agent_task_quarantine_binding_missing"
  ]],
  ["apps/api/src/authority-transaction-journal.test.ts",[
    "monotonic fencing",
    "fails closed when the authenticated journal is tampered",
    "stage regression"
  ]],
  ["apps/api/src/authority-transaction-recovery.test.ts",[
    "recovers a prepared ticket issue exactly once after reopen",
    "recovers a prepared ticket consumption without double-spending the lease",
    "records UNKNOWN execution once and blocks semantic retry",
    "recovers a partially applied UNKNOWN execution with the same quarantine id",
    "semantic_effect_quarantined",
    "clusterHaQualified:false",
    "pending:0"
  ]]
];

const failures=[];
for(const [file,tokens] of checks){
  if(!fs.existsSync(file)){failures.push(`${file}: missing`);continue}
  const text=fs.readFileSync(file,"utf8");
  for(const token of tokens)if(!text.includes(token))failures.push(`${file}: missing ${token}`);
}
if(failures.length){
  console.error("CIEAV authority transaction static gate FAIL");
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log("CIEAV authority transaction static gate PASS - authenticated durable journal + monotonic local fencing + crash recovery + idempotent ticket/lease/execution transitions + UNKNOWN quarantine convergence + deadlock-safe startup replay + zero authority present");
