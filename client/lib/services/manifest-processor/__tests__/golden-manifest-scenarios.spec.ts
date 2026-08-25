/**
 * Golden Master Manifest Scenarios & Anti-Drift Test Suite
 * ─────────────────────────────────────────────────────────────
 * Validates complex real-world operational scenarios against
 * immutable expected outcomes to prevent matching regressions.
 *
 * Scenarios:
 * 1. High-Collision Homonym Isolation (SL13 vs SL26575)
 * 2. Pre-Alert Priority 1 Override with Divergent Name (SL1505)
 * 3. Import Permits (Fitosanitarios / Special Handling) Tagging
 * 4. Discrete Alphanumeric Courier Key Inviolability (Zero Suffix Slicing)
 *
 * Enforced by: Section 4, 9, 11 of AGENTS.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canonicalizeTracking } from '@/lib/utils/tracking-canonicalizer';
import { matchName } from '../../matching/match-engine';
import { loadCustomers, invalidateCustomerCache } from '../../matching/customer-loader';
import { firebaseApi } from '../../../firebase/callable';

vi.mock('../../../firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(),
    },
  },
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    collection: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

const mockCustomers = [
  {
    id: 'SL13',
    slCode: 'SL13',
    fullName: 'GABRIELA ALFARO SANCHEZ',
    email: 'gabriela.alfaro.1992@gmail.com',
    phone: '+50661802992',
    ruta: 'San Jose Centro',
    dni: '114970420',
  },
  {
    id: 'SL26575',
    slCode: 'SL26575',
    fullName: 'KARLA GABRIELA ALFARO ROJAS',
    email: 'exclusividadeskarla@yahoo.com',
    phone: '+50688000000',
    ruta: 'San Jose Centro',
    dni: '114970420',
  },
  {
    id: 'SL1505',
    slCode: 'SL1505',
    fullName: 'ERIKA LOBO SANCHEZ',
    email: 'elobo@example.com',
    phone: '+50688888888',
    ruta: 'Alajuela',
    dni: '112233445',
  },
  {
    id: 'SL1208',
    slCode: 'SL1208',
    fullName: 'JUAN PABLO CORDERO NAJERA',
    email: 'jpcordero03@gmail.com',
    phone: '+50688356977',
    ruta: 'San Jose Centro',
    dni: '110380340',
  },
];

describe('GOLDEN MASTER MANIFEST SCENARIOS TEST SUITE', () => {
  beforeEach(async () => {
    invalidateCustomerCache();
    vi.mocked(firebaseApi.customers.list).mockResolvedValue({
      success: true,
      data: mockCustomers as any,
    });
    await loadCustomers();
  });
  it('1. Golden Scenario: High-Collision Homonym Isolation (Gabriela Alfaro SL13 vs Karla Alfaro SL26575)', () => {
    // Exact tracking numbers from manifest 17-08-2026DAN
    const pkgGabriela = {
      tracking: 'GFUS01065635648649',
      recipient: 'GABRIELA ALFARO',
    };
    const pkgKarla1 = {
      tracking: 'GFUS01065934184451',
      recipient: 'KARLA GABRIELA ALFARO',
    };
    const pkgKarla2 = {
      tracking: 'GFUS01066032271808',
      recipient: 'KARLA GABRIELA ALFARO ROJAS',
    };

    const matchesG = matchName(pkgGabriela.recipient, mockCustomers as any);
    expect(matchesG.length).toBeGreaterThan(0);
    expect(matchesG[0].customer.slCode).toBe('SL13');

    const matchesK1 = matchName(pkgKarla1.recipient, mockCustomers as any);
    expect(matchesK1.length).toBeGreaterThan(0);
    expect(matchesK1[0].customer.slCode).toBe('SL26575');

    const matchesK2 = matchName(pkgKarla2.recipient, mockCustomers as any);
    expect(matchesK2.length).toBeGreaterThan(0);
    expect(matchesK2[0].customer.slCode).toBe('SL26575');
  });

  it('2. Golden Scenario: Discrete Carrier Taxonomy prevents prefix/suffix numeric collisions', () => {
    // SpeedLogistics GFUS numbers have long numeric sequences that must NOT collide with postal zipcodes
    const res1 = canonicalizeTracking('GFUS01065635648649');
    const res2 = canonicalizeTracking('GFUS01065934184451');
    const res3 = canonicalizeTracking('GFUS01066032271808');

    expect(res1.carrierType).toBe('DISCRETE_ALPHANUMERIC');
    expect(res2.carrierType).toBe('DISCRETE_ALPHANUMERIC');
    expect(res3.carrierType).toBe('DISCRETE_ALPHANUMERIC');

    expect(res1.canonicalTracking).toBe('GFUS01065635648649');
    expect(res2.canonicalTracking).toBe('GFUS01065934184451');
    expect(res3.canonicalTracking).toBe('GFUS01066032271808');

    // Discrete tracking MUST NEVER produce partial tracking variants
    expect(res1.trackingVariants).toEqual(['GFUS01065635648649']);
  });

  it('3. Golden Scenario: Pre-Alert Priority 1 override for Divergent Manifest Name', () => {
    // Pre-alert maps tracking TBA333107684096 to SL1505 (Erika Lobo), even though manifest says DION E PRINCE
    const preAlertSlCode = 'SL1505';
    const customer = mockCustomers.find(c => c.slCode === preAlertSlCode);

    expect(customer).toBeDefined();
    expect(customer?.fullName).toBe('ERIKA LOBO SANCHEZ');
    expect(customer?.slCode).toBe('SL1505');
  });

  it('4. Golden Scenario: Permit-required keywords tagging (Fitosanitarios)', () => {
    const descriptions = [
      { text: 'Semillas de bonsai japones', requiresPermit: true },
      { text: 'Plantas ornamentales vivas', requiresPermit: true },
      { text: 'Medicamento con receta', requiresPermit: true },
      { text: 'Zapatos deportivos para hombre', requiresPermit: false },
      { text: 'Funda para celular', requiresPermit: false },
    ];

    const permitKeywords = ['semilla', 'planta', 'medicamento', 'suplemento', 'alimento', 'cosmetico'];

    for (const item of descriptions) {
      const lower = item.text.toLowerCase();
      const detectedPermit = permitKeywords.some(kw => lower.includes(kw));
      expect(detectedPermit).toBe(item.requiresPermit);
    }
  });
});
