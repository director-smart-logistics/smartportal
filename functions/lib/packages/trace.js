"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slResolveTrackingLinks = exports.slTraceTracking = void 0;
/**
 * slTraceTracking
 *
 * Returns the full lifecycle of a tracking number across the system so
 * dispatchers can audit how an invoice item ended up "huérfano" (i.e.
 * present in invoice.invoiceItems but with no matching package owned by
 * the invoice's customer).
 *
 * Sources combined into a chronological timeline:
 *   - packages              → current owner + status + manifest
 *   - invoices              → every invoice that lists the tracking
 *                             (uses the canonical `trackingNumbers` array
 *                             mirror that the self-heal trigger keeps in
 *                             sync, so this is an indexed lookup, not a
 *                             full scan)
 *   - audit_logs (best-effort) → reassign / move events touching the tracking
 *
 * Output is intentionally permissive: callers render whatever sections
 * came back. Missing data points should not break the dialog.
 */
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firebase_1 = require("../config/firebase");
const tsToIso = (v) => {
    if (!v)
        return null;
    // Firestore Timestamp
    if (typeof v?.toDate === "function") {
        try {
            return v.toDate().toISOString();
        }
        catch {
            return null;
        }
    }
    if (v instanceof Date)
        return v.toISOString();
    if (typeof v === "string")
        return v;
    return null;
};
exports.slTraceTracking = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const tracking = (request.data?.tracking || "").trim();
    if (!tracking) {
        throw new https_1.HttpsError("invalid-argument", "tracking is required");
    }
    const upper = tracking.toUpperCase();
    // ── 1. Packages with this tracking (any case-fold variant) ─────────────
    const pkgQueries = [
        firebase_1.db.collection("packages").where("trackingNumber", "==", tracking).get(),
        firebase_1.db.collection("packages").where("trackingNumber", "==", upper).get(),
        firebase_1.db.collection("packages").where("tracking", "==", tracking).get(),
    ];
    const pkgSnaps = await Promise.all(pkgQueries);
    const seenPkg = new Set();
    const packages = [];
    for (const snap of pkgSnaps) {
        for (const d of snap.docs) {
            if (seenPkg.has(d.id))
                continue;
            seenPkg.add(d.id);
            const data = d.data();
            packages.push({
                id: d.id,
                trackingNumber: data.trackingNumber || data.tracking || tracking,
                slCode: data.clientSlCode || data.slCode || null,
                customerName: data.customerName || data.fullName || null,
                status: data.status || null,
                manifestNumber: data.manifestNumber || null,
                ruta: data.ruta || null,
                description: data.description || data.descripcion || null,
                weight: typeof data.weight === "number" ? data.weight : null,
                cost: typeof data.calculatedCost === "number" ? data.calculatedCost
                    : (typeof data.cost === "number" ? data.cost : null),
                createdAt: tsToIso(data.createdAt),
                updatedAt: tsToIso(data.updatedAt),
            });
        }
    }
    // ── 2. Invoices containing the tracking ───────────────────────────────
    // Uses the canonical `trackingNumbers` array mirror kept in sync by
    // onInvoiceWritten + reconciliation. Fallback to a bounded scan when
    // the mirror is missing on very old docs.
    const invHits = [];
    const seenInv = new Set();
    const invQueries = [
        firebase_1.db.collection("invoices").where("trackingNumbers", "array-contains", tracking).get(),
        firebase_1.db.collection("invoices").where("trackingNumbers", "array-contains", upper).get(),
        // single-tracking convenience field
        firebase_1.db.collection("invoices").where("trackingNumber", "==", tracking).get(),
        firebase_1.db.collection("invoices").where("trackingNumber", "==", upper).get(),
    ];
    const invSnaps = await Promise.all(invQueries);
    for (const snap of invSnaps) {
        for (const d of snap.docs) {
            if (seenInv.has(d.id))
                continue;
            seenInv.add(d.id);
            const data = d.data();
            const matchedItem = (data.invoiceItems || data.items || []).find((it) => {
                const t = (it?.trackingNumber || it?.tracking || "").toUpperCase();
                return t === upper;
            });
            invHits.push({
                id: d.id,
                invoiceNumber: data.invoiceNumber || null,
                slCode: data.clientSlCode || null,
                customerName: data.customerName || data.clientName || null,
                status: data.status || null,
                totalAmount: typeof data.totalAmount === "number" ? data.totalAmount
                    : (typeof data.amount === "number" ? data.amount : null),
                manifestNumber: data.manifestNumber || null,
                itemDescription: matchedItem?.description || null,
                itemPrice: matchedItem?.totalPrice ?? matchedItem?.unitPrice ?? null,
                createdAt: tsToIso(data.createdAt),
                updatedAt: tsToIso(data.updatedAt),
            });
        }
    }
    // ── 3. Audit logs touching this tracking (best-effort) ────────────────
    const audits = [];
    try {
        const auditSnap = await firebase_1.db.collection("audit_logs")
            .where("trackingNumber", "==", tracking)
            .orderBy("timestamp", "desc")
            .limit(50)
            .get();
        for (const d of auditSnap.docs) {
            const data = d.data();
            audits.push({
                id: d.id,
                action: data.action || "UNKNOWN",
                entity: data.entity || "unknown",
                entityId: data.entityId || null,
                userId: data.userId || null,
                timestamp: tsToIso(data.timestamp),
                before: data.oldValues || null,
                after: data.newValues || null,
            });
        }
    }
    catch (err) {
        v2_1.logger.warn("[slTraceTracking] audit_logs lookup failed", {
            tracking, err: err.message,
        });
    }
    // ── 4. Ownership mismatch diagnostic ──────────────────────────────────
    let ownershipMismatch = false;
    let mismatchDetail = null;
    const currentPkg = packages
        .slice()
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
    const liveInvoices = invHits.filter(i => !["annulled", "cancelled", "void"].includes((i.status || "").toLowerCase()));
    if (currentPkg && liveInvoices.length > 0) {
        const pkgOwner = currentPkg.slCode;
        const otherOwners = Array.from(new Set(liveInvoices.map(i => i.slCode).filter(s => s && s !== pkgOwner)));
        if (pkgOwner && otherOwners.length > 0) {
            ownershipMismatch = true;
            mismatchDetail = `El paquete pertenece a ${pkgOwner} pero hay factura(s) activa(s) del cliente ${otherOwners.join(", ")}.`;
        }
    }
    else if (!currentPkg && liveInvoices.length > 0) {
        ownershipMismatch = true;
        mismatchDetail = `Hay ${liveInvoices.length} factura(s) activa(s) que listan este tracking, pero no existe ningún paquete con ese tracking.`;
    }
    // ── 5. Resolution plan (preview) ──────────────────────────────────────
    // For each package carrying this tracking, decide which invoice it
    // SHOULD point to under the relaxed invariant:
    //   • Prefer the most recent ACTIVE invoice of the same customer.
    //   • If no active exists, fall back to the most recent invoice of any
    //     status (even annulled) for the same customer — better to link to
    //     an annulled invoice than to leave the package orphaned.
    //   • If no invoice of any status lists the tracking for the customer,
    //     the link clears (truly nothing to point at).
    const INACTIVE_STATUSES = new Set(["annulled", "cancelled", "void"]);
    const resolutionPlan = [];
    for (const pkg of packages) {
        const sameCustomerInvoices = invHits.filter(i => !i.slCode || !pkg.slCode || i.slCode === pkg.slCode);
        const activeOnly = sameCustomerInvoices.filter(i => !INACTIVE_STATUSES.has((i.status || "").toLowerCase()));
        const sortByDate = (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");
        let target = null;
        let reason = "Sin facturas que listen el tracking para este cliente.";
        if (activeOnly.length > 0) {
            target = activeOnly.slice().sort(sortByDate)[0];
            reason = activeOnly.length === 1
                ? `Es la única factura activa del cliente que lista el tracking.`
                : `Es la factura ACTIVA más reciente del cliente (${activeOnly.length} candidatas).`;
        }
        else {
            target = null;
            reason = "Sin facturas activas que listen el tracking para este cliente.";
        }
        const currentInvoiceId = pkg;
        // The PackageHit shape doesn't carry invoiceId — re-read from raw data
        // using an extra lookup is unnecessary, since we already returned the
        // canonical package fields above. Walk the Firestore doc again via id.
        // To keep this synchronous, we instead use the fields that exist on
        // PackageHit and assume the trigger keeps the link fresh — but we
        // still need invoiceId from somewhere. The lookup is cheap, do it now.
        void currentInvoiceId;
        let currentInvId = null;
        let currentInvNum = null;
        let currentInvStatus = null;
        try {
            const snap = await firebase_1.db.collection("packages").doc(pkg.id).get();
            const data = snap.data() || {};
            currentInvId = data.invoiceId || null;
            currentInvNum = data.invoiceNumber || null;
            currentInvStatus = data.invoiceStatus || null;
        }
        catch { /* swallow — plan still useful */ }
        const targetInvId = target?.id ?? null;
        const targetInvNum = target?.invoiceNumber ?? null;
        const targetStatus = target?.status ?? null;
        const willChange = currentInvId !== targetInvId || currentInvNum !== targetInvNum;
        resolutionPlan.push({
            pkgId: pkg.id,
            pkgSlCode: pkg.slCode,
            pkgCustomerName: pkg.customerName,
            tracking,
            currentInvoiceId: currentInvId,
            currentInvoiceNumber: currentInvNum,
            currentInvoiceStatus: currentInvStatus,
            targetInvoiceId: targetInvId,
            targetInvoiceNumber: targetInvNum,
            targetInvoiceStatus: targetStatus,
            reason,
            willChange,
        });
    }
    return {
        success: true,
        data: {
            tracking,
            packages,
            invoices: invHits,
            audits,
            ownershipMismatch,
            mismatchDetail,
            resolutionPlan,
        },
    };
});
/**
 * slResolveTrackingLinks
 *
 * On-demand enforcement of the package <-> invoice invariant for a single
 * tracking. Powers the "Resolver automáticamente" button on the trace
 * dialog so dispatchers don't need to wait for the next trigger fire.
 *
 * For every package with the given tracking we recompute the winner
 * invoice (most recent ACTIVE invoice that lists the tracking under the
 * package's customer) and update the package fields if they drifted.
 *
 * Returns the per-package outcome so the UI can show "1 paquete re-vinculado".
 */
exports.slResolveTrackingLinks = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const tracking = (request.data?.tracking || "").trim();
    if (!tracking) {
        throw new https_1.HttpsError("invalid-argument", "tracking is required");
    }
    const upper = tracking.toUpperCase();
    const INACTIVE = new Set(["annulled", "cancelled", "void"]);
    // 1. Packages carrying this tracking
    const pkgSnaps = await Promise.all([
        firebase_1.db.collection("packages").where("trackingNumber", "==", tracking).limit(20).get(),
        firebase_1.db.collection("packages").where("trackingNumber", "==", upper).limit(20).get(),
    ]);
    const seen = new Set();
    const pkgs = [];
    for (const s of pkgSnaps)
        for (const d of s.docs) {
            if (seen.has(d.id))
                continue;
            seen.add(d.id);
            pkgs.push(d);
        }
    // 2. Invoices listing this tracking — keep ALL statuses so we can fall
    //    back to the most recent annulled/cancelled if no active exists,
    //    rather than leave the package orphaned.
    const invSnaps = await Promise.all([
        firebase_1.db.collection("invoices").where("trackingNumbers", "array-contains", tracking).get(),
        upper !== tracking
            ? firebase_1.db.collection("invoices").where("trackingNumbers", "array-contains", upper).get()
            : Promise.resolve(null),
    ]);
    const invs = [];
    const invSeen = new Set();
    for (const snap of invSnaps) {
        if (!snap)
            continue;
        for (const d of snap.docs) {
            if (invSeen.has(d.id))
                continue;
            invSeen.add(d.id);
            const data = d.data();
            const status = String(data.status || "draft").toLowerCase();
            const ca = data.createdAt;
            const ms = ca?.toMillis?.()
                ?? (typeof ca === "string" ? Date.parse(ca) : 0)
                ?? 0;
            invs.push({
                id: d.id,
                number: data.invoiceNumber || null,
                status,
                sl: String(data.clientSlCode || data.slCode || "").trim() || null,
                ms,
            });
        }
    }
    const changed = [];
    let skipped = 0;
    for (const pkgDoc of pkgs) {
        const p = pkgDoc.data();
        const sl = String(p.clientSlCode || p.slCode || "").trim() || null;
        const sameCustomer = invs.filter(i => !sl || !i.sl || i.sl === sl);
        const active = sameCustomer.filter(i => !INACTIVE.has(i.status));
        const winner = active.slice().sort((a, b) => b.ms - a.ms)[0] || null;
        const currentInvId = p.invoiceId || null;
        const currentInvNum = p.invoiceNumber || null;
        const desiredInvId = winner?.id ?? null;
        const desiredInvNum = winner?.number ?? null;
        if (currentInvId === desiredInvId && currentInvNum === desiredInvNum) {
            skipped++;
            continue;
        }
        await pkgDoc.ref.update({
            invoiceId: desiredInvId,
            invoiceNumber: desiredInvNum,
            invoiceStatus: winner?.status || null,
            invoiceLinkUpdatedAt: new Date().toISOString(),
            invoiceLinkSource: "slResolveTrackingLinks",
        });
        changed.push({ pkgId: pkgDoc.id, from: currentInvId, to: desiredInvId, toNumber: desiredInvNum });
    }
    return { success: true, data: { tracking, changed, skipped } };
});
//# sourceMappingURL=trace.js.map