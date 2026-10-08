"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slSetPackagesStatusFromSp2 = void 0;
exports.allowedTarget = allowedTarget;
exports.setPackagesStatusFromSp2Core = setPackagesStatusFromSp2Core;
/**
 * SP2 admin → "Ver lo que el cliente ve" → Factura → "Estado" (2026-09-30).
 *
 * When the SP1 admin forgets (or skips) a delivery step, the SP2 admin can fix the status of the packages of ONE
 * invoice. SP1 governs package statuses, so the change is made HERE (SP1) and onPackageStatusToSp2 carries it to
 * SP2 like any other SP1 change (forceSync, logged in package_status_sync_logs). Owner's rule — only:
 *   En ruta   → Entregado
 *   Entregado → En ruta
 * Anything else is skipped with the reason (never silent). One transaction for all the invoice's packages;
 * statusHistory gets who/why; package_status_admin_changes/<auto> keeps before → after for every package.
 * Nothing is deleted: going back to En ruta keeps the old delivery date in previousDeliveredAt.
 *
 * slSetPackagesStatusFromSp2 (HTTP, x-sync-secret): called by SP2's slAdminSetPackagesStatus.
 */
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const ROUTE = new Set(["on_route", "route", "in_route"]);
const LABEL = { delivered: "Entregado", on_route: "En Ruta" };
/** The transition the owner allows from a current status, or null. */
function allowedTarget(current) {
    const s = String(current || "").toLowerCase();
    if (ROUTE.has(s))
        return "delivered";
    if (s === "delivered")
        return "on_route";
    return null;
}
const clean = (s) => String(s ?? "").trim();
async function setPackagesStatusFromSp2Core(db, input, now = new Date().toISOString()) {
    const invoiceNumber = clean(input.invoiceNumber);
    const slCode = clean(input.slCode).toUpperCase();
    const reason = clean(input.reason);
    const to = input.to;
    if (!invoiceNumber)
        throw new Error("Falta el número de factura.");
    if (!/^SL\d+$/.test(slCode))
        throw new Error("Código SL inválido.");
    if (to !== "delivered" && to !== "on_route")
        throw new Error("Estado no permitido: solo Entregado o En ruta.");
    if (reason.length < 5)
        throw new Error("Escribe el motivo (mínimo 5 caracteres).");
    const only = input.trackings?.length ? new Set(input.trackings.map((t) => clean(t).toUpperCase())) : null;
    const logRef = db.collection("package_status_admin_changes").doc();
    const result = { invoiceNumber, to, logId: logRef.id, changed: [], skipped: [] };
    // The invoice's packages: linked by invoiceNumber, or (as SP1 links them) listed in the invoice's trackingNumbers.
    const refs = new Map();
    for (const d of (await db.collection("packages").where("invoiceNumber", "==", invoiceNumber).get()).docs)
        refs.set(d.id, d.ref);
    if (!refs.size) {
        const invs = (await db.collection("invoices").where("invoiceNumber", "==", invoiceNumber).get()).docs;
        const listed = (i) => [
            ...(Array.isArray(i.get("trackingNumbers")) ? i.get("trackingNumbers") : []),
            ...(Array.isArray(i.get("items")) ? i.get("items").map((it) => it?.trackingNumber ?? it?.tracking) : []),
        ].map((x) => clean(x));
        const trks = [...new Set(invs.flatMap(listed).filter(Boolean))];
        for (let i = 0; i < trks.length; i += 30) {
            for (const d of (await db.collection("packages").where("trackingNumber", "in", trks.slice(i, i + 30)).get()).docs)
                refs.set(d.id, d.ref);
        }
    }
    if (!refs.size)
        throw new Error(`No hay paquetes en SP1 con la factura ${invoiceNumber}.`);
    await db.runTransaction(async (tx) => {
        result.changed = [];
        result.skipped = [];
        const docs = await Promise.all([...refs.values()].map((r) => tx.get(r)));
        const writes = [];
        for (const d of docs) {
            if (!d.exists)
                continue;
            const p = d.data() || {};
            const tracking = clean(p.trackingNumber ?? p.tracking ?? d.id);
            const status = clean(p.status);
            if (only && !only.has(tracking.toUpperCase()))
                continue;
            // the invoice must belong to the customer seen in SP2 (never touch another customer's package)
            const owner = clean(p.slCode || p.clientSlCode || p.customerId).toUpperCase();
            if (owner !== slCode) {
                result.skipped.push({ id: d.id, tracking, status, reason: `pertenece a ${owner || "otro cliente"}` });
                continue;
            }
            if (allowedTarget(status) !== to) {
                result.skipped.push({ id: d.id, tracking, status, reason: status === to || (to === "on_route" && ROUTE.has(status)) ? "ya está en ese estado" : `desde "${status || "sin estado"}" no se permite` });
                continue;
            }
            const entry = { status: to, statusLabel: LABEL[to], changedAt: now, timestamp: now, changedBy: input.by, updatedBy: input.by, source: "sp2-admin", note: `Estado corregido desde SmartWeb (SP2): ${reason}`, notes: reason };
            const upd = {
                status: to, statusLabel: LABEL[to], statusHistory: [...(Array.isArray(p.statusHistory) ? p.statusHistory : []), entry],
                updatedAt: now, updatedBy: input.by,
                lastAdminStatusFromSp2: { at: now, by: input.by, reason, from: status, to, logId: logRef.id },
            };
            if (to === "delivered" && !p.deliveredAt)
                upd.deliveredAt = now;
            if (to === "on_route" && p.deliveredAt) {
                upd.previousDeliveredAt = p.deliveredAt;
                upd.deliveredAt = null;
            }
            writes.push(() => tx.update(d.ref, upd));
            result.changed.push({ id: d.id, tracking, from: status, to });
        }
        // a requested tracking that is not among the invoice's packages in SP1 is reported, never ignored silently
        if (only) {
            const seen = new Set(docs.filter((d) => d.exists).map((d) => clean(d.get("trackingNumber") ?? d.get("tracking") ?? d.id).toUpperCase()));
            for (const t of only)
                if (!seen.has(t))
                    result.skipped.push({ id: "", tracking: t, status: "", reason: "no está en esta factura en SP1" });
        }
        for (const w of writes)
            w();
        tx.set(logRef, { invoiceNumber, slCode, to, reason, by: input.by, at: now, source: "sp2-admin", changed: result.changed, skipped: result.skipped });
    });
    v2_1.logger.info("[admin-status-from-sp2] applied", { invoiceNumber, slCode, to, changed: result.changed.length, skipped: result.skipped.length, by: input.by });
    return result;
}
exports.slSetPackagesStatusFromSp2 = (0, https_1.onRequest)({ cors: false, invoker: "public", memory: "256MiB", timeoutSeconds: 60 }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const secret = process.env.SP2_SYNC_SECRET;
    if (!secret || req.headers["x-sync-secret"] !== secret) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const b = req.body || {};
        const r = await setPackagesStatusFromSp2Core((0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal"), {
            invoiceNumber: b.invoiceNumber, slCode: b.slCode, to: b.to, reason: b.reason, by: String(b.by || "sp2-admin"),
            trackings: Array.isArray(b.trackings) ? b.trackings : undefined,
        });
        res.status(200).json(r);
    }
    catch (err) {
        res.status(400).json({ error: err?.message || "Error" });
    }
});
//# sourceMappingURL=admin-status-from-sp2.js.map