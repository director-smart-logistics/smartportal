// F12 — a customer's ONE address lives in their SP2 users doc and reaches the SP1 customer at once.
// Runs the REAL app code: logs into the local SP2 app (http://localhost:5175, QA emulator) as a brand-new
// customer and calls the app's own `api.user.addresses` module (same session, same security rules).
// Checks after each step: users/{uid} (single-v1, one clean block), the collection transition copy,
// the SP1 customer (what every shipping label prints), and that nothing else was written.
//   1. new customer (registration) → first address  2. edit  3. list  4. a legacy extra address marked
//   principal loses the mark, the principal does not change  5. unmark-only update of another address
//   6. the denormalizer never rebuilds the users doc from the collection  7. delete
// Run: NODE_PATH=<playwright dir>/node_modules node scripts/qa-emulator/e2e/sp2-principal-address.cjs
const { chromium } = require('playwright');
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const AUTH = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const EMAIL = 'cliente3@prueba.local', SL = 'SL90003', PASS = 'Prueba1234!';
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// Firestore REST value → plain JS
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'timestampValue' in v ? v.timestampValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : 'mapValue' in v ? obj(v.mapValue.fields || {}) : undefined;
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
const getDoc = async (base, path) => { const r = await fetch(`${base}/${path}`, { headers: H }); return r.status === 200 ? obj((await r.json()).fields) : null; };
const addressesOf = async (uid) => ((await (await fetch(`${DB2}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: {
  from: [{ collectionId: 'addresses' }], where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: uid } } } } }) })).json())
  .filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), ...obj(r.document.fields) })));
const sp1Default = async () => (await getDoc(DB1, `customers/${SL}`))?.defaultAddress || null;
const waitSp1 = async (pred, ms = 20000) => { const t0 = Date.now(); let d; while (Date.now() - t0 < ms) { d = await sp1Default(); if (pred(d)) return { d, s: ((Date.now() - t0) / 1000).toFixed(1) }; await pause(500); } return { d, s: `>${ms / 1000}` }; };

async function setup() {
  // Fresh customer, as a registration leaves it: auth account + users doc (no address), SP1 customer by the trigger.
  const signUp = await (await fetch(`${AUTH}:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json();
  const uid = signUp.localId || (await (await fetch(`${AUTH}:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }) })).json()).localId;
  // Clean what a previous run left for THIS account (its real auth uid).
  for (const a of await addressesOf(uid)) await fetch(`${DB2}/addresses/${a.id}`, { method: 'DELETE', headers: H });
  await fetch(`${DB2}/users/${uid}`, { method: 'DELETE', headers: H });
  await fetch(`${DB1}/customers/${SL}`, { method: 'DELETE', headers: H });
  await pause(1500);
  const s = (v) => ({ stringValue: v });
  await fetch(`${DB2}/users/${uid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
    uid: s(uid), email: s(EMAIL), slCode: s(SL), firstName: s('Cliente'), lastName: s('Tres'), dni: s('100090004'), phone: s('88880003'),
    role: s('customer'), status: s('active'), isActive: { booleanValue: true }, isVerified: { booleanValue: true }, showVerificationModal: { booleanValue: false },
    createdAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
  return uid;
}

(async () => {
  const uid = await setup();
  await pause(4000);
  check('0. Registro: el cliente existe en SP1 (creado por el trigger de SP2)', !!(await getDoc(DB1, `customers/${SL}`)), `uid=${uid}`);

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); return (['localhost', '127.0.0.1'].includes(u.hostname) || ['data:', 'blob:'].includes(u.protocol) || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname)) ? r.continue() : r.abort(); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => { if (!/Failed to fetch/.test(e.message)) errors.push(e.message.slice(0, 140)); });
  await page.goto('http://localhost:5175/'); await page.waitForTimeout(6000);
  await page.getByRole('button', { name: /Aceptar todo/ }).click().catch(() => {});
  await page.getByText('Ingresar', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2500);
  await page.locator('input[type=email]').first().fill(EMAIL); await page.locator('input[type=password]').first().fill(PASS);
  await page.locator('button[type=submit]').first().click(); await page.waitForTimeout(9000);
  const call = (fn, ...args) => page.evaluate(async ([fn, args]) => {
    const { api } = await import('/src/infrastructure/api/index.ts');
    const r = await api.user.addresses[fn](...args);
    return JSON.parse(JSON.stringify(r ?? null));
  }, [fn, args]);

  // 1. First address (what the onboarding / address modal does).
  const first = await call('create', { alias: 'Casa', type: 'residence', country: 'Costa Rica', province: 'Heredia', canton: 'Barva', district: 'San Pedro',
    streetAddress: 'F12 Calle Uno casa 3', details: 'Portón verde', recipientName: 'Cliente Tres', recipientPhone: '8888-0003', deliveryInstructions: 'Llamar antes', requiresEncomienda: false, isDefault: true, isPrimary: true, isActive: true, status: 'active' });
  let u = await getDoc(DB2, `users/${uid}`);
  let col = await addressesOf(uid);
  check('1. Primera dirección → queda en el doc del usuario (single-v1, un solo bloque)', u?.addressModel === 'single-v1' && u?.defaultAddress?.id === first.id && u?.addresses?.length === 1 && u.addresses[0].id === first.id,
    `model=${u?.addressModel} addresses=${u?.addresses?.length}`);
  check('1. El bloque es el mismo texto que se escribió (nada se reescribe)', u?.defaultAddress?.streetAddress === 'F12 Calle Uno casa 3' && u?.defaultAddress?.details === 'Portón verde' && u?.defaultAddress?.deliveryInstructions === 'Llamar antes' && u?.defaultAddress?.isPrimary === true);
  check('1. Copia de transición en la colección (mismo id)', col.length === 1 && col[0].id === first.id && col[0].streetAddress === 'F12 Calle Uno casa 3');
  let r = await waitSp1((d) => d?.streetAddress === 'F12 Calle Uno casa 3');
  check('1. SP1 la tiene de inmediato (etiquetas)', r.d?.streetAddress === 'F12 Calle Uno casa 3' && r.d?.id === first.id, `${r.s}s`);

  // 2. Edit.
  await call('update', first.id, { streetAddress: 'F12 Calle Dos casa 9' });
  u = await getDoc(DB2, `users/${uid}`);
  check('2. Editar → el mismo bloque cambia, sigue siendo una sola', u?.addresses?.length === 1 && u?.defaultAddress?.streetAddress === 'F12 Calle Dos casa 9' && u?.defaultAddress?.details === 'Portón verde' && u?.defaultAddress?.createdAt === first.createdAt,
    `createdAt ${u?.defaultAddress?.createdAt === first.createdAt ? 'conservado' : 'CAMBIÓ'}`);
  r = await waitSp1((d) => d?.streetAddress === 'F12 Calle Dos casa 9');
  check('2. SP1 recibe la edición', r.d?.streetAddress === 'F12 Calle Dos casa 9', `${r.s}s`);

  // 3. List.
  const list = await call('list');
  check('3. list() devuelve solo la principal', Array.isArray(list) && list.length === 1 && list[0].id === first.id);

  // 4. A legacy extra address in the collection, marked principal (as old data may have).
  await fetch(`${DB2}/addresses/F12LEGACY_${uid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
    userId: { stringValue: uid }, alias: { stringValue: 'Vieja' }, streetAddress: { stringValue: 'F12 Dirección vieja' }, province: { stringValue: 'Heredia' },
    isPrimary: { booleanValue: true }, isDefault: { booleanValue: true }, isActive: { booleanValue: true }, status: { stringValue: 'active' }, createdAt: { timestampValue: '2025-01-01T00:00:00Z' } } }) });
  await pause(5000);
  u = await getDoc(DB2, `users/${uid}`);
  check('6. El denormalizador NO reconstruye el doc del usuario desde la colección', u?.addresses?.length === 1 && u?.defaultAddress?.id === first.id, `addresses=${JSON.stringify((u?.addresses || []).map((a) => [a.id, a.streetAddress, a.updatedBy]))} by=${u?.profileLastUpdatedBy}`);
  r = await waitSp1(() => true, 1);
  check('4. SP1 sigue imprimiendo la principal (no la vieja)', r.d?.streetAddress === 'F12 Calle Dos casa 9', r.d?.streetAddress);
  await call('update', first.id, { deliveryInstructions: 'Llamar antes (2)' });
  col = await addressesOf(uid);
  const legacy = col.find((a) => a.id === `F12LEGACY_${uid}`);
  check('4. Guardar la principal quita la marca a la vieja (sus datos intactos)', legacy && !legacy.isPrimary && !legacy.isDefault && legacy.streetAddress === 'F12 Dirección vieja');

  // 5. Unmark-only update of another address (old "mark as principal" loop).
  await call('update', `F12LEGACY_${uid}`, { isPrimary: false, isDefault: false });
  u = await getDoc(DB2, `users/${uid}`);
  check('5. Quitar la marca a otra dirección NO la vuelve principal', u?.defaultAddress?.id === first.id && u?.addresses?.length === 1);

  // 7. Delete.
  await call('delete', first.id);
  u = await getDoc(DB2, `users/${uid}`);
  col = await addressesOf(uid);
  check('7. Borrar → el usuario queda sin dirección y sin copia', !u?.defaultAddress && (u?.addresses || []).length === 0 && !col.some((a) => a.id === first.id));
  r = await waitSp1((d) => !d || !d.streetAddress || d.streetAddress !== 'F12 Calle Dos casa 9');
  check('7. SP1 deja de imprimir esa dirección', !r.d || r.d.streetAddress !== 'F12 Calle Dos casa 9', `${r.s}s → "${r.d?.streetAddress || ''}"`);

  check('Sin errores de página', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
