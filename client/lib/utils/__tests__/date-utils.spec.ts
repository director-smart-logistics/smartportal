import { describe, it, expect } from 'vitest';
import {
  COSTA_RICA_TIMEZONE,
  getCostaRicaDateParts,
  getCostaRicaTodayISO,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  parseDateSafe,
} from '../date-utils';
import {
  generateInvoiceNumber,
  safeFormatDate,
  safeFormatDateTime,
} from '../../services/invoice-service';

describe('Costa Rica Date Utilities (America/Costa_Rica, UTC-6)', () => {
  it('defines the correct timezone constant', () => {
    expect(COSTA_RICA_TIMEZONE).toBe('America/Costa_Rica');
  });

  describe('parseDateSafe', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(parseDateSafe(null)).toBeNull();
      expect(parseDateSafe(undefined)).toBeNull();
      expect(parseDateSafe('')).toBeNull();
    });

    it('parses JS Date objects', () => {
      const d = new Date('2026-08-17T18:00:00Z');
      expect(parseDateSafe(d)?.toISOString()).toBe(d.toISOString());
    });

    it('parses ISO strings and numeric timestamps', () => {
      const iso = '2026-08-17T18:00:00.000Z';
      expect(parseDateSafe(iso)?.toISOString()).toBe(iso);
      expect(parseDateSafe(1786989600000)?.getTime()).toBe(1786989600000);
    });

    it('parses Firestore Timestamp objects with seconds and nanoseconds', () => {
      const fsTimestamp = { seconds: 1786989600, nanoseconds: 500000000 };
      const parsed = parseDateSafe(fsTimestamp);
      expect(parsed).not.toBeNull();
      expect(parsed?.getTime()).toBe(1786989600500);
    });

    it('parses Firestore Timestamp objects with toDate() method', () => {
      const d = new Date('2026-08-17T18:00:00Z');
      const fsTimestampWithMethod = { toDate: () => d };
      expect(parseDateSafe(fsTimestampWithMethod)?.toISOString()).toBe(d.toISOString());
    });
  });

  describe('getCostaRicaDateParts across global timezone boundaries', () => {
    it('correctly maps UTC time across midnight to Costa Rica time (UTC-6)', () => {
      // 2026-08-18 03:30:45 UTC is 2026-08-17 21:30:45 in Costa Rica (UTC-6)
      const refDate = new Date('2026-08-18T03:30:45.123Z');
      const parts = getCostaRicaDateParts(refDate);

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(8);
      expect(parts.day).toBe(17);
      expect(parts.hours).toBe(21);
      expect(parts.minutes).toBe(30);
      expect(parts.seconds).toBe(45);
      expect(parts.milliseconds).toBe(123);

      expect(parts.yearStr).toBe('2026');
      expect(parts.monthStr).toBe('08');
      expect(parts.dayStr).toBe('17');
      expect(parts.hourStr).toBe('21');
      expect(parts.minuteStr).toBe('30');
      expect(parts.secondStr).toBe('45');
      expect(parts.millisecondStr).toBe('123');
      expect(parts.isoDate).toBe('2026-08-17');
    });

    it('correctly maps New Year midnight transition (UTC vs Costa Rica)', () => {
      // 2026-01-01 04:00:00 UTC is 2025-12-31 22:00:00 in Costa Rica
      const refDate = new Date('2026-01-01T04:00:00.000Z');
      const parts = getCostaRicaDateParts(refDate);

      expect(parts.year).toBe(2025);
      expect(parts.month).toBe(12);
      expect(parts.day).toBe(31);
      expect(parts.hours).toBe(22);
      expect(parts.minutes).toBe(0);
      expect(parts.seconds).toBe(0);
      expect(parts.isoDate).toBe('2025-12-31');
    });
  });

  describe('generateInvoiceNumber with Costa Rica timezone guarantee', () => {
    it('embeds Costa Rica date/time in standard invoice numbers regardless of client location', () => {
      // Suppose operator is in Tokyo (where it is Aug 18th morning).
      // UTC timestamp is 2026-08-18T03:30:45.123Z -> In Costa Rica it is 2026-08-17 21:30:45.123
      const refDate = new Date('2026-08-18T03:30:45.123Z');
      const invNum = generateInvoiceNumber('SL6782', false, refDate);

      expect(invNum).toBe('SL6782-20260817213045123');
      expect(invNum).not.toContain('20260818'); // MUST NOT be Japan or UTC date!
    });

    it('embeds Costa Rica date/time with -C suffix for consolidated invoices', () => {
      const refDate = new Date('2026-08-18T03:30:45.123Z');
      const invNum = generateInvoiceNumber('SL4859', true, refDate);

      expect(invNum).toBe('SL4859-20260817213045123-C');
    });

    it('falls back to INV prefix when slCode is empty', () => {
      const refDate = new Date('2026-08-18T03:30:45.123Z');
      const invNum = generateInvoiceNumber('', false, refDate);

      expect(invNum).toBe('INV-20260817213045123');
    });
  });

  describe('formatCostaRicaDate and safeFormatDate', () => {
    it('formats UTC ISO string to Costa Rica date', () => {
      const iso = '2026-08-18T03:30:00.000Z';
      const formatted = formatCostaRicaDate(iso);
      expect(formatted).toBe('17/8/2026');
    });

    it('preserves already formatted DD/MM/YYYY dates', () => {
      expect(formatCostaRicaDate('25/12/2026')).toBe('25/12/2026');
      expect(safeFormatDate('25-12-2026')).toBe('25-12-2026');
    });

    it('safeFormatDate handles null and undefined gracefully', () => {
      expect(safeFormatDate(null)).toBe('');
      expect(safeFormatDate(undefined)).toBe('');
    });

    it('supports custom formatting options in Costa Rica locale', () => {
      const iso = '2026-08-18T03:30:00.000Z';
      const formatted = formatCostaRicaDate(iso, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      expect(formatted).toBe('17/08/2026');
    });
  });

  describe('formatCostaRicaDateTime and safeFormatDateTime', () => {
    it('formats date and time in Costa Rica timezone', () => {
      const iso = '2026-08-18T03:30:45.000Z';
      const formatted = safeFormatDateTime(iso);
      expect(formatted).toContain('17/8/2026');
      expect(formatted).toMatch(/9:30/);

      const formatted24h = safeFormatDateTime(iso, { hour12: false });
      expect(formatted24h).toContain('21:30');
    });
  });

  describe('getCostaRicaTodayISO', () => {
    it('returns a valid YYYY-MM-DD string', () => {
      const todayISO = getCostaRicaTodayISO();
      expect(todayISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
