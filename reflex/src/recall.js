import { embed, cosine } from './models.js';
const tok = (s) => s.toLowerCase().match(/[a-z0-9]+/g) || [];

// Exact + BM25 lexical retrievers fused with reciprocal rank fusion (k=60).
// A semantic (embedding) retriever is the next retriever to add.
export function recall(db, q, limit = 5) {
  const rows = db.prepare('SELECT id,title,text,status FROM procedures').all();
  if (!rows.length) return [];
  const qt = tok(q), docs = rows.map((r) => tok(r.text)), N = rows.length;
  const avg = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = {};
  docs.forEach((d) => new Set(d).forEach((t) => (df[t] = (df[t] || 0) + 1)));
  const lex = docs.map((d) => qt.reduce((s, t) => {
    const f = d.filter((x) => x === t).length;
    if (!f) return s;
    return s + Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.length / avg));
  }, 0));
  const ql = q.toLowerCase().trim();
  const ex = rows.map((r) => (ql && (ql.includes(r.title.toLowerCase()) || r.title.toLowerCase().includes(ql)) ? 1 : 0));
  const rank = (sc) => {
    const m = {};
    sc.map((v, i) => [v, i]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).forEach(([, i], r) => (m[i] = r + 1));
    return m;
  };
  const qe = embed(q); // semantic retriever (hashed n-gram vectors; swap for model embeddings later)
  const sem = rows.map((r) => { const c = cosine(qe, embed(r.text)); return c > 0.3 ? c : 0; });
  const rl = rank(lex), re = rank(ex), rs = rank(sem);
  return rows.map((r, i) => ({
    id: r.id, title: r.title, status: r.status,
    score: (rl[i] ? 1 / (60 + rl[i]) : 0) + (re[i] ? 1 / (60 + re[i]) : 0) + (rs[i] ? 1 / (60 + rs[i]) : 0),
  })).filter((r) => r.score > 0)
    .map((r) => ({ ...r, confidence: +(r.score / (3 / 61)).toFixed(2) }))
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
