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

  describe('Payroll Weekly Calculations with Unpaid Leave (Production Case)', () => {
    it('calculates exact 1-day unpaid deduction and gross for Rodrigo Bonilla (₡550,000 monthly base)', () => {
      const monthlyBase = 550000;
      const dailyRate = monthlyBase / 30; // ₡18,333.3333
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡127,020.78
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡18,333.33
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡108,687.45
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡11,770.85
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡96,916.60

      expect(unpaidDiscountCycle).toBe(18333.33);
      expect(weeklyBase).toBe(127020.79);
      expect(grossCycle).toBe(108687.46);
      expect(ccssCycle).toBe(11770.85);
      expect(netCycle).toBe(96916.61);
    });

    it('calculates exact 1-day unpaid deduction and gross for Juan Carlos Gonzalez (₡450,000 monthly base)', () => {
      const monthlyBase = 450000;
      const dailyRate = monthlyBase / 30; // ₡15,000.00
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡103,926.10
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡15,000.00
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡88,926.10
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡9,630.70
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡79,295.40

      expect(unpaidDiscountCycle).toBe(15000.00);
      expect(weeklyBase).toBe(103926.10);
      expect(grossCycle).toBe(88926.10);
      expect(ccssCycle).toBe(9630.70);
      expect(netCycle).toBe(79295.40);
    });

    it('calculates exact 1-day unpaid deduction and gross for Rodolfo Martinez (₡500,000 monthly base)', () => {
      const monthlyBase = 500000;
      const dailyRate = monthlyBase / 30; // ₡16,666.6667
      const weeklyBase = Math.round(toCycleSalary(monthlyBase, 'weekly') * 100) / 100; // ₡115,473.44
      const unpaidDays = 1;

      const unpaidDiscountCycle = Math.round(dailyRate * unpaidDays * 100) / 100; // ₡16,666.67
      const grossCycle = Math.max(0, Math.round((weeklyBase - unpaidDiscountCycle) * 100) / 100); // ₡98,806.77
      const ccssCycle = Math.round(grossCycle * 0.1083 * 100) / 100; // ₡10,700.77
      const netCycle = Math.round((grossCycle - ccssCycle) * 100) / 100; // ₡88,106.00

      expect(unpaidDiscountCycle).toBe(16666.67);
      expect(weeklyBase).toBe(115473.44);
      expect(grossCycle).toBe(98806.77);
      expect(ccssCycle).toBe(10700.77);
      expect(netCycle).toBe(88106.00);
    });
  });
});
