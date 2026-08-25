import { useLocale } from "@/hooks/useLocale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface EmployeePayroll {
  employeeId: string;
  employeeName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  salaryFrequency: string;
  baseSalary: number;
  basePay: number;
  regularHours: number;
  overtimeHours: number;
  overtimePay: number;
  bonuses: number;
  grossPay: number;
  deductions: {
    socialSecurity: number;
    incomeTax: number;
    pension: number;
    other: number;
  };
  totalDeductions: number;
  netPay: number;
}

interface PayslipModalProps {
  employee: EmployeePayroll | null;
  periodStart?: string;
  periodEnd?: string;
  open: boolean;
  onClose: () => void;
}

export function PayslipModal({
  employee,
  periodStart,
  periodEnd,
  open,
  onClose,
}: PayslipModalProps) {
  const { t } = useLocale(["payrollReport", "common"]);

  if (!employee) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CR", {
      style: "currency",
      currency: "CRC",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("es-CR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const frequency = t(employee.salaryFrequency);
    const netPayDesc = t("netPayDescription", "Amount to be deposited/paid");
    const footerText = t(
      "payslipFooter",
      "This is an electronically generated payslip. No signature required.",
    );
    const periodText =
      periodStart && periodEnd
        ? `${formatDate(periodStart)} - ${formatDate(periodEnd)}`
        : "";

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Payslip - ${employee.employeeName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 30px;
      background: #ffffff;
      color: #27272a;
      line-height: 1.4;
    }
    .colilla-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 30px;
      border: 1px solid #e4e4e7;
      border-top: 4px solid #9E0A21;
      border-radius: 8px;
      background-color: #ffffff;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .header-table td { vertical-align: middle; }
    .logo-img { display: block; height: 38px; width: auto; }
    .header-right { text-align: right; }
    .title-text { font-size: 14px; font-weight: 800; color: #9E0A21; text-transform: uppercase; letter-spacing: 1.5px; }
    .company-text { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-top: 2px; }
    .divider { height: 1px; background-color: #e4e4e7; margin: 15px 0 20px 0; }
    .meta-container { background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px; }
    .meta-table { width: 100%; border-collapse: collapse; }
    .meta-cell { vertical-align: top; }
    .meta-label { font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .meta-value { font-size: 13px; font-weight: 700; color: #18181b; }
    .meta-value-regular { font-size: 13px; font-weight: 600; color: #27272a; }
    
    .section-title { font-size: 10px; font-weight: 800; color: #71717a; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px 0; }
    .concepts-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 13px; }
    .concepts-table th { background-color: #f4f4f5; color: #52525b; padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .concepts-table td { padding: 9px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a; }
    .concepts-table th.right, .concepts-table td.right { text-align: right; }
    .total-row { background-color: #fafafa; font-weight: 700; color: #18181b; }
    .total-row td { border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7; font-weight: 700; }
    
    .net-box { width: 100%; background-color: #fafafa; border: 1px solid #e4e4e7; border-left: 4px solid #059669; border-radius: 6px; margin-top: 24px; border-collapse: collapse; }
    .net-box td { padding: 14px 18px; vertical-align: middle; }
    .net-label { font-size: 10px; font-weight: 800; color: #065f46; letter-spacing: 0.5px; text-transform: uppercase; }
    .net-desc { font-size: 11px; color: #71717a; margin-top: 2px; }
    .net-amount { font-size: 22px; font-weight: 900; color: #059669; text-align: right; }
    .footer { text-align: center; margin-top: 30px; color: #a1a1aa; font-size: 11px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5; }
    
    @media screen and (max-width: 520px) {
      body { padding: 15px; }
      .colilla-container { padding: 20px; }
      .header-table td { display: block !important; width: 100% !important; text-align: center !important; }
      .header-right { text-align: center !important; margin-top: 12px; }
      .meta-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; border-bottom: 1px dashed #e4e4e7 !important; }
      .meta-cell:last-child { border-bottom: none !important; }
      .concepts-table th, .concepts-table td { padding: 8px 6px !important; font-size: 12px !important; }
    }
    @media print {
      body { padding: 0; background: white; }
      .colilla-container { border: none; box-shadow: none; padding: 10px; }
    }
  </style>
</head>
<body>
  <div class="colilla-container">
    <table class="header-table">
      <tr>
        <td>
          <img src="${window.location.origin}/logo.svg" alt="SmartLogistics Costa Rica" class="logo-img" onerror="this.onerror=null; this.src='${window.location.origin}/logo.png';" />
        </td>
        <td class="header-right">
          <div class="title-text">Comprobante de Pago</div>
          <div class="company-text">SmartLogistics Costa Rica</div>
        </td>
      </tr>
    </table>

    <div class="divider"></div>

    <div class="meta-container">
      <table class="meta-table">
        <tr>
          <td class="meta-cell" style="width: 50%; padding: 0 12px 8px 0; border-bottom: 1px dashed #e4e4e7;">
            <div class="meta-label">Colaborador</div>
            <div class="meta-value">${employee.employeeName}</div>
          </td>
          <td class="meta-cell" style="width: 50%; padding: 0 0 8px 12px; border-bottom: 1px dashed #e4e4e7;">
            <div class="meta-label">Período</div>
            <div class="meta-value">${periodText || "—"}</div>
          </td>
        </tr>
        <tr>
          <td class="meta-cell" style="padding: 8px 12px 8px 0; border-bottom: 1px dashed #e4e4e7;">
            <div class="meta-label">Departamento / Puesto</div>
            <div class="meta-value-regular">${employee.department || "—"}</div>
          </td>
          <td class="meta-cell" style="padding: 8px 0 8px 12px; border-bottom: 1px dashed #e4e4e7;">
            <div class="meta-label">Frecuencia</div>
            <div class="meta-value-regular" style="text-transform: capitalize;">${frequency}</div>
          </td>
        </tr>
        <tr>
          <td class="meta-cell" style="padding: 8px 12px 0 0;">
            <div class="meta-label">Contacto</div>
            <div class="meta-value-regular" style="font-size: 12px;">
              ${employee.email || "—"}${employee.phone ? ` / ${employee.phone}` : ""}
            </div>
          </td>
          <td class="meta-cell" style="padding: 8px 0 0 12px;">
            <div class="meta-label">Salario Base Contractual</div>
            <div class="meta-value">${formatCurrency(employee.baseSalary)}</div>
          </td>
        </tr>
      </table>
    </div>

    <div class="section-title">Ingresos</div>
    <table class="concepts-table">
      <thead>
        <tr>
          <th style="border-top-left-radius: 4px; border-bottom-left-radius: 4px;">Descripción</th>
          <th class="right">Horas</th>
          <th class="right" style="border-top-right-radius: 4px; border-bottom-right-radius: 4px;">Monto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Regular Pay</td>
          <td class="right">${employee.regularHours.toFixed(2)}</td>
          <td class="right" style="font-weight: 600;">${formatCurrency(employee.basePay)}</td>
        </tr>
        ${employee.overtimeHours > 0 ? `
        <tr>
          <td>Overtime Pay (150%)</td>
          <td class="right">${employee.overtimeHours.toFixed(2)}</td>
          <td class="right" style="font-weight: 600;">${formatCurrency(employee.overtimePay)}</td>
        </tr>` : ""}
        ${employee.bonuses > 0 ? `
        <tr>
          <td>Bonuses</td>
          <td class="right">—</td>
          <td class="right" style="font-weight: 600;">${formatCurrency(employee.bonuses)}</td>
        </tr>` : ""}
        <tr class="total-row">
          <td colspan="2">Gross Pay (Salario Bruto)</td>
          <td class="right" style="font-weight: bold;">${formatCurrency(employee.grossPay)}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Deducciones</div>
    <table class="concepts-table">
      <thead>
        <tr>
          <th style="border-top-left-radius: 4px; border-bottom-left-radius: 4px;">Descripción</th>
          <th class="right" style="border-top-right-radius: 4px; border-bottom-right-radius: 4px;">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${employee.deductions.socialSecurity > 0 ? `
        <tr>
          <td>Social Security (CCSS 10.83%)</td>
          <td class="right" style="font-weight: 600; color: #b91c1c;">-${formatCurrency(employee.deductions.socialSecurity)}</td>
        </tr>` : ""}
        ${employee.deductions.incomeTax > 0 ? `
        <tr>
          <td>Income Tax (Impuesto Renta)</td>
          <td class="right" style="font-weight: 600; color: #b91c1c;">-${formatCurrency(employee.deductions.incomeTax)}</td>
        </tr>` : ""}
        ${employee.deductions.pension > 0 ? `
        <tr>
          <td>Pension (Pensión)</td>
          <td class="right" style="font-weight: 600; color: #b91c1c;">-${formatCurrency(employee.deductions.pension)}</td>
        </tr>` : ""}
        ${employee.deductions.other > 0 ? `
        <tr>
          <td>Other Deductions (Otras Deducciones)</td>
          <td class="right" style="font-weight: 600; color: #b91c1c;">-${formatCurrency(employee.deductions.other)}</td>
        </tr>` : ""}
        <tr class="total-row">
          <td>Total Deducciones</td>
          <td class="right" style="font-weight: bold; color: #b91c1c;">-${formatCurrency(employee.totalDeductions)}</td>
        </tr>
      </tbody>
    </table>

    <table class="net-box">
      <tr>
        <td>
          <div class="net-label">Salario Neto a Depositar</div>
          <div class="net-desc">${netPayDesc}</div>
        </td>
        <td class="net-amount">
          ${formatCurrency(employee.netPay)}
        </td>
      </tr>
    </table>

    <div class="footer">
      <p>${footerText}</p>
      <p style="margin-top: 4px;">Smart Logistics - ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-slate-100 font-sans">
          <DialogHeader className="print:hidden pb-2 border-b">
            <DialogTitle>{t("payslip", "Payslip")}</DialogTitle>
          </DialogHeader>

          <div
            className="w-full max-w-[600px] mx-auto p-5 sm:p-8 border border-zinc-200 border-t-4 border-t-[#9E0A21] rounded-lg bg-white shadow-sm text-zinc-800"
            id="payslip-content"
          >
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
              <img 
                src="/logo.svg" 
                alt="SmartLogistics Costa Rica" 
                className="h-9 w-auto object-contain"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.png'; }}
              />
              <div className="text-center sm:text-right">
                <div className="text-sm font-extrabold text-[#9E0A21] tracking-wider uppercase">Comprobante de Pago</div>
                <div className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase mt-0.5">SmartLogistics Costa Rica</div>
              </div>
            </div>

            <div className="h-px bg-zinc-200 my-4"></div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4 sm:p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Colaborador</div>
                  <div className="text-sm font-bold text-zinc-900 mt-0.5">{employee.employeeName}</div>
                </div>
                <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:pl-4">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Período</div>
                  <div className="text-sm font-bold text-zinc-900 mt-0.5">
                    {periodStart && periodEnd ? `${formatDate(periodStart)} - ${formatDate(periodEnd)}` : "—"}
                  </div>
                </div>
                <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4 sm:pt-3">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Departamento / Puesto</div>
                  <div className="text-sm font-medium text-zinc-700 mt-0.5">{employee.department || "—"}</div>
                </div>
                <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:pl-4 sm:pt-3">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Frecuencia</div>
                  <div className="text-sm font-medium text-zinc-700 mt-0.5 capitalize">{t(employee.salaryFrequency)}</div>
                </div>
                <div className="pb-3 border-b border-dashed border-zinc-200 sm:pb-0 sm:border-b-0 sm:border-r sm:pr-4 sm:pt-3">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Contacto</div>
                  <div className="text-xs font-medium text-zinc-600 mt-0.5 break-all">
                    {employee.email || "—"}{employee.phone ? ` / ${employee.phone}` : ""}
                  </div>
                </div>
                <div className="sm:pl-4 sm:pt-3">
                  <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Salario Base Contractual</div>
                  <div className="text-sm font-bold text-zinc-900 mt-0.5">{formatCurrency(employee.baseSalary)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ingresos</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-100 text-left">
                        <th className="py-1.5 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider rounded-l">Descripción</th>
                        <th className="py-1.5 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-right w-[20%]">Horas</th>
                        <th className="py-1.5 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-right w-[25%] rounded-r">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      <tr>
                        <td className="py-2 px-3 text-zinc-700">Regular Pay</td>
                        <td className="py-2 px-3 text-right text-zinc-600">{employee.regularHours.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-zinc-900">{formatCurrency(employee.basePay)}</td>
                      </tr>
                      {employee.overtimeHours > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-700">Overtime Pay (150%)</td>
                          <td className="py-2 px-3 text-right text-zinc-600">{employee.overtimeHours.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-zinc-900">{formatCurrency(employee.overtimePay)}</td>
                        </tr>
                      )}
                      {employee.bonuses > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-700">Bonuses</td>
                          <td className="py-2 px-3 text-right text-zinc-400">—</td>
                          <td className="py-2 px-3 text-right font-semibold text-zinc-900">{formatCurrency(employee.bonuses)}</td>
                        </tr>
                      )}
                      <tr className="bg-zinc-50 font-bold text-zinc-900 border-t border-b border-zinc-200">
                        <td className="py-2 px-3" colSpan={2}>Gross Pay (Salario Bruto)</td>
                        <td className="py-2 px-3 text-right font-extrabold">{formatCurrency(employee.grossPay)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Deducciones</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-100 text-left">
                        <th className="py-1.5 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider rounded-l">Descripción</th>
                        <th className="py-1.5 px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-wider text-right w-[25%] rounded-r">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {employee.deductions.socialSecurity > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-600">Social Security (CCSS 10.83%)</td>
                          <td className="py-2 px-3 text-right font-semibold text-red-700">-{formatCurrency(employee.deductions.socialSecurity)}</td>
                        </tr>
                      )}
                      {employee.deductions.incomeTax > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-600">Income Tax (Impuesto Renta)</td>
                          <td className="py-2 px-3 text-right font-semibold text-red-700">-{formatCurrency(employee.deductions.incomeTax)}</td>
                        </tr>
                      )}
                      {employee.deductions.pension > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-600">Pension (Pensión)</td>
                          <td className="py-2 px-3 text-right font-semibold text-red-700">-{formatCurrency(employee.deductions.pension)}</td>
                        </tr>
                      )}
                      {employee.deductions.other > 0 && (
                        <tr>
                          <td className="py-2 px-3 text-zinc-600">Other Deductions (Otras Deducciones)</td>
                          <td className="py-2 px-3 text-right font-semibold text-red-700">-{formatCurrency(employee.deductions.other)}</td>
                        </tr>
                      )}
                      <tr className="bg-zinc-50 font-bold text-zinc-900 border-t border-b border-zinc-200">
                        <td className="py-2 px-3">Total Deducciones</td>
                        <td className="py-2 px-3 text-right font-extrabold text-red-700">-{formatCurrency(employee.totalDeductions)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-zinc-50 border border-zinc-200 border-l-4 border-l-[#059669] rounded-md mt-6 gap-3">
              <div>
                <div className="text-[10px] font-extrabold text-[#065f46] tracking-wider uppercase">Salario Neto a Depositar</div>
                <div className="text-xs text-zinc-500 mt-0.5">{t("netPayDescription", "Amount to be deposited/paid")}</div>
              </div>
              <div className="text-2xl font-black text-[#059669] self-end sm:self-auto">
                {formatCurrency(employee.netPay)}
              </div>
            </div>

            <div className="text-center mt-8 text-[11px] text-zinc-400 border-t border-zinc-200 pt-4 leading-relaxed">
              <p>
                {t(
                  "payslipFooter",
                  "This is an electronically generated payslip. No signature required.",
                )}
              </p>
              <p className="mt-1">
                Smart Logistics - {new Date().getFullYear()}
              </p>
            </div>
          </div>

          <DialogFooter className="print:hidden">
            <Button onClick={handlePrint} className="w-full sm:w-auto text-white">
              <Printer className="h-4 w-4 mr-2" />
              {t("common.print", "Print")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
