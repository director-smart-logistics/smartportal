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

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApp } from "firebase-admin/app";

// SP1 uses a named database "portal"
const getPortalDb = () => getFirestore(getApp(), "portal");

const COLLECTION = "encomiendas";

// Shared function config to match other functions
const fnConfig = {
  cors: true,
  maxInstances: 10,
};

function getSyncSecret(): string {
  // Try checking multiple possible variable names just in case
  return process.env.ENCOMIENDA_SYNC_SECRET || process.env.SP2_SYNC_SECRET || "";
}

export const slSyncEncomiendaFromSp2 = onRequest(fnConfig, async (req, res) => {
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
      logger.warn("[slSyncEncomiendaFromSp2] Unauthorized sync attempt", {
        provided,
      });
      res.status(401).send("Unauthorized");
      return;
    }
  } else {
    logger.warn(
      "[slSyncEncomiendaFromSp2] No secret configured in environment variables. Allowing request."
    );
  }

  // 3. Parse Payload
  const { action, id, data } = req.body || {};

  if (!action || !id) {
    logger.warn("[slSyncEncomiendaFromSp2] Bad Request: missing action or id", req.body);
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
        updatedAt: data.updatedAt || FieldValue.serverTimestamp(),
      };
      
      await docRef.set(payload, { merge: true });
      logger.info(`[slSyncEncomiendaFromSp2] Upserted ${COLLECTION}/${id}`);
      
    } else if (action === "delete") {
      await docRef.delete();
      logger.info(`[slSyncEncomiendaFromSp2] Deleted ${COLLECTION}/${id}`);
      
    } else {
      res.status(400).send(`Unknown action: ${action}`);
      return;
    }

    res.status(200).send({ success: true, id, action });
  } catch (err) {
    logger.error("[slSyncEncomiendaFromSp2] Error", err);
    res.status(500).send("Internal Server Error");
  }
});
