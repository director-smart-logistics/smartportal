"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slLookupCustomerByEmail = void 0;
/**
 * slLookupCustomerByEmail (HTTP, SP2-only)
 *
 * Server-to-server lookup endpoint used by SP2 to recover a customer's
 * Firestore profile when their Firebase Auth record exists in SP2 but the
 * SP2 `users` doc is missing (orphan Auth state).
 *
 * SP1 is the source of truth for customer master data — every admin-created
 * customer lives in `customers/{slCode}` here. When SP2's profile is gone
 * (manually purged, sync drift, etc.) SP2 calls this endpoint with the
 * customer's email, gets the SP1 record, and rebuilds `users/{uid}` +
 * `email_index/{email}` from it. No data is lost; the user can log in again
 * without re-registering.
 *
 * Auth:   `x-sync-secret` header must match `SP2_SYNC_SECRET` env var
 *         (reuses the same shared secret as the inbound customer sync).
 * Method: GET ?email=<email> | POST { email }
 *
 * Response shape:
 *   { success: true, found: true,  customer: { slCode, email, firstName, lastName, dni, phone, ruta, ... } }
 *   { success: true, found: false, customer: null, email: <normalized> }
 */
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firebase_1 = require("../config/firebase");
const SECRET_ENV = "SP2_SYNC_SECRET";
function normEmail(s) {
    return s.trim().toLowerCase();
}
exports.slLookupCustomerByEmail = (0, https_1.onRequest)({ cors: false, invoker: "public", memory: "256MiB", timeoutSeconds: 30 }, async (req, res) => {
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-sync-secret");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
        res.status(405).json({ success: false, error: "Method not allowed" });
        return;
    }
    const incoming = req.headers["x-sync-secret"];
    const expected = process.env[SECRET_ENV];
    if (!expected || incoming !== expected) {
        v2_1.logger.warn("[slLookupCustomerByEmail] unauthorized", { ip: req.ip });
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
    }
    const raw = (req.method === "GET" ? req.query.email : req.body?.email);
    if (!raw || typeof raw !== "string") {
        res.status(400).json({ success: false, error: "Missing 'email' parameter" });
        return;
    }
    const email = normEmail(raw);
    try {
        // Customers store email lowercased on read paths, but historical data
        // might have the original case. Query both for safety.
        const [s1, s2] = await Promise.all([
            firebase_1.db.collection("customers").where("email", "==", email).limit(2).get(),
            email !== raw
                ? firebase_1.db.collection("customers").where("email", "==", raw).limit(2).get()
                : Promise.resolve(null),
        ]);
        const docs = [];
        const seen = new Set();
        for (const snap of [s1, s2]) {
            if (!snap)
                continue;
            for (const d of snap.docs) {
                if (seen.has(d.id))
                    continue;
                seen.add(d.id);
                docs.push(d);
            }
        }
        if (docs.length === 0) {
            res.status(200).json({ success: true, found: false, customer: null, email });
            return;
        }
        // Prefer the most recently updated record if there are multiple matches
        // (shouldn't happen — email is unique by convention, but be defensive).
        docs.sort((a, b) => {
            const am = a.data().updatedAt?.toMillis?.() ?? 0;
            const bm = b.data().updatedAt?.toMillis?.() ?? 0;
            return bm - am;
        });
        const doc = docs[0];
        const data = doc.data();
        const customer = {
            id: doc.id,
            slCode: data.slCode || doc.id,
            email: data.email || email,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            fullName: data.fullName || `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim(),
            dni: data.dni || null,
            phone: data.phone || null,
            ruta: data.ruta || null,
            nationality: data.nationality || null,
            birthDate: data.birthDate || null,
            provincia: data.provincia || null,
            country: data.country || "Costa Rica",
            addresses: Array.isArray(data.addresses) ? data.addresses : [],
            membership: data.membership || "Basic",
            language: data.preferredLanguage || "es",
            // Don't expose internal Firestore Timestamps — convert to ISO.
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
        };
        res.status(200).json({ success: true, found: true, customer });
    }
    catch (err) {
        v2_1.logger.error("[slLookupCustomerByEmail] lookup failed", {
            email, error: err.message,
        });
        res.status(500).json({ success: false, error: err.message });
    }
});
//# sourceMappingURL=lookup-by-email.js.map