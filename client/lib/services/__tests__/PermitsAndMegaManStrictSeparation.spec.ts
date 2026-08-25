import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isInvoiceForPermits,
  pickActiveInvoice,
  appendPackagesToCustomerInvoice,
  type InvoiceRecord,
  type PackageInvoiceEntry,
} from '@/lib/services/invoice-service';
import { fuseFirestoreManifests, mergeManifestIntoMegaMan } from '@/lib/services/manifest-processor/fusion';

describe('Permits and Regular Manifest Strict Separation Suite', () => {
  describe('1. isInvoiceForPermits classification helper', () => {
    it('correctly identifies DANP and PERMISOS manifests/invoices as permits', () => {
      expect(isInvoiceForPermits({ manifestNumber: '22-08-2026DANP' })).toBe(true);
      expect(isInvoiceForPermits({ manifestId: '11-04-2026DANP' })).toBe(true);
      expect(isInvoiceForPermits({ manifestNumber: '01-08-2026DANP' })).toBe(true);
      expect(isInvoiceForPermits({ requiresPermit: true })).toBe(true);
      expect(isInvoiceForPermits({ manifestNumber: 'MANIFEST_PERMISOS_2026' })).toBe(true);
    });

    it('correctly identifies regular and mega-man manifests as NOT permits', () => {
      expect(isInvoiceForPermits({ manifestNumber: '19-08-2026DAN' })).toBe(false);
      expect(isInvoiceForPermits({ manifestNumber: '20-08-2026DAN' })).toBe(false);
      expect(isInvoiceForPermits({ manifestNumber: 'SL-MEGA-MAN-20-08-2026' })).toBe(false);
      expect(isInvoiceForPermits({ manifestNumber: 'ENC-MEGA-MAN-20-08-2026' })).toBe(false);
      expect(isInvoiceForPermits({ requiresPermit: false, manifestNumber: '14-08-2026DAN' })).toBe(false);
      expect(isInvoiceForPermits(null)).toBe(false);
      expect(isInvoiceForPermits(undefined)).toBe(false);
    });
  });

  describe('2. pickActiveInvoice category separation', () => {
    const regularInvoice: InvoiceRecord = {
      id: 'inv-regular-1',
      invoiceNumber: 'SL26025-REGULAR',
      clientSlCode: 'SL26025',
      manifestNumber: '20-08-2026DAN',
      status: 'sent',
      amount: 76,
      createdAt: '2026-08-22T01:00:00Z',
    } as any;

    const permitInvoice: InvoiceRecord = {
      id: 'inv-permit-1',
      invoiceNumber: 'SL26025-PERMIT',
      clientSlCode: 'SL26025',
      manifestNumber: '22-08-2026DANP',
      requiresPermit: true,
      status: 'sent',
      amount: 30,
      createdAt: '2026-08-21T20:59:00Z',
    } as any;

    it('returns ONLY regular invoices when requesting regular packages', () => {
      const records = [permitInvoice, regularInvoice];
      const active = pickActiveInvoice(records, { isPermiso: false });
      expect(active?.id).toBe('inv-regular-1');
      expect(active?.manifestNumber).toBe('20-08-2026DAN');
    });

    it('returns ONLY permit invoices when requesting permit packages', () => {
      const records = [regularInvoice, permitInvoice];
      const active = pickActiveInvoice(records, { isPermiso: true });
      expect(active?.id).toBe('inv-permit-1');
      expect(active?.manifestNumber).toBe('22-08-2026DANP');
    });

    it('returns null and does NOT cross-pollinate when only a mismatched invoice exists', () => {
      // Customer ONLY has a permit invoice open, but we have a regular package
      const active = pickActiveInvoice([permitInvoice], { isPermiso: false });
      expect(active).toBeNull();

      // Customer ONLY has a regular invoice open, but we have a permit package
      const activePermit = pickActiveInvoice([regularInvoice], { isPermiso: true });
      expect(activePermit).toBeNull();
    });

    it('respects targetManifest option if provided', () => {
      const active = pickActiveInvoice([permitInvoice, regularInvoice], { targetManifest: '20-08-2026DAN' });
      expect(active?.id).toBe('inv-regular-1');

      const activePermit = pickActiveInvoice([permitInvoice, regularInvoice], { targetManifest: '22-08-2026DANP' });
      expect(activePermit?.id).toBe('inv-permit-1');
    });
  });

  describe('3. MEGA-MAN fusion strict rules', () => {
    it('fuseFirestoreManifests rejects fusing permit manifests with regular manifests', async () => {
      await expect(
        fuseFirestoreManifests(['19-08-2026DAN', '22-08-2026DANP'])
      ).rejects.toThrow(/No está permitido incluir manifiestos de permisos/);
    });

    it('mergeManifestIntoMegaMan rejects adding a permit manifest to a regular MEGA-MAN', async () => {
      await expect(
        mergeManifestIntoMegaMan('22-08-2026DANP', 'SL-MEGA-MAN-20-08-2026')
      ).rejects.toThrow(/es de permisos y no puede ser añadido a un MEGA-MAN/);
    });
  });
});
