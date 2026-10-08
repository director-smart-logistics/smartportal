/**
 * READ-ONLY audit: which SP2 customers sign in with Google (before removing the Google button so SP2
 * is only e-mail + password). Never writes. Reads Firebase Auth (providers, last sign-in) and the
 * users docs (slCode, name) of SP2.
 *
 * Groups
 *   A. Google ONLY (no password)      → cannot log in once Google is removed: need a password first.
 *   B. Google + password               → will keep working with e-mail + password.
 *   C. Password only                   → not affected.
 * Usage: node scripts/audit/audit-google-signin.cjs --prod   [--out <folder>]   (emulator: FIREBASE_AUTH_EMULATOR_HOST)
 * Output: summary + <out>/google-signin-<date>.md (+ .json). Personal data → audit-output/ (git-ignored).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const args = process.argv.slice(2);
const PROD = args.includes('--prod');
const emulator = /^(localhost|127\.0\.0\.1):/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || '');
if (!PROD && !emulator) { console.error('❌ Use the emulator or pass --prod (read-only).'); process.exit(1); }
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(__dirname, '../../audit-output');
const app = emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-sp-qa' }, 'g') : initializeApp({ projectId: 'smart-portal-2', credential: applicationDefault() }, 'g');

(async () => {
  const auth = getAuth(app); const db = getFirestore(app);
  const accounts = []; let token;
  do { const page = await auth.listUsers(1000, token); accounts.push(...page.users); token = page.pageToken; } while (token);
  const users = new Map((await db.collection('users').select('slCode', 'firstName', 'lastName', 'displayName', 'phone', 'status', 'isActive').get()).docs.map((d) => [d.id, d.data()]));
  const rows = accounts.map((a) => {
    const providers = a.providerData.map((p) => p.providerId);
    const google = providers.includes('google.com'); const password = providers.includes('password') || !!a.passwordHash;
    const u = users.get(a.uid) || {};
    return { uid: a.uid, email: a.email || '', slCode: u.slCode || '', name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.displayName || a.displayName || '',
      phone: u.phone || a.phoneNumber || '', google, password, providers: providers.join('+'), disabled: a.disabled,
      lastSignIn: a.metadata.lastSignInTime ? new Date(a.metadata.lastSignInTime).toISOString().slice(0, 10) : '', created: a.metadata.creationTime ? new Date(a.metadata.creationTime).toISOString().slice(0, 10) : '',
      hasProfile: users.has(a.uid) };
  });
  const A = rows.filter((r) => r.google && !r.password), B = rows.filter((r) => r.google && r.password);
  const sortRecent = (x) => [...x].sort((a, b) => (b.lastSignIn || '').localeCompare(a.lastSignIn || ''));
  const since = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const summary = { cuentas: rows.length, googleSolo: A.length, googleYContrasena: B.length, soloContrasena: rows.filter((r) => !r.google && r.password).length,
    googleSoloActivos90d: A.filter((r) => r.lastSignIn >= since(90)).length, googleSoloSinPerfil: A.filter((r) => !r.hasProfile).length, deshabilitadas: rows.filter((r) => r.disabled).length };
  console.log(JSON.stringify(summary, null, 1));
  const day = new Date().toISOString().slice(0, 10);
  const table = (list) => ['| SL | Cliente | Correo | Teléfono | Último ingreso | Creada |', '|---|---|---|---|---|---|',
    ...sortRecent(list).map((r) => `| ${r.slCode || '—'} | ${r.name.replace(/\|/g, '/')} | ${r.email} | ${r.phone} | ${r.lastSignIn || '—'} | ${r.created} |`)].join('\n');
  const md = `# Cuentas de SP2 que ingresan con Google — ${day}

Auditoría SOLO LECTURA (\`scripts/audit/audit-google-signin.cjs\`). Datos personales: **no se sube a git**.

| | Cuentas |
|---|---:|
| Total de cuentas | ${summary.cuentas} |
| **A. Solo Google (sin contraseña)** — no podrán entrar si se quita Google | **${summary.googleSolo}** (activas últimos 90 días: ${summary.googleSoloActivos90d}) |
| B. Google + contraseña — seguirán entrando con correo y contraseña | ${summary.googleYContrasena} |
| C. Solo contraseña — no les afecta | ${summary.soloContrasena} |

## A. Solo Google (${A.length}) — necesitan una contraseña ANTES de quitar el botón

${table(A)}

## B. Google + contraseña (${B.length}) — solo avisarles que entren con correo y contraseña

${table(B)}
`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `google-signin-${emulator ? 'emulator' : 'prod'}-${day}.md`), md);
  fs.writeFileSync(path.join(OUT, `google-signin-${emulator ? 'emulator' : 'prod'}-${day}.json`), JSON.stringify({ summary, rows }, null, 1));
  console.log(`Lista: ${path.join(OUT, `google-signin-${emulator ? 'emulator' : 'prod'}-${day}.md`)}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
