/**
 * SP1 governs the package status in SP2 (user 2026-09-28): "si SP1 manda un estado debe aplicarse sí o sí en SP2,
 * no importa desde dónde".
 *
 * Until now a status change reached SP2 only if the SCREEN that made it remembered to push it from the browser
 * (≈20 call sites, some behind a "Sincronizar con SP2" checkbox). A closed tab, a network error or an unticked box
 * left the customer's "Facturados" card stuck "En ruta" after SP1 had delivered it.
 *
 * This trigger closes that gap on the server: every time a package's `status` CHANGES in SP1 — whatever screen,
 * callable, script or trigger wrote it — the new status is pushed to SP2 with forceSync (SP1's decision wins over
 * SP2's regression guard). Nothing is decided here: the status pushed is exactly the one SP1 now has.
 *
 *   - only on updates whose status changed (creations keep their existing Nova/sync flows; no extra calls otherwise)
 *   - SP2 down / 5xx / network → the function throws and Firebase retries it (retry: true); every attempt is logged
 *   - a package SP2 does not know, or without SL code → logged as skipped with the reason (never silent)
 *   - idempotent: pushing the same status twice changes nothing in SP2
 */
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { pushBulkStatusToSP2 } from "../routes/callable";

/** Events older than this are dropped (Firebase retries for up to 7 days; a newer change will have been pushed). */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export const onPackageStatusToSp2 = onDocumentUpdated(
  {
    document: "packages/{pkgId}",
    database: "portal",
    region: "us-central1",
    retry: true,
    maxInstances: 10, // a Nova manifest save changes hundreds of packages at once — keep SP2 from being flooded
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const status = String(after.status || "");
    if (!status || status === String(before.status || "")) return;

    const tracking = after.trackingNumber ?? after.tracking ?? event.params.pkgId;
    const age = Date.now() - Date.parse(event.time);
    if (age > MAX_EVENT_AGE_MS) {
      logger.warn("[pkg-status→SP2] event too old, dropped", { tracking, status, ageMs: age });
      return;
    }

    // Re-read: after a retry the package may already hold a newer status — push what SP1 has NOW.
    const fresh = (await db.collection("packages").doc(event.params.pkgId).get()).data() ?? after;
    const pkg = {
      trackingNumber: fresh.trackingNumber ?? fresh.tracking ?? tracking,
      slCode: fresh.slCode || fresh.clientSlCode,
      status: String(fresh.status || status),
      weight: fresh.weight,
      description: fresh.description,
      ruta: fresh.ruta,
      manifestNumber: fresh.manifestNumber,
      requiresPermit: fresh.requiresPermit,
      calculatedCost: fresh.calculatedCost,
      cost: fresh.cost,
      currency: fresh.currency,
    };
    const sp2 = await pushBulkStatusToSP2([pkg], true);
    // Retry only what a retry can fix: network / 5xx. A per-package "not found" is a skip; a 4xx or a missing secret
    // is a configuration problem that is logged, not retried for 24 h.
    const failed = sp2.errors > 0 && !!sp2.error && !/^HTTP 4\d\d$|no configurado/.test(sp2.error);

    try {
      await db.collection("package_status_sync_logs").add({
        at: new Date().toISOString(),
        by: fresh.updatedBy || "sistema",
        source: "onPackageStatusToSp2",
        tracking: pkg.trackingNumber,
        slCode: pkg.slCode || null,
        from: before.status || null,
        status: pkg.status,
        count: 1,
        sp2: { updated: sp2.updated, created: sp2.created, skipped: sp2.skipped, errors: sp2.errors, error: sp2.error ?? null },
        notUpdated: sp2.details.slice(0, 5),
        retry: failed,
      });
    } catch (err) {
      logger.warn("[pkg-status→SP2] log write failed", { error: (err as Error).message });
    }

    if (failed) {
      // Throwing makes Firebase retry the event; the next attempt re-reads the package.
      throw new Error(`SP2 no respondió para ${pkg.trackingNumber}: ${sp2.error}`);
    }
  }
);
