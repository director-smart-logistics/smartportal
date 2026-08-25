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
export declare const slSyncEncomiendaFromSp2: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=sync.d.ts.map