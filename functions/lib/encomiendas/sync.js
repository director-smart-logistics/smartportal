"use strict";
/**
 * Encomienda Sync — SP2 → SP1
 *
 * HTTPS Cloud Function that receives encomienda CRUD events from SP2's client/trigger.
 *
 * Security:
 * Protected by `ENCOMIENDA_SYNC_SECRET` env var (must match SP2's env).
 *
 * Payload format:
 *   POST /slSyncEncomiendaFromSp2   { action: 'upsert' | 'delete', id, data? }
 *
 * @module functions/encomiendas/sync
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.slSyncEncomiendaFromSp2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const app_1 = require("firebase-admin/app");
// SP1 uses a named database "portal"
const getPortalDb = () => (0, firestore_1.getFirestore)((0, app_1.getApp)(), "portal");
const COLLECTION = "encomiendas";
// Shared function config to match other functions
const fnConfig = {
    cors: true,
    maxInstances: 10,
};
function getSyncSecret() {
    // Try checking multiple possible variable names just in case
    return process.env.ENCOMIENDA_SYNC_SECRET || process.env.SP2_SYNC_SECRET || "";
}
exports.slSyncEncomiendaFromSp2 = (0, https_1.onRequest)(fnConfig, async (req, res) => {
    // 1. Verify Method
    if (req.method !== "POST" && req.method !== "OPTIONS") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    // 2. Auth via Header
    const secret = getSyncSecret();
    if (secret) {
        const provided = req.headers["x-sync-secret"] || req.headers["authorization"];
        if (!provided || provided !== secret) {
            v2_1.logger.warn("[slSyncEncomiendaFromSp2] Unauthorized sync attempt", {
                provided,
            });
            res.status(401).send("Unauthorized");
            return;
        }
    }
    else {
        v2_1.logger.warn("[slSyncEncomiendaFromSp2] No secret configured in environment variables. Allowing request.");
    }
    // 3. Parse Payload
    const { action, id, data } = req.body || {};
    if (!action || !id) {
        v2_1.logger.warn("[slSyncEncomiendaFromSp2] Bad Request: missing action or id", req.body);
        res.status(400).send("Bad Request: missing action or id");
        return;
    }
    const db = getPortalDb();
    const docRef = db.collection(COLLECTION).doc(id);
    try {
        if (action === "upsert") {
            if (!data) {
                res.status(400).send("Bad Request: missing data for upsert");
                return;
            }
            // Ensure updatedAt is present and valid
            const payload = {
                ...data,
                updatedAt: data.updatedAt || firestore_1.FieldValue.serverTimestamp(),
            };
            await docRef.set(payload, { merge: true });
            v2_1.logger.info(`[slSyncEncomiendaFromSp2] Upserted ${COLLECTION}/${id}`);
        }
        else if (action === "delete") {
            await docRef.delete();
            v2_1.logger.info(`[slSyncEncomiendaFromSp2] Deleted ${COLLECTION}/${id}`);
        }
        else {
            res.status(400).send(`Unknown action: ${action}`);
            return;
        }
        res.status(200).send({ success: true, id, action });
    }
    catch (err) {
        v2_1.logger.error("[slSyncEncomiendaFromSp2] Error", err);
        res.status(500).send("Internal Server Error");
    }
});
//# sourceMappingURL=sync.js.map