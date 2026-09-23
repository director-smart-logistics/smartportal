import { describe, it, expect } from 'vitest';

describe('Payroll Defensive Functional Flows and Pasivos Invariants', () => {
  it('computes employee CCSS retention accurately with fallback to legal default (10.83%)', () => {
    function calculateEmployeeCcss(grossSalaryCrc: number, customRate?: number) {
      const effectiveRate = customRate != null && customRate > 0 ? customRate : 0.1083;
      const ccssRetention = Number((grossSalaryCrc * effectiveRate).toFixed(2));
      const rateLabel = `${((Number(effectiveRate)) * 100).toFixed(2)}%`;
      return { ccssRetention, rateLabel };
    }

    const standard = calculateEmployeeCcss(650000);
    expect(standard.ccssRetention).toBe(70395.0);
    expect(standard.rateLabel).toBe('10.83%');

    const custom = calculateEmployeeCcss(650000, 0.0967);
    expect(custom.ccssRetention).toBe(62855.0);
    expect(custom.rateLabel).toBe('9.67%');

    const fallbackNull = calculateEmployeeCcss(500000, null as any);
    expect(fallbackNull.ccssRetention).toBe(54150.0);
    expect(fallbackNull.rateLabel).toBe('10.83%');
  });

  it('calculates legal cesantía and aguinaldo provisions defensively', () => {
    interface PasivosCalculation {
      years: number;
      monthsWorked: number;
      grossMonthlySalary: number;
    }

    function calculatePasivos(calc: PasivosCalculation) {
      const yearsSafe = Number(calc.years || 0);
      const monthsSafe = Number(calc.monthsWorked || 0);
      const grossSafe = Number(calc.grossMonthlySalary || 0);

      const aguinaldo = Number(((grossSafe / 12) * Math.min(12, monthsSafe)).toFixed(2));
      const cesantiaDays = Number((Math.min(8, Math.max(0, yearsSafe)) * 20).toFixed(1));
      const dailySalary = grossSafe / 30;
      const cesantiaAmount = Number((cesantiaDays * dailySalary).toFixed(2));
      const totalLiability = Number((aguinaldo + cesantiaAmount).toFixed(2));

      return {
        yearsFormatted: `${yearsSafe.toFixed(2)} ${yearsSafe === 1 ? 'año' : 'años'}`,
        monthsFormatted: `${monthsSafe.toFixed(2)} meses`,
        cesantiaDaysFormatted: `${cesantiaDays.toFixed(1)} días`,
        aguinaldo,
        cesantiaAmount,
        totalLiability,
      };
    }

    const r1 = calculatePasivos({ years: 3.5, monthsWorked: 10, grossMonthlySalary: 600000 });
    expect(r1.yearsFormatted).toBe('3.50 años');
    expect(r1.monthsFormatted).toBe('10.00 meses');
    expect(r1.cesantiaDaysFormatted).toBe('70.0 días');
    expect(r1.aguinaldo).toBe(500000);
    expect(r1.cesantiaAmount).toBe(1400000);
    expect(r1.totalLiability).toBe(1900000);

    const r2 = calculatePasivos({ years: 0, monthsWorked: 0, grossMonthlySalary: 0 });
    expect(r2.yearsFormatted).toBe('0.00 años');
    expect(r2.aguinaldo).toBe(0);
    expect(r2.totalLiability).toBe(0);
  });
});
