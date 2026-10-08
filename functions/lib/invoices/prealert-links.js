"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceTrackings = invoiceTrackings;
exports.preAlertLinksFor = preAlertLinksFor;
exports.loadPreAlertLinks = loadPreAlertLinks;
/**
 * F2.2 — the invoice sync hands SP2 the CONFIRMED pre-alert of each invoice tracking, by id.
 *
 * Nova (SP1) is the only place that matches a tracking to a pre-alert. "Guardar en BD" stores
 * the certain result on packages/{tracking} (preAlertId, preAlertSlCode — see
 * client/lib/nova/prealert-link.ts). With it SP2 links pre-alert ↔ shipment by id and never has
 * to search by tracking.
 *
 * A link travels only when the package AND its pre-alert belong to the invoice's customer.
 */
const SL_RE = /^SL\d+$/;
function normalizeSl(value) {
    const raw = String(value ?? "").toUpperCase().replace(/\s+/g, "");
    const sl = /^\d+$/.test(raw) ? `SL${raw}` : raw;
    return SL_RE.test(sl) ? sl : "";
}
/** Trackings of an invoice: trackingNumbers + trackingNumber + its item trackings, upper case, unique. */
function invoiceTrackings(invoice) {
    const out = new Set();
    const add = (t) => {
        const v = String(t ?? "").toUpperCase().trim();
        if (v)
            out.add(v);
    };
    (Array.isArray(invoice.trackingNumbers) ? invoice.trackingNumbers : []).forEach(add);
    add(invoice.trackingNumber);
    (Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []).forEach((it) => add(it?.trackingNumber));
    return [...out];
}
/** Pure decision: which confirmed links may travel with this invoice. */
function preAlertLinksFor(invoiceSlCode, packages) {
    const sl = normalizeSl(invoiceSlCode);
    if (!sl)
        return [];
    const links = [];
    packages.forEach((pkg, tracking) => {
        if (!pkg)
            return;
        const id = String(pkg.preAlertId ?? "").trim();
        if (!id)
            return;
        if (normalizeSl(pkg.preAlertSlCode) !== sl)
            return;
        if (normalizeSl(pkg.slCode || pkg.clientSlCode) !== sl)
            return;
        links.push({ tracking, preAlertId: id });
    });
    return links;
}
/** Reads packages/{tracking} of the invoice (one batched read) and returns the links that may travel. */
async function loadPreAlertLinks(db, invoice) {
    const trackings = invoiceTrackings(invoice);
    if (trackings.length === 0)
        return [];
    const snaps = await db.getAll(...trackings.map((t) => db.collection("packages").doc(t)));
    const packages = new Map();
    snaps.forEach((snap, i) => packages.set(trackings[i], snap.exists ? snap.data() : undefined));
    return preAlertLinksFor(invoice.slCode || invoice.clientSlCode || invoice.customerId, packages);
}
//# sourceMappingURL=prealert-links.js.map