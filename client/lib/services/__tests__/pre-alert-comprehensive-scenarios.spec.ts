import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isEligiblePreAlert,
  batchResolvePreAlerts,
  resolveCustomerSlCode,
} from '../pre-alert-resolver';
import {
  canonicalizeTracking,
  cleanRawTracking,
} from '../../utils/tracking-canonicalizer';

describe('Pre-Alert Comprehensive Scenarios & Anti-Regression Suite', () => {
  describe('1. Jimena Cerdas vs Jimena Gamboa Case (Manifest Rollover & Pre-Alert Priority)', () => {
    it('debe aceptar pre-alerta de Jimena Cerdas aunque tenga manifestNumber de borrador previo (13-08-2026DAN) en un mega-manifiesto (MEGA-MAN-14-08-2026)', () => {
      const jimenaCerdasDoc = {
        _id: '1Z1R054E0343790488_SL261320',
        tracking: '1Z1R054E0343790488',
        canonicalTracking: '1Z1R054E0343790488',
        slCode: 'SL261320',
        displayName: 'Jimena Cerdas',
        email: 'jmncerdas@gmail.com',
        manifestNumber: '13-08-2026DAN',
        active: true,
        status: 'received',
        invoiced: false,
        delivered: false,
        createdAt: '2026-08-04T18:01:00.000Z',
      };

      const isEligible = isEligiblePreAlert(jimenaCerdasDoc, 'MEGA-MAN-14-08-2026');
      expect(isEligible).toBe(true);
    });

    it('debe extraer el slCode correctamente del docId compuesto si slCode viene nulo en docData', async () => {
      const docWithCompositeId = {
        _id: '1Z1R054E0343790488_SL261320',
        tracking: '1Z1R054E0343790488',
      };
      const mockDb: any = {};
      const resolvedSl = await resolveCustomerSlCode(mockDb, docWithCompositeId);
      expect(resolvedSl).toBe('SL261320');
    });
  });

  describe('2. USPS IMpb Postal Composite Canonicalization (Jimena Sibaja Case)', () => {
    it('debe clasificar barcode USPS de 34 dígitos (serie 96) como POSTAL_COMPOSITE y mantener variantes', () => {
      const rawBarcode = '9632080400208194694100875411686022';
      const analysis = canonicalizeTracking(rawBarcode);

      expect(analysis.carrierType).toBe('POSTAL_COMPOSITE');
      expect(analysis.carrier).toBe('USPS');
      expect(analysis.canonicalTracking).toBe('9632080400208194694100875411686022');
      expect(analysis.trackingVariants).toContain('9632080400208194694100875411686022');
    });

    it('debe clasificar barcode USPS 420 con prefijo de ruteo Miami como POSTAL_COMPOSITE', () => {
      const rawUsps = '4203316694001008754116860220';
      const analysis = canonicalizeTracking(rawUsps);

      expect(analysis.carrierType).toBe('POSTAL_COMPOSITE');
      expect(analysis.carrier).toBe('USPS');
      expect(analysis.canonicalTracking).toBe('94001008754116860220');
      expect(analysis.trackingVariants).toContain('94001008754116860220');
    });
  });

  describe('3. Discrete Alphanumeric Isolation (Anti-False-Positive / Zero Collision)', () => {
    it('UPS 1Z: 1Z8V76X80398480603 debe ser DISCRETE_ALPHANUMERIC y no permitir allowSuffix', () => {
      const upsTracking = '1Z8V76X80398480603';
      const analysis = canonicalizeTracking(upsTracking);

      expect(analysis.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(analysis.carrier).toBe('UPS');
      expect(analysis.canonicalTracking).toBe('1Z8V76X80398480603');
      expect(analysis.allowSuffix).toBe(false);
      expect(analysis.trackingVariants).toEqual(['1Z8V76X80398480603']);
    });

    it('SpeedLogistics: GFUS01065635648649 debe ser DISCRETE_ALPHANUMERIC y no admitir cortes numéricos', () => {
      const gfusTracking = 'GFUS01065635648649';
      const analysis = canonicalizeTracking(gfusTracking);

      expect(analysis.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(analysis.carrier).toBe('SPEEDLOGISTICS');
      expect(analysis.allowSuffix).toBe(false);
      expect(analysis.trackingVariants).toEqual(['GFUS01065635648649']);
    });

    it('Amazon TBA: TBA304918274000 debe ser DISCRETE_ALPHANUMERIC', () => {
      const amazonTracking = 'TBA304918274000';
      const analysis = canonicalizeTracking(amazonTracking);

      expect(analysis.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(analysis.carrier).toBe('AMAZON');
      expect(analysis.allowSuffix).toBe(false);
    });
  });

  describe('4. Strict Lifecycle Ineligibility Gates', () => {
    it('debe rechazar pre-alertas que ya tienen factura asociada', () => {
      expect(isEligiblePreAlert({ active: true, invoiceNumber: 'INV-2026-001' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, invoiceId: 'inv-doc-123' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, invoiced: true })).toBe(false);
    });

    it('debe rechazar pre-alertas con delivered === true o deliveredAt', () => {
      expect(isEligiblePreAlert({ active: true, delivered: true })).toBe(false);
      expect(isEligiblePreAlert({ active: true, deliveredAt: '2026-08-01' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, packageStatus: 'delivered' })).toBe(false);
    });

    it('debe rechazar pre-alertas en estados terminales o canceladas', () => {
      expect(isEligiblePreAlert({ active: false, status: 'received' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, status: 'cancelled' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, status: 'void' })).toBe(false);
      expect(isEligiblePreAlert({ active: true, status: 'annulled' })).toBe(false);
    });

    it('debe rechazar pre-alertas con más de 60 días de antigüedad', () => {
      const oldDate = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
      expect(isEligiblePreAlert({ active: true, status: 'received', createdAt: oldDate })).toBe(false);

      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(isEligiblePreAlert({ active: true, status: 'received', createdAt: recentDate })).toBe(true);
    });
  });
});
