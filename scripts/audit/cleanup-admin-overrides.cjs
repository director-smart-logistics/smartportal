/**
 * F11.3 (docs/F11_LABEL_ADDRESS_AUDIT.md) — hand-typed label addresses (SP1 customers.adminAddressOverride)
 * saved before F11 have no date, so they win over the customer's address FOREVER, and SP2 never learned
 * the admin's correction. This script puts SP1 and SP2 in sync. NOTHING IS EVER DELETED.
 *
 * Each override is classified:
 *   IGUAL     the label prints the same without it → only its date is added (savedAt). The label prints
 *             exactly the same; from now on it follows the customer's address.
 *   A_SP2     different, and the admin wrote it AFTER the customer's last address change (date of the last
 *             label printed with that text, shippingLabels) → the correction is written to the customer's
 *             principal address in SP2 with the F11.2 writer (functions/lib/customers/label-address-sp2-writer.js:
 *             street / otras señas / instrucciones replaced only by non-empty values, province/canton/district
 *             kept, before/after logged). SP2 pushes it to SP1 at once. Then the override gets its date.
 *   REVISAR   anything else (the customer changed the address later, unknown dates, other encomienda
 *             service, no customer address, ambiguous…) → only reported. A person decides.
 *
 * SAFETY: dry-run unless --apply; production only with --prod, and --apply in production needs --sl or
 * --limit (gradual); SP1 writes only ADD fields (savedAt, savedAtSource) inside a transaction that skips the
 * customer if the override changed; log in admin_override_cleanup_log/{runId}_{SL}; --rollback <runId>
 * removes only what this run added and restores the SP2 address (unless the customer edited it since).
 * The report (personal data) goes to audit-output/ (gitignored).
 *
 * Usage
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-sp-qa node scripts/audit/cleanup-admin-overrides.cjs [--apply]
 *   node scripts/audit/cleanup-admin-overrides.cjs --prod                               # dry-run + report
 *   node scripts/audit/cleanup-admin-overrides.cjs --prod --apply --sl SL25001           # ONLY with approval
 *   node scripts/audit/cleanup-admin-overrides.cjs --prod --rollback <runId>            # undo a run
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore, FieldValue } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));
const { parseLabelAddressText } = require(path.join(fnDir, 'lib/customers/label-address-sp2.js'));

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const APPLY = args.includes('--apply');
const ROLLBACK = arg('--rollback', '');
const ONLY_SL = new Set(String(arg('--sl', '')).toUpperCase().split(',').map((x) => x.trim()).filter(Boolean));
const LIMIT = Number(arg('--limit', '0')) || Infinity;
const SP2_WRITES = args.includes('--sp2');   // A_SP2 writes: only once SP1 and SP2 (F11/F12) are deployed
let stopped = false;
const emulator = /^(localhost|127\.0\.0\.1):/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const PROD = args.includes('--prod');
// Test hook — emulator only: simulate a write that loses information, to prove the precision stop.
const TEST_BREAK_SL = emulator ? String(process.env.F113_TEST_BREAK_SL || '').toUpperCase() : '';
const isMain = require.main === module;
if (isMain && !emulator && !PROD) { console.error('❌ Use the QA emulator or pass --prod explicitly.'); process.exit(1); }
if (isMain && emulator && !String(process.env.GCLOUD_PROJECT || '').startsWith('demo-')) { console.error('❌ Emulator run requires a demo- GCLOUD_PROJECT.'); process.exit(1); }
if (isMain && PROD && APPLY && !ONLY_SL.size && LIMIT === Infinity) { console.error('❌ In production --apply needs --sl or --limit (gradual).'); process.exit(1); }

const OUT = arg('--out', path.join(__dirname, '../../audit-output'));
const runId = ROLLBACK || `${new Date().toISOString().replace(/[:.]/g, '-')}${emulator ? '-emu' : ''}`;
const LOG = 'admin_override_cleanup_log';
const BY = 'F11.3 (script)';

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const toMs = (v) => (!v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v.seconds === 'number' ? v.seconds * 1000 : typeof v === 'number' ? v : (Date.parse(String(v)) || 0));
const iso = (ms) => (ms ? new Date(ms).toISOString() : '');
const isActive = (a) => !!a && a.isActive !== false && a.status !== 'inactive';
const hasText = (a) => !!(String(a.streetAddress || '').trim() || String(a.province || '').trim());
/** Same as client/lib/customers/label-address.ts principalLabelAddress. */
function principalLabelAddress(c) {
  if (isActive(c.defaultAddress) && hasText(c.defaultAddress)) return c.defaultAddress;
  const list = (c.addresses || []).filter((a) => isActive(a) && hasText(a));
  return list.find((a) => a.isDefault || a.isPrimary) || list[0] || null;
}
/** Every encomienda service name the customer carries (conservative). */
const customerServices = (c, p) => [p?.encomienda?.name, p?.courierService, c.encomiendaServiceName, c.encomiendaProvider, c.encomienda?.name].filter(Boolean).map(clean);
/** What a label text says, field by field (to recognise the same text in the label history). */
const textKey = (text) => { const t = parseLabelAddressText(text); return [t.streetAddress, t.details, t.deliveryInstructions].map(clean).join('|'); };

/**
 * Content, not dates (2026-09-26): the customer's address date also moves when SP2 re-pushes after an
 * admin saves the encomienda service, so "who is newer" cannot be known from dates. What matters is that
 * NO INFORMATION IS LOST: every word and number of dirección / otras señas / instrucciones is compared.
 * Accents and upper/lower case are ignored; numbers always count; a few connector words do not.
 */
const STOP = new Set(['de', 'la', 'el', 'en', 'y', 'a', 'del', 'los', 'las', 'con', 'por', 'para', 'al', 'un', 'una', 'e', 'o', 'instrucciones', 'detalles', 'senas']);
function tokens(s) {
  return new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ').filter((w) => w && !STOP.has(w)));
}
const geoTokens = (p) => tokens([p.district, p.canton, p.province, p.city, p.country].filter(Boolean).join(' '));
const customerTokens = (p) => tokens([p.streetAddress, p.details, p.deliveryInstructions].filter(Boolean).join(' '));
/** What each side has that the other does not (geography of the customer's address is not "new"). */
function contentDiff(text, p) {
  const geo = geoTokens(p), cust = customerTokens(p), admin = tokens(text);
  return {
    adminOnly: [...admin].filter((w) => !cust.has(w) && !geo.has(w)),
    customerOnly: [...cust].filter((w) => !admin.has(w)),
  };
}
/** The label text for SP2: lines that only repeat the customer's district/canton/province are left out. */
function textForSp2(text, p) {
  const geo = geoTokens(p);
  return String(text || '').split(/\r?\n/).filter((l) => { const t = tokens(l.replace(/^instrucciones\s*:/i, '')); return !t.size || [...t].some((w) => !geo.has(w)); }).join('\n');
}

/**
 * IGUAL / A_SP2 / REVISAR / YA_FECHADA / VACIO. Pure — exported for the unit test.
 *   IGUAL    same content (only format differs)             → only its date is added
 *   A_SP2    the admin ADDED information and lacks nothing    → written to SP2 (nothing is lost)
 *   REVISAR  the customer's has something the admin's lacks, both have their own information,
 *            another encomienda service, no customer address → untouched (the label prints as today)
 */
function classify(c) {
  const o = c.adminAddressOverride;
  if (!o || !clean(o.deliveryAddress)) return { kind: 'VACIO' };
  if (o.savedAt) return { kind: 'YA_FECHADA', why: 'ya tiene fecha' };
  const p = principalLabelAddress(c);
  if (!p) return { kind: 'REVISAR', why: 'el cliente no tiene dirección' };
  const oc = clean(o.courierService || o.encomiendaService);
  if (oc && !customerServices(c, p).includes(oc)) return { kind: 'REVISAR', why: 'otro servicio de encomienda' };
  if (!parseLabelAddressText(o.deliveryAddress).streetAddress) return { kind: 'REVISAR', why: 'la escrita a mano no trae dirección' };
  const d = contentDiff(o.deliveryAddress, p);
  if (!d.adminOnly.length && !d.customerOnly.length) return { kind: 'IGUAL', ...d };
  if (d.adminOnly.length && !d.customerOnly.length) return { kind: 'A_SP2', why: `el admin agregó: ${d.adminOnly.join(' ')}`, ...d };
  if (!d.adminOnly.length) return { kind: 'REVISAR', why: `la del cliente trae lo que la escrita a mano no tiene (hoy la etiqueta no lo imprime): ${d.customerOnly.join(' ')}`, ...d };
  return { kind: 'REVISAR', why: `las dos tienen información propia — admin: ${d.adminOnly.join(' ')} · cliente: ${d.customerOnly.join(' ')}`, ...d };
}

module.exports = { classify, textKey, tokens, contentDiff, textForSp2 };
if (!isMain) return;

const sp2 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp2') : initializeApp({ projectId: 'smart-portal-2', credential: applicationDefault() }, 'sp2'));
const sp1 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp1') : initializeApp({ projectId: 'smart-portal-admin', credential: applicationDefault() }, 'sp1'), 'portal');
const { updateSp2PrincipalFromLabel, restoreSp2Principal } = require(path.join(fnDir, 'lib/customers/label-address-sp2-writer.js'));

/** Last time a label was printed for this SL with the same address text (ms, 0 = none). */
async function lastAdminUse(sl, text) {
  const key = textKey(text);
  const labels = await sp1.collection('shippingLabels').where('customerSlCode', '==', sl).get();
  return Math.max(0, ...labels.docs.map((d) => d.data()).filter((l) => textKey(l.recipientAddress || '') === key).map((l) => toMs(l.createdAt)));
}

/** Adds the date to the override (only if it did not change since it was read). Nothing else is written. */
async function stampOverride(sl, expected, savedAt, logData) {
  const ref = sp1.collection('customers').doc(sl);
  return sp1.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() || {};
    if (JSON.stringify(cur.adminAddressOverride) !== JSON.stringify(expected)) return 'changed';
    tx.update(ref, { 'adminAddressOverride.savedAt': savedAt, 'adminAddressOverride.savedAtSource': 'F11.3' });
    tx.set(sp1.collection(LOG).doc(`${runId}_${sl}`), { runId, sl, override: expected, savedAt, ...logData, at: FieldValue.serverTimestamp() });
    return 'stamped';
  });
}

async function rollback() {
  const logs = await sp1.collection(LOG).where('runId', '==', runId).get();
  let n = 0;
  for (const d of logs.docs) {
    const x = d.data();
    if (x.result === 'rolled-back') continue;
    let sp2Result = null;
    if (x.sp2?.changed) sp2Result = await restoreSp2Principal(sp2, x.sl, x.sp2.before, x.sp2.after, BY);
    await sp1.collection('customers').doc(x.sl).update({ 'adminAddressOverride.savedAt': FieldValue.delete(), 'adminAddressOverride.savedAtSource': FieldValue.delete() });
    await d.ref.update({ result: 'rolled-back', sp2Rollback: sp2Result, rolledBackAt: FieldValue.serverTimestamp() });
    console.log(`  ↩️  ${x.sl}${sp2Result ? ` (SP2: ${sp2Result === 'restored' ? 'restaurada' : 'el cliente la cambió después — se deja la suya'})` : ''}`);
    n++;
  }
  console.log(`↩️  ${n} revertidas (run ${runId})`);
}

async function main() {
  if (ROLLBACK) return rollback();
  const snap = await sp1.collection('customers').where('adminAddressOverride', '!=', null).get();
  const rows = [];
  for (const d of snap.docs) {
    if (ONLY_SL.size && !ONLY_SL.has(d.id)) continue;
    const c = d.data();
    const o = c.adminAddressOverride;
    const adminMs = o?.deliveryAddress && !o.savedAt ? await lastAdminUse(d.id, o.deliveryAddress) : 0;
    const r = classify(c);
    if (r.kind !== 'VACIO') rows.push({ sl: d.id, c, r, adminMs });
  }
  const by = (k) => rows.filter((x) => x.r.kind === k);
  console.log(`Escritas a mano: ${rows.length} — IGUALES (mismo contenido): ${by('IGUAL').length} — A_SP2 (el admin agregó información): ${by('A_SP2').length} — A REVISAR: ${by('REVISAR').length} — ya fechadas: ${by('YA_FECHADA').length}`);

  const done = [];
  if (APPLY) {
    const kinds = SP2_WRITES ? ['IGUAL', 'A_SP2'] : ['IGUAL'];
    if (!SP2_WRITES && by('A_SP2').length) console.log(`  (las ${by('A_SP2').length} A_SP2 no se escriben: falta --sp2, que va solo después de desplegar SP1 y SP2)`);
    for (const x of rows.filter((r) => kinds.includes(r.r.kind)).slice(0, LIMIT)) {
      const o = x.c.adminAddressOverride;
      let sp2Res = null;
      try {
        const stampAt = new Date().toISOString();   // before the SP2 write → the SP2 address (newer) is what labels print
        if (x.r.kind === 'A_SP2') {
          const p = principalLabelAddress(x.c);
          const text = textForSp2(o.deliveryAddress, p);
          sp2Res = await updateSp2PrincipalFromLabel(sp1, sp2, { slCode: x.sl, text, by: BY, source: 'F11.3', runId });
          // PRECISION CHECK: the SP2 address must contain every word/number of BOTH versions.
          if (TEST_BREAK_SL === x.sl) await sp2.collection('users').doc(sp2Res.uid).update({ 'defaultAddress.details': 'PERDIDA (prueba)' });
          const now = (await sp2.collection('users').doc(sp2Res.uid).get()).data()?.defaultAddress || {};
          const have = customerTokens(now);
          const geo = geoTokens(now);
          const missing = [...tokens(text), ...customerTokens(p)].filter((w) => !have.has(w) && !geo.has(w));
          if (missing.length) {
            if (sp2Res.changed) await restoreSp2Principal(sp2, x.sl, sp2Res.before, sp2Res.after, BY);
            console.log(`  🛑 ${x.sl}: faltaría información (${missing.join(' ')}) → SP2 restaurada. La corrida SE DETIENE.`);
            done.push({ ...x, res: 'detenido', err: `faltaría: ${missing.join(' ')}` });
            stopped = true;
            break;
          }
        }
        const res = await stampOverride(x.sl, o, stampAt,
          { kind: x.r.kind, result: 'stamped', sp2: sp2Res ? { changed: sp2Res.changed, before: sp2Res.before, after: sp2Res.after || null } : null });
        done.push({ ...x, res, sp2: sp2Res?.changed ? 'actualizada' : sp2Res ? 'ya igual' : '' });
        console.log(`  ${res === 'stamped' ? '✅' : '↷'} ${x.sl} ${x.r.kind}${sp2Res ? ` — SP2 ${sp2Res.changed ? 'actualizada' : 'ya igual'}` : ''}${res === 'changed' ? ' (cambió durante la corrida, no se fechó)' : ''}`);
      } catch (e) {
        done.push({ ...x, res: 'error', err: e.message });
        console.log(`  ❌ ${x.sl}: ${e.message} — no se tocó`);
      }
    }
    console.log(`Listo (run ${runId}). Revertir: --rollback ${runId}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const md = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 160);
  const p = (c) => principalLabelAddress(c) || {};
  const line = (x) => `| ${x.sl} | ${x.r.why || ''} | ${md(x.c.adminAddressOverride.deliveryAddress)} | ${md(x.c.adminAddressOverride.courierService)} | ${md([p(x.c).streetAddress, p(x.c).details, p(x.c).deliveryInstructions].filter(Boolean).join(' / '))} |`;
  const head = ['| SL | Motivo | Escrita a mano | Servicio | Dirección del cliente (dirección / otras señas / instrucciones) |', '|---|---|---|---|---|'];
  const file = path.join(OUT, `f11-overrides-${runId}.md`);
  fs.writeFileSync(file, [
    `# F11.3 — direcciones escritas a mano en etiquetas (${PROD ? 'producción' : 'emulador'}, ${APPLY ? 'APLICADO' : 'dry-run'})`, '',
    `Total ${rows.length} · iguales ${by('IGUAL').length} · el admin agregó información → SP2 ${by('A_SP2').length} · a revisar ${by('REVISAR').length} · ya fechadas ${by('YA_FECHADA').length}`, '',
    'Regla por CONTENIDO (cada palabra y número de dirección, otras señas e instrucciones). Nada se borra: a las iguales solo se les agrega la fecha; las A_SP2 se escriben en SP2 y se verifica que no falte ninguna palabra de ninguna de las dos versiones.', '',
    '## El admin agregó información (y no le falta nada de la del cliente) → se pasa a SP2', '', ...head, ...by('A_SP2').map(line), '',
    '## A revisar (no se tocan)', '', ...head, ...by('REVISAR').map(line), '',
    '## Iguales (solo se les agrega la fecha)', '', ...by('IGUAL').map((x) => `- ${x.sl}`), '',
    ...(APPLY ? ['## Resultado', '', ...done.map((x) => `- ${x.sl} ${x.r.kind}: ${x.res}${x.sp2 ? ` · SP2 ${x.sp2}` : ''}${x.err ? ` · ${x.err}` : ''}`), ''] : []),
  ].join('\n'));
  console.log(`📄 ${path.relative(process.cwd(), file)}`);
}

main().then(() => process.exit(stopped ? 2 : 0)).catch((e) => { console.error(e); process.exit(1); });
