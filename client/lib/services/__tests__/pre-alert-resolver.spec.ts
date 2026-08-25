import { describe, it, expect } from 'vitest';
import { isEligiblePreAlert, resolveCustomerFullProfile } from '../pre-alert-resolver';
import { canonicalizeTracking } from '../../utils/tracking-canonicalizer';

describe('PreAlertResolver — Comprehensive Logic & Integrity Suite', () => {
  describe('Rule: isEligiblePreAlert (Consumable Entity & Active Gate)', () => {
    it('debe aceptar pre-alertas pendientes activas dentro de la ventana de 60 días', () => {
      const validDoc = {
        active: true,
        status: 'pending',
        createdAt: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, // 5 days old
      };
      expect(isEligiblePreAlert(validDoc)).toBe(true);
    });

    it('debe rechazar pre-alertas con active === false (Canceladas por cliente o admin)', () => {
      const cancelledDoc = {
        active: false,
        status: 'cancelled',
        createdAt: { toDate: () => new Date() },
      };
      expect(isEligiblePreAlert(cancelledDoc)).toBe(false);
    });

    it('debe rechazar pre-alertas en estado "manifested" (Consumidas por Nova previamente)', () => {
      const manifestedDoc = {
        active: true,
        status: 'manifested',
        manifestNumber: 'MAN-2026-08-18',
        createdAt: { toDate: () => new Date() },
      };
      expect(isEligiblePreAlert(manifestedDoc)).toBe(false);
    });

    it('debe rechazar pre-alertas en estados terminales (delivered, returned, void)', () => {
      ['delivered', 'returned', 'void', 'invoiced'].forEach((status) => {
        expect(isEligiblePreAlert({ active: true, status })).toBe(false);
      });
    });

    it('debe rechazar pre-alertas que ya tienen factura asociada (invoiceNumber o invoiceId)', () => {
      const invoicedDoc1 = { active: true, status: 'pending', invoiceNumber: 'INV-2026-001' };
      const invoicedDoc2 = { active: true, status: 'pending', invoiceId: 'INV-2026-002' };
      const invoicedDoc3 = { active: true, status: 'pending', invoiced: true };
      expect(isEligiblePreAlert(invoicedDoc1)).toBe(false);
      expect(isEligiblePreAlert(invoicedDoc2)).toBe(false);
      expect(isEligiblePreAlert(invoicedDoc3)).toBe(false);
    });

    it('debe permitir pre-alertas activas no facturadas y no entregadas aunque tengan referencia de manifiesto borrador previo', () => {
      const manifestDoc1 = { active: true, status: 'pending', manifestNumber: 'MIA-AIR-2026' };
      const manifestDoc2 = { active: true, status: 'pending', manifestId: 'MIA-AIR-2026' };
      expect(isEligiblePreAlert(manifestDoc1)).toBe(true);
      expect(isEligiblePreAlert(manifestDoc2)).toBe(true);
    });

    it('debe rechazar pre-alertas cuyos paquetes ya fueron entregados (delivered === true o deliveredAt)', () => {
      const deliveredDoc1 = { active: true, status: 'pending', delivered: true };
      const deliveredDoc2 = { active: true, status: 'pending', deliveredAt: new Date().toISOString() };
      const deliveredDoc3 = { active: true, status: 'pending', packageStatus: 'delivered' };
      expect(isEligiblePreAlert(deliveredDoc1)).toBe(false);
      expect(isEligiblePreAlert(deliveredDoc2)).toBe(false);
      expect(isEligiblePreAlert(deliveredDoc3)).toBe(false);
    });

    it('debe rechazar pre-alertas con más de 60 días de antigüedad (Prevención de números reciclados)', () => {
      const oldDoc = {
        active: true,
        status: 'pending',
        createdAt: { toDate: () => new Date(Date.now() - 65 * 24 * 60 * 60 * 1000) }, // 65 days old
      };
      expect(isEligiblePreAlert(oldDoc)).toBe(false);
    });
  });

  describe('Rule: Carrier Discrimination & Collision Prevention (Gabriela Alfaro Case)', () => {
    it('GFUS01065635648649 debe ser DISCRETE_ALPHANUMERIC y no permitir variantes por sufijo numérico', () => {
      const analysis = canonicalizeTracking('GFUS01065635648649');
      expect(analysis.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(analysis.allowSuffix).toBe(false);
      expect(analysis.canonicalTracking).toBe('GFUS01065635648649');
      // Must NOT generate numeric runs that collide with unrelated customer trackings
      expect(analysis.trackingVariants).toEqual(['GFUS01065635648649']);
    });

    it('1Z8V76X80398480603 (UPS) no debe recortarse numéricamente', () => {
      const analysis = canonicalizeTracking('1Z8V76X80398480603');
      expect(analysis.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(analysis.allowSuffix).toBe(false);
    });

    it('Barcode USPS con prefijo de ruteo 42033166 debe extraer el Core IMpb', () => {
      const analysis = canonicalizeTracking('420331669400111899223344556677');
      expect(analysis.carrierType).toBe('POSTAL_COMPOSITE');
      expect(analysis.allowSuffix).toBe(false);
      expect(analysis.canonicalTracking).toBe('9400111899223344556677');
    });
  });

  describe('3. Dynamic Customer Profile Enrichment (Legacy & Denormalized SSOT)', () => {
    const mockDb = {} as any;

    it('debe resolver userId puramente numérico (ej. 1796) como SL1796 y enriquecer perfil', async () => {
      const mockDoc = {
        tracking: 'GFUS01065241791744',
        userId: '1796',
        description: 'PAQUETE DE SHEIN',
      };

      const profile = await resolveCustomerFullProfile(mockDb as any, mockDoc);
      expect(profile.slCode).toBe('SL1796');
    });

    it('debe respetar slCode y datos existentes en el documento si ya están presentes', async () => {
      const mockDoc = {
        tracking: '9400111899228226247158',
        slCode: 'SL261320',
        displayName: 'Jimena Sibaja',
        dni: '118220345',
        email: 'jimena@example.com',
      };

      const profile = await resolveCustomerFullProfile(mockDb as any, mockDoc);
      expect(profile.slCode).toBe('SL261320');
      expect(profile.displayName).toBe('Jimena Sibaja');
      expect(profile.dni).toBe('118220345');
      expect(profile.email).toBe('jimena@example.com');
    });
  });
});
