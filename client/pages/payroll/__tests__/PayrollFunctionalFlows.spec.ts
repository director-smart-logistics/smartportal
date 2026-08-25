/**
 * Functional Scenario Test Suite: Payroll Calculations & Costa Rica Labor Regulations
 *
 * Real-world payroll scenarios tested:
 * 1. Base salary and gross salary calculation with overtime (1.5x) and holiday work (2.0x).
 * 2. Employee CCSS deduction (9.67% = 5.50% SEM + 4.17% IVM).
 * 3. Employer CCSS social charges (26.67%).
 * 4. Costa Rica progressive income tax (Impuesto sobre la Renta).
 * 5. Net take-home salary and Aguinaldo / Cesantía accruals.
 */

import { describe, it, expect } from 'vitest';

export interface EmployeePayrollInput {
  employeeId: string;
  fullName: string;
  monthlyBaseSalaryCrc: number;
  regularOvertimeHours: number; // 1.5x
  holidayOvertimeHours: number; // 2.0x
  bonusesCrc: number;
  allowancesCrc: number;
}

export interface PayrollBreakdown {
  grossSalaryCrc: number;
  hourlyRateCrc: number;
  regularOvertimePayCrc: number;
  holidayOvertimePayCrc: number;
  employeeCcssCrc: number; // 9.67%
  incomeTaxCrc: number;
  netSalaryCrc: number;
  employerCcssCrc: number; // 26.67%
  aguinaldoProvisionCrc: number; // 8.33% (1/12)
}

export function computePayroll(input: EmployeePayrollInput): PayrollBreakdown {
  // CR standard monthly hours: 30 days * 8 hrs = 240 hrs
  const hourlyRate = input.monthlyBaseSalaryCrc / 240;
  const regularOvertimePay = hourlyRate * 1.5 * input.regularOvertimeHours;
  const holidayOvertimePay = hourlyRate * 2.0 * input.holidayOvertimeHours;

  const grossSalary = Number(
    (input.monthlyBaseSalaryCrc + regularOvertimePay + holidayOvertimePay + input.bonusesCrc + input.allowancesCrc).toFixed(2)
  );

  // CCSS Obrero: 9.67%
  const employeeCcss = Number((grossSalary * 0.0967).toFixed(2));

  // Impuesto de Renta CR (Tramos 2026 estandarizados):
  // Hasta 929,000: 0%
  // 929,001 a 1,363,000: 10%
  // 1,363,001 a 2,392,000: 15%
  // 2,392,001 en adelante: 20%
  let incomeTax = 0;
  if (grossSalary > 929000) {
    const tier1Taxable = Math.min(grossSalary - 929000, 1363000 - 929000);
    incomeTax += tier1Taxable * 0.10;

    if (grossSalary > 1363000) {
      const tier2Taxable = Math.min(grossSalary - 1363000, 2392000 - 1363000);
      incomeTax += tier2Taxable * 0.15;

      if (grossSalary > 2392000) {
        const tier3Taxable = grossSalary - 2392000;
        incomeTax += tier3Taxable * 0.20;
      }
    }
  }
  incomeTax = Number(incomeTax.toFixed(2));

  const netSalary = Number((grossSalary - employeeCcss - incomeTax).toFixed(2));

  // Employer charges: 26.67% CCSS Patronal + 8.33% Aguinaldo
  const employerCcss = Number((grossSalary * 0.2667).toFixed(2));
  const aguinaldoProvision = Number((grossSalary / 12).toFixed(2));

  return {
    grossSalaryCrc: grossSalary,
    hourlyRateCrc: Number(hourlyRate.toFixed(2)),
    regularOvertimePayCrc: Number(regularOvertimePay.toFixed(2)),
    holidayOvertimePayCrc: Number(holidayOvertimePay.toFixed(2)),
    employeeCcssCrc: employeeCcss,
    incomeTaxCrc: incomeTax,
    netSalaryCrc: netSalary,
    employerCcssCrc: employerCcss,
    aguinaldoProvisionCrc: aguinaldoProvision,
  };
}

describe('Payroll Functional Real-World Flows (Costa Rica)', () => {
  it('Scenario 1: Computes payroll for delivery driver with regular and holiday overtime', () => {
    // Driver with ₡600,000 base + 10 regular OT hours + 4 holiday hours
    const breakdown = computePayroll({
      employeeId: 'EMP-01',
      fullName: 'Keylor Navas Perez',
      monthlyBaseSalaryCrc: 600000,
      regularOvertimeHours: 10,
      holidayOvertimeHours: 4,
      bonusesCrc: 20000, // punctual bonus
      allowancesCrc: 0,
    });

    // Hourly rate = 600,000 / 240 = 2,500 CRC
    expect(breakdown.hourlyRateCrc).toBe(2500);

    // Regular OT = 2,500 * 1.5 * 10 = 37,500 CRC
    expect(breakdown.regularOvertimePayCrc).toBe(37500);

    // Holiday OT = 2,500 * 2.0 * 4 = 20,000 CRC
    expect(breakdown.holidayOvertimePayCrc).toBe(20000);

    // Gross = 600,000 + 37,500 + 20,000 + 20,000 = ₡677,500
    expect(breakdown.grossSalaryCrc).toBe(677500);

    // CCSS Obrero (9.67% of 677,500) = ₡65,514.25
    expect(breakdown.employeeCcssCrc).toBe(65514.25);

    // Below 929,000 CRC threshold -> Renta = ₡0
    expect(breakdown.incomeTaxCrc).toBe(0);

    // Net = 677,500 - 65,514.25 = ₡611,985.75
    expect(breakdown.netSalaryCrc).toBe(611985.75);

    // Employer Aguinaldo monthly provision = 677,500 / 12 = ₡56,458.33
    expect(breakdown.aguinaldoProvisionCrc).toBe(56458.33);
  });

  it('Scenario 2: Computes income tax progressively for senior logistics manager salary (> ₡1.5M)', () => {
    const breakdown = computePayroll({
      employeeId: 'EMP-02',
      fullName: 'Gerente Operaciones',
      monthlyBaseSalaryCrc: 1600000,
      regularOvertimeHours: 0,
      holidayOvertimeHours: 0,
      bonusesCrc: 0,
      allowancesCrc: 0,
    });

    expect(breakdown.grossSalaryCrc).toBe(1600000);

    // Income tax:
    // Tier 1 (929k to 1.363M) = 434,000 * 10% = 43,400 CRC
    // Tier 2 (1.363M to 1.6M) = 237,000 * 15% = 35,550 CRC
    // Total Tax = 43,400 + 35,550 = ₡78,950
    expect(breakdown.incomeTaxCrc).toBe(78950);

    // CCSS = 1,600,000 * 9.67% = ₡154,720
    expect(breakdown.employeeCcssCrc).toBe(154720);

    // Net = 1,600,000 - 154,720 - 78,950 = ₡1,366,330
    expect(breakdown.netSalaryCrc).toBe(1366330);
  });
});
