/**
 * Shared types for Payroll functionality
 * Used by both client and server
 */

export type SalaryFrequency = 'weekly' | 'biweekly' | 'monthly' | 'contract' | 'hourly';

export type PayrollStatus = 'draft' | 'calculated' | 'approved' | 'paid' | 'cancelled';

export interface DeductionBreakdown {
  socialSecurity: number;
  incomeTax: number;
  pension: number;
  other: number;
}

export interface PayrollLineItem {
  id: string;
  employeeId: string;
  employeeName: string;
  salaryFrequency: SalaryFrequency;
  basePay: number;
  regularHours: number;
  overtimeHours: number;
  overtimePay: number;
  bonuses: number;
  grossPay: number;
  deductions: DeductionBreakdown;
  totalDeductions: number;
  netPay: number;
}

export interface PayrollReportResponse {
  id: string;
  frequency: SalaryFrequency;
  periodStart: string;
  periodEnd: string;
  status: PayrollStatus;
  totalGrossPay: number;
  totalNetPay: number;
  totalDeductions: number;
  employeeCount: number;
  lineItems: PayrollLineItem[];
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface GeneratePayrollRequest {
  frequency: SalaryFrequency;
  periodStart: string;
  periodEnd: string;
  departmentIds?: string[];
  employeeIds?: string[];
  countryCode?: string;
}

export interface SendPayslipRequest {
  employeeId: string;
  includePdf?: boolean;
}
