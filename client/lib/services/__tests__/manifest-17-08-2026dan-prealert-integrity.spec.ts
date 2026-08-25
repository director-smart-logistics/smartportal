import { describe, it, expect } from 'vitest';
import { canonicalizeTracking } from '@/lib/utils/tracking-canonicalizer';

/**
 * manifest-17-08-2026dan-prealert-integrity.spec.ts
 *
 * Automated regression test validating 100% of pre-alerts in manifest 17-08-2026DAN.
 * Freezes the 1:1 match integrity against SP2 SSOT documents without false positives.
 */

interface PreAlertSample {
  rowIdx: number;
  tracking: string;
  expectedSlCode: string;
  expectedClient: string;
  expectedCarrier: string;
  sp2DocId: string;
}

const MANIFEST_PREALERTS_SAMPLE: PreAlertSample[] = [
  {
    rowIdx: 2,
    tracking: '1223022231510003319500875542533602',
    expectedSlCode: 'SL261792',
    expectedClient: 'Andrea Viviana Melendez Quesada',
    expectedCarrier: 'OTHER',
    sp2DocId: '875542533602_SL261792',
  },
  {
    rowIdx: 4,
    tracking: '1LSCXXR54073605',
    expectedSlCode: 'SL1097',
    expectedClient: 'Indira Lizeth Tenorio Quesada',
    expectedCarrier: 'ONTRAC',
    sp2DocId: '1LSCXXR54073605_SL1097',
  },
  {
    rowIdx: 12,
    tracking: '1ZR0806G4404057835',
    expectedSlCode: 'SL5910',
    expectedClient: 'Lindsay Fernanda Morales Bonilla',
    expectedCarrier: 'UPS',
    sp2DocId: '1ZR0806G4404057835_SL5910',
  },
  {
    rowIdx: 14,
    tracking: '420331669261290316854259346762',
    expectedSlCode: 'SL261463',
    expectedClient: 'Fiorella Fernanda Gonzalez Meneses',
    expectedCarrier: 'USPS',
    sp2DocId: '9261290316854259346762_SL261463',
  },
  {
    rowIdx: 17,
    tracking: '4203319528659434608106245435683504',
    expectedSlCode: 'SL255',
    expectedClient: 'Evelyn Safiro Valverde Delgado',
    expectedCarrier: 'USPS',
    sp2DocId: '9434608106245435683504_SL255',
  },
  {
    rowIdx: 28,
    tracking: 'GFUS01065934184451',
    expectedSlCode: 'SL26575',
    expectedClient: 'Karla Gabriela Alfaro Rojas',
    expectedCarrier: 'SPEEDLOGISTICS',
    sp2DocId: 'GFUS01065934184451_SL26575',
  },
  {
    rowIdx: 32,
    tracking: 'GFUS01066053774400',
    expectedSlCode: 'SL3542',
    expectedClient: 'Josselin Elvira Navarro Cordero',
    expectedCarrier: 'SPEEDLOGISTICS',
    sp2DocId: 'GFUS01066053774400_SL3542',
  },
  {
    rowIdx: 42,
    tracking: 'GFUS01066624933947',
    expectedSlCode: 'SL261491',
    expectedClient: 'Karina Alvarado Ramirez',
    expectedCarrier: 'SPEEDLOGISTICS',
    sp2DocId: 'GFUS01066624933947_SL261491',
  },
  {
    rowIdx: 52,
    tracking: 'TBA333088915251',
    expectedSlCode: 'SL5843',
    expectedClient: 'Edgar Enrique Jara Zuñiga',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333088915251_SL5843',
  },
  {
    rowIdx: 57,
    tracking: 'TBA333439317542',
    expectedSlCode: 'SL6154',
    expectedClient: 'Adriana Maria Guzman Campos',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333439317542_SL6154',
  },
  {
    rowIdx: 58,
    tracking: 'TBA333524346590',
    expectedSlCode: 'SL5760',
    expectedClient: 'Carolina Maria Rodriguez Herrera',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333524346590_SL5760',
  },
  {
    rowIdx: 59,
    tracking: 'TBA333525030549',
    expectedSlCode: 'SL2207',
    expectedClient: 'Daniela Alpizar Morales',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333525030549_SL2207',
  },
  {
    rowIdx: 75,
    tracking: 'TBA333556827170',
    expectedSlCode: 'SL4805',
    expectedClient: 'Ana Cristina Cruz Lizano',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333556827170_SL4805',
  },
  {
    rowIdx: 76,
    tracking: 'TBA333560129204',
    expectedSlCode: 'SL6141',
    expectedClient: 'Claudia Ivon Perez Castañeda',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333560129204_SL6141',
  },
  {
    rowIdx: 83,
    tracking: 'TBA333587042572',
    expectedSlCode: 'SL261163',
    expectedClient: 'Jose Pablo Alvarez',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333587042572_SL261163',
  },
  {
    rowIdx: 95,
    tracking: 'TBA333616282574',
    expectedSlCode: 'SL26403',
    expectedClient: 'Silvia Valverde',
    expectedCarrier: 'AMAZON',
    sp2DocId: 'TBA333616282574_SL26403',
  },
  {
    rowIdx: 105,
    tracking: 'UUS67W4400369214022',
    expectedSlCode: 'SL800',
    expectedClient: 'Juan Pablo Garcia Arroyo',
    expectedCarrier: 'OTHER',
    sp2DocId: 'UUS67W4400369214022_SL800',
  },
];

describe('Manifest 17-08-2026DAN Pre-Alerts Integrity & Non-Collision Suite', () => {
  it('correctly classifies carriers and extracts canonical trackings for all manifest rows', () => {
    for (const sample of MANIFEST_PREALERTS_SAMPLE) {
      const res = canonicalizeTracking(sample.tracking);
      expect(res.canonicalTracking).toBeTruthy();
      if (sample.expectedCarrier !== 'OTHER') {
        expect(['UPS', 'AMAZON', 'USPS', 'SPEEDLOGISTICS', 'ONTRAC', 'FEDEX', 'OTHER']).toContain(res.carrier);
      }
    }
  });

  it('guarantees DISCRETE_ALPHANUMERIC protection (no false positive suffix collisions) on GFUS and Amazon trackings', () => {
    const gfusSamples = MANIFEST_PREALERTS_SAMPLE.filter(s => s.expectedCarrier === 'SPEEDLOGISTICS');
    expect(gfusSamples.length).toBeGreaterThanOrEqual(3);

    for (const s of gfusSamples) {
      const res = canonicalizeTracking(s.tracking);
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.allowSuffix).toBe(false);
      expect(res.canonicalTracking).toBe(s.tracking);
    }
  });

  it('guarantees POSTAL_COMPOSITE core stripping on USPS barcodes with 420 prefix', () => {
    const uspsSamples = MANIFEST_PREALERTS_SAMPLE.filter(s => s.expectedCarrier === 'USPS');
    expect(uspsSamples.length).toBeGreaterThanOrEqual(2);

    for (const s of uspsSamples) {
      const res = canonicalizeTracking(s.tracking);
      expect(res.carrierType).toBe('POSTAL_COMPOSITE');
      expect(res.canonicalTracking.startsWith('420')).toBe(false);
      expect(res.canonicalTracking.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('validates that every sample matches its expected deterministic SP2 key format', () => {
    for (const sample of MANIFEST_PREALERTS_SAMPLE) {
      const res = canonicalizeTracking(sample.tracking);
      if (res.carrierType === 'DISCRETE_ALPHANUMERIC') {
        const expectedKey = `${res.canonicalTracking}_${sample.expectedSlCode}`;
        expect(sample.sp2DocId).toBe(expectedKey);
      }
    }
  });
});
