/**
 * Tests for `computeIntegrityReport` — the pure cross-source comparison
 * engine that powers the Nova manifest integrity audit.
 *
 * The contract this suite freezes:
 *   1. SlCode mismatches always emit `slcode_mismatch` (high severity)
 *      with a suggestedFix derived from the authority ranking.
 *   2. Protected invoices win as the suggested fix source (confidence 0.95).
 *   3. Cross-source consensus (≥2 sources agree) wins over single-source.
 *   4. Invoice drift (weight/price) is reported even when slCode matches.
 *   5. Duplicate invoices are flagged independently.
 *   6. Tombstone invoices (annulled/cancelled/void) are silently ignored.
 *   7. Repairable count only includes rows where confidence ≥ 0.8.
 */

import { describe, it, expect } from 'vitest';
import { computeIntegrityReport, compareRow } from '.././compute';
import type {
  IntegrityAuditInputs,
  IntegrityEvidence,
  ManifestRowSnapshot,
  IntegrityIssueKind,
  IntegrityIssueSeverity,
} from '.././types';

// ── Fixture helpers ───────────────────────────────────────────────────────

function manifestRow(over: Partial<IntegrityAuditInputs['manifestPackages'][number]> = {}): IntegrityAuditInputs['manifestPackages'][number] {
  return {
    tracking: 'TRK-1',
    slCode: 'SL26111',
    customerName: 'APRIL JIMENEZ HERRERA',
    ruta: 'METROPOLITANA',
    weight: 2.45,
    price: 18.47,
    ...over,
  };
}

function pkgRow(over: Partial<IntegrityAuditInputs['packagesCollection'][number]> = {}): IntegrityAuditInputs['packagesCollection'][number] {
  return {
    docId: 'TRK-1',
    tracking: 'TRK-1',
    slCode: 'SL488',
    customerName: 'ARELIS VALERIO QUESADA',
    ruta: 'METROPOLITANA',
    ...over,
  };
}

function encRow(over: Partial<IntegrityAuditInputs['encomiendas'][number]> = {}): IntegrityAuditInputs['encomiendas'][number] {
  return {
    docId: 'TRK-1',
    tracking: 'TRK-1',
    slCode: 'SL488',
    customerName: 'ARELIS VALERIO QUESADA',
    ruta: 'Encomiendas',
    ...over,
  };
}

function invoiceRow(over: Partial<IntegrityAuditInputs['invoices'][number]> = {}): IntegrityAuditInputs['invoices'][number] {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'SL488-202604280000-C',
    clientSlCode: 'SL488',
    clientName: 'ARELIS VALERIO QUESADA',
    status: 'sent',
    trackings: ['TRK-1'],
    items: [{ tracking: 'TRK-1', unitPrice: 18.47, weight: 2.45 }],
    ...over,
  };
}

function inputs(over: Partial<IntegrityAuditInputs> = {}): IntegrityAuditInputs {
  return {
    manifestId: 'MEGA-MAN-TEST',
    manifestPackages: [manifestRow()],
    packagesCollection: [],
    encomiendas: [],
    invoices: [],
    ...over,
  };
}

// ── slCode mismatch ──────────────────────────────────────────────────────

describe('computeIntegrityReport — slCode mismatch detection', () => {
  it('flags HIGH-severity slcode_mismatch when packages disagrees with manifest', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow()],
    }));
    expect(r.issues).toHaveLength(2); // slcode_mismatch + orphan_tracking
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue).toBeDefined();
    expect(slIssue!.severity).toBe('high');
    expect(slIssue!.message).toMatch(/SL26111/);
    expect(slIssue!.message).toMatch(/SL488/);
    expect(r.summary.bySeverity.high).toBe(1);
  });

  it('does NOT flag mismatch when all sources agree', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'SL26111', customerName: 'APRIL JIMENEZ HERRERA' })],
      encomiendas: [encRow({ slCode: 'SL26111', customerName: 'APRIL JIMENEZ HERRERA' })],
      invoices: [invoiceRow({ clientSlCode: 'SL26111', clientName: 'APRIL JIMENEZ HERRERA' })],
    }));
    expect(r.issues.find(i => i.kind === 'slcode_mismatch')).toBeUndefined();
  });

  it('treats slCode comparison case-insensitively', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'sl26111' })],  // lowercase
      manifestPackages: [manifestRow({ slCode: 'SL26111' })],
    }));
    expect(r.issues.find(i => i.kind === 'slcode_mismatch')).toBeUndefined();
  });

  it('flags slcode_mismatch when manifest slCode is empty but packages has one', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: '' })],
      packagesCollection: [pkgRow({ slCode: 'SL488' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue).toBeDefined();
    expect(slIssue!.severity).toBe('high');
    expect(slIssue!.message).toMatch(/sin slCode/i);
  });
});

// ── Suggested-fix authority ──────────────────────────────────────────────

describe('computeIntegrityReport — suggestedFix authority ranking', () => {
  it('protected invoice status does NOT grant authority (2026-05-04 policy)', () => {
    // Every source disagrees → no consensus → fallback ranking applies:
    // packages wins over encomiendas, invoice gets rewritten by the repair.
    // Previous policy returned 'invoice_protected' at 0.95 — that override
    // was removed because it prevented legitimate orphan-prefix cleanups
    // (e.g. invoice stamped `SL-NAN-…` while manifest+packages agree on
    // the real SL code).
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'SL_PKG' })],
      encomiendas:        [encRow({ slCode: 'SL_ENC' })],
      invoices:           [invoiceRow({ clientSlCode: 'SL488', status: 'sent' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).not.toBe('invoice_protected');
    // No consensus → falls through to invoice fallback (0.75 conf) regardless
    // of protected status. The invoice is still a hint — it's just no longer
    // a veto against 2+ agreeing sources.
    expect(slIssue?.suggestedFix?.source).toBe('invoice_draft');
    expect(slIssue?.suggestedFix?.slCode).toBe('SL488');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.75);
  });

  it('manifest + packages consensus outvotes a protected invoice', () => {
    // Real-world case: manifest and packages agree on SL6519 but the
    // invoice was stamped `Alajuela-…` (route-name leak) and then sent.
    // New policy: consensus wins, invoice gets rewritten by the repair.
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: 'SL6519', customerName: 'JEFFRY ORTIZ', ruta: 'Alajuela' })],
      packagesCollection: [pkgRow({ slCode: 'SL6519', customerName: 'JEFFRY ORTIZ', ruta: 'Alajuela' })],
      invoices: [invoiceRow({ clientSlCode: 'Alajuela', status: 'sent' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).toBe('consensus');
    expect(slIssue?.suggestedFix?.slCode).toBe('SL6519');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.90);
  });

  it('uses CONSENSUS when two sources agree and there is no protected invoice', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'SL488' })],
      encomiendas:        [encRow({ slCode: 'SL488' })],
      // No invoice, or only a draft.
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).toBe('consensus');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.90);
    expect(slIssue?.suggestedFix?.slCode).toBe('SL488');
  });

  it('uses DRAFT INVOICE when no consensus and no protected invoice', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'SL777' })], // disagrees with invoice
      invoices: [invoiceRow({ clientSlCode: 'SL999', status: 'draft' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).toBe('invoice_draft');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.75);
  });

  it('uses PACKAGES alone when only one source available', () => {
    const r = computeIntegrityReport(inputs({
      packagesCollection: [pkgRow({ slCode: 'SL488' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).toBe('packages');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.6);
  });

  it('uses ENCOMIENDAS alone when packages absent', () => {
    const r = computeIntegrityReport(inputs({
      encomiendas: [encRow({ slCode: 'SL488' })],
    }));
    const slIssue = r.issues.find(i => i.kind === 'slcode_mismatch');
    expect(slIssue?.suggestedFix?.source).toBe('encomiendas');
    expect(slIssue?.suggestedFix?.confidence).toBeCloseTo(0.6);
  });
});

// ── Invoice drift ────────────────────────────────────────────────────────

describe('computeIntegrityReport — invoice drift', () => {
  it('flags invoice_weight_drift when invoice weight differs from manifest', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ weight: 2.45 })],
      invoices: [invoiceRow({
        clientSlCode: 'SL26111',
        clientName: 'APRIL JIMENEZ HERRERA',
        items: [{ tracking: 'TRK-1', unitPrice: 18.47, weight: 5.0 }],
      })],
    }));
    const issue = r.issues.find(i => i.kind === 'invoice_weight_drift');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('medium');
  });

  it('flags invoice_price_drift when invoice unitPrice differs', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ price: 18.47 })],
      invoices: [invoiceRow({
        clientSlCode: 'SL26111',
        clientName: 'APRIL JIMENEZ HERRERA',
        items: [{ tracking: 'TRK-1', unitPrice: 25.99, weight: 2.45 }],
      })],
    }));
    const issue = r.issues.find(i => i.kind === 'invoice_price_drift');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('medium');
    expect(issue!.message).toMatch(/25\.99/);
  });

  it('does NOT flag drift within epsilon tolerance', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ weight: 2.45, price: 18.47 })],
      invoices: [invoiceRow({
        clientSlCode: 'SL26111',
        clientName: 'APRIL JIMENEZ HERRERA',
        items: [{ tracking: 'TRK-1', unitPrice: 18.471, weight: 2.4501 }], // <0.005 drift
      })],
    }));
    expect(r.issues.find(i => i.kind === 'invoice_weight_drift')).toBeUndefined();
    expect(r.issues.find(i => i.kind === 'invoice_price_drift')).toBeUndefined();
  });
});

// ── Duplicate / orphan / tombstones ──────────────────────────────────────

describe('computeIntegrityReport — duplicate, orphan, tombstones', () => {
  it('flags duplicate_invoice when same tracking is in 2+ active invoices', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: 'SL26111' })],
      invoices: [
        invoiceRow({ invoiceId: 'inv-1', invoiceNumber: 'INV-001', clientSlCode: 'SL26111', clientName: 'APRIL', items: undefined }),
        invoiceRow({ invoiceId: 'inv-2', invoiceNumber: 'INV-002', clientSlCode: 'SL26111', clientName: 'APRIL', items: undefined, status: 'draft' }),
      ],
    }));
    const dup = r.issues.find(i => i.kind === 'duplicate_invoice');
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('high');
    expect(dup!.message).toMatch(/INV-002/);
    expect(r.summary.invoicesNeedingReview).toBeGreaterThanOrEqual(2);
  });

  it('flags orphan_tracking when row has slCode but no invoice references it', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: 'SL26111' })],
      // No invoices.
    }));
    expect(r.issues.find(i => i.kind === 'orphan_tracking')).toBeDefined();
  });

  it('does NOT flag orphan_tracking when row has no slCode (would not be billed anyway)', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: '' })],
    }));
    expect(r.issues.find(i => i.kind === 'orphan_tracking')).toBeUndefined();
  });

  it('IGNORES tombstone invoices (annulled / cancelled / void)', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [manifestRow({ slCode: 'SL26111' })],
      invoices: [
        invoiceRow({ status: 'annulled', clientSlCode: 'SL488' }),
        invoiceRow({ status: 'cancelled', clientSlCode: 'SL488' }),
        invoiceRow({ status: 'void', clientSlCode: 'SL488' }),
      ],
    }));
    // No slcode_mismatch (annulled invoices are tombstones, ignored).
    expect(r.issues.find(i => i.kind === 'slcode_mismatch')).toBeUndefined();
    // But orphan_tracking SHOULD fire because no live invoice.
    expect(r.issues.find(i => i.kind === 'orphan_tracking')).toBeDefined();
  });
});

// ── Sorting + summary ────────────────────────────────────────────────────

describe('computeIntegrityReport — sorting + summary', () => {
  it('sorts issues with HIGH severity first, then by rowIndex', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [
        manifestRow({ tracking: 'A', slCode: 'SL_A' }), // orphan_tracking → low
        manifestRow({ tracking: 'B', slCode: 'SL_X' }), // slcode_mismatch → high
      ],
      packagesCollection: [
        pkgRow({ tracking: 'B', slCode: 'SL_PKG' }),
      ],
    }));
    expect(r.issues[0].severity).toBe('high');
    expect(r.issues[0].kind).toBe('slcode_mismatch');
  });

  it('repairableManifestRows counts only rows with confidence >= 0.8', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [
        manifestRow({ tracking: 'A', slCode: 'SL_A' }),
        manifestRow({ tracking: 'B', slCode: 'SL_B' }),
      ],
      packagesCollection: [
        pkgRow({ tracking: 'A', slCode: 'SL_OTHER_A' }),
        pkgRow({ tracking: 'B', slCode: 'SL_OTHER_B' }),
      ],
      // Single-source → confidence 0.6 < 0.8 → not repairable
    }));
    expect(r.summary.repairableManifestRows).toBe(0);

    // Now with consensus on row A only:
    const r2 = computeIntegrityReport(inputs({
      manifestPackages: [
        manifestRow({ tracking: 'A', slCode: 'SL100' }),
        manifestRow({ tracking: 'B', slCode: 'SL200' }),
      ],
      packagesCollection: [
        pkgRow({ tracking: 'A', slCode: 'SL101' }),
        pkgRow({ tracking: 'B', slCode: 'SL202' }),
      ],
      encomiendas: [
        encRow({ tracking: 'A', slCode: 'SL101' }),  // consensus on A
      ],
    }));
    expect(r2.summary.repairableManifestRows).toBe(1);
  });

  it('counts issues by severity + kind in summary', () => {
    const r = computeIntegrityReport(inputs({
      manifestPackages: [
        manifestRow({ tracking: 'A', slCode: 'SL_A' }),
        manifestRow({ tracking: 'B', slCode: '' }),
      ],
      packagesCollection: [
        pkgRow({ tracking: 'A', slCode: 'SL_OTHER' }),
        pkgRow({ tracking: 'B', slCode: 'SL_BBB' }),
      ],
    }));
    expect(r.summary.bySeverity.high).toBe(2); // both rows have slcode_mismatch
    expect(r.summary.byKind.slcode_mismatch).toBe(2);
  });
});

// ── compareRow direct tests for fine-grained branches ────────────────────

describe('compareRow — single-row contract', () => {
  function emptyCtx() {
    return {
      bySeverity: { high: 0, medium: 0, low: 0 } as Record<IntegrityIssueSeverity, number>,
      byKind: {} as Partial<Record<IntegrityIssueKind, number>>,
      invoicesNeedingReview: new Set<string>(),
    };
  }

  it('does NOT report name_mismatch when an slcode_mismatch already fires (no double-counting)', () => {
    const row: ManifestRowSnapshot = {
      rowIndex: 0,
      tracking: 'TRK-1',
      slCode: 'SL_OLD',
      customerName: 'OLD NAME',
      ruta: '',
      weight: 1,
      price: 1,
    };
    const evidence: IntegrityEvidence = {
      packagesCollection: { docId: 'p', slCode: 'SL_NEW', customerName: 'NEW NAME', ruta: '' },
    };
    const issues = compareRow(row, evidence, emptyCtx());
    expect(issues.filter(i => i.kind === 'slcode_mismatch')).toHaveLength(1);
    expect(issues.filter(i => i.kind === 'name_mismatch')).toHaveLength(0);
  });

  it('reports name_mismatch standalone when slCode actually agrees', () => {
    const row: ManifestRowSnapshot = {
      rowIndex: 0,
      tracking: 'TRK-1',
      slCode: 'SL488',
      customerName: 'OLD NAME',
      ruta: '',
      weight: 1,
      price: 1,
    };
    const evidence: IntegrityEvidence = {
      packagesCollection: { docId: 'p', slCode: 'SL488', customerName: 'NEW NAME', ruta: '' },
    };
    const issues = compareRow(row, evidence, emptyCtx());
    const nm = issues.find(i => i.kind === 'name_mismatch');
    expect(nm).toBeDefined();
    expect(nm!.severity).toBe('medium');
  });
});
