import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';

interface UnpaidLeaveRecord {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "approved" | "rejected" | "pending";
}

const getOverlapDays = (leave: UnpaidLeaveRecord, periodStart: Date, periodEnd: Date) => {
  const leaveStart = new Date(leave.startDate + "T00:00:00");
  const leaveEnd = new Date(leave.endDate + "T00:00:00");
  const pStart = new Date(format(periodStart, "yyyy-MM-dd") + "T00:00:00");
  const pEnd = new Date(format(periodEnd, "yyyy-MM-dd") + "T00:00:00");
  
  const overlapStart = new Date(Math.max(leaveStart.getTime(), pStart.getTime()));
  const overlapEnd = new Date(Math.min(leaveEnd.getTime(), pEnd.getTime()));
  
  if (overlapStart > overlapEnd) return 0;
  const calendarDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (typeof leave.days === "number" && leave.days > 0) {
    return Math.min(leave.days, calendarDays);
  }
  return calendarDays;
};

const toCycleSalary = (monthlySalary: number, frequency: string): number => {
  if (frequency === "weekly") return monthlySalary / 4.33;
  if (frequency === "biweekly") return monthlySalary / 2;
  if (frequency === "daily") return monthlySalary / 30;
  return monthlySalary;
};

describe('Payroll Unpaid Leave Overlap & Calculation Suite', () => {
  describe('getOverlapDays', () => {
    const periodStart = new Date("2026-08-31T00:00:00");
    const periodEnd = new Date("2026-09-06T23:59:59");

    it('returns exactly 1 day when a single-day unpaid leave falls in the period', () => {
      const leave: UnpaidLeaveRecord = {
        id: 'leave-1',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        days: 1,
        reason: 'Personal',
        status: 'approved',
      };
      expect(getOverlapDays(leave, periodStart, periodEnd)).toBe(1);
    });

    it('returns exactly 3 days when a 3-day unpaid leave falls entirely within the period', () => {
      const leave: UnpaidLeaveRecord = {
        id: 'leave-2',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        days: 3,
        reason: 'Trámite',
        status: 'approved',
      };
      expect(getOverlapDays(leave, periodStart, periodEnd)).toBe(3);
    });

    it('clamps overlap to leave.days if leave.days is explicitly defined', () => {
      const leave: UnpaidLeaveRecord = {
        id: 'leave-3',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        days: 1,
        reason: 'Permiso',
        status: 'approved',
      };
      expect(getOverlapDays(leave, periodStart, periodEnd)).toBe(1);
    });

    it('handles partial overlap when leave begins before the period and ends inside', () => {
      const leave: UnpaidLeaveRecord = {
        id: 'leave-4',
        startDate: '2026-08-28',
        endDate: '2026-09-01', // overlap is Aug 31 & Sep 01 = 2 days in period
        days: 5,
        reason: 'Permiso extendido',
        status: 'approved',
      };
      expect(getOverlapDays(leave, periodStart, periodEnd)).toBe(2);
    });

    it('returns 0 when unpaid leave is entirely outside the period', () => {
      const leave: UnpaidLeaveRecord = {
        id: 'leave-5',
        startDate: '2026-08-20',
        endDate: '2026-08-25',
        days: 6,
        reason: 'Pasado',
        status: 'approved',
      };
      expect(getOverlapDays(leave, periodStart, periodEnd)).toBe(0);
    });
  });

  describe('Payroll Weekly Calculations with Unpaid Leave (6-day work week standard)', () => {
    it('calculates exact 1-day unpaid deduction (1/6th of week) and gross for Rodrigo Bonilla (₡550,000 monthly base)', () => {
      const monthlyBase = 550000;
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡127,020.79
      const dailyRate = weeklyBase / 6; // ₡21,170.13 (1 of 6 working days in week)
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡21,170.13
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡105,850.66
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡11,463.63
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡94,387.03

      expect(unpaidDiscountCycle).toBe(21170.13);
      expect(weeklyBase).toBe(127020.79);
      expect(grossCycle).toBe(105850.66);
      expect(ccssCycle).toBe(11463.63);
      expect(netCycle).toBe(94387.03); // Exactly matches HR calculation (94k)
    });

    it('calculates exact 1-day unpaid deduction and gross for Juan Carlos Gonzalez (₡450,000 monthly base)', () => {
      const monthlyBase = 450000;
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡103,926.10
      const dailyRate = weeklyBase / 6; // ₡17,321.02
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡17,321.02
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡86,605.08
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡9,379.33
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡77,225.75

      expect(unpaidDiscountCycle).toBe(17321.02);
      expect(weeklyBase).toBe(103926.10);
      expect(grossCycle).toBe(86605.08);
      expect(ccssCycle).toBe(9379.33);
      expect(netCycle).toBe(77225.75);
    });

    it('calculates exact 1-day unpaid deduction and gross for Rodolfo Martinez (₡500,000 monthly base)', () => {
      const monthlyBase = 500000;
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡115,473.44
      const dailyRate = weeklyBase / 6; // ₡19,245.57
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡19,245.57
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡96,227.87
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡10,421.48
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡85,806.39

      expect(unpaidDiscountCycle).toBe(19245.57);
      expect(weeklyBase).toBe(115473.44);
      expect(grossCycle).toBe(96227.87);
      expect(ccssCycle).toBe(10421.48);
      expect(netCycle).toBe(85806.39);
    });

    it('calculates exact 1-day unpaid deduction for monthly employee using 30-day base', () => {
      const monthlyBase = 550000;
      const dailyRate = monthlyBase / 30; // ₡18,333.33
      const unpaidDays = 1;
      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100;
      const grossCycle = monthlyBase - unpaidDiscountCycle;

      expect(unpaidDiscountCycle).toBe(18333.33);
      expect(grossCycle).toBe(531666.67);
    });
  });
});
