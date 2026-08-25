/**
 * Invoice Firestore triggers — SP1 → SP2 auto-sync safety net.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Historically, SP1 → SP2 invoice sync depended on every UI path remembering
 * to fire a `pushInvoiceStatusToSP2` / `syncInvoicesToSp2` call after each
 * mutation. Inevitably some paths (bulk merges, direct `firestoreApi.invoices
 * .update`, package-driven recalculations, etc.) forgot to do so, leaving
 * SP2 permanently desynced. Customer-facing data drifted.
 *
 * This trigger is the **canonical** propagation point: any write to
 * `invoices/{id}` on the `portal` database fires this function, which pushes
 * the current state of the doc to SP2 (idempotent — keyed by SP1 doc.id).
 *
 * ── ANTI-LOOP ────────────────────────────────────────────────────────────────
 * The sync is unidirectional: SP2 never writes back to SP1 invoices, so there
 * is no loop risk. We still skip writes that don't touch any SP2-relevant
 * field (e.g. internal-only flags) to avoid burning SP2 function quota.
 *
 * ── DRAFTS ──────────────────────────────────────────────────────────────────
 * Drafts are not pushed because SP2 customers should not see work-in-progress.
 * If a draft is later promoted to `sent`/`paid`/etc., this trigger will fire
 * again on the status change and push the now-syncable doc.
 *
 * @module functions/invoices/triggers
 */
/**
 * Auto-sync any change to an SP1 invoice into SP2.
 *
 * Behaviour matrix:
 *   • doc created with non-draft status → push as `created` to SP2
 *   • doc updated with relevant diff    → push as `updated` to SP2
 *   • doc deleted                       → push `deleted: true` to SP2 so it
 *                                          unlinks shipments + removes the doc
 *   • status flipped to 'draft'         → skipped (SP2 excludes drafts)
 *   • no relevant diff                  → skipped (saves SP2 quota)
 */
export declare const onInvoiceWritten: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    invoiceId: string;
}>>;
//# sourceMappingURL=triggers.d.ts.map