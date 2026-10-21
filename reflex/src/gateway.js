// One door for every action. Fail closed.
export function decide(step, manifest) {
  if (!manifest.apps.includes(step.app)) return 'deny'; // outside capability manifest
  if (step.risk === 'R3' || step.risk === 'R2') return 'approve'; // irreversible or externally visible
  if (step.risk === 'R0' || step.risk === 'R1') return 'allow';
  return 'deny';
}
