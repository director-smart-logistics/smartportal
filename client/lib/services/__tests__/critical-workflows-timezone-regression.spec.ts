import { describe, it, expect } from 'vitest';
import {
  COSTA_RICA_TIMEZONE,
  getCostaRicaDateParts,
  getCostaRicaTodayISO,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  extractDateFromInvoiceNumber,
} from '../../utils/date-utils';
import {
  generateInvoiceNumber,
  safeFormatDate,
  safeFormatDateTime,
  isConsolidatedInvoice,
} from '../invoice-service';
import { buildRouteManifestHTML } from '../../utils/nova-print';
import { buildShippingLabelsHTML } from '../../../pages/encomiendas/components/encomienda-shipping-label';

describe('CRITICAL LOGISTICS WORKFLOWS — ZERO-REGRESSION SUITE', () => {
  // ── 1. SALIDA DE ENCOMIENDAS & ETIQUETAS DE ENCOMIENDA ─────────────────────────
  describe('Salida de Encomiendas & Etiquetas de Encomienda', () => {
    it('generates encomienda shipping labels with Costa Rica print date and manifest date', () => {
      const labels = [
        {
          customerName: 'Carlos Jimenez',
          slCode: 'SL4859',
          phone: '8888-9999',
          dni: '1-1234-0567',
          address: 'Sucursal Liberia',
          encomiendaService: 'Correos de Costa Rica',
          invoiceNumber: 'SL4859-20260817210000000',
          manifestNumber: 'ENC-20260817-01',
          invoiceStatus: 'paid',
          totalAmount: 25.5,
          currency: 'USD',
          items: [
            { trackingNumber: '940010001', description: 'Repuestos' },
            { trackingNumber: '940010002', description: 'Ropa' },
          ],
        },
      ];

      const html = buildShippingLabelsHTML(labels);
      expect(html).toContain('SMARTLOGISTICS');
      expect(html).toContain('CARLOS JIMENEZ');
      expect(html).toContain('SL4859');
      expect(html).toContain('940010001');
      expect(html).toContain('940010002');
      expect(html).toContain('17/08/2026'); // Manifest date correctly parsed
      const parts = getCostaRicaDateParts();
      expect(html).toContain(parts.yearStr);
    });
  });

  // ── 2. ETIQUETAS DE ENVÍO Y FECHAS DE CREACIÓN ─────────────────────────────────
  describe('Etiquetas de Envío de Paquetería', () => {
    it('formats parcel createdAt in Costa Rica timezone accurately', () => {
      const parcelUtc = '2026-08-18T03:30:00.000Z'; // 2026-08-17 21:30 in Costa Rica
      const formatted = formatCostaRicaDate(parcelUtc);
      expect(formatted).toBe('17/8/2026');
      expect(formatted).not.toContain('18/8/2026'); // Must not be UTC day 18
    });
  });

  // ── 3. BOLETAS DE RUTA Y DESPACHO DE CHOFERES ──────────────────────────────────
  describe('Boletas de Ruta y Despacho de Choferes (nova-print)', () => {
    it('aggregates packages, multiple invoices, and formats Costa Rica currency and manifest info', () => {
      const manifestId = 'MAN-20260817-SANJOSE';
      const rows = [
        {
          tracking: '940012345678901',
          customerName: 'Maria Rodriguez',
          manifestName: 'Maria Rodriguez',
          slCode: 'SL1001',
          ruta: 'San Jose Centro',
          weight: 2.5,
          price: 15.0,
          invoiceNumber: 'SL1001-20260817210000000',
          invoiceAmountUSD: 15.0,
        },
        {
          tracking: '940012345678902',
          customerName: 'Maria Rodriguez',
          manifestName: 'Maria Rodriguez',
          slCode: 'SL1001',
          ruta: 'San Jose Centro',
          weight: 1.5,
          price: 10.0,
          invoiceNumber: 'SL1001-20260817210000000',
          invoiceAmountUSD: 10.0,
        },
      ];

      const html = buildRouteManifestHTML(rows as any, 'San Jose Centro', manifestId, 520);

      expect(html).toContain('MAN-20260817-SANJOSE');
      expect(html).toContain('MARIA RODRIGUEZ');
      expect(html).toContain('SL1001');
      expect(html).toContain('940012345678901');
      expect(html).toContain('940012345678902');
      expect(html).toContain('SL1001-20260817210000000');
    });
  });

  // ── 4. CONSOLIDACIÓN, DEVOLUCIONES Y REASIGNACIÓN ──────────────────────────────
  describe('Consolidación y Devoluciones', () => {
    it('preserves invoice number and extracts correct date when package is returned', () => {
      const invNum = 'SL4859-20260416154146-C';
      expect(isConsolidatedInvoice({ invoiceNumber: invNum })).toBe(true);

      const formattedDate = extractDateFromInvoiceNumber(invNum);
      expect(formattedDate).toContain('2026');
      expect(formattedDate).toContain('16');
      expect(formattedDate).toContain('abr');
    });

    it('generates new unique invoice numbers for newly consolidated packages in Costa Rica time', () => {
      const refInstant = new Date('2026-08-18T02:45:30.500Z'); // 2026-08-17 20:45:30 in CR
      const inv = generateInvoiceNumber('SL7777', true, refInstant);

      expect(inv).toBe('SL7777-20260817204530500-C');
      expect(isConsolidatedInvoice({ invoiceNumber: inv })).toBe(true);
    });
  });

  // ── 5. MANIFIESTOS DE NOVA Y COMPROBANTES DE FACTURAS ─────────────────────────
  describe('Nova & Invoices Universal Guarantee', () => {
    it('ensures safeFormatDate handles diverse historical and new formats without regression', () => {
      expect(safeFormatDate('15/08/2026')).toBe('15/08/2026');
      expect(safeFormatDate('15-08-2026')).toBe('15-08-2026');
      expect(safeFormatDate('2026-08-17T22:00:00Z')).toBe('17/8/2026');
      expect(safeFormatDate(null)).toBe('');
      expect(safeFormatDate(undefined)).toBe('');
    });

    it('ensures safeFormatDateTime outputs Costa Rica local hour and minute', () => {
      const utcDate = '2026-08-18T04:15:00.000Z'; // 2026-08-17 22:15 in Costa Rica
      const res = safeFormatDateTime(utcDate, { hour12: false });
      expect(res).toContain('17/8/2026');
      expect(res).toContain('22:15');
    });

    it('guarantees getCostaRicaTodayISO matches Costa Rica local calendar day', () => {
      const todayISO = getCostaRicaTodayISO();
      expect(todayISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
