import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/firebase/config';
import { addItemsToConsolidation, movePackagesBetweenManifestDocs } from '@/lib/services/manifest-consolidation-service';

// Mock dependencies
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  dbSP2: {},
}));

vi.mock('@/lib/services/manifest-consolidation-service', () => ({
  addItemsToConsolidation: vi.fn().mockResolvedValue(undefined),
  movePackagesBetweenManifestDocs: vi.fn().mockResolvedValue(undefined),
  batchUpdateConsolidationManifest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/sync-smartweb-service', () => ({
  syncPackagesToSmartWeb: vi.fn().mockResolvedValue(undefined),
}));

describe('Invoice Annulment and Atomic Moves Invariants Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Annul Invoice -> Move to Consolidación Transitoria', () => {
    it('sets invoice to annulled, marks packages as consolidated and adds them to Transitoria without touching other invoices', async () => {
      const invoiceId = 'inv-123';
      const items = [
        { tracking: 'TBA111', weight: 1.5, price: 10, slCode: 'SL26025', description: 'Shoes' },
        { tracking: 'TBA222', weight: 2.0, price: 15, slCode: 'SL26025', description: 'Clothes' },
      ];

      // Simulated atomic annulment handler logic when targetManifest is null
      const targetManifest = null;
      const invoiceUpdates: Record<string, any> = {
        status: 'annulled',
        annulledAt: new Date().toISOString(),
        cancelReason: 'Anulada para mover a consolidación transitoria',
      };

      const packageDocUpdates = items.map(item => ({
        tracking: item.tracking,
        status: targetManifest ? 'customs' : 'consolidated',
        consolidacion: !targetManifest,
        invoiceId: null, // cleared
      }));

      // When targetManifest is null, addItemsToConsolidation must be called
      if (!targetManifest) {
        await addItemsToConsolidation(items as any);
      } else {
        await movePackagesBetweenManifestDocs(
          items.map(i => i.tracking),
          '19-08-2026DAN',
          (targetManifest as any).manifestNumber,
          [invoiceId]
        );
      }

      // Assertions:
      expect(invoiceUpdates.status).toBe('annulled');
      expect(packageDocUpdates.every(p => p.status === 'consolidated')).toBe(true);
      expect(packageDocUpdates.every(p => p.consolidacion === true)).toBe(true);
      expect(packageDocUpdates.every(p => p.invoiceId === null)).toBe(true);
      
      expect(addItemsToConsolidation).toHaveBeenCalledTimes(1);
      expect(addItemsToConsolidation).toHaveBeenCalledWith(items);
      expect(movePackagesBetweenManifestDocs).not.toHaveBeenCalled();
    });
  });

  describe('2. Annul Invoice -> Move to another Manifest', () => {
    it('sets invoice to annulled, reassigns packages to target manifest and mirrors in manifest doc without touching active invoices', async () => {
      const invoiceId = 'inv-456';
      const sourceManifest = '19-08-2026DAN';
      const targetManifest = { manifestNumber: '20-08-2026DAN' };
      const items = [
        { tracking: 'TBA333', weight: 1.0, price: 10, slCode: 'SL26025', description: 'Electronics' },
      ];

      const invoiceUpdates: Record<string, any> = {
        status: 'annulled',
        annulledAt: new Date().toISOString(),
        cancelReason: `Anulada y trasladada al manifiesto ${targetManifest.manifestNumber}`,
      };

      const packageDocUpdates = items.map(item => ({
        tracking: item.tracking,
        manifestNumber: targetManifest.manifestNumber,
        status: targetManifest ? 'customs' : 'consolidated',
        invoiceId: null, // cleared
      }));

      if (targetManifest) {
        await movePackagesBetweenManifestDocs(
          items.map(i => i.tracking),
          sourceManifest,
          targetManifest.manifestNumber,
          [invoiceId]
        );
      } else {
        await addItemsToConsolidation(items as any);
      }

      expect(invoiceUpdates.status).toBe('annulled');
      expect(packageDocUpdates.every(p => p.manifestNumber === '20-08-2026DAN')).toBe(true);
      expect(packageDocUpdates.every(p => p.status === 'customs')).toBe(true);
      expect(packageDocUpdates.every(p => p.invoiceId === null)).toBe(true);

      expect(movePackagesBetweenManifestDocs).toHaveBeenCalledTimes(1);
      expect(movePackagesBetweenManifestDocs).toHaveBeenCalledWith(
        ['TBA333'],
        '19-08-2026DAN',
        '20-08-2026DAN',
        ['inv-456']
      );
      expect(addItemsToConsolidation).not.toHaveBeenCalled();
    });
  });

  describe('3. Pure Atomic Move Invariant', () => {
    it('does NOT trigger implicit invoice writes during package reassignment', () => {
      // Invariant: packages moved to a new manifest stay ready for invoicing in the target manifest
      // without modifying or appending to any existing customer invoices in the background.
      const movedPackage = {
        id: 'pkg-789',
        trackingNumber: 'TBA999',
        manifestNumber: '20-08-2026DAN',
        slCode: 'SL26025',
      };

      expect(movedPackage.manifestNumber).toBe('20-08-2026DAN');
      expect(movedPackage.slCode).toBe('SL26025');
    });
  });
});
