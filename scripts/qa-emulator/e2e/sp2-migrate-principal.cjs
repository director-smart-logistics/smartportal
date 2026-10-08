// F12.3 — the ultra-safe migration (scripts/audit/migrate-principal-address.cjs) on the QA emulator,
// with its own legacy customers SL91001–SL91006 (address only in the `addresses` collection):
//   M1 normal → migrated; SP1 keeps printing the same        M2 legacy field names → migrated, same text
//   M3 two marked principal → NOT touched (review)            M4 SP1 prints another address → NOT touched
//   M5 the customer edits during the run → aborted, NOT touched
//   M6 SP1 changes after the write → that customer RESTORED and the run STOPS (exit 2)
//   re-run → nothing written (idempotent)                     --rollback <runId> → M1, M2 back as before
const { execFileSync } = require('child_process');
const path = require('path');
const DB2 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/(default)/documents';
const DB1 = 'http://localhost:8080/v1/projects/demo-sp-qa/databases/portal/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const SCRIPT = path.join(__dirname, '../../audit/migrate-principal-address.cjs');
const pause = (ms) => new Promise((s) => setTimeout(s, ms));
let ok = 0, n = 0; const check = (name, cond, detail = '') => { n++; if (cond) ok++; console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const val = (v) => v == null ? v : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'integerValue' in v ? Number(v.integerValue) : 'timestampValue' in v ? v.timestampValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(val)
  : 'mapValue' in v ? obj(v.mapValue.fields || {}) : undefined;
const obj = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));
const get = async (base, p) => { const r = await fetch(`${base}/${p}`, { headers: H }); return r.status === 200 ? obj((await r.json()).fields) : null; };
const s = (v) => ({ stringValue: v }); const b = (v) => ({ booleanValue: v });
const put = (base, p, fields) => fetch(`${base}/${p}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
const del = (base, p) => fetch(`${base}/${p}`, { method: 'DELETE', headers: H });
const run = (extra, env = {}) => {
  try { return { code: 0, out: execFileSync('node', [SCRIPT, ...extra], { env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'localhost:8080', GCLOUD_PROJECT: 'demo-sp-qa', ...env }, encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const addr = (street, extra = {}) => ({ streetAddress: s(street), province: s('Heredia'), canton: s('Barva'), district: s('San Pedro'), alias: s('Casa'),
  isActive: b(true), status: s('active'), isPrimary: b(true), isDefault: b(true), createdAt: { timestampValue: '2025-06-01T00:00:00Z' }, ...extra });

const C = [1, 2, 3, 4, 5, 6].map((i) => ({ uid: `e2e-mig-${i}`, sl: `SL9100${i}` }));

// Auth accounts (a users doc without one is deleted by SP2's orphan-profile guard, as in production).
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
const fnDir = path.join(__dirname, '../../../functions');
const { initializeApp } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getAuth } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/auth'));
const auth = getAuth(initializeApp({ projectId: 'demo-sp-qa' }, 'mig-e2e'));

async function seed() {
  for (const [i, c] of C.entries()) {
    await auth.deleteUser(c.uid).catch(() => {});
    await auth.createUser({ uid: c.uid, email: `mig${i + 1}@prueba.local`, password: 'Prueba1234!', emailVerified: true });
  }
  for (const c of C) { for (const id of [`MIG${c.sl}A`, `MIG${c.sl}B`]) await del(DB2, `addresses/${id}`); await del(DB2, `users/${c.uid}`); await del(DB1, `customers/${c.sl}`); await del(DB2, `address_migration_log/${c.uid}`); }
  await pause(1500);
  for (const [i, c] of C.entries()) {
    const withUser = (f) => ({ userId: s(c.uid), ...f });
    if (i === 1) await put(DB2, `addresses/MIG${c.sl}A`, withUser({ detail: s('M2 Barrio legado casa 7'), contactName: s('Ana Legado'), contactPhone: s('8888-9102'), deliveryNotes: s('Portón azul'), province: s('Heredia'), label: s('Casa'), isActive: b(true), status: s('active'), isPrimary: b(true), createdAt: { timestampValue: '2025-06-01T00:00:00Z' } }));
    else await put(DB2, `addresses/MIG${c.sl}A`, withUser(addr(`M${i + 1} Calle principal ${c.sl}`)));
    if (i === 2) await put(DB2, `addresses/MIG${c.sl}B`, withUser(addr(`M3 Otra marcada ${c.sl}`, { createdAt: { timestampValue: '2025-07-01T00:00:00Z' } })));
    await put(DB2, `users/${c.uid}`, { uid: s(c.uid), email: s(`mig${i + 1}@prueba.local`), slCode: s(c.sl), firstName: s('Migra'), lastName: s(`Cliente ${i + 1}`),
      status: s('active'), isActive: b(true), createdAt: { timestampValue: new Date().toISOString() } });
  }
  await pause(12000); // SP2 triggers create each SP1 customer with its address (several pushes: let them settle)
  // M4: SP1 prints another address. Re-apply until it sticks (a late push must not undo the scenario).
  for (let i = 0; i < 5; i++) {
    await put(DB1, `customers/${C[3].sl}?updateMask.fieldPaths=defaultAddress.streetAddress`, { defaultAddress: { mapValue: { fields: { streetAddress: s('M4 SP1 imprime OTRA') } } } });
    await pause(3000);
    if ((await get(DB1, `customers/${C[3].sl}`))?.defaultAddress?.streetAddress === 'M4 SP1 imprime OTRA') break;
  }
}

(async () => {
  await seed();
  const base = {}; for (const c of C) base[c.sl] = (await get(DB1, `customers/${c.sl}`))?.defaultAddress?.streetAddress;
  check('Preparación: cada cliente SP1 tiene su dirección (M4 con otra)', C.every((c) => base[c.sl]) && base.SL91004 === 'M4 SP1 imprime OTRA', JSON.stringify(base));

  // Dry-run: nothing written, the right people planned.
  const dry = run(['--sl', C.slice(0, 5).map((c) => c.sl).join(',')]);
  const u1dry = await get(DB2, `users/${C[0].uid}`);
  check('Dry-run: no escribe nada', !u1dry?.addressModel && /a migrar: 3/.test(dry.out), dry.out.split('\n').filter((l) => /a migrar|omitidos/.test(l)).join(' | '));

  // Apply on M1–M5 (M5 edited concurrently by the test hook).
  const ap = run(['--apply', '--sl', C.slice(0, 5).map((c) => c.sl).join(','), '--batch', '5', '--watch', '6'], { F12_TEST_MUTATE_UID: C[4].uid });
  const runId = (ap.out.match(/--rollback (\S+)/) || [])[1];
  const u = {}; for (const c of C) u[c.sl] = await get(DB2, `users/${c.uid}`);
  check('M1 migrada: un bloque limpio en el doc del usuario', u.SL91001?.addressModel === 'single-v1' && u.SL91001?.addresses?.length === 1 && u.SL91001?.defaultAddress?.streetAddress === 'M1 Calle principal SL91001' && u.SL91001?.profileLastUpdatedBy === 'system_migration');
  check('M2 nombres viejos → campos estándar, MISMO texto', u.SL91002?.addressModel === 'single-v1' && u.SL91002?.defaultAddress?.streetAddress === 'M2 Barrio legado casa 7' && u.SL91002?.defaultAddress?.recipientName === 'Ana Legado' && u.SL91002?.defaultAddress?.deliveryInstructions === 'Portón azul');
  check('M3 dos marcadas como principal → NO se toca (revisión)', !u.SL91003?.addressModel);
  check('M4 SP1 imprime otra → NO se toca (revisión)', !u.SL91004?.addressModel);
  check('M5 el cliente editó durante la corrida → abortado, NO se toca', !u.SL91005?.addressModel && /SL91005: la dirección cambió desde la foto/.test(ap.out));
  const after = {}; for (const c of C) after[c.sl] = (await get(DB1, `customers/${c.sl}`))?.defaultAddress?.streetAddress;
  check('SP1 imprime EXACTAMENTE lo mismo que antes (M1, M2)', after.SL91001 === base.SL91001 && after.SL91002 === base.SL91002, `${after.SL91001} / ${after.SL91002}`);
  check('La colección vieja no se tocó', (await get(DB2, `addresses/MIGSL91001A`))?.streetAddress === 'M1 Calle principal SL91001');
  const log1 = await get(DB2, `address_migration_log/${C[0].uid}`);
  check('Registro por cliente (antes/después/huellas)', log1?.result === 'migrated' && log1?.runId === runId && !!log1?.before && !!log1?.after);

  // Idempotent.
  const again = run(['--apply', '--sl', 'SL91001,SL91002', '--watch', '3']);
  check('Re-correr no escribe nada (ya migrados)', /a migrar: 0/.test(again.out) && /ya migrado: 2/.test(again.out));

  // M6: SP1 changes after the write → restored + stop.
  const brk = run(['--apply', '--sl', 'SL91006', '--watch', '8'], { F12_TEST_BREAK_SL: 'SL91006' });
  const u6 = await get(DB2, `users/${C[5].uid}`);
  const log6 = await get(DB2, `address_migration_log/${C[5].uid}`);
  check('M6 SP1 cambió tras escribir → RESTAURADO y la corrida se DETIENE', brk.code === 2 && !u6?.addressModel && log6?.result === 'restored', `exit=${brk.code}`);

  // Rollback of the first run.
  const rb = run(['--rollback', runId]);
  const r1 = await get(DB2, `users/${C[0].uid}`), r2 = await get(DB2, `users/${C[1].uid}`);
  check('--rollback devuelve M1 y M2 exactamente a como estaban', !r1?.addressModel && !r2?.addressModel && !r1?.addressMigration && /2 clientes restaurados/.test(rb.out), rb.out.trim().split('\n').pop());

  console.log(`\n${ok}/${n}`);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
