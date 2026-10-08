/**
 * READ-ONLY audit (F11/F12): does every SP1 customer have the RIGHT principal address — the one
 * the customer has in SP2 — and which customers need a person to review their address?
 * Never writes: only get() calls on SP1 (customers) and SP2 (users, addresses).
 *
 * A shipping label / encomienda manifest prints SP1 customers/{slCode}.defaultAddress (or a
 * hand-typed adminAddressOverride). A wrong address = a package delivered to the wrong place, so
 * this report is the baseline before any change (docs/F12_ADDRESS_STRUCTURE_PLAN.md).
 *
 * The principal rule and the compared fields live in address-principal.cjs (shared with the
 * migration, so the audit and the migration always decide the same thing).
 *
 * Usage
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-sp-qa node scripts/audit/audit-customer-addresses.cjs
 *   node scripts/audit/audit-customer-addresses.cjs --prod            # SP1 smart-portal-admin + SP2 smart-portal-2
 *   [--out <folder>]  (default audit-output/, git-ignored: the report contains customers' addresses)
 * Output: summary on screen + <out>/customer-addresses-<date>.md (review list) + .json (all data).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const fnDir = path.join(__dirname, '../../functions');
const { initializeApp, applicationDefault } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/app'));
const { getFirestore } = require(path.join(fnDir, 'node_modules/firebase-admin/lib/firestore'));

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const emulator = /^(localhost|127\.0\.0\.1):/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
const PROD = args.includes('--prod');
if (!emulator && !PROD) { console.error('❌ Use the QA emulator or pass --prod explicitly (read-only).'); process.exit(1); }
if (emulator && !String(process.env.GCLOUD_PROJECT || '').startsWith('demo-')) { console.error('❌ Emulator run requires a demo- GCLOUD_PROJECT.'); process.exit(1); }
const OUT = arg('--out', path.join(__dirname, '../../audit-output'));

const { clean, sameAddress, differingFields, hasAddress, principalOf } = require('./address-principal.cjs');
const oneLine = (a) => !a ? '—' : [a.streetAddress, a.details, [a.district, a.canton, a.province].filter(Boolean).join(', ')].filter((x) => clean(x)).join(' · ');

(async () => {
  const sp2 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp2') : initializeApp({ projectId: 'smart-portal-2', credential: applicationDefault() }, 'sp2'));
  const sp1 = getFirestore(emulator ? initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'sp1') : initializeApp({ projectId: 'smart-portal-admin', credential: applicationDefault() }, 'sp1'), 'portal');
  console.log(`READ-ONLY audit on ${emulator ? 'emulator' : 'PRODUCTION'}…`);
  const [users, addrs, customers] = await Promise.all([sp2.collection('users').get(), sp2.collection('addresses').get(), sp1.collection('customers').get()]);

  const addrsByUser = new Map();
  for (const d of addrs.docs) { const u = d.get('userId'); if (u) (addrsByUser.get(u) || addrsByUser.set(u, []).get(u)).push({ id: d.id, ...d.data() }); }
  const userIds = new Set(users.docs.map((d) => d.id));
  const customersBySl = new Map(customers.docs.map((d) => [String(d.id).toUpperCase(), d.data()]));

  const rows = [];
  for (const u of users.docs) {
    const x = u.data(); const sl = String(x.slCode || '').toUpperCase();
    const c = sl ? customersBySl.get(sl) : undefined;
    const sp1Default = c?.defaultAddress && hasAddress(c.defaultAddress) ? c.defaultAddress : null;
    const embedded = [x.defaultAddress, ...(Array.isArray(x.addresses) ? x.addresses : [])].filter((a) => a && typeof a === 'object');
    const p = principalOf(addrsByUser.get(u.id) || [], embedded, sp1Default);
    const override = c?.adminAddressOverride?.deliveryAddress ? String(c.adminAddressOverride.deliveryAddress) : '';
    let status;
    if (!sl) status = 'user-without-slcode';
    else if (!c) status = 'no-sp1-customer';
    else if (!p.principal && !sp1Default) status = 'no-address-anywhere';
    else if (!p.principal) status = 'only-sp1-has-address';
    else if (!sp1Default) status = 'sp1-missing-address';
    else if (sameAddress(p.principal, sp1Default)) status = 'ok';
    else status = 'sp1-differs';
    rows.push({
      uid: u.id, sl, name: [x.firstName, x.lastName].filter(Boolean).join(' ') || x.displayName || '', ruta: c?.ruta || '',
      status, source: p.source, activeAddresses: p.active, ambiguousPrincipal: p.ambiguous,
      sp2: p.principal ? { id: p.principal.id, text: oneLine(p.principal), updatedAt: String(p.principal.updatedAt?.toDate?.()?.toISOString?.() || p.principal.updatedAt || '') } : null,
      sp1: sp1Default ? { id: sp1Default.id || null, text: oneLine(sp1Default), updatedAt: String(sp1Default.updatedAt || '') } : null,
      differingFields: p.principal && sp1Default ? differingFields(p.principal, sp1Default) : [],
      override: override ? { text: override.replace(/\s+/g, ' ').slice(0, 200), matchesSp2: !!p.principal && clean(override).includes(clean(p.principal.streetAddress).slice(0, 25)), courier: c.adminAddressOverride.courierService || '' } : null,
    });
  }
  const orphanDocs = addrs.docs.filter((d) => d.get('userId') && !userIds.has(d.get('userId'))).map((d) => ({ id: d.id, userId: d.get('userId'), text: oneLine(d.data()) }));
  const sp2Sl = new Set(rows.map((r) => r.sl).filter(Boolean));
  const sp1Only = customers.docs.filter((d) => !sp2Sl.has(String(d.id).toUpperCase())).map((d) => ({ sl: d.id, name: d.get('fullName') || '', ruta: d.get('ruta') || '', hasAddress: hasAddress(d.get('defaultAddress')) }));

  const count = (f) => rows.filter(f).length;
  const summary = {
    at: new Date().toISOString(), sp2Users: users.size, sp1Customers: customers.size, sp2AddressDocs: addrs.size,
    ok: count((r) => r.status === 'ok'),
    sp1Differs: count((r) => r.status === 'sp1-differs'),
    sp1MissingAddress: count((r) => r.status === 'sp1-missing-address'),
    onlySp1HasAddress: count((r) => r.status === 'only-sp1-has-address'),
    noAddressAnywhere: count((r) => r.status === 'no-address-anywhere'),
    noSp1Customer: count((r) => r.status === 'no-sp1-customer'),
    userWithoutSlCode: count((r) => r.status === 'user-without-slcode'),
    severalActiveAddresses: count((r) => r.activeAddresses > 1),
    ambiguousPrincipal: count((r) => r.ambiguousPrincipal),
    overrides: count((r) => r.override), overridesDifferentFromSp2: count((r) => r.override && !r.override.matchesSp2),
    orphanAddressDocs: orphanDocs.length, sp1CustomersWithoutSp2User: sp1Only.length,
  };
  console.log(JSON.stringify(summary, null, 1));

  // ── Review document (Markdown) ─────────────────────────────────────────────
  const day = summary.at.slice(0, 10);
  const md = [];
  const table = (title, why, list, cols) => {
    md.push(`\n## ${title} (${list.length})\n\n${why}\n`);
    if (!list.length) { md.push('_Ninguno._'); return; }
    md.push(`| ${cols.map((c) => c[0]).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`);
    for (const r of list) md.push(`| ${cols.map((c) => String(c[1](r) ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`);
  };
  md.push(`# Revisión de direcciones de clientes — ${day}`, '',
    `Auditoría SOLO LECTURA (\`scripts/audit/audit-customer-addresses.cjs\`). Contiene datos personales: **no se sube a git**.`, '',
    '## Resumen', '', '| | Clientes |', '|---|---:|',
    `| ✅ SP1 tiene exactamente la dirección principal de SP2 (la etiqueta imprime la correcta) | ${summary.ok} |`,
    `| ⚠️ SP1 imprime una dirección DISTINTA a la principal de SP2 | ${summary.sp1Differs} |`,
    `| ⚠️ SP2 tiene dirección y SP1 no | ${summary.sp1MissingAddress} |`,
    `| ⚠️ Solo SP1 tiene dirección (SP2 ninguna) | ${summary.onlySp1HasAddress} |`,
    `| ⚠️ Dirección escrita a mano (override) distinta a SP2 | ${summary.overridesDifferentFromSp2} de ${summary.overrides} |`,
    `| ℹ️ Varias direcciones activas (se usa la principal) | ${summary.severalActiveAddresses} (ambiguas: ${summary.ambiguousPrincipal}) |`,
    `| ℹ️ Sin dirección en ningún lado | ${summary.noAddressAnywhere} |`,
    `| ℹ️ Usuario SP2 sin cliente en SP1 / sin slCode | ${summary.noSp1Customer} / ${summary.userWithoutSlCode} |`,
    `| ℹ️ Clientes SP1 sin usuario en SP2 | ${summary.sp1CustomersWithoutSp2User} |`,
    `| ℹ️ Documentos de dirección huérfanos (su usuario no existe) | ${summary.orphanAddressDocs} |`);
  table('1. SP1 imprime una dirección DISTINTA a la principal del cliente en SP2',
    'Riesgo directo de entrega mal hecha. Decidir por cliente cuál es la correcta (confirmar con el cliente si hace falta). Tras el deploy de F8.1 SP1 toma la de SP2 en el próximo cambio del cliente.',
    rows.filter((r) => r.status === 'sp1-differs'),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Ruta', (r) => r.ruta], ['SP2 (principal)', (r) => r.sp2?.text], ['SP1 (etiqueta hoy)', (r) => r.sp1?.text], ['Campos distintos', (r) => r.differingFields.join(', ')], ['Direcciones activas', (r) => r.activeAddresses]]);
  table('2. El cliente tiene dirección en SP2 pero SP1 no',
    'La etiqueta sale sin dirección (el admin la escribe a mano). Se corrige llevando la de SP2 a SP1.',
    rows.filter((r) => r.status === 'sp1-missing-address'),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Ruta', (r) => r.ruta], ['SP2 (principal)', (r) => r.sp2?.text]]);
  table('3. Solo SP1 tiene dirección (SP2 ninguna)',
    'El cliente no la ve en su portal. Confirmar y registrarla en SP2.',
    rows.filter((r) => r.status === 'only-sp1-has-address'),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Ruta', (r) => r.ruta], ['SP1', (r) => r.sp1?.text]]);
  table('4. Dirección escrita a mano en SP1 (override) DISTINTA a la de SP2',
    'Hoy gana en etiquetas y manifiesto de encomiendas. Decidir: pasarla a SP2 (si es la correcta) o quitarla.',
    rows.filter((r) => r.override && !r.override.matchesSp2),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Override (a mano)', (r) => r.override.text], ['Encomienda', (r) => r.override.courier], ['SP2 (principal)', (r) => r.sp2?.text || '— sin dirección —']]);
  table('5. Varias direcciones activas con más de una marcada como principal',
    'Se tomó la que SP1 imprime hoy. Verificar con el cliente al normalizar a una sola.',
    rows.filter((r) => r.ambiguousPrincipal),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Principal elegida', (r) => r.sp2?.text], ['Activas', (r) => r.activeAddresses]]);
  table('6. Clientes sin dirección en ningún lado',
    'No se puede imprimir etiqueta. Pedir al cliente que registre su dirección.',
    rows.filter((r) => r.status === 'no-address-anywhere'),
    [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Ruta', (r) => r.ruta]]);
  table('7. Documentos de dirección huérfanos (su usuario ya no existe)', 'Solo informativo; no se migran.', orphanDocs, [['Doc', (r) => r.id], ['userId', (r) => r.userId], ['Dirección', (r) => r.text]]);
  table('8. Clientes SP1 sin usuario en SP2', 'Clientes creados solo en SP1 (temporales o sin cuenta).', sp1Only, [['SL', (r) => r.sl], ['Cliente', (r) => r.name], ['Ruta', (r) => r.ruta], ['Tiene dirección', (r) => (r.hasAddress ? 'sí' : 'no')]]);

  fs.mkdirSync(OUT, { recursive: true });
  const base = path.join(OUT, `customer-addresses-${emulator ? 'emulator' : 'prod'}-${day}`);
  fs.writeFileSync(`${base}.md`, md.join('\n') + '\n');
  fs.writeFileSync(`${base}.json`, JSON.stringify({ summary, rows, orphanDocs, sp1Only }, null, 1));
  console.log(`\nRevisión: ${base}.md\nDatos:    ${base}.json`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
