import { describe, it, expect } from 'vitest';
import {
  COSTA_RICA_TIMEZONE,
  getCostaRicaDateParts,
  getCostaRicaTodayISO,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  parseDateSafe,
  extractDateFromInvoiceNumber,
} from '../date-utils';
import {
  generateInvoiceNumber,
  safeFormatDate,
  safeFormatDateTime,
  isConsolidatedInvoice,
} from '../../services/invoice-service';
import { formatRelative } from '../../../pages/manifests/admin/utils';

describe('EXHAUSTIVE COSTA RICA TIMEZONE & HISTORICAL REGRESSION SUITE (America/Costa_Rica, UTC-6)', () => {
  // ── 1. GLOBAL OPERATOR TIMEZONE INVARIANCE ─────────────────────────────────────
  describe('Global Operator Location Invariance (Tokyo, London, NY, Sydney, Hawaii, UTC)', () => {
    // Exact UTC timestamp: 2026-08-18T04:30:15.789Z
    // In Tokyo (UTC+9): 2026-08-18 13:30:15
    // In London (UTC+1 BST): 2026-08-18 05:30:15
    // In New York (UTC-4 EDT): 2026-08-18 00:30:15
    // In Honolulu (UTC-10): 2026-08-17 18:30:15
    // IN COSTA RICA (UTC-6): 2026-08-17 22:30:15 (DAY 17, HOUR 22)
    const testInstant = new Date('2026-08-18T04:30:15.789Z');

    it('getCostaRicaDateParts returns Costa Rica local time regardless of environment', () => {
      const parts = getCostaRicaDateParts(testInstant);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(8);
      expect(parts.day).toBe(17);
      expect(parts.hours).toBe(22);
      expect(parts.minutes).toBe(30);
      expect(parts.seconds).toBe(15);
      expect(parts.milliseconds).toBe(789);

      expect(parts.yearStr).toBe('2026');
      expect(parts.monthStr).toBe('08');
      expect(parts.dayStr).toBe('17');
      expect(parts.hourStr).toBe('22');
      expect(parts.minuteStr).toBe('30');
      expect(parts.secondStr).toBe('15');
      expect(parts.millisecondStr).toBe('789');
      expect(parts.isoDate).toBe('2026-08-17');
    });

    it('generateInvoiceNumber embeds Costa Rica year/month/day/hour/min/sec/ms', () => {
      const standardInv = generateInvoiceNumber('SL8921', false, testInstant);
      expect(standardInv).toBe('SL8921-20260817223015789');
      expect(standardInv).not.toContain('20260818'); // Must never bleed Tokyo/London/NY day 18

      const consolidatedInv = generateInvoiceNumber('SL8921', true, testInstant);
      expect(consolidatedInv).toBe('SL8921-20260817223015789-C');
      expect(isConsolidatedInvoice({ invoiceNumber: consolidatedInv })).toBe(true);
    });

    it('formatCostaRicaDate and safeFormatDate output Costa Rica date (17/8/2026)', () => {
      expect(formatCostaRicaDate(testInstant)).toBe('17/8/2026');
      expect(safeFormatDate(testInstant)).toBe('17/8/2026');
    });

    it('formatCostaRicaDateTime and safeFormatDateTime output Costa Rica date and hour (17/8/2026, 10:30 p. m. / 22:30)', () => {
      const dt = safeFormatDateTime(testInstant);
      expect(dt).toContain('17/8/2026');
      expect(dt).toMatch(/10:30/);

      const dt24 = safeFormatDateTime(testInstant, { hour12: false });
      expect(dt24).toContain('17/8/2026');
      expect(dt24).toContain('22:30');
    });
  });

  // ── 2. YEAR-END & MIDNIGHT CROSSING EDGE CASES ────────────────────────────────
  describe('Year-End & Midnight Crossing Edge Cases', () => {
    it('handles December 31st 23:59:59 Costa Rica time (UTC New Year already started)', () => {
      // 2027-01-01T05:59:59.000Z is 2026-12-31 23:59:59 in Costa Rica
      const newYearEveInstant = new Date('2027-01-01T05:59:59.000Z');
      const parts = getCostaRicaDateParts(newYearEveInstant);

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(12);
      expect(parts.day).toBe(31);
      expect(parts.hours).toBe(23);
      expect(parts.minutes).toBe(59);
      expect(parts.seconds).toBe(59);
      expect(parts.isoDate).toBe('2026-12-31');

      const inv = generateInvoiceNumber('SL1000', false, newYearEveInstant);
      expect(inv).toBe('SL1000-20261231235959000');
    });

    it('handles January 1st 00:00:01 Costa Rica time', () => {
      // 2027-01-01T06:00:01.000Z is 2027-01-01 00:00:01 in Costa Rica
      const newYearInstant = new Date('2027-01-01T06:00:01.000Z');
      const parts = getCostaRicaDateParts(newYearInstant);

      expect(parts.year).toBe(2027);
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(1);
      expect(parts.hours).toBe(0);
      expect(parts.minutes).toBe(0);
      expect(parts.seconds).toBe(1);
      expect(parts.isoDate).toBe('2027-01-01');

      const inv = generateInvoiceNumber('SL1000', false, newYearInstant);
      expect(inv).toBe('SL1000-20270101000001000');
    });

    it('handles leap day (February 29th) in Costa Rica time', () => {
      // 2028-03-01T02:00:00.000Z is 2028-02-29 20:00:00 in Costa Rica
      const leapDayInstant = new Date('2028-03-01T02:00:00.000Z');
      const parts = getCostaRicaDateParts(leapDayInstant);

      expect(parts.year).toBe(2028);
      expect(parts.month).toBe(2);
      expect(parts.day).toBe(29);
      expect(parts.hours).toBe(20);
      expect(parts.isoDate).toBe('2028-02-29');

      expect(safeFormatDate(leapDayInstant)).toBe('29/2/2028');
    });
  });

  // ── 3. HISTORICAL DATA COMPATIBILITY & REGRESSION SHIELD ───────────────────────
  describe('Historical Data Compatibility & Regression Shield', () => {
    it('preserves pre-formatted DD/MM/YYYY and DD-MM-YYYY strings without modification', () => {
      expect(safeFormatDate('15/04/2026')).toBe('15/04/2026');
      expect(safeFormatDate('01/12/2025')).toBe('01/12/2025');
      expect(safeFormatDate('28-02-2026')).toBe('28-02-2026');
      expect(formatCostaRicaDate('30/06/2026')).toBe('30/06/2026');
    });

    it('parses and correctly formats Firestore Timestamp objects { seconds, nanoseconds }', () => {
      // Timestamp for 2026-05-20 14:00:00 CR time -> 2026-05-20T20:00:00Z -> seconds = 1779307200
      const fsTimestamp = { seconds: 1779307200, nanoseconds: 0 };
      expect(safeFormatDate(fsTimestamp)).toBe('20/5/2026');
    });

    it('parses and correctly formats Firestore Timestamps with toDate() method', () => {
      const targetDate = new Date('2026-05-20T20:00:00Z');
      const fsTimestamp = {
        seconds: 1779307200,
        toDate: () => targetDate,
      };
      expect(safeFormatDate(fsTimestamp)).toBe('20/5/2026');
    });

    it('extracts embedded dates correctly from historical invoice numbers', () => {
      // Historical invoice: SL4859-20260416154146-C -> Date 2026-04-16
      const invNum = 'SL4859-20260416154146-C';
      const formatted = extractDateFromInvoiceNumber(invNum);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('16');
      expect(formatted).toContain('abr');

      expect(extractDateFromInvoiceNumber('SL1001-20261231235959-C')).toContain('31');
      expect(extractDateFromInvoiceNumber('SL1001-20261231235959-C')).toContain('2026');
      expect(extractDateFromInvoiceNumber('')).toBe('-');
      expect(extractDateFromInvoiceNumber(undefined)).toBe('-');
    });

    it('handles null, undefined, empty string, and invalid inputs gracefully without throwing', () => {
      expect(safeFormatDate(null)).toBe('');
      expect(safeFormatDate(undefined)).toBe('');
      expect(safeFormatDate('')).toBe('');
      expect(safeFormatDate('not-a-date')).toBe('not-a-date');
      expect(safeFormatDateTime(null)).toBe('');
      expect(safeFormatDateTime(undefined)).toBe('');
    });
  });

  // ── 4. MANIFEST ADMINISTRATION & RELATIVE TIME FORMATTING ──────────────────────
  describe('Manifest Administration formatRelative', () => {
    it('formats recent events accurately in relative terms', () => {
      const now = new Date();
      expect(formatRelative(now.toISOString())).toBe('hace un momento');

      const fiveMinsAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      expect(formatRelative(fiveMinsAgo)).toBe('hace 5m');

      const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString();
      expect(formatRelative(threeHoursAgo)).toBe('hace 3h');

      const fourDaysAgo = new Date(Date.now() - 4 * 86400_000).toISOString();
      expect(formatRelative(fourDaysAgo)).toBe('hace 4d');
    });

    it('formats older events using Costa Rica timezone locale format', () => {
      // 60 days ago ISO
      const oldDate = new Date('2025-10-15T15:00:00Z');
      const res = formatRelative(oldDate.toISOString());
      expect(res).toBe('15/10/2025');
    });

    it('handles empty or missing ISO date gracefully', () => {
      expect(formatRelative(undefined)).toBe('—');
      expect(formatRelative('')).toBe('—');
      expect(formatRelative('invalid-date')).toBe('invalid-date');
    });
  });

  // ── 5. NEW DATA PROCESSING TIMEZONE GUARANTEES ─────────────────────────────────
  describe('New Data Processing Timezone Guarantees', () => {
    it('getCostaRicaTodayISO returns the exact Costa Rica date YYYY-MM-DD', () => {
      const crToday = getCostaRicaTodayISO();
      expect(crToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const parts = getCostaRicaDateParts();
      expect(crToday).toBe(parts.isoDate);
    });

    it('generates consistent invoice numbers for rapid-fire batches without collisions', () => {
      const refDate = new Date('2026-08-17T21:00:00.123Z');
      const inv1 = generateInvoiceNumber('SL101', false, refDate);
      
      const refDate2 = new Date('2026-08-17T21:00:00.124Z');
      const inv2 = generateInvoiceNumber('SL101', false, refDate2);

      expect(inv1).not.toBe(inv2);
      expect(inv1.endsWith('123')).toBe(true);
      expect(inv2.endsWith('124')).toBe(true);
    });
  });
});
