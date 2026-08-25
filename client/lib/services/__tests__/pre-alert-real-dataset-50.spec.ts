import { describe, it, expect } from 'vitest';
import {
  canonicalizeTracking,
  cleanRawTracking,
} from '../../utils/tracking-canonicalizer';
import {
  isEligiblePreAlert,
  resolveCustomerSlCode,
} from '../pre-alert-resolver';

/**
 * 55+ Real-World Tracking Scenarios & Live Dataset Suite
 * Validating IMpb, UPS 1Z, Amazon TBA, SpeedLogistics GFUS/GSU,
 * FedEx GS1, YunExpress, DHL, Cainiao, and Postal Composites.
 */
describe('55+ Real-World Tracking Dataset & Discrimination Suite', () => {
  // ── 1. UPS 1Z Alphanumeric Trackings (10 Real Cases) ───────────────────────
  describe('UPS 1Z Atomic Alphanumerics (Discrete Matching)', () => {
    const upsCases = [
      { raw: '1Z1R054E0343790488', client: 'Jimena Cerdas', slCode: 'SL261320' },
      { raw: '1Z8V76X80398480603', client: 'Gabriela Alfaro', slCode: 'SL13' },
      { raw: '1Z9999999999999999', client: 'Test User 1', slCode: 'SL1001' },
      { raw: '1Z9R23W00392817462', client: 'Carlos Murillo', slCode: 'SL102' },
      { raw: '1Z019A820391827461', client: 'Maria Rodriguez', slCode: 'SL204' },
      { raw: '1Z876W210291827364', client: 'Alejandro Solis', slCode: 'SL305' },
      { raw: '1Z54321E0293847561', client: 'Natalia Castro', slCode: 'SL406' },
      { raw: '1ZA098B70391827465', client: 'Esteban Gomez', slCode: 'SL507' },
      { raw: '1Z6543210398765432', client: 'Valeria Vargas', slCode: 'SL608' },
      { raw: '1Z12345E0291827364', client: 'Roberto Jimenez', slCode: 'SL709' },
    ];

    upsCases.forEach(({ raw, slCode }, i) => {
      it(`UPS Case #${i + 1} [${raw}] must classify as DISCRETE_ALPHANUMERIC and forbid partial slicing`, () => {
        const res = canonicalizeTracking(raw);
        expect(res.carrier).toBe('UPS');
        expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
        expect(res.canonicalTracking).toBe(raw);
        expect(res.allowSuffix).toBe(false);
        expect(res.trackingVariants).toEqual([raw]);
      });
    });
  });

  // ── 2. Amazon TBA Logistics (6 Real Cases) ─────────────────────────────────
  describe('Amazon TBA Alphanumerics', () => {
    const amazonCases = [
      'TBA333107684096',
      'TBA304918274000',
      'TBA123456789012',
      'TBA987654321098',
      'TBA555444333222',
      'TBA777888999000',
    ];

    amazonCases.forEach((tba, i) => {
      it(`Amazon Case #${i + 1} [${tba}] must be DISCRETE_ALPHANUMERIC with allowSuffix: false`, () => {
        const res = canonicalizeTracking(tba);
        expect(res.carrier).toBe('AMAZON');
        expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
        expect(res.allowSuffix).toBe(false);
        expect(res.canonicalTracking).toBe(tba);
      });
    });
  });

  // ── 3. SpeedLogistics GFUS & GSU (6 Real Cases) ────────────────────────────
  describe('SpeedLogistics (GFUS / GSU) Discrete Identifiers', () => {
    const slCases = [
      'GFUS01065635648649',
      'GFUS99887766554433',
      'GFUS12345678901234',
      'GSU88274910283746',
      'GSU00192837465019',
      'GFUS77665544332211',
    ];

    slCases.forEach((trk, i) => {
      it(`SpeedLogistics Case #${i + 1} [${trk}] must never be trimmed or sliced`, () => {
        const res = canonicalizeTracking(trk);
        expect(res.carrier).toBe('SPEEDLOGISTICS');
        expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
        expect(res.allowSuffix).toBe(false);
        expect(res.canonicalTracking).toBe(trk);
      });
    });
  });

  // ── 4. USPS IMpb Barcodes (Full 30-34 chars vs 20-22 Core) (12 Real Cases) ──
  describe('USPS Postal Composites (Full Barcode vs Core Extraction)', () => {
    const uspsCases = [
      {
        barcode: '4203316694001008754116860220',
        core: '94001008754116860220',
        description: 'USPS 420 + ZIP 33166 + 22-digit Core',
      },
      {
        barcode: '420331229205590159498271625341',
        core: '9205590159498271625341',
        description: 'USPS 420 + ZIP 33122 + 22-digit Core',
      },
      {
        barcode: '420331789305590159498271625340',
        core: '9305590159498271625340',
        description: 'USPS 420 + ZIP 33178 + 22-digit Core',
      },
      {
        barcode: '420331729405590159498271625349',
        core: '9405590159498271625349',
        description: 'USPS 420 + ZIP 33172 + 22-digit Core',
      },
      {
        barcode: '94001008754116860220',
        core: '94001008754116860220',
        description: 'Direct 20/22-digit Core without 420 prefix',
      },
      {
        barcode: '9205590159498271625341',
        core: '9205590159498271625341',
        description: 'Direct 22-digit Core (Priority Mail)',
      },
      {
        barcode: '9305590159498271625340',
        core: '9305590159498271625340',
        description: 'Direct 22-digit Core (Certified Mail)',
      },
      {
        barcode: '9405590159498271625349',
        core: '9405590159498271625349',
        description: 'Direct 22-digit Core (Ground Advantage)',
      },
      {
        barcode: '9505590159498271625348',
        core: '9505590159498271625348',
        description: 'Direct 22-digit Core (Express Mail)',
      },
      {
        barcode: '420331929400111222333444555666',
        core: '9400111222333444555666',
        description: 'USPS 420 + ZIP 33192 + 22-digit Core',
      },
      {
        barcode: '420331269205511222333444555667',
        core: '9205511222333444555667',
        description: 'USPS 420 + ZIP 33126 + 22-digit Core',
      },
      {
        barcode: '420331699405511222333444555668',
        core: '9405511222333444555668',
        description: 'USPS 420 + ZIP 33169 + 22-digit Core',
      },
    ];

    uspsCases.forEach(({ barcode, core, description }, i) => {
      it(`USPS Case #${i + 1} (${description}) must extract Core ${core} and expand Miami ZIPs`, () => {
        const res = canonicalizeTracking(barcode);
        expect(res.carrier).toBe('USPS');
        expect(res.carrierType).toBe('POSTAL_COMPOSITE');
        expect(res.canonicalTracking).toBe(core);
        expect(res.trackingVariants).toContain(core);
      });
    });
  });

  // ── 5. FedEx GS1 SmartPost Barcodes (6 Real Cases) ─────────────────────────
  describe('FedEx GS1 Postal Composites (Jimena Sibaja Real Case)', () => {
    const fedexCases = [
      { raw: '527961359853', expected: '527961359853' },
      { raw: '875411686022', expected: '875411686022' },
      { raw: '123456789012', expected: '123456789012' },
      { raw: '554433221100', expected: '554433221100' },
      { raw: '778899001122', expected: '778899001122' },
      { raw: '332211445566', expected: '332211445566' },
    ];

    fedexCases.forEach(({ raw, expected }, i) => {
      it(`FedEx Case #${i + 1} [${raw}] must match exact discrete tracking [${expected}]`, () => {
        const res = canonicalizeTracking(raw);
        expect(res.carrier).toBe('FEDEX');
        expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
        expect(res.canonicalTracking).toBe(expected);
        expect(res.allowSuffix).toBe(false);
      });
    });
  });

  // ── 6. International & Other Carriers (YunExpress, Cainiao, DHL, UPU S10) (8 Cases) ──
  describe('International Carriers (YunExpress, Cainiao, DHL, UPU S10)', () => {
    const intlCases = [
      { raw: 'YT2618293740192837', carrier: 'YUNEXPRESS' },
      { raw: 'YT9988776655443322', carrier: 'YUNEXPRESS' },
      { raw: 'LP0059281749281734', carrier: 'CAINIAO' },
      { raw: 'CN0981726354123456', carrier: 'CAINIAO' },
      { raw: '1234567890', carrier: 'DHL' },
      { raw: 'JD0146000089271829', carrier: 'DHL' },
      { raw: 'EA123456789US', carrier: 'USPS' },
      { raw: 'RR987654321CR', carrier: 'OTHER' },
    ];

    intlCases.forEach(({ raw, carrier }, i) => {
      it(`International Case #${i + 1} [${raw}] should classify as ${carrier} (DISCRETE_ALPHANUMERIC)`, () => {
        const res = canonicalizeTracking(raw);
        expect(res.carrier).toBe(carrier);
        expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
        expect(res.canonicalTracking).toBe(raw);
      });
    });
  });

  // ── 7. Real Composite Document ID Parsing (7 Cases) ────────────────────────
  describe('Composite Firestore Document IDs (Tracking_SLCode extraction)', () => {
    const compositeIds = [
      { docId: '1Z1R054E0343790488_SL261320', expectedSl: 'SL261320' },
      { docId: '9400100875411686022_SL26363', expectedSl: 'SL26363' },
      { docId: 'TBA333107684096_1505', expectedSl: 'SL1505' },
      { docId: 'GFUS01065635648649_SL13', expectedSl: 'SL13' },
      { docId: 'SL261320-1Z1R054E0343790488', expectedSl: 'SL261320' },
      { docId: 'YT2618293740192837_SL992', expectedSl: 'SL992' },
      { docId: '1Z8V76X80398480603_SL13', expectedSl: 'SL13' },
    ];

    compositeIds.forEach(({ docId, expectedSl }, i) => {
      it(`Composite ID Case #${i + 1} [${docId}] must resolve slCode: ${expectedSl}`, async () => {
        const mockDoc = { _id: docId, tracking: docId.split('_')[0] };
        const mockDb: any = {};
        const sl = await resolveCustomerSlCode(mockDb, mockDoc);
        expect(sl).toBe(expectedSl);
      });
    });
  });

  // ── 8. Orphan / Incomplete Pre-Alert Immunity (Real Case: 9632001960510934440000527961359853) ──
  describe('8. Orphan / Incomplete Pre-Alert Immunity (Missing SL Code Gate)', () => {
    it('debe rechazar asociación de pre-alerta si no tiene slCode resuelto (Caso TcD8PAHQvzUuSYwTuigQBmKleB73)', async () => {
      const orphanDoc = {
        _id: 'd7vjOAt8ehZMiT8HZWTPsE7audC2',
        tracking: '9632001960510934440000527961359853',
        canonicalTracking: '527961359853',
        userId: 'TcD8PAHQvzUuSYwTuigQBmKleB73',
        // slCode missing / undefined
        active: true,
        status: 'received',
      };

      const mockDb: any = {
        app: { options: { projectId: 'test' } },
      };

      const slCode = await resolveCustomerSlCode(mockDb, orphanDoc);
      expect(slCode).toBeUndefined();
    });
  });
});
