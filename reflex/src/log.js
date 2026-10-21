import { createHash } from 'node:crypto';
const h = (...a) => createHash('sha256').update(a.join('|')).digest('hex');

export function log(db, actor, event, data = {}) {
  const prev = db.prepare('SELECT hash FROM activity ORDER BY seq DESC LIMIT 1').get()?.hash || '0';
  const ts = Date.now();
  const body = JSON.stringify({ event, ...data });
  db.prepare('INSERT INTO activity(ts,actor,event,prev,hash) VALUES(?,?,?,?,?)')
    .run(ts, actor, body, prev, h(prev, ts, actor, body));
}

export function verify(db) {
  let prev = '0';
  for (const r of db.prepare('SELECT * FROM activity ORDER BY seq').all()) {
    if (r.prev !== prev || r.hash !== h(prev, r.ts, r.actor, r.event)) return { ok: false, seq: r.seq };
    prev = r.hash;
  }
  return { ok: true };
}
