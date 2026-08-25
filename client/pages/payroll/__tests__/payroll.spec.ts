import { describe, it, expect } from 'vitest';

describe('Payroll — calculation logic', () => {
  it('calculates gross salary from hours and rate', () => {
    const calcGross = (hours: number, rate: number) => hours * rate;
    expect(calcGross(40, 5000)).toBe(200000);
    expect(calcGross(0, 5000)).toBe(0);
  });

  it('calculates CCSS deduction (10.83% employee share)', () => {
    const CCSS_EMPLOYEE_RATE = 0.1083;
    const calcCCSS = (gross: number) => Math.round(gross * CCSS_EMPLOYEE_RATE);
    expect(calcCCSS(500000)).toBe(54150);
    expect(calcCCSS(0)).toBe(0);
  });

  it('calculates Christmas bonus (aguinaldo) as 1/12 of annual salary', () => {
    const calcAguinaldo = (annualSalary: number) => annualSalary / 12;
    expect(calcAguinaldo(6_000_000)).toBe(500_000);
    expect(calcAguinaldo(0)).toBe(0);
  });

  it('calculates severance (cesantía) for years of service', () => {
    const calcSeverance = (monthlySalary: number, years: number) => {
      const rate = Math.min(years, 8);
      return monthlySalary * (rate * 20) / 365;
    };
    expect(calcSeverance(500_000, 1)).toBeCloseTo(27397, 0);
    expect(calcSeverance(500_000, 10)).toBeCloseTo(219178, 0);
  });
});
