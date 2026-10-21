const $ = (s) => document.querySelector(s), W = 150, H = 56;
let token = '', key = sessionStorage.getItem('k') || '', pipe = null, sel = null, linking = null, linkMode = false, last = null, answer = null;
const msg = (m) => ($('#msg').textContent = m || '');
const api = async (p, o = {}) => {
  const r = await fetch('/api' + p, { ...o, headers: { ...(token ? { authorization: 'Bearer ' + token } : { 'x-api-key': key }), 'content-type': 'application/json' } });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); return d;
};
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });
const h = (t, p = {}, ...k) => { const e = Object.assign(document.createElement(t), p); e.append(...k); return e; };
const status = (id) => last?.trace.find((t) => t.id === id)?.status || '';
const save = () => api(`/pipelines/${pipe.id}`, { method: 'PUT', body: JSON.stringify({ graph: pipe.graph }) }).catch((e) => msg(e.message));

function wires() {
  const g = pipe.graph, by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  $('#wires').replaceChildren(...g.edges.map((e) => {
    const a = by[e.from], b = by[e.to], x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', `M${x1} ${y1}C${x1 + 60} ${y1},${x2 - 60} ${y2},${x2} ${y2}`); return p;
  }));
}
function draw() {
  $('#nodes').replaceChildren(...pipe.graph.nodes.map((n) => {
    const el = h('div', { className: `node t-${n.type} ${status(n.id)} ${sel === n.id ? 'sel' : ''}` }, h('i', {}, n.type), h('span', {}, n.id));
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    el.onpointerdown = (ev) => {
      if (linkMode) { if (!linking) linking = n.id; else { if (linking !== n.id && !pipe.graph.edges.some((e) => e.from === linking && e.to === n.id)) { pipe.graph.edges.push({ from: linking, to: n.id }); save(); } linking = null; } draw(); return; }
      sel = n.id; const ox = ev.clientX - n.x, oy = ev.clientY - n.y; el.setPointerCapture(ev.pointerId);
      el.onpointermove = (m) => { n.x = Math.max(0, m.clientX - ox); n.y = Math.max(0, m.clientY - oy); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; wires(); };
      el.onpointerup = () => { el.onpointermove = null; save(); draw(); side(); };
    };
    return el;
  }));
  wires();
}
function side() {
  const s = $('#side'), n = pipe.graph.nodes.find((x) => x.id === sel), parts = [];
  if (last?.status === 'paused') {
    const node = Object.values(last.ctx).find((c) => ['awaiting_approval', 'awaiting_repair'].includes(c?.status));
    const resume = async () => { last = await post(`/pipeline-runs/${last.id}/resume`, {}); draw(); side(); };
    if (node?.status === 'awaiting_repair') {
      const p = node.pending.proposal, go = async (d) => { await post(`/runs/${node.id}/repair`, { decision: d }); await resume(); };
      parts.push(h('div', { className: 'warn' }, h('b', {}, 'Agent proposes a fix'), h('div', {}, `Step ${p.step}: change control "${p.from}" to "${p.to}". ${p.reason}`),
        h('button', { className: 'go', onclick: () => go('approve') }, 'Apply fix and retry'), h('button', { onclick: () => go('reject') }, 'Reject')));
    } else if (node?.pending?.card) {
      const c = node.pending.card, go = async (d) => { await post(`/runs/${node.id}/approve`, { decision: d }); await resume(); };
      parts.push(h('div', { className: 'warn' }, h('b', {}, 'Needs your approval'), h('div', {}, `${c.action} in ${c.app} (risk ${c.risk}), value: ${JSON.stringify(c.value)}`),
        h('button', { className: 'go', onclick: () => go('approve') }, 'Approve and send'), h('button', { onclick: () => go('reject') }, 'Reject')));
    }
  }
  if (answer) parts.push(h('h3', {}, 'Answer'), h('div', {}, answer.answer ?? answer.reason), ...(answer.citations || []).map((c) => h('div', { className: 'item' }, `[${c.n}] ${c.doc_key} v${c.version}: ${c.title}`)));
  if (last) parts.push(h('h3', {}, 'Last run'), h('div', {}, `${last.status}${last.error ? ': ' + last.error : ''}`), ...last.trace.map((t) => h('div', { className: 'item' }, `${t.id}: ${t.status}`)));
  if (n) {
    const ta = h('textarea', { value: JSON.stringify(n.config, null, 2) });
    parts.push(h('h3', {}, `Node: ${n.id}`), ta, h('button', { onclick: () => { try { n.config = JSON.parse(ta.value); save(); msg('Saved'); } catch { msg('Config is not valid JSON'); } } }, 'Save config'),
      h('button', { onclick: () => { pipe.graph.nodes = pipe.graph.nodes.filter((x) => x !== n); pipe.graph.edges = pipe.graph.edges.filter((e) => e.from !== n.id && e.to !== n.id); sel = null; save(); draw(); side(); } }, 'Delete node'));
  }
  s.replaceChildren(...parts, h('div', { className: 'item' }, 'Click a node to edit it. Drag to move. Use Link, then click two nodes to connect them. Reference earlier nodes in config as {{nodeId.field}}.'));
}
const DEFAULTS = { ask: { question: '{{trigger.query}}' }, agent: { system: 'You are concise.', prompt: '{{procedure}}' }, recall: { query: '{{trigger.query}}' }, procedure: { procedureId: '{{recall.id}}', params: {} }, http: { url: '', body: '{}' }, log: { message: '' } };

async function init() {
  if (!key && !token) return msg('Enter your API key to connect.');
  try { pipe = (await api('/pipelines'))[0]; const m = await api('/models'); msg('Model provider: ' + m.provider); draw(); side(); } catch (e) { msg(e.message); }
}
$('#save').onclick = () => { key = $('#key').value; sessionStorage.setItem('k', key); init(); };
$('#sample').onclick = async () => { try { await post('/traces', await (await fetch('sample.json')).json()); msg('Sample procedure loaded'); } catch (e) { msg(e.message); } };
$('#run').onclick = async () => { try { msg('Running'); last = await post(`/pipelines/${pipe.id}/run`, { input: { query: $('#q').value, week: $('#week').value } }); msg(last.status); draw(); side(); } catch (e) { msg(e.message); } };
$('#add').onclick = () => { const t = $('#type').value; let i = 1; while (pipe.graph.nodes.some((n) => n.id === t + i)) i++; pipe.graph.nodes.push({ id: t + i, type: t, x: 60 + 30 * i, y: 220, config: structuredClone(DEFAULTS[t]) }); save(); draw(); };
$('#link').onclick = () => { linkMode = !linkMode; linking = null; $('#link').classList.toggle('on', linkMode); };
$('#askbtn').onclick = async () => { try { answer = await post('/ask', { question: $('#ask').value }); side(); } catch (e) { msg(e.message); } };
// Microsoft sign-in: shown only when the server has SSO configured and the MSAL library is present (npm run vendor:msal).
async function sso() {
  const cfg = await (await fetch('/config.json')).json();
  if (!cfg.sso || !window.msal) return;
  const app = new msal.PublicClientApplication({ auth: { clientId: cfg.sso.clientId, authority: `https://login.microsoftonline.com/${cfg.sso.tenant}`, redirectUri: location.origin } });
  await app.initialize();
  $('header').insertBefore(h('button', { className: 'go', textContent: 'Sign in with Microsoft', onclick: async () => { token = (await app.loginPopup({ scopes: [cfg.sso.scope] })).accessToken; init(); } }), $('#key'));
}
sso().catch(() => {});
init();
