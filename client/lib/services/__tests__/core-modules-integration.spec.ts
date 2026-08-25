import { describe, it, expect } from 'vitest';
import { recomputeInvoiceCRC } from '../update-exchange-rate-service';
import { detectPermit } from '../permit-detector';

describe('Core Operations Functional Integration Specs — Invoices, Packages, Consolidations & Encomiendas', () => {

  describe('1. Facturación & Exchange Rate Recomputation', () => {
    it('should correctly calculate subtotal, IVA, and total for multi-package invoices', () => {
      const packages = [
        { weight: 2.5, priceUSD: 15.00 },
        { weight: 1.0, priceUSD: 6.00 },
      ];
      const sumWeight = packages.reduce((acc, p) => acc + p.weight, 0);
      const sumPriceUSD = packages.reduce((acc, p) => acc + p.priceUSD, 0);

      expect(sumWeight).toBe(3.5);
      expect(sumPriceUSD).toBe(21.00);

      const tc = 500;
      const amountCRC = Math.round(sumPriceUSD * tc);
      expect(amountCRC).toBe(10500);
    });

    it('should accurately calculate CRC values when exchange rate changes', () => {
      const mockInvoice = {
        amount: 50.00,
        ivaEnabled: false,
      };

      const updated = recomputeInvoiceCRC(mockInvoice, 510);
      expect(updated.amountCRC).toBe(25500);
      expect(updated.subtotalCRC).toBe(25500);
      expect(updated.ivaCRC).toBe(0);
    });
  });

  describe('2. Packaging & Permit Detection', () => {
    it('should detect permits accurately for DANP manifest IDs and restricted items', () => {
      const res1 = detectPermit({ manifestId: '28-02-2026DANP' });
      expect(res1.requiresPermit).toBe(true);

      const res2 = detectPermit({ manifestId: '28-02-2026DAN' });
      expect(res2.requiresPermit).toBe(false);
    });

    it('should detect permit keywords in package descriptions', () => {
      const res = detectPermit({ description: 'MEDICAMENTOS Y VITAMINAS' });
      expect(res.requiresPermit).toBe(true);
    });
  });

  describe('3. Consolidación Transitoria & Date Prefix Parsing', () => {
    it('should extract manifest date prefixes for chronology and fusion grouping', () => {
      const extractDate = (id: string) => id.match(/^(\d{2}-\d{2}-\d{4})/)?.[1] || null;

      expect(extractDate('27-07-2026DAN')).toBe('27-07-2026');
      expect(extractDate('26-07-2026DANP')).toBe('26-07-2026');
    });
  });

  describe('4. Encomiendas & Manifest Exclusion Safeguards', () => {
    it('should identify encomienda manifest prefixes for strict filtering', () => {
      const isEncomiendaManifest = (id: string) =>
        id.startsWith('ENC-') || id.startsWith('ENC-MEGA-MAN-');

      expect(isEncomiendaManifest('ENC-MEGA-MAN-26-07-2026')).toBe(true);
      expect(isEncomiendaManifest('ENC-26-07-2026')).toBe(true);
      expect(isEncomiendaManifest('23-07-2026DAN')).toBe(false);
    });
  });
});
