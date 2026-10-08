/**
 * "Día 1" source of truth (2026-09-28): every SP1 package carries the FIRST invoice it was ever invoiced in —
 *   firstInvoiceNumber, firstInvoiceDate (ISO), firstInvoiceSetAt, firstInvoiceSource ('invoices' | 'package')
 * set ONCE, the moment the package is first linked to an invoice (invoiceId / invoiceNumber / annulled invoice written
 * by any SP1 flow: the invoice ↔ package link triggers, Nova, Facturas, Consolidación…). Never overwritten here:
 * a correction is only done by the documented backfill (scripts/audit/backfill-first-invoice.cjs) with its log.
 *
 * Why a separate trigger (and not inside onPackageWritten / onInvoiceWritten): it only ADDS these four fields and
 * never touches what those triggers decide (links, statuses, encomienda) — no behavior of theirs changes, and Nova is
 * not involved. It fires on the same package write those flows make.
 *
 * The first invoice = the EARLIEST of the customer's SP1 invoices listing the tracking (any status, incl. annulled) and
 * the invoices the package itself remembers (fields + history) — same rule as the SP1 Consolidation page and SP2's
 * "En Consolidación" (../consolidation/consolidation-start.ts). Every write is logged in first_invoice_logs.
 */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { consolidationStart, firstInvoiceFromInvoices, membershipKey, normSl, TRANSITORIA } from "../consolidation/consolidation-start";
import { loadCustomerInvoices } from "../consolidation/customer-invoices";

/** The package has been in an invoice (now or before). */
export function hasInvoiceSignal(p: any): boolean {
  if (!p) return false;
  const num = String(p.invoiceNumber || "").trim();
  return !!(p.invoiceId || (num && num.toLowerCase() !== TRANSITORIA) || p.annulledInvoiceNumber || p.annulledInvoiceId || p.invoicedAt);
}

export const onPackageFirstInvoice = onDocumentWritten(
  { document: "packages/{pkgId}", database: "portal", region: "us-central1", retry: true, maxInstances: 10 },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after || after.firstInvoiceDate || !hasInvoiceSignal(after)) return;
    const pkgId = event.params.pkgId;
    const key = membershipKey(after);
    const invoices = key ? await loadCustomerInvoices(db, key.slCode) : [];
    const hist = key ? firstInvoiceFromInvoices(key.tracking, invoices) : null;
    const start = consolidationStart({ ...after, invoiceHistoryFirst: hist || undefined });
    if (start.scenario !== "primera-factura" || !start.date) return;   // no invoice date known yet
    const source = hist && hist.date === start.date ? "invoices" : "package";
    const now = new Date().toISOString();
    const ref = db.collection("packages").doc(pkgId);
    const wrote = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists || cur.get("firstInvoiceDate")) return false;   // set once, never overwritten
      tx.update(ref, { firstInvoiceNumber: start.invoiceNumber ?? null, firstInvoiceDate: start.date, firstInvoiceSetAt: now, firstInvoiceSource: source });
      return true;
    });
    if (!wrote) return;
    await db.collection("first_invoice_logs").add({
      at: now, pkgId, tracking: key?.tracking ?? null, slCode: normSl(after.slCode || after.clientSlCode) || null,
      firstInvoiceNumber: start.invoiceNumber ?? null, firstInvoiceDate: start.date, source, by: "onPackageFirstInvoice",
      invoicesScanned: invoices.length,
    }).catch((err) => logger.warn("[first-invoice] log write failed", { error: (err as Error).message }));
    logger.info("[first-invoice] set", { pkgId, firstInvoiceNumber: start.invoiceNumber, firstInvoiceDate: start.date, source });
  }
);
