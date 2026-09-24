import { describe, it, expect } from 'vitest';
import { deleteField } from 'firebase/firestore';
import {
  pkgHasPaidInvoice,
  buildReconsolidatePayload,
  buildReassignPayload,
} from '../components/returned-packages-mutations';

// AUDIT NOTE (2026-09-23): tests 'guards returned packages...', 'filters out
// returned packages from bulk route delivery updates', 'deduplicates
// packages...', 'aggregates multi-invoice sums...', and 'normalizes all
// synonyms of "route" status...' were removed from this file — they asserted
// against locally hand-typed copies of logic that actually lives in
// RoutesManagement.tsx / Distribution.tsx (a different module entirely,
// unrelated to ReturnedPackages.tsx), never importing anything real. That
// coverage gap is real and still open; tracked separately, not fixed here.
//
// The remaining tests below DID map to real logic — the paid/unpaid payload
// branches in ReturnedPackages.tsx's "Re-consolidar" and "Reasignar" admin
// actions (financially sensitive: a paid invoice's linkage/pricing must
// never be silently cleared). That logic has been extracted into
// returned-packages-mutations.ts (single source of truth for both the
// component and this test) and is exercised for real here.
const DELETED = deleteField();

describe('Returned Packages — paid-invoice preservation (buildReconsolidatePayload / buildReassignPayload)', () => {
  describe('pkgHasPaidInvoice', () => {
    it('is TRUE when the package doc itself says invoiceStatus === "paid"', () => {
      expect(pkgHasPaidInvoice({ invoiceStatus: 'paid' }, new Set())).toBe(true);
    });

    it('is TRUE when invoiceStatus is stale but the invoiceId is in the caller\'s paid-invoice set', () => {
      expect(pkgHasPaidInvoice({ invoiceStatus: 'draft', invoiceId: 'inv-1' }, new Set(['inv-1']))).toBe(true);
    });

    it('is FALSE when neither condition holds', () => {
      expect(pkgHasPaidInvoice({ invoiceStatus: 'draft', invoiceId: 'inv-2' }, new Set(['inv-1']))).toBe(false);
      expect(pkgHasPaidInvoice({}, new Set())).toBe(false);
    });
  });

  describe('buildReconsolidatePayload — "Re-consolidar" (send back to consolidacion_transitoria)', () => {
    it('PAID: preserves invoice linkage and pricing — does NOT clear invoiceId/invoiceNumber/precio', () => {
      const pkg = { invoiceId: 'inv-paid-1', invoiceNumber: 'FAC-001', invoiceStatus: 'paid' };
      const payload = buildReconsolidatePayload(pkg, '2026-09-23T10:00:00Z', true);

      expect(payload.manifestNumber).toBe('consolidacion_transitoria');
      expect(payload.status).toBe('consolidated');
      expect(payload.consolidacion).toBe(true);
      expect(payload.invoiceId).toBeUndefined();
      expect(payload).not.toHaveProperty('precio');
      expect(payload.statusHistory).toBeDefined();
    });

    it('UNPAID: clears invoice linkage AND every pricing override field via deleteField()', () => {
      const pkg = { invoiceId: 'inv-draft-1', invoiceNumber: 'FAC-002', invoiceStatus: 'draft' };
      const payload = buildReconsolidatePayload(pkg, '2026-09-23T10:00:00Z', false);

      expect(payload.invoiceId).toEqual(DELETED);
      expect(payload.invoiceNumber).toEqual(DELETED);
      expect(payload.invoiceStatus).toEqual(DELETED);
      expect(payload.precio).toEqual(DELETED);
      expect(payload.ajustePrecio).toEqual(DELETED);
      expect(payload.pesoRedondeo).toEqual(DELETED);
    });

    it('stamps firstConsolidatedAt only when the package does not already have one', () => {
      const now = '2026-09-23T10:00:00Z';
      const withoutOne = buildReconsolidatePayload({}, now, true);
      expect(withoutOne.firstConsolidatedAt).toBe(now);

      const withOne = buildReconsolidatePayload({ firstConsolidatedAt: '2026-01-01T00:00:00Z' }, now, true);
      expect(withOne.firstConsolidatedAt).toBeUndefined(); // not overwritten
    });
  });

  describe('buildReassignPayload — "Reasignar" (send to a specific target manifest)', () => {
    it('PAID: preserves invoiceId, invoiceNumber, invoiceStatus and does NOT delete pricing', () => {
      const pkg = {
        invoiceId: 'inv-sl270-paid',
        invoiceNumber: 'SL270-20260814133227598',
        invoiceStatus: 'paid',
        manifestNumber: '11-08-2026DAN',
      };
      const payload = buildReassignPayload(pkg, '2026-09-23T10:00:00Z', '14-08-2026DAN', true);

      expect(payload.manifestNumber).toBe('14-08-2026DAN');
      expect(payload.originalManifest).toBe('11-08-2026DAN');
      expect(payload.isReassigned).toBe(true);
      expect(payload.wasReturned).toBe(true);
      expect(payload.invoiceId).toBeUndefined();
      expect(payload).not.toHaveProperty('precio');
    });

    it('UNPAID: clears invoice linkage and pricing overrides for a clean re-invoice in the target manifest', () => {
      const pkg = { invoiceStatus: 'draft', manifestNumber: '11-08-2026DAN' };
      const payload = buildReassignPayload(pkg, '2026-09-23T10:00:00Z', '14-08-2026DAN', false);

      expect(payload.invoiceId).toEqual(DELETED);
      expect(payload.precio).toEqual(DELETED);
      expect(payload.ajustePrecio).toEqual(DELETED);
    });

    it('falls back through originalManifest -> manifestNumber -> manifiesto -> targetManifest, in that priority', () => {
      expect(buildReassignPayload({ originalManifest: 'ORIG-1', manifestNumber: 'M-2' }, 'now', 'TARGET', true).originalManifest).toBe('ORIG-1');
      expect(buildReassignPayload({ manifestNumber: 'M-2' }, 'now', 'TARGET', true).originalManifest).toBe('M-2');
      expect(buildReassignPayload({ manifiesto: 'M-3' }, 'now', 'TARGET', true).originalManifest).toBe('M-3');
      expect(buildReassignPayload({}, 'now', 'TARGET', true).originalManifest).toBe('TARGET');
    });

    it('sets encomiendaManifestNumber to the target manifest when it is an encomienda (ENC- prefix), else "none"', () => {
      expect(buildReassignPayload({}, 'now', 'ENC-2026-08', true).encomiendaManifestNumber).toBe('ENC-2026-08');
      expect(buildReassignPayload({}, 'now', 'USA-AIR-08', true).encomiendaManifestNumber).toBe('none');
      // Case-insensitive prefix check, mirrors the real code's .toUpperCase().startsWith('ENC-')
      expect(buildReassignPayload({}, 'now', 'enc-lowercase', true).encomiendaManifestNumber).toBe('enc-lowercase');
    });
  });
});
