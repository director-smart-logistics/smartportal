/**
 * Pure integrity-comparison engine — operates on plain JS data, no
 * Firestore I/O. The Firestore-backed `auditManifestIntegrity` is a thin
 * wrapper that loads the four sources and delegates here.
 *
 * Splitting it this way is deliberate:
 *   • The comparison logic (which is where bugs hide) is fully
 *     unit-testable with fixture data.
 *   • The I/O wrapper can change query shape over time without re-testing
 *     the audit semantics.
 */

import type {
  IntegrityAuditInputs,
  IntegrityEvidence,
  IntegrityIssue,
  IntegrityIssueKind,
  IntegrityIssueSeverity,
  IntegrityReport,
  IntegritySuggestedFix,
  ManifestRowSnapshot,
} from './types';
import { isOrphanSlCode } from '@/lib/utils/invoice-reassign';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * POLICY (2026-05-04): the integrity repair must ONLY propose real customer
 * slCodes (shape `SL\d+`). Temp placeholders (`SL-NAN-*`), manifest prefixes
 * (`SL-MAN-*`), route-name leaks (`Alajuela`, `Encomiendas`, …) and empty
 * strings are **invalid repair targets** — assigning an invoice to them
 * would simply move the same orphan-prefix problem to a different doc.
 *
 * When the only available evidence points to a non-real slCode, the audit
 * still surfaces the issue but emits `suggestedFix: null`, forcing the
 * operator to pick a real customer from the Facturas → Reasignar flow.
 *
 * Wraps `isOrphanSlCode` from `invoice-reassign.ts` — keeping a single
 * source of truth for the "real customer" shape definition.
 */
function isRealCustomerSlCode(slCode: string | null | undefined): boolean {
  return !isOrphanSlCode(slCode);
}

/** Tolerance for weight comparisons — Firestore stores `Number(p.weight)`
 *  which can introduce 1e-12 noise when the row goes through a stringify. */
const WEIGHT_EPSILON = 0.005;

/** Tolerance for unit-price comparisons. */
const PRICE_EPSILON = 0.005;

/** Statuses the audit treats as authoritative for billing. */
const PROTECTED_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue', 'pending', 'pending_payment']);

/** Statuses the audit ignores entirely (tombstones). */
const TOMBSTONE_INVOICE_STATUSES = new Set(['annulled', 'cancelled', 'void']);

function upperTracking(t: unknown): string {
  return String(t ?? '').trim().toUpperCase();
}

/** Returns true when both strings, after trim/upper, are equal. */
function eqInsensitive(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();
}

/** Returns true when both strings are equal AFTER trim+upper, AND non-empty. */
function eqInsensitiveNonEmpty(a: unknown, b: unknown): boolean {
  const aa = String(a ?? '').trim();
  const bb = String(b ?? '').trim();
  if (!aa || !bb) return false;
  return aa.toUpperCase() === bb.toUpperCase();
}

// ── Suggested-fix derivation ─────────────────────────────────────────────

/**
 * Derive the canonical (slCode, customerName, ruta) tuple from the
 * available evidence. Returns `null` when no source is reachable AND no
 * consensus can be formed.
 *
 * Authority ranking:
 *   1. Protected invoice (sent/paid/overdue/pending) — confidence 0.95.
 *   2. Two or more sources agreeing on the same slCode — confidence 0.90.
 *   3. Draft invoice present — confidence 0.75 (mid-confidence, can be
 *      regenerated cheaply by the next "Actualizar BD" pass).
 *   4. Single non-invoice source (packages OR encomiendas) — confidence 0.6.
 *   5. Otherwise — `null` (no recommendation; operator must choose).
 */
function deriveSuggestedFix(
  manifestRow: ManifestRowSnapshot,
  evidence: IntegrityEvidence,
): IntegritySuggestedFix | null {
  const inv = evidence.invoice;
  const pkg = evidence.packagesCollection;
  const enc = evidence.encomiendas;

  // POLICY (2026-05-04): Protected invoice status does NOT grant authority.
  // The integrity repair is semantically a "customer reassignment" — the
  // invoice is just another source that must yield to the 2-of-N consensus
  // across manifest / packages / encomiendas / invoice. This handles the
  // common case where an invoice was stamped with an orphan prefix
  // (`SL-NAN-…` or a route name like `Alajuela-…`) while the rest of the
  // world correctly identifies the customer.
  //
  // 1. Cross-source consensus (2+ sources agree on same slCode).
  type CandidateBucket = { slCode: string; customerName: string; ruta: string; sources: number };
  const buckets = new Map<string, CandidateBucket>();
  const push = (slCode: string, customerName: string, ruta: string) => {
    if (!slCode) return;
    const k = slCode.toUpperCase();
    const existing = buckets.get(k);
    if (existing) {
      existing.sources++;
      // Keep the customerName / ruta that's not blank if the existing one is.
      if (!existing.customerName && customerName) existing.customerName = customerName;
      if (!existing.ruta && ruta) existing.ruta = ruta;
    } else {
      buckets.set(k, { slCode, customerName, ruta, sources: 1 });
    }
  };
  // Real-customer guard applied at push time — non-real slCodes never even
  // enter the bucket so they can't accidentally become the consensus winner.
  if (isRealCustomerSlCode(pkg?.slCode)) push(pkg!.slCode, pkg!.customerName ?? '', pkg!.ruta ?? '');
  if (isRealCustomerSlCode(enc?.slCode)) push(enc!.slCode, enc!.customerName ?? '', enc!.ruta ?? '');
  if (isRealCustomerSlCode(inv?.clientSlCode)) push(inv!.clientSlCode, inv!.clientName ?? '', '');
  if (isRealCustomerSlCode(manifestRow.slCode)) push(manifestRow.slCode, manifestRow.customerName, manifestRow.ruta);

  const consensus = Array.from(buckets.values()).find(b => b.sources >= 2);
  if (consensus) {
    return {
      source: 'consensus',
      slCode: consensus.slCode,
      customerName: consensus.customerName || manifestRow.customerName,
      ruta: consensus.ruta || manifestRow.ruta,
      confidence: 0.90,
    };
  }

  // 2. Invoice as sole-source fallback — status no longer matters, but the
  //    slCode must still be real. A draft invoice stamped with `SL-NAN-…`
  //    is exactly the case we refuse to propagate.
  if (isRealCustomerSlCode(inv?.clientSlCode)) {
    return {
      source: 'invoice_draft',
      slCode: inv!.clientSlCode,
      customerName: inv!.clientName,
      ruta: pkg?.ruta ?? enc?.ruta ?? manifestRow.ruta,
      confidence: 0.75,
    };
  }

  // 4. Single cross-source — packages preferred over encomiendas.
  if (isRealCustomerSlCode(pkg?.slCode)) {
    return {
      source: 'packages',
      slCode: pkg!.slCode,
      customerName: pkg!.customerName ?? manifestRow.customerName,
      ruta: pkg!.ruta ?? manifestRow.ruta,
      confidence: 0.6,
    };
  }
  if (isRealCustomerSlCode(enc?.slCode)) {
    return {
      source: 'encomiendas',
      slCode: enc!.slCode,
      customerName: enc!.customerName ?? manifestRow.customerName,
      ruta: enc!.ruta ?? manifestRow.ruta,
      confidence: 0.6,
    };
  }

  // No real customer slCode anywhere in the evidence — operator MUST pick
  // one via the Facturas → Reasignar flow. The audit still reports the
  // inconsistency at compareRow time; we just refuse to auto-propose.
  return null;
}

// ── Per-row issue detection ──────────────────────────────────────────────

interface CollectorContext {
  bySeverity: Record<IntegrityIssueSeverity, number>;
  byKind: Partial<Record<IntegrityIssueKind, number>>;
  invoicesNeedingReview: Set<string>;
}

function bumpSummary(
  ctx: CollectorContext,
  kind: IntegrityIssueKind,
  severity: IntegrityIssueSeverity,
  invoiceId?: string,
) {
  ctx.bySeverity[severity]++;
  ctx.byKind[kind] = (ctx.byKind[kind] ?? 0) + 1;
  if (invoiceId) ctx.invoicesNeedingReview.add(invoiceId);
}

/**
 * Inspect a single row + its evidence and emit zero-or-more
 * `IntegrityIssue` entries. The function is exported only for testing.
 */
export function compareRow(
  manifestRow: ManifestRowSnapshot,
  evidence: IntegrityEvidence,
  ctx: CollectorContext,
): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const fix = deriveSuggestedFix(manifestRow, evidence);

  // ── slCode mismatch — always HIGH. ────────────────────────────────────
  // Surface as a single issue per row even when 3 sources disagree, so
  // the UI can present one repair card per row.
  const sources: Array<[string, string]> = [];
  if (evidence.packagesCollection?.slCode) sources.push(['packages', evidence.packagesCollection.slCode]);
  if (evidence.encomiendas?.slCode) sources.push(['encomiendas', evidence.encomiendas.slCode]);
  if (evidence.invoice?.clientSlCode) sources.push(['invoice', evidence.invoice.clientSlCode]);

  const slMismatch = sources.find(([, sl]) => !eqInsensitive(sl, manifestRow.slCode));
  if (slMismatch && manifestRow.slCode) {
    const issue: IntegrityIssue = {
      kind: 'slcode_mismatch',
      severity: 'high',
      manifestRow,
      evidence,
      suggestedFix: fix ?? undefined,
      message: `Manifest dice slCode=${manifestRow.slCode || '—'}; ${slMismatch[0]} dice ${slMismatch[1]}.`,
    };
    out.push(issue);
    bumpSummary(ctx, 'slcode_mismatch', 'high', evidence.invoice?.invoiceId);
  } else if (!manifestRow.slCode && sources.length > 0) {
    // Empty slCode in manifest but some other source has it — same severity.
    const issue: IntegrityIssue = {
      kind: 'slcode_mismatch',
      severity: 'high',
      manifestRow,
      evidence,
      suggestedFix: fix ?? undefined,
      message: `Manifest sin slCode; ${sources[0][0]} dice ${sources[0][1]}.`,
    };
    out.push(issue);
    bumpSummary(ctx, 'slcode_mismatch', 'high', evidence.invoice?.invoiceId);
  }

  // ── name_mismatch — MEDIUM. Only fire when we did NOT already report
  //    an slCode issue (would be redundant since fixing slCode brings the
  //    customerName along).
  if (out.length === 0) {
    const evNames = [
      evidence.packagesCollection?.customerName,
      evidence.encomiendas?.customerName,
      evidence.invoice?.clientName,
    ].filter(Boolean) as string[];
    const nameDrift = evNames.find(n => !eqInsensitiveNonEmpty(n, manifestRow.customerName));
    if (nameDrift && manifestRow.customerName) {
      const issue: IntegrityIssue = {
        kind: 'name_mismatch',
        severity: 'medium',
        manifestRow,
        evidence,
        suggestedFix: fix ?? undefined,
        message: `Manifest dice customer="${manifestRow.customerName}"; otra fuente dice "${nameDrift}".`,
      };
      out.push(issue);
      bumpSummary(ctx, 'name_mismatch', 'medium', evidence.invoice?.invoiceId);
    }
  }

  // ── route_mismatch — LOW (route can also drift legitimately when the
  //    operator updates a customer's default route in /customers).
  if (out.length === 0) {
    const evRutas = [
      evidence.packagesCollection?.ruta,
      evidence.encomiendas?.ruta,
    ].filter(Boolean) as string[];
    const rutaDrift = evRutas.find(r => !eqInsensitiveNonEmpty(r, manifestRow.ruta));
    if (rutaDrift && manifestRow.ruta) {
      out.push({
        kind: 'route_mismatch',
        severity: 'low',
        manifestRow,
        evidence,
        suggestedFix: fix ?? undefined,
        message: `Manifest dice ruta="${manifestRow.ruta}"; otra fuente dice "${rutaDrift}".`,
      });
      bumpSummary(ctx, 'route_mismatch', 'low');
    }
  }

  // ── invoice_customer_drift — MEDIUM (only fired when there's an active
  //    invoice AND the row's slCode disagrees AND we didn't already flag
  //    slcode_mismatch).
  if (out.length === 0 && evidence.invoice && !eqInsensitive(evidence.invoice.clientSlCode, manifestRow.slCode)) {
    out.push({
      kind: 'invoice_customer_drift',
      severity: 'medium',
      manifestRow,
      evidence,
      suggestedFix: fix ?? undefined,
      message: `Factura ${evidence.invoice.invoiceNumber} cobrada a ${evidence.invoice.clientSlCode}, manifiesto dice ${manifestRow.slCode || '—'}.`,
    });
    bumpSummary(ctx, 'invoice_customer_drift', 'medium', evidence.invoice.invoiceId);
  }

  // ── invoice_weight_drift / invoice_price_drift — MEDIUM. Independent of
  //    the customer-drift checks; can co-exist with name/route drift.
  //
  // CONSOLIDATION GUARD (2026-05-04): consolidated invoices aggregate many
  // trackings into a single line item. The per-tracking `weight`/`unitPrice`
  // extracted from `invoiceItems[]` reflects *one* tracking's share of that
  // aggregate — it is EXPECTED to differ from the manifest row's individual
  // weight/price because:
  //   • `weight`  comes from the consolidation's billable weight split.
  //   • `unitPrice` is computed from the invoice's total and divided by the
  //     number of trackings, not the manifest row's per-tracking price.
  // Surfacing these as issues produces false positives and floods the
  // operator. Normal (non-consolidated) invoices stay strict.
  if (evidence.invoice && !evidence.invoice.isConsolidation) {
    const invWeight = evidence.invoice.weight;
    const invPrice = evidence.invoice.unitPrice;
    if (invWeight != null && Math.abs(invWeight - manifestRow.weight) > WEIGHT_EPSILON) {
      out.push({
        kind: 'invoice_weight_drift',
        severity: 'medium',
        manifestRow,
        evidence,
        message: `Factura ${evidence.invoice.invoiceNumber} pesa ${invWeight.toFixed(2)} kg; manifiesto dice ${manifestRow.weight.toFixed(2)} kg.`,
      });
      bumpSummary(ctx, 'invoice_weight_drift', 'medium', evidence.invoice.invoiceId);
    }
    if (invPrice != null && Math.abs(invPrice - manifestRow.price) > PRICE_EPSILON) {
      out.push({
        kind: 'invoice_price_drift',
        severity: 'medium',
        manifestRow,
        evidence,
        message: `Factura ${evidence.invoice.invoiceNumber} cobra $${invPrice.toFixed(2)}; manifiesto dice $${manifestRow.price.toFixed(2)}.`,
      });
      bumpSummary(ctx, 'invoice_price_drift', 'medium', evidence.invoice.invoiceId);
    }
  }

  // ── orphan_tracking — LOW. Tracking exists in manifest but no invoice
  //    references it. Skipped when the row has no slCode (won't be billed
  //    in any case).
  if (manifestRow.slCode && !evidence.invoice) {
    out.push({
      kind: 'orphan_tracking',
      severity: 'low',
      manifestRow,
      evidence,
      message: `${manifestRow.tracking} no aparece en ninguna factura activa.`,
    });
    bumpSummary(ctx, 'orphan_tracking', 'low');
  }

  // ── duplicate_invoice — HIGH (fires regardless of other findings).
  if (evidence.conflictingInvoices && evidence.conflictingInvoices.length > 0) {
    const ids = evidence.conflictingInvoices.map(c => c.invoiceNumber || c.invoiceId).join(', ');
    out.push({
      kind: 'duplicate_invoice',
      severity: 'high',
      manifestRow,
      evidence,
      message: `${manifestRow.tracking} aparece en múltiples facturas: ${ids}.`,
    });
    bumpSummary(ctx, 'duplicate_invoice', 'high', evidence.invoice?.invoiceId);
    // Also flag the conflicting invoices.
    evidence.conflictingInvoices.forEach(c => ctx.invoicesNeedingReview.add(c.invoiceId));
  }

  return out;
}

// ── Top-level pure entrypoint ─────────────────────────────────────────────

/**
 * Compute the integrity report from already-loaded data. No Firestore I/O.
 *
 * Caller responsibility: pass in the four authoritative collections
 * filtered to the manifest's scope. The audit performs no further
 * filtering — it assumes every input row belongs to the same manifest.
 */
export function computeIntegrityReport(inputs: IntegrityAuditInputs): IntegrityReport {
  const { manifestId, manifestPackages, packagesCollection, encomiendas, invoices } = inputs;

  // ── Index by tracking for O(1) cross-ref lookups ───────────────────────
  const pkgByTracking = new Map<string, IntegrityAuditInputs['packagesCollection'][number]>();
  for (const p of packagesCollection) pkgByTracking.set(upperTracking(p.tracking), p);

  const encByTracking = new Map<string, IntegrityAuditInputs['encomiendas'][number]>();
  for (const e of encomiendas) encByTracking.set(upperTracking(e.tracking), e);

  // For invoices — a tracking can appear in MULTIPLE invoices. Keep all
  // of them so we can detect duplicates. Skip tombstone statuses.
  const invsByTracking = new Map<string, IntegrityAuditInputs['invoices']>();
  for (const inv of invoices) {
    if (TOMBSTONE_INVOICE_STATUSES.has(inv.status.toLowerCase())) continue;
    for (const tr of inv.trackings) {
      const k = upperTracking(tr);
      const list = invsByTracking.get(k) ?? [];
      list.push(inv);
      invsByTracking.set(k, list);
    }
  }

  // ── Walk every manifest row ───────────────────────────────────────────
  const ctx: CollectorContext = {
    bySeverity: { high: 0, medium: 0, low: 0 },
    byKind: {},
    invoicesNeedingReview: new Set<string>(),
  };
  const issues: IntegrityIssue[] = [];

  manifestPackages.forEach((row, rowIndex) => {
    const tracking = upperTracking(row.tracking);
    if (!tracking) return;

    const snapshot: ManifestRowSnapshot = {
      rowIndex,
      tracking,
      slCode: String(row.slCode ?? '').trim(),
      customerName: String(row.customerName ?? '').trim(),
      ruta: String(row.ruta ?? '').trim(),
      weight: Number(row.weight) || 0,
      price: Number(row.price) || 0,
    };

    const pkg = pkgByTracking.get(tracking);
    const enc = encByTracking.get(tracking);
    const invList = invsByTracking.get(tracking) ?? [];
    const primaryInv = invList[0];
    const others = invList.slice(1);

    const evidence: IntegrityEvidence = {};
    if (pkg) {
      evidence.packagesCollection = {
        docId: pkg.docId,
        slCode: String(pkg.slCode ?? '').trim(),
        customerName: String(pkg.customerName ?? '').trim(),
        ruta: String(pkg.ruta ?? '').trim(),
      };
    }
    if (enc) {
      evidence.encomiendas = {
        docId: enc.docId,
        slCode: String(enc.slCode ?? '').trim(),
        customerName: String(enc.customerName ?? '').trim(),
        ruta: String(enc.ruta ?? '').trim(),
      };
    }
    if (primaryInv) {
      const status = primaryInv.status.toLowerCase();
      const item = primaryInv.items?.find(i => upperTracking(i.tracking) === tracking);
      evidence.invoice = {
        invoiceId: primaryInv.invoiceId,
        invoiceNumber: primaryInv.invoiceNumber,
        clientSlCode: String(primaryInv.clientSlCode ?? '').trim(),
        clientName: String(primaryInv.clientName ?? '').trim(),
        status,
        isProtected: PROTECTED_INVOICE_STATUSES.has(status),
        // Defaults to false when the fixture omits it — protects pre-existing
        // tests that constructed invoice inputs without the consolidation flag.
        isConsolidation: primaryInv.isConsolidation === true,
        unitPrice: item?.unitPrice,
        weight: item?.weight,
      };
    }
    if (others.length > 0) {
      evidence.conflictingInvoices = others.map(o => ({
        invoiceId: o.invoiceId,
        invoiceNumber: o.invoiceNumber,
        clientSlCode: o.clientSlCode,
        status: o.status.toLowerCase(),
      }));
    }

    issues.push(...compareRow(snapshot, evidence, ctx));
  });

  // ── Sort: high severity first, then by rowIndex for deterministic UI ─
  const severityRank: Record<IntegrityIssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => {
    const r = severityRank[a.severity] - severityRank[b.severity];
    if (r !== 0) return r;
    return a.manifestRow.rowIndex - b.manifestRow.rowIndex;
  });

  // ── Repairable count: rows where confidence ≥ 0.8.
  // Many issues per row collapse into a single "row repaired" counter.
  const repairableRows = new Set<number>();
  issues.forEach(i => {
    if (i.suggestedFix && i.suggestedFix.confidence >= 0.8) {
      repairableRows.add(i.manifestRow.rowIndex);
    }
  });

  return {
    manifestId,
    scannedAt: new Date().toISOString(),
    totalRows: manifestPackages.length,
    issues,
    summary: {
      bySeverity: ctx.bySeverity,
      byKind: ctx.byKind,
      repairableManifestRows: repairableRows.size,
      invoicesNeedingReview: ctx.invoicesNeedingReview.size,
    },
  };
}
