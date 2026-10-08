/**
 * SP2 "En Consolidación" tab (2026-09-28): the customer's list of packages in consolidation, kept by the SERVER.
 *
 * A package enters consolidation from several SP1 screens (invoice annul in Facturas / invoice-service, the
 * Consolidation page, Mover manifiesto, Devueltos, the Kanban) and leaves it when the admin moves it to a manifest
 * (its new invoice then shows in "Facturados"). None of those screens is touched: this trigger watches every package
 * write and, when its membership changes (same predicate as SP1's Consolidation page — see
 * ../consolidation/consolidation-start.ts), pushes an add / remove to SP2 (slSyncConsolidationFromSp1).
 *
 *   - add carries "Día 1" (the date of the FIRST invoice of the package); SP2 keeps the first one it received for that
 *     customer + tracking and never overwrites it
 *   - customer or tracking changed while in consolidation → remove from the old list + add to the new one
 *   - nothing is pushed when the package stays in (or out of) consolidation
 *   - SP2 down / 5xx / network → throws, Firebase retries (retry: true); events older than 24 h are dropped
 *   - every push is logged in consolidation_sync_logs (SP1) and in SP2's own log
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { consolidationOps, consolidationStart, firstInvoiceFromInvoices, type ConsolidationOp } from "../consolidation/consolidation-start";
import { loadCustomerInvoices } from "../consolidation/customer-invoices";

const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export interface ConsolidationPushResult { ok: boolean; status: number; error?: string; results?: Array<{ key: string; outcome: string; reason?: string }> }

/** POST the operations to SP2 (shared with the backfill script's logic). One retry on network / 5xx. */
export async function pushConsolidationToSp2(items: Array<ConsolidationOp & { by?: string }>): Promise<ConsolidationPushResult> {
  const url = process.env.SP2_CONSOLIDATION_SYNC_URL || "https://us-central1-smart-portal-2.cloudfunctions.net/slSyncConsolidationFromSp1";
  const secret = process.env.SP2_SYNC_SECRET || "";
  if (!secret) return { ok: false, status: 0, error: "SP2_SYNC_SECRET no configurado" };
  let last: ConsolidationPushResult = { ok: false, status: 0, error: "sin respuesta" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-sync-secret": secret }, body: JSON.stringify({ items }) });
      const json: any = await res.json().catch(() => ({}));
      last = { ok: res.ok, status: res.status, error: res.ok ? undefined : (json?.error || `HTTP ${res.status}`), results: json?.results };
      if (res.ok || res.status < 500) return last;
    } catch (err: any) {
      last = { ok: false, status: 0, error: err?.message || String(err) };
    }
  }
  return last;
}

export const onPackageConsolidationToSp2 = onDocumentWritten(
  {
    document: "packages/{pkgId}",
    database: "portal",
    region: "us-central1",
    retry: true,
    maxInstances: 10,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const ops = consolidationOps(event.params.pkgId, before, after);
    if (!ops.length) return;

    const age = Date.now() - Date.parse(event.time);
    if (age > MAX_EVENT_AGE_MS) {
      logger.warn("[consolidation→SP2] event too old, dropped", { pkgId: event.params.pkgId, ageMs: age });
      return;
    }

    // "Día 1" for an add: the package's stored firstInvoice* when it has it; otherwise the customer's SP1 invoices
    // (any status) listing the tracking + the package fields/history — the earliest wins.
    for (const o of ops) {
      if (o.op !== "add" || after?.firstInvoiceDate) continue;
      const invoices = await loadCustomerInvoices(db, o.slCode);
      const hist = firstInvoiceFromInvoices(o.tracking, invoices);
      const s = consolidationStart({ ...after, invoiceHistoryFirst: hist || undefined });
      o.since = s.date; o.sourceInvoiceNumber = s.invoiceNumber;
    }

    const by = String(after?.updatedBy || before?.updatedBy || "sistema");
    // Correlation + ordering: the SP1 event id (shared by the SP1 and SP2 logs) and its time (SP2 ignores anything
    // older than the last event it applied for that item — a retry or an out-of-order event never resurrects one).
    for (const o of ops) { o.eventId = event.id; o.eventAt = event.time; }
    const sp2 = await pushConsolidationToSp2(ops.map((o) => ({ ...o, by })));
    // Retry only what a retry can fix: network / 5xx. A 4xx or a missing secret is logged, not retried for 24 h.
    const retry = !sp2.ok && (sp2.status === 0 || sp2.status >= 500) && !/no configurado/.test(sp2.error || "");

    try {
      const batch = db.batch();
      for (const o of ops) {
        batch.set(db.collection("consolidation_sync_logs").doc(), {
          at: new Date().toISOString(), by, source: "onPackageConsolidationToSp2", eventId: event.id, eventAt: event.time, op: o.op, slCode: o.slCode, tracking: o.tracking,
          sp1PackageId: o.sp1PackageId, since: o.since ?? null, sourceInvoiceNumber: o.sourceInvoiceNumber ?? null, reason: o.reason,
          sp2: { ok: sp2.ok, status: sp2.status, error: sp2.error ?? null, result: sp2.results?.find((r) => r.key === `${o.slCode}_${o.tracking}`) ?? null },
          retry,
        });
      }
      await batch.commit();
    } catch (err) {
      logger.warn("[consolidation→SP2] log write failed", { error: (err as Error).message });
    }

    if (retry) throw new Error(`SP2 no respondió (consolidación ${ops.map((o) => `${o.op} ${o.tracking}`).join(", ")}): ${sp2.error}`);
  }
);
