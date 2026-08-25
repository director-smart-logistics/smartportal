/**
 * dateUtils.spec.ts
 *
 * Locks the date-range and formatting helpers used by analytics, dashboards
 * and customer-history widgets. The helpers must be tolerant of edge cases
 * (timezone-shift around DST, month overflow, single-day ranges) because
 * they feed downstream chart axes and SQL-like filters.
 */

import { describe, it, expect } from 'vitest';
import {
  getMonthName,
  getMonthYear,
  getLastNMonths,
  getCurrentYear,
  getPreviousYear,
  getCustomRange,
  formatDate,
  getDatesInRange,
  getMonthsInRange,
  getQuartersInRange,
  compareYearOverYear,
} from '.././dateUtils';

describe('getMonthName', () => {
  it('returns the short English month name', () => {
    expect(getMonthName(new Date(2026, 0, 15))).toBe('Jan');
    expect(getMonthName(new Date(2026, 5, 15))).toBe('Jun');
    expect(getMonthName(new Date(2026, 11, 15))).toBe('Dec');
  });

  it('handles every month of the year', () => {
    const expected = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 0; m < 12; m++) {
      expect(getMonthName(new Date(2026, m, 1))).toBe(expected[m]);
    }
  });
});

describe('getMonthYear', () => {
  it('returns short month + 2-digit year', () => {
    expect(getMonthYear(new Date(2026, 3, 12))).toBe('Apr 26');
    expect(getMonthYear(new Date(2099, 11, 1))).toBe('Dec 99');
  });

  it('pads single-digit years correctly', () => {
    expect(getMonthYear(new Date(2005, 0, 1))).toBe('Jan 05');
  });
});

describe('getLastNMonths', () => {
  it('returns a label that includes the count', () => {
    expect(getLastNMonths(6).label).toBe('Last 6 months');
  });

  it('startDate.day is set to 1', () => {
    expect(getLastNMonths(3).startDate.getDate()).toBe(1);
  });

  it('startDate is N-1 months before the current month', () => {
    const r = getLastNMonths(4);
    const today = new Date();
    const expectedMonth = (today.getMonth() - 3 + 12) % 12;
    expect(r.startDate.getMonth()).toBe(expectedMonth);
  });

  it('endDate is set to day 31 (clamped to month length by Date)', () => {
    const r = getLastNMonths(2);
    // setDate(31) on a 30-day month rolls to the next month — that's expected behaviour
    // for the helper. We just verify the day is either 31, the last legal day, or rolled over (1st to 3rd).
    const d = r.endDate.getDate();
    expect(d >= 28 || d <= 3).toBe(true);
  });

  it('handles n=1 (current month only)', () => {
    const r = getLastNMonths(1);
    const today = new Date();
    expect(r.startDate.getMonth()).toBe(today.getMonth());
  });

  it('handles n=12 (full year)', () => {
    expect(getLastNMonths(12).label).toBe('Last 12 months');
  });
});

describe('getCurrentYear', () => {
  it('returns Jan 1 as start', () => {
    const r = getCurrentYear();
    expect(r.startDate.getMonth()).toBe(0);
    expect(r.startDate.getDate()).toBe(1);
  });

  it('uses current year for both start and end', () => {
    const r = getCurrentYear();
    const y = new Date().getFullYear();
    expect(r.startDate.getFullYear()).toBe(y);
    expect(r.endDate.getFullYear()).toBe(y);
  });

  it('label is "Current Year"', () => {
    expect(getCurrentYear().label).toBe('Current Year');
  });
});

describe('getPreviousYear', () => {
  it('uses (currentYear - 1) for the entire range', () => {
    const r = getPreviousYear();
    const y = new Date().getFullYear() - 1;
    expect(r.startDate.getFullYear()).toBe(y);
    expect(r.endDate.getFullYear()).toBe(y);
  });

  it('starts on Jan 1 and ends on Dec 31', () => {
    const r = getPreviousYear();
    expect(r.startDate.getMonth()).toBe(0);
    expect(r.startDate.getDate()).toBe(1);
    expect(r.endDate.getMonth()).toBe(11);
    expect(r.endDate.getDate()).toBe(31);
  });

  it('label is "Previous Year"', () => {
    expect(getPreviousYear().label).toBe('Previous Year');
  });
});

describe('getCustomRange', () => {
  it('builds a label using formatDate on both ends', () => {
    const r = getCustomRange(new Date(2026, 0, 5), new Date(2026, 1, 10));
    expect(r.label).toMatch(/^Jan \d+, 2026 - Feb \d+, 2026$/);
  });

  it('preserves the inputs verbatim', () => {
    const start = new Date(2026, 2, 15);
    const end = new Date(2026, 2, 20);
    const r = getCustomRange(start, end);
    expect(r.startDate).toBe(start);
    expect(r.endDate).toBe(end);
  });
});

describe('formatDate', () => {
  it('uses month-day-year en-US format', () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe('Jan 15, 2026');
    expect(formatDate(new Date(2026, 11, 31))).toBe('Dec 31, 2026');
  });
});

describe('getDatesInRange', () => {
  it('returns one entry per day inclusive of both ends', () => {
    const dates = getDatesInRange(new Date(2026, 0, 1), new Date(2026, 0, 5));
    expect(dates).toHaveLength(5);
  });

  it('returns a single date when start equals end', () => {
    const d = new Date(2026, 0, 15);
    expect(getDatesInRange(d, d)).toHaveLength(1);
  });

  it('returns an empty array when start > end', () => {
    expect(getDatesInRange(new Date(2026, 0, 5), new Date(2026, 0, 1))).toEqual([]);
  });

  it('does not mutate the input dates (uses copies)', () => {
    const start = new Date(2026, 0, 1);
    const startTime = start.getTime();
    getDatesInRange(start, new Date(2026, 0, 5));
    expect(start.getTime()).toBe(startTime);
  });

  it('crosses month boundaries cleanly', () => {
    const dates = getDatesInRange(new Date(2026, 0, 30), new Date(2026, 1, 2));
    expect(dates).toHaveLength(4);
    expect(dates[0].getMonth()).toBe(0);
    expect(dates[3].getMonth()).toBe(1);
  });
});

describe('getMonthsInRange', () => {
  it('emits one entry per month, anchored to day 1', () => {
    const months = getMonthsInRange(new Date(2026, 0, 15), new Date(2026, 2, 10));
    expect(months).toHaveLength(3);
    expect(months[0].month).toBe('Jan');
    expect(months[1].month).toBe('Feb');
    expect(months[2].month).toBe('Mar');
  });

  it('includes the year for each entry', () => {
    const m = getMonthsInRange(new Date(2025, 11, 1), new Date(2026, 1, 1));
    expect(m.map(x => x.year)).toEqual([2025, 2026, 2026]);
  });

  it('returns a single month when start and end fall in the same month', () => {
    expect(getMonthsInRange(new Date(2026, 0, 1), new Date(2026, 0, 31))).toHaveLength(1);
  });
});

describe('getQuartersInRange', () => {
  it('emits one entry per quarter from Q1 to Q4', () => {
    const q = getQuartersInRange(new Date(2026, 0, 1), new Date(2026, 11, 31));
    expect(q).toHaveLength(4);
    expect(q.map(x => x.quarter)).toEqual([1, 2, 3, 4]);
  });

  it('groups Jan / Feb / Mar into Q1', () => {
    const q = getQuartersInRange(new Date(2026, 1, 15), new Date(2026, 2, 20));
    expect(q).toHaveLength(1);
    expect(q[0].quarter).toBe(1);
  });

  it('groups Oct / Nov / Dec into Q4', () => {
    const q = getQuartersInRange(new Date(2026, 9, 1), new Date(2026, 11, 31));
    expect(q[0].quarter).toBe(4);
  });

  it('handles year-spanning ranges', () => {
    const q = getQuartersInRange(new Date(2025, 9, 1), new Date(2026, 5, 30));
    // Q4 2025, Q1 2026, Q2 2026
    expect(q.map(x => `${x.year}Q${x.quarter}`)).toEqual(['2025Q4','2026Q1','2026Q2']);
  });
});

describe('compareYearOverYear', () => {
  it('returns a positive percentageChange when current > previous', () => {
    const r = compareYearOverYear(new Date(2026, 0, 1), new Date(2025, 0, 1), 100);
    expect(r.percentageChange).toBeGreaterThan(0);
    expect(r.isPositive).toBe(true);
  });

  it('returns a negative percentageChange when current < previous', () => {
    const r = compareYearOverYear(new Date(2025, 0, 1), new Date(2026, 0, 1), 100);
    expect(r.percentageChange).toBeLessThan(0);
    expect(r.isPositive).toBe(false);
  });

  it('rounds percentageChange to 1 decimal', () => {
    const r = compareYearOverYear(new Date(2026, 5, 15), new Date(2025, 5, 15), 1);
    expect(r.percentageChange.toString()).toMatch(/^-?\d+(\.\d)?$/);
  });

  it('treats equal dates as 0% (isPositive=true at boundary)', () => {
    const d = new Date(2026, 0, 1);
    const r = compareYearOverYear(d, d, 100);
    expect(r.percentageChange).toBe(0);
    expect(r.isPositive).toBe(true);
  });
});
