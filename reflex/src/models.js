// Model gateway: Anthropic API, a local Ollama server, or an offline stand-in.
// The model is chosen by environment, so swapping it never touches procedures.
const MODEL = process.env.MODEL || 'claude-sonnet-4-6';

let override = null; // tests inject a fake model here
export const setModel = (f) => { override = f; };

let sink = null; // records token usage for cost tracking
export const setUsageSink = (f) => { sink = f; };

export const provider = () =>
  process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OLLAMA_URL ? 'ollama' : 'offline';

export async function complete(system, prompt) {
  if (override) return override(system, prompt);
  const p = provider();
  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error('model request failed: ' + r.status);
    const j = await r.json();
    sink?.({ model: MODEL, input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 });
    return j.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  if (p === 'ollama') {
    const r = await fetch(process.env.OLLAMA_URL + '/api/chat', {
      method: 'POST', signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3.1', stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error('local model request failed: ' + r.status);
    return (await r.json()).message.content;
  }
  return '[offline] ' + prompt.slice(0, 240); // deterministic stand-in: pipelines still run with no model
}

// Hashed character-trigram vectors: deterministic, local, no network.
export function embed(text, dim = 256) {
  const v = new Float64Array(dim), t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (let i = 0; i < t.length - 2; i++) {
    let h = 0;
    for (const c of t.slice(i, i + 3)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % dim] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
export const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
