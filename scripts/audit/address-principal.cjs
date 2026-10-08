/**
 * F12 — ONE rule, shared by the read-only audit (audit-customer-addresses.cjs) and the migration
 * (migrate-principal-address.cjs), so both always decide the same thing.
 *
 *   principalOf()      which of the customer's SP2 addresses is the principal one
 *   sameAddress()      would a label print the same address (the fields a label prints)
 *   canonicalAddress() the clean, standard block stored in users/{uid}.defaultAddress —
 *                      SAME values as the source (address text is NEVER rewritten), fixed key set.
 *
 * Tested in scripts/audit/__tests__/address-principal.spec.ts.
 */
'use strict';

/** Fields a shipping label / encomienda manifest prints. */
const LABEL_FIELDS = ['streetAddress', 'details', 'district', 'canton', 'province', 'deliveryInstructions', 'recipientName', 'recipientPhone'];

/** The standard address block, in this order (only keys that have a value are written). */
const CANONICAL_KEYS = [
  'id', 'alias', 'type',
  'recipientName', 'recipientPhone',
  'country', 'province', 'canton', 'district', 'city', 'postalCode',
  'streetAddress', 'details', 'deliveryInstructions', 'coordinates',
  'requiresEncomienda', 'encomienda', 'encomiendaPendingReview', 'encomiendaSubmittedName',
  'userId', 'createdAt', 'updatedAt', 'updatedBy',
];

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const isActive = (a) => !!a && a.isActive !== false && a.status !== 'inactive';
const hasAddress = (a) => !!a && !!(clean(fieldOf(a, 'streetAddress')) || clean(a.province));
const toMs = (v) => (!v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : (Date.parse(String(v)) || 0));

function sameAddress(a, b) {
  return !!a && !!b && LABEL_FIELDS.every((k) => clean(fieldOf(a, k)) === clean(fieldOf(b, k)));
}
function differingFields(a, b) {
  return LABEL_FIELDS.filter((k) => clean(fieldOf(a, k)) !== clean(fieldOf(b, k)));
}

/**
 * The customer's principal address in SP2:
 *   active addresses from the `addresses` collection, else the ones embedded in users;
 *   the one marked isPrimary/isDefault; several marked (ambiguous) → the one SP1 prints today,
 *   else the most recently updated; none marked → the oldest active one.
 */
function principalOf(collectionAddrs, embeddedAddrs, sp1Default) {
  const fromCollection = (collectionAddrs || []).filter(isActive);
  const pool = fromCollection.length ? fromCollection : (embeddedAddrs || []).filter(isActive);
  if (!pool.length) return { principal: null, active: 0, source: 'none', ambiguous: false };
  const marked = pool.filter((a) => a.isPrimary || a.isDefault);
  let principal;
  if (marked.length > 1) {
    principal = marked.find((a) => sp1Default && (a.id === sp1Default.id || sameAddress(a, sp1Default)))
      || [...marked].sort((x, y) => toMs(y.updatedAt) - toMs(x.updatedAt))[0];
  } else {
    principal = marked[0] || [...pool].sort((x, y) => toMs(x.createdAt) - toMs(y.createdAt))[0];
  }
  return { principal, active: pool.length, source: fromCollection.length ? 'collection' : 'embedded', ambiguous: marked.length > 1 };
}

/**
 * Legacy field names (older address documents) → the standard name. Same mapping SP1 already
 * applies when it receives an address (functions/src/customers/sync.ts transformAddressToCustomerAddress),
 * so the text a label prints never changes.
 */
const LEGACY_FALLBACKS = {
  streetAddress: ['detail', 'addressDetail', 'direccionExacta', 'direccion'],
  details: ['addressDetail'],
  recipientName: ['contactName'],
  recipientPhone: ['contactPhone'],
  deliveryInstructions: ['deliveryNotes'],
  alias: ['label'],
};
const present = (v) => v !== undefined && v !== null && v !== '';
/** The value of a field, taking the legacy name when the standard one is empty. */
function fieldOf(a, k) {
  if (!a) return undefined;
  if (present(a[k])) return a[k];
  for (const legacy of LEGACY_FALLBACKS[k] || []) if (present(a[legacy]) && typeof a[legacy] === 'string') return a[legacy];
  return a[k];
}

/** The clean block: same values, fixed keys, principal flags set. Never changes the address text. */
function canonicalAddress(src, userId) {
  const out = {};
  for (const k of CANONICAL_KEYS) {
    const v = k === 'userId' ? (src.userId || userId) : fieldOf(src, k);
    if (present(v)) out[k] = v;
  }
  out.isDefault = true;
  out.isPrimary = true;
  out.isActive = true;
  out.status = 'active';
  return out;
}

/** Stable fingerprint of what a label prints (to verify before/after). */
function labelFingerprint(a) {
  return a ? LABEL_FIELDS.map((k) => clean(fieldOf(a, k))).join('|') : '';
}

module.exports = { LABEL_FIELDS, CANONICAL_KEYS, LEGACY_FALLBACKS, fieldOf, clean, isActive, hasAddress, toMs, sameAddress, differingFields, principalOf, canonicalAddress, labelFingerprint };
