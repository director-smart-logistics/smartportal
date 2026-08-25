/**
 * Nova manifest integrity — public types.
 *
 * ─── What "integrity" means here ──────────────────────────────────────────
 *
 * Nova writes the same logical row (one tracking → one customer / route /
 * weight / price) into FOUR Firestore locations:
 *
 *   1. `manifests/{mn}.packages[]`     — embedded snapshot, drives the table UI
 *   2. `packages/{trackingId}`         — canonical live record used everywhere
 *   3. `manifest_encomiendas/{trkId}`  — encomienda-routing mirror
 *   4. `invoices/*`                    — billing record (one or many per slCode)
 *
 * Under normal operation these four agree on `slCode`, `customerName`,
 * and `ruta` for any given tracking. The data-corruption bug
 * (BUG-CURATED-DESTROYED 2026-04-29) showed that during fusion / save
 * regressions, the embedded array could get rewritten with WRONG identity
 * fields while the other three sources retained the correct values.
 *
 * The integrity audit cross-references every tracking against all four
 * sources and reports any divergence. The output is a strict, typed
 * payload that the UI can render evidence-side-by-side without any
 * additional Firestore I/O — every datum needed to make a repair decision
 * is contained in the report.
 *
 * ─── Authority ranking ────────────────────────────────────────────────────
 *
 * When two sources disagree, the "right" answer is inferred from a
 * deterministic ranking:
 *
 *   1. Invoice in protected status (sent/paid/overdue/pending) —
 *      represents money already billed; almost always the canonical truth.
 *   2. Two or more sources agreeing on the same value (consensus).
 *   3. `packages/{tracking}` — the canonical live record.
 *   4. `manifest_encomiendas/{tracking}` — operator-curated routing.
 *   5. `manifests/{mn}.packages[]` — last resort (this is the field most
 *      likely to be corrupt since the bug lives in its writers).
 *
 * The audit never *mutates*. It only emits a `suggestedFix` payload,
 * which the repair service consumes (only when the operator confirms).
 */

/** Buckets of inconsistencies surfaced by the audit. */
export type IntegrityIssueKind =
  /** `manifest.row.slCode` differs from at least one other source. */
  | 'slcode_mismatch'
  /** `manifest.row.customerName` differs from at least one other source. */
  | 'name_mismatch'
  /** `manifest.row.ruta` differs from at least one other source. */
  | 'route_mismatch'
  /** Active invoice references a different `clientSlCode` than the manifest row. */
  | 'invoice_customer_drift'
  /** Active invoice item weight doesn't match the manifest row's `peso`. */
  | 'invoice_weight_drift'
  /** Active invoice item unit-price doesn't match the manifest row's `precio`. */
  | 'invoice_price_drift'
  /**
   * Tracking exists in the manifest but no active invoice contains it —
   * surfaced as a low-severity warning (the next "Actualizar BD" pass
   * will create one, but the operator might want to know now).
   */
  | 'orphan_tracking'
  /**
   * Same tracking found in TWO OR MORE active (non-annulled) invoices —
   * almost certainly a regression from the older paths that double-billed.
   */
  | 'duplicate_invoice';

/** Severity tier — drives sort order + colour in the UI. */
export type IntegrityIssueSeverity = 'high' | 'medium' | 'low';

/**
 * Snapshot of the manifest row's identity at audit time. Repair flows
 * compare this against the chosen evidence source to compute the diff.
 */
export interface ManifestRowSnapshot {
  /** Index into `manifest.packages[]` (used by repair to address the row). */
  rowIndex: number;
  /** Tracking ID, normalized to upper-case (we treat it as case-insensitive). */
  tracking: string;
  slCode: string;
  customerName: string;
  ruta: string;
  weight: number;
  price: number;
}

/** Cross-reference evidence pulled from another collection. */
export interface IntegrityEvidence {
  /** State found in `packages` collection (if a doc exists for the tracking). */
  packagesCollection?: {
    docId: string;
    slCode: string;
    customerName: string;
    ruta: string;
  };
  /** State found in `manifest_encomiendas` collection. */
  encomiendas?: {
    docId: string;
    slCode: string;
    customerName: string;
    ruta: string;
  };
  /**
   * Active (non-annulled) invoice referencing this tracking. When the
   * tracking appears in MULTIPLE invoices, only the first is surfaced
   * here; the duplicate is reported separately via `duplicate_invoice`.
   */
  invoice?: {
    invoiceId: string;
    invoiceNumber: string;
    clientSlCode: string;
    clientName: string;
    status: string;
    /** True for sent/paid/overdue/pending — drives suggestedFix authority. */
    isProtected: boolean;
    /**
     * True when the invoice aggregates several trackings into a single line
     * item (see `isConsolidatedInvoice` in `invoice-service.ts` — detects
     * `isConsolidation === true`, `-C` suffix, or `-CONSOLIDACION` suffix).
     * The audit DISABLES per-tracking weight/price drift checks on these
     * invoices because the consolidated line item rolls multiple trackings
     * together and the per-tracking numbers are not directly comparable.
     */
    isConsolidation: boolean;
    /** Per-tracking unit price extracted from the invoice item, when present. */
    unitPrice?: number;
    /** Per-tracking weight from the invoice item, when present. */
    weight?: number;
  };
  /** When `duplicate_invoice` fires, holds every other invoice that shares the tracking. */
  conflictingInvoices?: Array<{
    invoiceId: string;
    invoiceNumber: string;
    clientSlCode: string;
    status: string;
  }>;
}

/**
 * What the audit thinks the row SHOULD say, and how confident it is.
 * Absent when the audit can't reach a consensus — the operator must
 * decide manually in that case.
 */
export interface IntegritySuggestedFix {
  /** Which evidence source drove the suggestion. Drives provenance copy in the UI. */
  source: 'invoice_protected' | 'consensus' | 'packages' | 'encomiendas' | 'invoice_draft';
  slCode: string;
  customerName: string;
  ruta: string;
  /** [0..1] — UI uses ≥0.8 as the bar for "Aplicar todas las sugerencias confiables". */
  confidence: number;
}

/** Single audit finding. */
export interface IntegrityIssue {
  kind: IntegrityIssueKind;
  severity: IntegrityIssueSeverity;
  /** Manifest-side snapshot — where the issue lives in the table. */
  manifestRow: ManifestRowSnapshot;
  /** Cross-reference state used to detect the issue. */
  evidence: IntegrityEvidence;
  /** Optional automatic remediation — operator must still confirm. */
  suggestedFix?: IntegritySuggestedFix;
  /** Human-readable summary — render-safe, never holds Firestore refs. */
  message: string;
}

/** Aggregate view returned to the UI. */
export interface IntegrityReport {
  manifestId: string;
  /** ISO timestamp at the moment the audit ran. */
  scannedAt: string;
  /** Number of rows in `manifest.packages[]` at audit time. */
  totalRows: number;
  /** Every detected issue, sorted by severity then rowIndex. */
  issues: IntegrityIssue[];
  /** Pre-aggregated counters for header chips + summary line. */
  summary: {
    bySeverity: Record<IntegrityIssueSeverity, number>;
    byKind: Partial<Record<IntegrityIssueKind, number>>;
    /** Rows where `suggestedFix.confidence >= 0.8` — eligible for batch repair. */
    repairableManifestRows: number;
    /** Distinct invoiceIds with at least one drift issue (review queue size). */
    invoicesNeedingReview: number;
  };
}

/**
 * Inputs to the pure `computeIntegrityReport` function. Splitting the
 * I/O (Firestore queries) from the comparison logic keeps the audit
 * deterministic + unit-testable without firebase mocks.
 */
export interface IntegrityAuditInputs {
  manifestId: string;
  manifestPackages: Array<{
    tracking: string;
    slCode?: string;
    customerName?: string;
    ruta?: string;
    weight?: number;
    price?: number;
    [key: string]: unknown;
  }>;
  packagesCollection: Array<{
    docId: string;
    tracking: string;
    slCode?: string;
    customerName?: string;
    ruta?: string;
    [key: string]: unknown;
  }>;
  encomiendas: Array<{
    docId: string;
    tracking: string;
    slCode?: string;
    customerName?: string;
    ruta?: string;
    [key: string]: unknown;
  }>;
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    clientSlCode: string;
    clientName: string;
    status: string;
    /**
     * True when the invoice is a consolidation (multiple trackings rolled
     * into one line item). Populated by the audit loader via
     * `isConsolidatedInvoice` in `invoice-service.ts` — defaults to `false`
     * when omitted by test fixtures for backward compatibility.
     */
    isConsolidation?: boolean;
    /** Trackings referenced by the invoice. Audit only inspects this set. */
    trackings: string[];
    /** Per-tracking item details, when present. Index aligns with `trackings`. */
    items?: Array<{ tracking: string; unitPrice?: number; weight?: number }>;
  }>;
}
