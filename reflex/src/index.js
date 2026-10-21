import { createApp } from './app.js';
import { loadKeys } from './entra.js';

let entra = null; // Entra ID SSO turns on when tenant and audience are configured
if (process.env.ENTRA_TENANT_ID && process.env.ENTRA_AUDIENCE) {
  const t = process.env.ENTRA_TENANT_ID, url = `https://login.microsoftonline.com/${t}/discovery/v2.0/keys`;
  entra = { keys: await loadKeys(url), aud: process.env.ENTRA_AUDIENCE, iss: `https://login.microsoftonline.com/${t}/v2.0`, groupMap: JSON.parse(process.env.GROUP_MAP || '{}') };
  setInterval(() => loadKeys(url).then((k) => Object.assign(entra.keys, k)).catch(() => {}), 3600000).unref();
}
const app = createApp({ dbPath: process.env.DB_PATH || './reflex.db', apiKey: process.env.API_KEY, users: JSON.parse(process.env.USERS || '[]'), entra });
const server = app.listen(process.env.PORT || 3000, () => console.log('Reflex listening on', server.address().port));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
