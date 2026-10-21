// Copies the MSAL browser bundle next to the dashboard so it is served from our own origin (CSP-friendly).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
const src = ['lib/msal-browser.min.js', 'lib/msal-browser.js'].map((f) => `node_modules/@azure/msal-browser/${f}`).find(existsSync);
if (!src) { console.error('MSAL bundle not found; run npm install first'); process.exit(1); }
mkdirSync('public/vendor', { recursive: true });
copyFileSync(src, 'public/vendor/msal-browser.min.js');
console.log('copied', src);
