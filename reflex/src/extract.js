import { createHash } from 'node:crypto';

const RISK = { read: 'R0', navigate: 'R0', write: 'R1', execute: 'R1', draft: 'R2', send: 'R3', delete: 'R3', pay: 'R3' };

// Deterministic: the same trace always yields the same procedure. No model involved.
export function extract(trace) {
  const steps = trace.steps
    .filter((s) => !s.undone) // prune dead ends
    .map((s, i) => ({
      n: i + 1, app: String(s.app || 'unknown'), action: String(s.action || ''),
      class: s.class, target: s.target || {}, value: s.value ?? null,
      check: s.check || null, risk: RISK[s.class] || 'R3', // unknown classes fail closed
    }));
  const verifier = [...steps].reverse().find((s) => s.check)?.n ?? null;
  return {
    title: String(trace.prompt).slice(0, 200), steps, verifier,
    status: verifier ? 'ready' : 'draft', // no verifier => cannot run
    manifest: { apps: [...new Set(steps.map((s) => s.app))] },
    hash: createHash('sha256').update(JSON.stringify(steps)).digest('hex'),
  };
}
