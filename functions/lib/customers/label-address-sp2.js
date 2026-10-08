"use strict";
/**
 * F11.2 (docs/F11_LABEL_ADDRESS_AUDIT.md) — the address an admin corrects on the Nova shipping label,
 * saved as the customer's principal address in SP2 (option "Actualizar también en SmartWeb").
 *
 * The label textarea is built from the principal address (NovaShippingLabelModal):
 *     line 1               streetAddress
 *     middle lines         details
 *     "Instrucciones: …"   deliveryInstructions (the modal omits it when it repeats the details)
 * Province / canton / district are never changed here; the "Distrito, Cantón, Provincia" line the labels
 * print since 2026-09-27 is recognised and ignored (it is not street or details).
 *
 * The stored block is the F12 standard block (users/{uid}.defaultAddress, addressModel 'single-v1').
 * CANONICAL_KEYS / fieldOf / canonicalAddress / principalOf are the same rule as
 * scripts/audit/address-principal.cjs and SP2 src/domain/address/principal-address.ts
 * (test/label-address-sp2.spec.ts checks they stay equal). Pure; no Firestore here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canEditCustomerAddress = exports.sameAddress = exports.hasAddress = exports.CANONICAL_KEYS = exports.LABEL_FIELDS = exports.SINGLE_ADDRESS_MODEL = void 0;
exports.fieldOf = fieldOf;
exports.canonicalAddress = canonicalAddress;
exports.principalOf = principalOf;
exports.currentSp2Principal = currentSp2Principal;
exports.isLocationLine = isLocationLine;
exports.parseLabelAddressText = parseLabelAddressText;
exports.principalFromLabelText = principalFromLabelText;
exports.SINGLE_ADDRESS_MODEL = "single-v1";
/** Fields a shipping label / encomienda manifest prints. */
exports.LABEL_FIELDS = ["streetAddress", "details", "district", "canton", "province", "deliveryInstructions", "recipientName", "recipientPhone"];
exports.CANONICAL_KEYS = [
    "id", "alias", "type",
    "recipientName", "recipientPhone",
    "country", "province", "canton", "district", "city", "postalCode",
    "streetAddress", "details", "deliveryInstructions", "coordinates",
    "requiresEncomienda", "encomienda", "encomiendaPendingReview", "encomiendaSubmittedName",
    "userId", "createdAt", "updatedAt", "updatedBy",
];
const LEGACY_FALLBACKS = {
    streetAddress: ["detail", "addressDetail", "direccionExacta", "direccion"],
    details: ["addressDetail"],
    recipientName: ["contactName"],
    recipientPhone: ["contactPhone"],
    deliveryInstructions: ["deliveryNotes"],
    alias: ["label"],
};
const present = (v) => v !== undefined && v !== null && v !== "";
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const isActive = (a) => !!a && a.isActive !== false && a.status !== "inactive";
const toMs = (v) => (!v ? 0 : typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : (Date.parse(String(v)) || 0));
function fieldOf(a, k) {
    if (!a)
        return undefined;
    if (present(a[k]))
        return a[k];
    for (const legacy of LEGACY_FALLBACKS[k] || [])
        if (present(a[legacy]) && typeof a[legacy] === "string")
            return a[legacy];
    return a[k];
}
const hasAddress = (a) => !!a && !!(clean(fieldOf(a, "streetAddress")) || clean(a.province));
exports.hasAddress = hasAddress;
const sameAddress = (a, b) => !!a && !!b && exports.LABEL_FIELDS.every((k) => clean(fieldOf(a, k)) === clean(fieldOf(b, k)));
exports.sameAddress = sameAddress;
/** The clean block: same values, fixed keys, principal flags set. */
function canonicalAddress(src, userId) {
    const out = {};
    for (const k of exports.CANONICAL_KEYS) {
        const v = k === "userId" ? (src.userId || userId) : fieldOf(src, k);
        if (present(v))
            out[k] = v;
    }
    out.isDefault = true;
    out.isPrimary = true;
    out.isActive = true;
    out.status = "active";
    return out;
}
/** Same rule as the F12 audit/migration (principalOf) — which SP2 address is the principal one. */
function principalOf(collectionAddrs, embeddedAddrs, sp1Default) {
    const fromCollection = (collectionAddrs || []).filter(isActive);
    const pool = fromCollection.length ? fromCollection : (embeddedAddrs || []).filter(isActive);
    if (!pool.length)
        return { principal: null, ambiguous: false };
    const marked = pool.filter((a) => a.isPrimary || a.isDefault);
    let principal;
    if (marked.length > 1) {
        principal = marked.find((a) => sp1Default && (a.id === sp1Default.id || (0, exports.sameAddress)(a, sp1Default)))
            || [...marked].sort((x, y) => toMs(y.updatedAt) - toMs(x.updatedAt))[0];
    }
    else {
        principal = marked[0] || [...pool].sort((x, y) => toMs(x.createdAt) - toMs(y.createdAt))[0];
    }
    return { principal, ambiguous: marked.length > 1 };
}
/** The customer's current principal address in SP2 (users doc for single-v1, else the F12 rule). */
function currentSp2Principal(user, collectionAddrs, sp1Default) {
    if (user.addressModel === exports.SINGLE_ADDRESS_MODEL) {
        const a = isActive(user.defaultAddress) && (0, exports.hasAddress)(user.defaultAddress) ? user.defaultAddress : null;
        return { principal: a, ambiguous: false };
    }
    const embedded = [user.defaultAddress, ...(Array.isArray(user.addresses) ? user.addresses : [])].filter((a) => a && typeof a === "object");
    return principalOf(collectionAddrs, embedded, sp1Default);
}
const normLoc = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
/**
 * True for the "Distrito, Cantón, Provincia" line the labels print since 2026-09-27: every comma part is
 * one of the address's own district / canton / province. That line is not part of the street or details.
 */
function isLocationLine(line, a) {
    if (!a)
        return false;
    const names = new Set([fieldOf(a, "district"), fieldOf(a, "canton"), fieldOf(a, "province")].map(normLoc).filter(Boolean));
    const parts = String(line || "").split(",").map(normLoc).filter(Boolean);
    return names.size > 0 && parts.length > 0 && parts.every((p) => names.has(p));
}
/** The label textarea → address fields (inverse of how the modal builds it). Empty = "not given".
 *  With `current`, the location line (district/canton/province) is dropped: it is never street/details. */
function parseLabelAddressText(text, current) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !isLocationLine(l, current));
    const instr = lines.filter((l) => /^instrucciones\s*:/i.test(l));
    const rest = lines.filter((l) => !/^instrucciones\s*:/i.test(l));
    return {
        streetAddress: rest[0] || "",
        details: rest.slice(1).join("\n"),
        deliveryInstructions: instr.length ? instr.map((l) => l.replace(/^instrucciones\s*:\s*/i, "")).join("\n").trim() : undefined,
    };
}
/**
 * The new principal block: the current one with the label's street / details / instructions.
 * Everything else (province, canton, district, recipient, encomienda…) is kept as it is, and no field
 * is ever emptied: missing / empty lines keep the customer's value (decision 2026-09-26).
 * Returns null when a label would print the same address (nothing to write).
 */
function principalFromLabelText(current, text, meta) {
    const parsed = parseLabelAddressText(text, current);
    // Normalize first (legacy names → standard), so an emptied field cannot fall back to a legacy one.
    const next = canonicalAddress(current, meta.userId);
    // NOTHING IS EVER ERASED: a field is only replaced by a non-empty value from the label. A label
    // without the details line or with an empty "Instrucciones:" keeps the customer's otras señas / notes.
    if (parsed.streetAddress)
        next.streetAddress = parsed.streetAddress;
    if (parsed.details)
        next.details = parsed.details;
    if (parsed.deliveryInstructions)
        next.deliveryInstructions = parsed.deliveryInstructions;
    if ((0, exports.sameAddress)(next, current))
        return null;
    return canonicalAddress({ ...next, createdAt: next.createdAt || meta.updatedAt, updatedAt: meta.updatedAt, updatedBy: meta.updatedBy }, meta.userId);
}
/** Roles that may change a customer (same set as the SP1 rules' isAgent() for customers). */
const STAFF_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT", "STAFF", "superadmin", "admin"]);
const canEditCustomerAddress = (role) => STAFF_ROLES.has(String(role || ""));
exports.canEditCustomerAddress = canEditCustomerAddress;
//# sourceMappingURL=label-address-sp2.js.map