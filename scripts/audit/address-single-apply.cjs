/**
 * Single-address cleanup (2026-09-29): each customer keeps ONLY the principal address, in SP2 (addresses
 * collection + the profile copy users.addresses / defaultAddress) and in the SP1 ficha (addresses / defaultAddress).
 * Input: the plan written by address-extras-plan.cjs (only status OK rows) + optional overrides file
 * { "<uid>": "<principal address id>" } for the conflict cases decided by the owner.
 * Simulation by default; --fix applies; --rollback <backup.json> restores every document.
 *
 * Per customer, BEFORE any write: full backup of the SP2 profile, every address doc and the SP1 ficha
 * (audit-output/addresses/<run>.json, flushed per customer) + log doc address_cleanup_log/<run>_<code> in SP1 and
 * SP2. The principal keeps all its data (street, details, notes, coordinates, encomienda); only the OTHER
 * addresses are removed. profileLastUpdatedBy = 'admin-address-cleanup' (admin change: no customer e-mail and no
 * route review — the principal does not change).
 *
 * Run: node scripts/audit/address-single-apply.cjs --plan audit-output/direcciones-extra-<date>.json [--overrides f.json] [--fix]
 *      node scripts/audit/address-single-apply.cjs --rollback audit-output/addresses/<file>.json
 */
'use strict';
const path = require('path');
const fs = require('fs');
const A = path.join(__dirname, '../../functions/node_modules/firebase-admin');
const { initializeApp, applicationDefault } = require(path.join(A, 'lib/app'));
const { getFirestore, Timestamp } = require(path.join(A, 'lib/firestore'));

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const EMU = process.env.EMU === '1';
const FIX = args.includes('--fix');
const cred = EMU ? {} : { credential: applicationDefault() };
const sp2 = getFirestore(initializeApp({ ...cred, projectId: EMU ? 'demo-sp-qa' : 'smart-portal-2' }, 'sp2'));
const sp1 = getFirestore(initializeApp({ ...cred, projectId: EMU ? 'demo-sp-qa' : 'smart-portal-admin' }, 'sp1'), 'portal');
const DBS = { sp1, sp2 };
const encode = (v) => v instanceof Timestamp ? { __ts: [v.seconds, v.nanoseconds] } : Array.isArray(v) ? v.map(encode) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) : v;
const decode = (v) => v && v.__ts ? new Timestamp(v.__ts[0], v.__ts[1]) : Array.isArray(v) ? v.map(decode) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)])) : v;
const OUTDIR = process.env.OUTDIR || path.join(__dirname, '../../audit-output/addresses');

async function rollback(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const c of b.customers) for (const d of c.docs) { const ref = DBS[d.db].doc(d.path); if (d.before === null) await ref.delete(); else await ref.set(decode(d.before)); n++; }
  console.log(`✅ Reversa: ${n} documentos restaurados (${b.customers.length} clientes).`);
}

async function main() {
  const planFile = arg('--plan'); if (!planFile) { console.error('Falta --plan'); process.exit(1); }
  const overrides = arg('--overrides') ? JSON.parse(fs.readFileSync(arg('--overrides'), 'utf8')) : {};
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8')).filter((p) => p.status === 'OK' || overrides[p.uid]);
  const run = `address-single-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.mkdirSync(OUTDIR, { recursive: true });
  const outFile = path.join(OUTDIR, `${run}${EMU ? '-QA' : ''}${FIX ? '' : '-simulacion'}.json`);
  const out = { run, fix: FIX, customers: [] }; const flush = () => fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`${FIX ? 'APLICAR' : 'SIMULACIÓN'} · ${EMU ? 'EMULADOR' : 'PRODUCCIÓN'} · ${plan.length} clientes`);
  let done = 0, skipped = 0, removed = 0;
  for (const p of plan) {
    const principal = overrides[p.uid] || p.principal;
    const userRef = sp2.collection('users').doc(p.uid);
    const [u, addrSnap] = await Promise.all([userRef.get(), sp2.collection('addresses').where('userId', '==', p.uid).get()]);
    const ficha = p.fichaSp1 ? await sp1.collection('customers').doc(p.fichaSp1).get() : null;
    const pDoc = addrSnap.docs.find((d) => d.id === principal);
    const problems = [];
    if (!u.exists) problems.push('sin perfil SP2');
    if (!pDoc) problems.push('la principal no existe en SP2');
    const extrasDocs = addrSnap.docs.filter((d) => d.id !== principal);
    const profileList = Array.isArray(u.get('addresses')) ? u.get('addresses') : [];
    const sp1List = ficha && Array.isArray(ficha.get('addresses')) ? ficha.get('addresses') : [];
    const nothing = !extrasDocs.length && profileList.filter((a) => a?.id && a.id !== principal).length === 0 && sp1List.filter((a) => a?.id && a.id !== principal).length === 0;
    const entry = { uid: p.uid, slCode: p.slCode, principal, extras: extrasDocs.map((d) => d.id), problems, docs: [] };
    if (problems.length || nothing) { entry.status = problems.length ? 'omitido' : 'ya estaba bien'; out.customers.push(entry); skipped++; console.log(`  · ${p.slCode} ${entry.status}${problems.length ? ': ' + problems.join('; ') : ''}`); continue; }
    const pData = pDoc.data();
    const principalEntry = { ...(profileList.find((a) => a?.id === principal) || {}), ...pData, id: principal, isPrimary: true, isDefault: true };
    const sp1Principal = sp1List.find((a) => a?.id === principal) || null;
    console.log(`  ${FIX ? '✔' : '·'} ${p.slCode}: queda "${pData.alias || ''} · ${String(pData.streetAddress || '').slice(0, 50)}" · se quitan ${extrasDocs.length} en SP2${sp1List.length > 1 ? ` y ${sp1List.length - (sp1Principal ? 1 : 0)} en SP1` : ''}`);
    removed += extrasDocs.length;
    if (!FIX) { out.customers.push({ ...entry, status: 'simulado' }); continue; }
    // backup first
    entry.docs.push({ db: 'sp2', path: userRef.path, before: encode(u.data()) });
    for (const d of addrSnap.docs) entry.docs.push({ db: 'sp2', path: d.ref.path, before: encode(d.data()) });
    if (ficha && ficha.exists) entry.docs.push({ db: 'sp1', path: ficha.ref.path, before: encode(ficha.data()) });
    out.customers.push(entry); flush();
    const now = new Date().toISOString();
    const logId = `${run}_${p.slCode || p.uid}`;
    const log = { run, slCode: p.slCode, uid: p.uid, principal, removed: entry.extras, at: now, by: 'address-single-apply', backupFile: path.basename(outFile), status: 'pending' };
    await Promise.all([sp1.collection('address_cleanup_log').doc(logId).set(log), sp2.collection('address_cleanup_log').doc(logId).set(log)]);
    // SP1 first (so the SP2 push finds the ficha already with one address), then SP2.
    if (ficha && ficha.exists && (sp1List.length > 1 || (ficha.get('defaultAddress')?.id && ficha.get('defaultAddress').id !== principal))) {
      const keep = sp1Principal ? [{ ...sp1Principal, isDefault: true, isActive: true }] : sp1List.filter((a) => a?.id === principal);
      const upd = { addresses: keep.length ? keep : sp1List, addressCleanupAt: now };
      if (keep.length) upd.defaultAddress = keep[0];
      await ficha.ref.update(upd);
    }
    const b = sp2.batch();
    for (const d of extrasDocs) b.delete(d.ref);
    b.update(pDoc.ref, { isPrimary: true, isDefault: true, status: pData.status || 'active' });
    b.update(userRef, { addresses: [principalEntry], defaultAddress: principalEntry, profileLastUpdatedBy: 'admin-address-cleanup', addressCleanupAt: now, updatedAt: now });
    await b.commit();
    await Promise.all([sp1.collection('address_cleanup_log').doc(logId).update({ status: 'done' }), sp2.collection('address_cleanup_log').doc(logId).update({ status: 'done' })]);
    entry.status = 'hecho'; flush(); done++;
  }
  flush();
  console.log(`\n${FIX ? 'Hechos' : 'A cambiar'}: ${FIX ? done : plan.length - skipped} · direcciones extra quitadas en SP2: ${removed} · omitidos/ya bien: ${skipped}\nRespaldo: ${outFile}`);
  if (FIX) console.log(`Reversa: node scripts/audit/address-single-apply.cjs --rollback "${outFile}"`);
}

(arg('--rollback') ? rollback(arg('--rollback')) : main()).then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
