/**
 * Pre-Alert Eligibility & Lifecycle Contracts Test Suite
 * ─────────────────────────────────────────────────────────────
 * Validates that the pre-alert resolution engine strictly rejects
 * historical normalizations, delivered records, terminal statuses,
 * and old declarations, preventing ghost shipments and false matches.
 *
 * Enforced by: Section 4 & Section 11 of AGENTS.md.
 */

import { describe, it, expect } from 'vitest';
import { isEligiblePreAlert, resolveCustomerSlCode } from '../pre-alert-resolver';

describe('PRE-ALERT ELIGIBILITY & LIFECYCLE CONTRACTS', () => {
  it('1. should REJECT pre-alerts with historical normalization flags (Ghost Prevention)', () => {
    const historicalDoc1 = {
      tracking: '1Z4492E90346042116',
      slCode: 'SL1208',
      isHistoricalNormalization: true,
      active: true,
    };
    expect(isEligiblePreAlert(historicalDoc1)).toBe(false);

    const historicalDoc2 = {
      tracking: 'JCZ0305150626DH',
      slCode: 'SL1208',
      isHistorical: true,
      active: true,
    };
    expect(isEligiblePreAlert(historicalDoc2)).toBe(false);
  });

  it('2. should REJECT pre-alerts that have already been delivered', () => {
    expect(isEligiblePreAlert({ delivered: true, tracking: '123' })).toBe(false);
    expect(isEligiblePreAlert({ deliveredAt: '2026-01-01T00:00:00Z', tracking: '123' })).toBe(false);
    expect(isEligiblePreAlert({ packageStatus: 'delivered', tracking: '123' })).toBe(false);
    expect(isEligiblePreAlert({ deliveryStatus: 'delivered', tracking: '123' })).toBe(false);
  });

  it('3. should REJECT pre-alerts in terminal business states', () => {
    const terminalStatuses = [
      'delivered',
      'returned',
      'cancelled',
      'annulled',
      'void',
      'invoiced',
      'paid',
      'closed',
      'completed',
    ];

    for (const status of terminalStatuses) {
      expect(isEligiblePreAlert({ status, tracking: '123' })).toBe(false);
    }
  });

  it('4. should REJECT pre-alerts where active is explicitly false', () => {
    expect(isEligiblePreAlert({ active: false, tracking: '123' })).toBe(false);
  });

  it('5. should REJECT pre-alerts older than 60 days (Temporal Window Protection)', () => {
    const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();
    const oldPreAlert = {
      tracking: 'TBA123456789012',
      slCode: 'SL100',
      createdAt: seventyDaysAgo,
      active: true,
    };
    expect(isEligiblePreAlert(oldPreAlert)).toBe(false);
  });

  it('6. should ACCEPT valid, fresh, unmanifested pre-alerts within 60 days', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const validPreAlert = {
      tracking: 'TBA333418271432',
      canonicalTracking: 'TBA333418271432',
      slCode: 'SL1208',
      displayName: 'Juan Pablo Cordero Najera',
      active: true,
      status: 'pending',
      createdAt: fiveDaysAgo,
    };
    expect(isEligiblePreAlert(validPreAlert)).toBe(true);
  });

  it('7. should resolve customer SL code from canonical docId suffix in O(1)', async () => {
    const mockDb: any = {};
    const slCode = await resolveCustomerSlCode(mockDb, { _id: '1Z4492E90346042116_SL1208' });
    expect(slCode).toBe('SL1208');

    const slCodeLower = await resolveCustomerSlCode(mockDb, { _id: 'TBA333418271432_sl1505' });
    expect(slCodeLower).toBe('SL1505');
  });
});
