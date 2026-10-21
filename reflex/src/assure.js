import { open } from './db.js';
import { start, decideApproval } from './replay.js';

const CLASSES = ['read', 'navigate', 'write', 'execute', 'draft', 'send', 'delete', 'pay'];
const risky = (s) => ['R2', 'R3'].includes(s.risk);

// Design-rule check for procedures (constraint-aware, like a PCB DRC): deterministic, no model.
export function lint(proc) {
  const v = [];
  for (const s of proc.steps) {
    if (risky(s) && !s.check) v.push({ step: s.n, rule: 'risky-step-needs-check', message: `${s.risk} step ${s.n} (${s.action}) has no check, so success cannot be verified` });
    if (!CLASSES.includes(s.class)) v.push({ step: s.n, rule: 'unknown-class', message: `step ${s.n} has an unknown class and is treated as R3` });
  }
  if (!proc.steps.some((s) => s.check)) v.push({ step: 0, rule: 'no-verifier', message: 'no step has a check' });
  return { ok: !v.length, violations: v };
}

// Pre-deployment simulation in a throwaway database: nothing touches real tools or the real audit log.
// It replays the procedure through the real engine with fault injection at every checked step and
// verifies that it stops safely and that every risky step was gated for approval.
export async function simulate(row, extra = []) {
  const steps = JSON.parse(row.steps), riskyCount = steps.filter(risky).length;
  const scenarios = [
    { name: 'happy path', script: {}, expect: 'done' },
    ...steps.filter((s) => s.check).map((s) => ({ name: `fault at step ${s.n}`, script: { [s.n]: { ok: false, text: '', ui: [] } }, expect: 'handoff', failAt: s.n })),
    ...extra,
  ];
  const out = [];
  for (const sc of scenarios) {
    const tmp = open(':memory:');
    tmp.prepare('INSERT INTO procedures(id,title,text,status,trace_hash,verifier,manifest,steps,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(row.id, row.title, row.text, row.status, row.trace_hash, row.verifier, row.manifest, row.steps, 0);
    tmp.driver = async (step) => sc.script?.[step.n] ?? { ok: true, text: step.check?.contains ?? '' };
    let run = await start(tmp, row.id, sc.params || {}, 'sim'), gated = 0;
    while (run.status === 'awaiting_approval') { gated++; run = await decideApproval(tmp, run.id, 'approve', 'sim'); }
    const evs = tmp.prepare('SELECT event FROM activity').all().map((r) => JSON.parse(r.event));
    const okSteps = evs.filter((e) => e.event === 'step.ok').map((e) => e.step);
    const problems = [];
    if (run.status !== sc.expect) problems.push(`expected ${sc.expect}, got ${run.status}`);
    if (sc.failAt && okSteps.some((n) => n >= sc.failAt)) problems.push('a step ran after the failure');
    if (sc.expect === 'done' && gated !== riskyCount) problems.push(`${gated} of ${riskyCount} risky steps were gated`);
    out.push({ name: sc.name, pass: !problems.length, problems });
  }
  return out;
}

// Outcome ledger: what the system delivered, what operators taught it, and whether targets were met.
export function outcomes(db) {
  const target = +process.env.TARGET_MODEL_FREE_RATE || 0.6, minutes = +process.env.MINUTES_PER_RUN || 5, patched = {};
  for (const r of db.prepare("SELECT event FROM activity WHERE event LIKE '%procedure.patched%'").all()) {
    const e = JSON.parse(r.event); patched[e.procedure] = (patched[e.procedure] || 0) + 1;
  }
  return db.prepare('SELECT id,title,trusted FROM procedures').all().map((p) => {
    const runs = db.prepare('SELECT status, llm_calls FROM runs WHERE procedure_id=?').all(p.id);
    const done = runs.filter((r) => r.status === 'done'), free = done.filter((r) => !r.llm_calls);
    const rate = done.length ? free.length / done.length : null;
    return { procedure: p.id, title: p.title, trusted: !!p.trusted, runs: runs.length, completed: done.length,
      handoffs: runs.filter((r) => r.status === 'handoff').length, model_free_rate: rate, target_met: rate === null ? null : rate >= target,
      corrections_codified: patched[p.id] || 0, minutes_saved: done.length * minutes };
  });
}
