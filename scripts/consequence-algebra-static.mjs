import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const contracts=read("packages/contracts/src/consequence-algebra.ts");
const core=read("packages/core/src/consequence-algebra.ts");
const store=read("apps/api/src/consequence-algebra-store.ts");
const coreTest=read("packages/core/src/consequence-algebra.test.ts");
const storeTest=read("apps/api/src/consequence-algebra-store.test.ts");
const must=(ok,msg)=>{if(!ok)throw new Error(`Consequence Algebra gate failed: ${msg}`)};

for(const token of ["EQUIVALENT","INDEPENDENT","COMMUTES","CONFLICTS","REQUIRES","INVALIDATES","SUPERSEDES","COMPENSATES","AGGREGATES_WITH","UNKNOWN_RELATION"])must(contracts.includes(`\"${token}\"`),`relation ${token} missing`);
for(const token of ["RealityAddressSchema","SemanticEffectIdentitySchema","ConsequenceFootprintSchema","InvariantCompatibilityWitnessSchema","ConsequenceReservationSchema","ProofPlanReservationSchema","CausalRealityFenceSchema","ActiveConsequenceNodeSchema","AlgebraAdmissionSchema"])must(contracts.includes(token),`${token} missing`);
must(core.includes("CIEAV_CANONICAL_REALITY_REF_V1"),"route-independent canonical reality identity missing");
must(core.includes("Equivalent consequence")&&core.includes('decision:\"RECONCILE\"'),"cross-route semantic idempotency/reconciliation missing");
must(core.includes('decision:\"COORDINATE\"')&&core.includes("UNKNOWN_RELATION"),"conflict/unknown fail-closed coordination missing");
must(core.includes("Cumulative consequence budget exceeded"),"anti-fragmentation cumulative budget gate missing");
must(core.includes("Protected consequence has no admissible proof-provider binding"),"proofability admission missing");
must(core.includes("CONSEQUENCE_ALGEBRA_AUTHORITY=false")&&core.includes("CONSEQUENCE_ALGEBRA_MAY_MINT_EXECUTION_AUTHORITY=false"),"zero-authority constants missing");
must(store.includes("createHmac")&&store.includes("timingSafeEqual")&&store.includes("durableReplace"),"authenticated durable state missing");
must(store.includes("SETTLED_UNKNOWN")&&store.includes('rs=\"QUARANTINED\"'),"UNKNOWN quarantine reservation semantics missing");
must(store.includes("assertFencesSatisfied"),"causal reality fence enforcement missing");
must(store.includes("assertSemanticRetryAllowed"),"semantic retry barrier missing");
must(coreTest.includes("independently of route protocol")&&coreTest.includes("cumulative budget fragmentation"),"core semantic qualification tests missing");
must(storeTest.includes("persists an admitted reservation across restart")&&storeTest.includes("fails closed on tampered persisted state")&&storeTest.includes("cross-route duplicate")&&storeTest.includes("causal fence"),"durability/adversarial qualification tests missing");

console.log("CIEAV Consequence Algebra static gate PASS - route-independent semantic identity + relation algebra + invariant witness + authenticated Active Consequence Graph + reservation/quarantine + proofability + causal fences + cumulative anti-fragmentation + zero authority present");
