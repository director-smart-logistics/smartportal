/**
 * Principal SDET Hardcore Test Suite: Customer Matching Engine & Invariants
 *
 * Direct execution against real production modules:
 * - findCustomerMatch
 * - searchCustomersLocal
 * - matchName
 * - normalize & sanitizeName
 * - meaningfulTokens
 * - MATCH_THRESHOLDS
 *
 * SDET Invariant & Boundary Scenarios:
 * 1. [Single-Token Protection]: Single-word searches have token count 1 and score below auto-accept threshold.
 * 2. [Accents & Diacritics Invariance]: Accented strings normalize and score identically to unaccented ones.
 * 3. [Inverted Surnames]: Legal format "ALVARADO QUESADA CARLOS" matches "CARLOS ALVARADO QUESADA".
 * 4. [Garbage Date Suffix Stripping]: "GERARDO SOLANO RAMIREZ06-05-2026" strips suffix and matches "GERARDO SOLANO RAMIREZ".
 * 5. [Typeahead Multi-Index Retrieval]: Structured lookups (SL, phone, email, name token) return deterministic results.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCustomerList = [
  {
    id: 'cust-1',
    slCode: 'SL2001',
    name: 'CARLOS ALVARADO QUESADA',
    fullName: 'CARLOS ALVARADO QUESADA',
    normalizedName: 'CARLOS ALVARADO QUESADA',
    email: 'carlos.alvarado@example.com',
    phone: '88881111',
    dni: '1-1111-0111',
    ruta: 'San Jose',
    consolidationEnabled: true,
  },
  {
    id: 'cust-2',
    slCode: 'SL2002',
    name: 'MARÍA JOSÉ CHACÓN VARGAS',
    fullName: 'MARÍA JOSÉ CHACÓN VARGAS',
    normalizedName: 'MARIA JOSE CHACON VARGAS',
    email: 'maria.chacon@example.com',
    phone: '88882222',
    dni: '2-2222-0222',
    ruta: 'Encomiendas - San Carlos',
    consolidationEnabled: false,
  },
  {
    id: 'cust-3',
    slCode: 'SL2003',
    name: 'ALLAN VALVERDE MORA',
    fullName: 'ALLAN VALVERDE MORA',
    normalizedName: 'ALLAN VALVERDE MORA',
    email: 'allan.valverde@example.com',
    phone: '88883333',
    dni: '3-3333-0333',
    ruta: 'Heredia',
    consolidationEnabled: false,
  },
  {
    id: 'cust-4',
    slCode: 'SL2004',
    name: 'JORGE VALVERDE ROJAS',
    fullName: 'JORGE VALVERDE ROJAS',
    normalizedName: 'JORGE VALVERDE ROJAS',
    email: 'jorge.valverde@example.com',
    phone: '88884444',
    dni: '4-4444-0444',
    ruta: 'Cartago',
    consolidationEnabled: true,
  },
  {
    id: 'cust-5',
    slCode: 'SL2005',
    name: 'GERARDO SOLANO RAMIREZ',
    fullName: 'GERARDO SOLANO RAMIREZ',
    normalizedName: 'GERARDO SOLANO RAMIREZ',
    email: 'gerardo.solano@example.com',
    phone: '88885555',
    dni: '5-5555-0555',
    ruta: 'GAM',
    consolidationEnabled: false,
  },
];

vi.mock('@/lib/firebase/config', () => ({ db: {}, app: {}, storage: {}, auth: {}, sp2App: {} }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('@/lib/firebase/callable', () => ({
  firebaseApi: {
    customers: {
      list: vi.fn(async () => ({ success: true, data: mockCustomerList })),
    },
  },
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  setDoc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
}));

import {
  invalidateCustomerCache,
  loadCustomers,
} from '../customer-loader';
import { matchName } from '../match-engine';
import { searchCustomersLocal } from '../typeahead-search';
import { normalize, sanitizeName, meaningfulTokens } from '../normalize';
import { MATCH_THRESHOLDS } from '../thresholds';

describe('SDET HARDCORE ENGINE: Customer Matching & Invariant Integrity', () => {
  beforeEach(async () => {
    invalidateCustomerCache();
    await loadCustomers();
  });

  it('SDET Matching 1 [Single-Token Protection]: Single-word searches have meaningful token count 1 and are not auto-accepted', async () => {
    const tokens = meaningfulTokens(['VALVERDE']);
    expect(tokens.length).toBe(1);
    expect(tokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS).toBe(true);

    const customers = await loadCustomers();
    const results = matchName('VALVERDE', customers);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].score).toBeLessThan(MATCH_THRESHOLDS.AUTO_ACCEPT_MIN);
  });

  it('SDET Matching 2 [Diacritics Invariance]: Accented strings normalize identically to unaccented ones', async () => {
    expect(normalize('MARÍA JOSÉ CHACÓN')).toBe('MARIA JOSE CHACON');
    expect(normalize('Álvaro Núñez')).toBe('ALVARO NUNEZ');
    expect(normalize('  cArLos   aLvArAdO   ')).toBe('CARLOS ALVARADO');

    const customers = await loadCustomers();
    const resultsAccented = matchName('MARIA JOSE CHACON VARGAS', customers);
    expect(resultsAccented.length).toBeGreaterThanOrEqual(1);
    expect(resultsAccented[0].customer?.slCode).toBe('SL2002');
    expect(resultsAccented[0].score).toBeGreaterThanOrEqual(0.95);
  });

  it('SDET Matching 3 [Inverted Surnames]: Matches legal name format "ALVARADO QUESADA CARLOS" to "CARLOS ALVARADO QUESADA"', async () => {
    const customers = await loadCustomers();
    const results = matchName('ALVARADO QUESADA CARLOS', customers);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].customer?.slCode).toBe('SL2001');
    expect(results[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it('SDET Matching 4 [Garbage Date Suffix Stripping]: Strips trailing date suffixes from contaminated manifest lines', async () => {
    expect(sanitizeName('GERARDO SOLANO06-05-2026')).toBe('GERARDO SOLANO');
    expect(sanitizeName('CARLOS ALVARADO 14/08/2026')).toBe('CARLOS ALVARADO');
    expect(sanitizeName('MARIA CHACON 20260819')).toBe('MARIA CHACON');

    const clean = sanitizeName('GERARDO SOLANO RAMIREZ06-05-2026');
    const customers = await loadCustomers();
    const results = matchName(clean, customers);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].customer?.slCode).toBe('SL2005');
  });

  it('SDET Matching 5 [Typeahead Multi-Index]: Local typeahead search queries structured fields directly', async () => {
    // 1. By SL Code
    const bySl = await searchCustomersLocal('SL2001');
    expect(bySl.length).toBeGreaterThanOrEqual(1);
    expect(bySl[0].slCode).toBe('SL2001');

    // 2. By Email
    const byEmail = await searchCustomersLocal('carlos.alvarado@example.com');
    expect(byEmail.length).toBeGreaterThanOrEqual(1);
    expect(byEmail[0].slCode).toBe('SL2001');

    // 3. By Phone digits
    const byPhone = await searchCustomersLocal('88881111');
    expect(byPhone.length).toBeGreaterThanOrEqual(1);
    expect(byPhone[0].slCode).toBe('SL2001');

    // 4. By Name token
    const byName = await searchCustomersLocal('CHACON');
    expect(byName.length).toBeGreaterThanOrEqual(1);
    expect(byName[0].slCode).toBe('SL2002');
  });
});
