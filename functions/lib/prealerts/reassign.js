"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slReassignPreAlertsBulk = exports.slReassignPreAlert = void 0;
/**
 * slReassignPreAlert
 *
 * Re-assigns a pre-alert (and its mirrored SP2 shipment) to a different
 * customer (`slCode`). Required after duplicate-account purges or wrong-
 * customer registrations: the pre-alert was created under the wrong
 * `slCode` and we need to move it to the canonical customer without
 * losing the tracking + middleware enrichment.
 *
 * Behaviour:
 *   1. Validate the source pre-alert exists in SP1 `pre_alerts`.
 *   2. Validate the target customer exists in SP1 `customers/{slCode}` and
 *      capture their canonical identity fields (email, phone, dni, name).
 *   3. Update the SP1 pre-alert in place: slCode, userId (resolved from
 *      target email in SP2 if available), denormalized customer fields,
 *      and audit metadata.
 *   4. Push the same change to SP2 via the existing `slSyncShipmentsFromSp1`
 *      HTTP endpoint with `allowCreate: true`, so the SP2 shipment is
 *      re-bound to the target customer's userId (or created if the
 *      shipment never existed because the original account was purged).
 *
 * AI-GUARD ⚠️ The SP2 sync is fire-and-forget but awaited so the caller
 * gets the success/failure status. If SP2 push fails the SP1 doc is still
 * updated — the next scheduled sync (`syncPreAlertsFromSP2`) will reconcile.
 */
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
const SP2_PROJECT_ID = "smart-portal-2";
const SP2_SHIPMENT_SYNC_URL = process.env.SP2_SHIPMENT_SYNC_URL ||
    "https://us-central1-smart-portal-2.cloudfunctions.net/slSyncShipmentsFromSp1";
const sp1Db = (0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal");
// SP2 cross-project Firestore (read-only lookup of `users/{slCode}` to map
// the new customer's slCode -> uid so the shipment update carries the right
// userId, which is the field SP2 reads for the customer UI).
let sp2Db = null;
function getSp2Firestore() {
    if (sp2Db)
        return sp2Db;
    const appName = "smart-portal-2-prealert-reassign";
    const existing = (0, app_1.getApps)().find(a => a.name === appName);
    sp2Db = (0, firestore_1.getFirestore)(existing ?? (0, app_1.initializeApp)({ projectId: SP2_PROJECT_ID }, appName));
    return sp2Db;
}
async function resolveSp2UserIdBySlCode(slCode) {
    try {
        const db = getSp2Firestore();
        const snap = await db.collection("users").where("slCode", "==", slCode).limit(1).get();
        if (snap.empty)
            return null;
        const d = snap.docs[0];
        return d.data().uid || d.id;
    }
    catch (err) {
        v2_1.logger.warn("[slReassignPreAlert] SP2 userId lookup failed", {
            slCode, error: err.message,
        });
        return null;
    }
}
async function loadCustomer(slCode) {
    const snap = await sp1Db.collection("customers").doc(slCode).get();
    if (!snap.exists)
        return null;
    const d = snap.data() || {};
    const firstName = String(d.firstName || "").trim();
    const lastName = String(d.lastName || "").trim();
    return {
        slCode,
        firstName,
        lastName,
        displayName: String(d.fullName || `${firstName} ${lastName}`).trim() || slCode,
        email: String(d.email || "").trim(),
        dni: String(d.dni || d.verifiedDni || "").trim(),
        phone: String(d.phone || "").trim(),
    };
}
/**
 * Apply the reassignment to a SINGLE pre-alert. Caller pre-loads the
 * target customer + SP2 userId so bulk operations don't re-hit Firestore
 * for every item.
 */
async function applyReassign(preAlertId, target, sp2UserId, performedBy, reason, sp2Secret) {
    const result = {
        preAlertId,
        tracking: null,
        ok: false,
        fromSlCode: null,
        toSlCode: target.slCode,
        sp2: { pushed: false },
    };
    const preAlertRef = sp1Db.collection("pre_alerts").doc(preAlertId);
    const preAlertSnap = await preAlertRef.get();
    if (!preAlertSnap.exists) {
        result.error = "Pre-alert not found";
        return result;
    }
    const preAlert = preAlertSnap.data() || {};
    result.tracking = String(preAlert.tracking || "") || null;
    const sourceSlCode = String(preAlert.slCode || "").trim();
    result.fromSlCode = sourceSlCode || null;
    if (sourceSlCode === target.slCode) {
        result.error = "Same SL Code — nothing to change";
        return result;
    }
    const searchTokens = generateSearchTokens([
        String(preAlert.tracking || ""),
        String(preAlert.canonicalTracking || ""),
        target.slCode,
        target.displayName,
        target.firstName,
        target.lastName,
        target.email,
        target.dni,
        String(preAlert.manifestId || ""),
    ]);
    await preAlertRef.update({
        slCode: target.slCode,
        firstName: target.firstName,
        lastName: target.lastName,
        displayName: target.displayName,
        email: target.email,
        dni: target.dni,
        phone: target.phone,
        userId: sp2UserId || null,
        searchTokens,
        reassignedAt: firestore_1.FieldValue.serverTimestamp(),
        reassignedBy: performedBy,
        reassignedFromSlCode: sourceSlCode || null,
        reassignedReason: reason || null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    // ── SP2 push ──────────────────────────────────────────────────────────
    if (sp2Secret) {
        try {
            const body = {
                packages: [{
                        trackingNumber: String(preAlert.tracking || ""),
                        slCode: target.slCode,
                        status: String(preAlert.status || "pre-alerted"),
                        weight: typeof preAlert.weight === "number" ? preAlert.weight : undefined,
                        description: String(preAlert.description || ""),
                        manifestNumber: String(preAlert.manifestId || ""),
                        requiresPermit: !!preAlert.requiresPermit,
                        allowCreate: true,
                        isPreAlertReassign: true,
                    }],
            };
            const res = await fetch(SP2_SHIPMENT_SYNC_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-sync-secret": sp2Secret },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                result.sp2 = { pushed: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
            }
            else {
                const json = await res.json().catch(() => null);
                result.sp2 = { pushed: true, outcome: json?.results?.[0]?.outcome ?? "unknown" };
            }
        }
        catch (err) {
            result.sp2 = { pushed: false, error: err.message };
        }
    }
    else {
        result.sp2 = { pushed: false, error: "SP2 sync secret not configured" };
    }
    // ── Audit log (best-effort) ───────────────────────────────────────────
    try {
        await sp1Db.collection("_admin_audit").add({
            action: "prealert_reassign",
            preAlertId,
            tracking: preAlert.tracking || null,
            fromSlCode: sourceSlCode || null,
            toSlCode: target.slCode,
            targetUserId: sp2UserId,
            sp2Pushed: result.sp2.pushed,
            sp2Outcome: result.sp2.outcome || result.sp2.error || null,
            reason: reason || null,
            performedBy,
            performedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        v2_1.logger.warn("[applyReassign] audit log failed", {
            preAlertId, error: err.message,
        });
    }
    result.ok = true;
    return result;
}
exports.slReassignPreAlert = (0, https_1.onCall)({ cors: true, memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const { preAlertId, newSlCode, reason } = request.data || {};
    if (!preAlertId || typeof preAlertId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "preAlertId is required");
    }
    const targetSlCode = (newSlCode || "").trim().toUpperCase();
    if (!targetSlCode) {
        throw new https_1.HttpsError("invalid-argument", "newSlCode is required");
    }
    const target = await loadCustomer(targetSlCode);
    if (!target) {
        throw new https_1.HttpsError("not-found", `No existe ningún cliente con SL Code ${targetSlCode} en SP1.`);
    }
    const sp2UserId = await resolveSp2UserIdBySlCode(targetSlCode);
    const sp2Secret = process.env.ENCOMIENDA_SYNC_SECRET || process.env.SP2_SYNC_SECRET || "";
    const out = await applyReassign(preAlertId, target, sp2UserId, request.auth.uid, reason, sp2Secret);
    if (!out.ok) {
        throw new https_1.HttpsError(out.error === "Pre-alert not found" ? "not-found" : "failed-precondition", out.error || "Reassign failed");
    }
    return {
        success: true,
        preAlertId,
        from: { slCode: out.fromSlCode || "", displayName: out.fromSlCode || "" },
        to: { slCode: target.slCode, displayName: target.displayName, userId: sp2UserId },
        sp2: out.sp2,
    };
});
exports.slReassignPreAlertsBulk = (0, https_1.onCall)({ cors: true, memory: "512MiB", timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const { preAlertIds, newSlCode, reason } = request.data || {};
    if (!Array.isArray(preAlertIds) || preAlertIds.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "preAlertIds must be a non-empty array");
    }
    if (preAlertIds.length > 500) {
        throw new https_1.HttpsError("invalid-argument", "preAlertIds limited to 500 per call");
    }
    const targetSlCode = (newSlCode || "").trim().toUpperCase();
    if (!targetSlCode) {
        throw new https_1.HttpsError("invalid-argument", "newSlCode is required");
    }
    const target = await loadCustomer(targetSlCode);
    if (!target) {
        throw new https_1.HttpsError("not-found", `No existe ningún cliente con SL Code ${targetSlCode} en SP1.`);
    }
    const sp2UserId = await resolveSp2UserIdBySlCode(targetSlCode);
    const sp2Secret = process.env.ENCOMIENDA_SYNC_SECRET || process.env.SP2_SYNC_SECRET || "";
    // Bounded concurrency: keep memory + Firestore quota reasonable. Each
    // item does ~1 read, 1 write, 1 SP2 fetch, 1 audit write.
    const CONCURRENCY = 8;
    const results = [];
    for (let i = 0; i < preAlertIds.length; i += CONCURRENCY) {
        const slice = preAlertIds.slice(i, i + CONCURRENCY);
        const batch = await Promise.all(slice.map(id => applyReassign(id, target, sp2UserId, request.auth.uid, reason, sp2Secret)
            .catch((err) => ({
            preAlertId: id,
            tracking: null,
            ok: false,
            fromSlCode: null,
            toSlCode: targetSlCode,
            sp2: { pushed: false },
            error: err.message,
        }))));
        results.push(...batch);
    }
    const succeeded = results.filter(r => r.ok).length;
    const sp2Pushed = results.filter(r => r.sp2.pushed).length;
    v2_1.logger.info("[slReassignPreAlertsBulk] done", {
        total: results.length, succeeded, sp2Pushed,
        target: targetSlCode, by: request.auth.uid,
    });
    return {
        success: true,
        target: { slCode: target.slCode, displayName: target.displayName, userId: sp2UserId },
        total: results.length,
        succeeded,
        failed: results.length - succeeded,
        sp2Pushed,
        results,
    };
});
// ── Search token generator (mirrors sync.ts) ────────────────────────────────
function generateSearchTokens(fields) {
    const tokens = new Set();
    for (const field of fields) {
        if (!field)
            continue;
        const normalized = field.toLowerCase().trim();
        for (let len = 3; len <= normalized.length; len++) {
            tokens.add(normalized.substring(0, len));
        }
        tokens.add(normalized);
    }
    return [...tokens];
}
//# sourceMappingURL=reassign.js.map