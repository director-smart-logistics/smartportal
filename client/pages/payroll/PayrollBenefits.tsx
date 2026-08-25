import { useState, useMemo, memo, useEffect, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonPayrollTable } from "@/components/SkeletonLoaders";
import {
  Palmtree,
  Gift,
  Briefcase,
  Plus,
  Search,
  Calendar,
  Calculator,
  User,
  DollarSign,
  Check,
  X,
  Printer,
  TrendingUp,
  FileText,
  CreditCard,
  Building,
  HeartHandshake,
  Percent,
  Trash2,
  Edit,
  Settings,
  Download,
  Mail,
  History,
  Loader2,
  Eye,
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { cn, safeFormatEmployeeDate } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useEmailService } from "@/lib/hooks/useEmailService";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";

/* ── types ─────────────────────────────────────────────────────────────────── */

interface SwagRecord {
  id: string;
  item: string;
  cost: number;
  date: string;
  status: "pending" | "deducted" | "paid" | "delivered";
  items?: { name: string; cost: number }[];
}

interface DeductionRecord {
  id: string;
  amount: number;
  description: string;
  date: string;
  status: "pending" | "deducted";
}

interface UnpaidLeaveRecord {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "approved" | "rejected" | "pending";
}

interface VacationRecord {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  notes?: string;
  status: "approved" | "rejected" | "pending";
}

interface Employee {
  id: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  hireDate: string;
  baseSalary: number;
  salaryFrequency: string;
  departmentName?: string;
  position?: string;
  countryCode: string;
  status: string;
  spouseDependent?: boolean;
  childrenCount?: number;
  privateInsuranceCost?: number;
  vacationAdjustedDays?: number;
  deductions?: DeductionRecord[];
  swag?: SwagRecord[];
  unpaidLeaves?: UnpaidLeaveRecord[];
  vacationsTaken?: VacationRecord[];
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

const toMonthly = (salary: number, freq: string) => {
  if (freq === "hourly")    return salary * 240;
  return salary;
};

const yearsFrom = (date?: string | null) => {
  if (!date) return 0;
  let parsed: Date;
  if (typeof date === "string" && date.includes("-") && !date.includes("T")) {
    parsed = new Date(date + "T12:00:00");
  } else if (typeof date === "string" && date.includes("T00:00:00")) {
    parsed = new Date(date.replace("T00:00:00", "T12:00:00"));
  } else {
    parsed = new Date(date);
  }
  if (isNaN(parsed.getTime())) return 0;
  const diff = Date.now() - parsed.getTime();
  return Math.max(0, diff / (1000 * 60 * 60 * 24 * 365.25));
};

const getCompletedMonths = (dateStr?: string | null) => {
  if (!dateStr) return 0;
  let parsed: Date;
  if (typeof dateStr === "string" && dateStr.includes("-") && !dateStr.includes("T")) {
    parsed = new Date(dateStr + "T12:00:00");
  } else if (typeof dateStr === "string" && dateStr.includes("T00:00:00")) {
    parsed = new Date(dateStr.replace("T00:00:00", "T12:00:00"));
  } else {
    parsed = new Date(dateStr);
  }
  if (isNaN(parsed.getTime())) return 0;

  const today = new Date();
  let months = (today.getFullYear() - parsed.getFullYear()) * 12 + (today.getMonth() - parsed.getMonth());
  if (today.getDate() < parsed.getDate()) {
    months--;
  }
  return Math.max(0, months);
};

const formatServiceTime = (months: number) => {
  if (months === 0) return "0 meses";
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const yrs = Math.floor(months / 12);
  const remM = months % 12;
  if (remM === 0) return `${yrs} ${yrs === 1 ? "año" : "años"}`;
  return `${yrs} ${yrs === 1 ? "año" : "años"}, ${remM} ${remM === 1 ? "mes" : "meses"}`;
};

const calcEmployeeVacations = (e: { hireDate?: string | null; vacationAdjustedDays?: number; vacationsTaken?: any[] }) => {
  const completedMonths = getCompletedMonths(e.hireDate);
  // 1 día entero devengado por cada mes cumplido cerrado + días ajustados
  const accrued = completedMonths * 1 + Math.round(e.vacationAdjustedDays || 0);
  const taken = Math.round((e.vacationsTaken || []).reduce((s, r) => s + (Number(r.days) || 0), 0));
  const balance = accrued - taken;
  const timeFormatted = formatServiceTime(completedMonths);
  return { completedMonths, accrued, taken, balance, timeFormatted };
};

const formatCRC = (n: number) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    minimumFractionDigits: 0,
  }).format(n);

const calcCesantiasDays = (years: number) => {
  if (years < 0.25) return 0; // Menos de 3 meses: 0
  if (years < 0.5) return 7;   // 3 a 6 meses: 7 días
  if (years < 1) return 14;    // 6 meses a 1 año: 14 días

  const actualYears = Math.min(years, 8); // Tope máximo de 8 años
  const integerYears = Math.floor(actualYears);

  // Escala de días por año según Art 29
  const scale = [
    0,     // 0
    19.5,  // Año 1
    20,    // Año 2
    20.5,  // Año 3
    21,    // Año 4
    21.24, // Año 5
    21.5,  // Año 6
    22,    // Año 7
    22     // Año 8
  ];

  let totalDays = integerYears * (scale[integerYears] || 20);

  // Fracciones superiores a 6 meses cuentan como un año adicional
  const fraction = actualYears - integerYears;
  if (fraction >= 0.5 && integerYears < 8) {
    totalDays += scale[integerYears + 1] || 20;
  }

  return totalDays;
};

const calcRentaCR = (gross: number, spouse: boolean, children: number) => {
  if (gross <= 922000) return 0;
  
  let tax = 0;
  const brackets = [
    { limit: 922000, rate: 0 },
    { limit: 1352000, rate: 0.1 },
    { limit: 2373000, rate: 0.15 },
    { limit: 4745000, rate: 0.2 },
    { limit: Infinity, rate: 0.25 }
  ];

  let remaining = gross;
  let prevLimit = 0;

  for (const b of brackets) {
    const range = b.limit - prevLimit;
    if (remaining > range) {
      tax += range * b.rate;
      remaining -= range;
      prevLimit = b.limit;
    } else {
      tax += remaining * b.rate;
      break;
    }
  }

  // Créditos fiscales
  const spouseCredit = spouse ? 2590 : 0;
  const childCredit = children * 1710;
  const totalCredits = spouseCredit + childCredit;

  return Math.max(0, tax - totalCredits);
};

const buildVacationBoletaHtml = (emp: Employee, vacation: VacationRecord, calc: ReturnType<typeof calcEmployeeVacations>) => {
  const reqDays = Math.round(Number(vacation.days) || 0);
  const prevBalance = calc.balance + reqDays;
  const startDateStr = vacation.startDate ? new Date(vacation.startDate + "T12:00:00").toLocaleDateString("es-CR") : "—";
  const endDateStr = vacation.endDate ? new Date(vacation.endDate + "T12:00:00").toLocaleDateString("es-CR") : "—";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Boleta de Control de Vacaciones</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="650" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 20px 24px; border-bottom: 2px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <img src="https://smart-portal-admin.web.app/logo-inv.png" alt="SmartLogistics" width="150" style="display: block; border: 0; width: 150px; height: auto;">
                  </td>
                  <td valign="middle" align="right" style="font-size: 11px; color: #475569; line-height: 1.4;">
                    <strong style="color: #0f172a; font-size: 13px;">SmartLogistics Costa Rica</strong><br>
                    Cédula Jurídica: 3-101-4480994<br>
                    Email: rrhh@smartlogistics.cr
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 24px 10px 24px;">
              <div style="background-color: #0f172a; border-radius: 8px; padding: 14px; text-align: center; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">
                BOLETA DE CONTROL DE VACACIONES
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Colaborador</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.firstName} ${emp.lastName}</span>
                        </td>
                        <td width="50%" style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Cédula de Identidad</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.idNumber || "—"}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Puesto / Departamento</strong>
                          <span style="font-size: 12px; color: #0f172a;">${emp.position || "—"} (${emp.departmentName || "—"})</span>
                        </td>
                        <td style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Fecha de Ingreso</strong>
                          <span style="font-size: 12px; color: #0f172a;">${safeFormatEmployeeDate(emp.hireDate)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 4px 0 0 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Tiempo Laborado</strong>
                          <span style="font-size: 12px; color: #0f172a; font-weight: 600;">${calc.timeFormatted}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; text-align: center;">
                <tr style="background-color: #f1f5f9;">
                  <th style="padding: 10px; font-size: 11px; color: #475569; font-weight: 700;">Saldo Previo</th>
                  <th style="padding: 10px; font-size: 11px; color: #475569; font-weight: 700;">Días Solicitados</th>
                  <th style="padding: 10px; font-size: 11px; color: #475569; font-weight: 700;">Nuevo Saldo Restante</th>
                </tr>
                <tr>
                  <td style="padding: 14px; font-size: 13px; font-weight: 700; color: #0f172a; border-top: 1px solid #e2e8f0;">${prevBalance} días</td>
                  <td style="padding: 14px; font-size: 13px; font-weight: 800; color: #d97706; background-color: #fffbeb; border-top: 1px solid #e2e8f0;">${reqDays} días</td>
                  <td style="padding: 14px; font-size: 13px; font-weight: 800; color: ${calc.balance < 0 ? '#dc2626' : '#059669'}; background-color: ${calc.balance < 0 ? '#fef2f2' : '#ecfdf5'}; border-top: 1px solid #e2e8f0;">${calc.balance} días</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Período Solicitado</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
                <tr>
                  <td width="50%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha de Inicio</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${startDateStr}</span>
                  </td>
                  <td width="50%" style="padding: 12px; border-left: 1px solid #e2e8f0;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha de Finalización</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${endDateStr}</span>
                  </td>
                </tr>
              </table>
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 8px; background-color: #ffffff;">
                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Observaciones / Notas</span>
                <span style="font-size: 12px; color: #334155; line-height: 1.5;">${vacation.notes || "Días de vacaciones autorizados por la administración."}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong style="color: #0f172a; display: block; margin-bottom: 4px;">Declaración del Colaborador:</strong>
                Hago constar que los días aquí indicados corresponden a mi período de vacaciones anuales, solicitados y aprobados de mutuo acuerdo con la empresa. Declaro estar conforme con la cuenta de días devengados y el saldo restante reflejado en mi expediente laboral.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
              <strong style="color: #ffffff;">SmartLogistics CR &bull; San José, Costa Rica</strong><br>
              Documento digital generado automáticamente el ${new Date().toLocaleString("es-CR")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

const buildUnpaidBoletaHtml = (emp: Employee, unpaid: UnpaidLeaveRecord, years: number) => {
  const startDateStr = unpaid.startDate ? new Date(unpaid.startDate + "T12:00:00").toLocaleDateString("es-CR") : "—";
  const endDateStr = unpaid.endDate ? new Date(unpaid.endDate + "T12:00:00").toLocaleDateString("es-CR") : "—";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Boleta de Permiso sin Goce de Salario</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="650" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 20px 24px; border-bottom: 2px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <img src="https://smart-portal-admin.web.app/logo-inv.png" alt="SmartLogistics" width="150" style="display: block; border: 0; width: 150px; height: auto;">
                  </td>
                  <td valign="middle" align="right" style="font-size: 11px; color: #475569; line-height: 1.4;">
                    <strong style="color: #0f172a; font-size: 13px;">SmartLogistics Costa Rica</strong><br>
                    Cédula Jurídica: 3-101-4480994<br>
                    Email: rrhh@smartlogistics.cr
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 24px 10px 24px;">
              <div style="background-color: #0f172a; border-radius: 8px; padding: 14px; text-align: center; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">
                BOLETA DE PERMISO SIN GOCE DE SALARIO
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Colaborador</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.firstName} ${emp.lastName}</span>
                        </td>
                        <td width="50%" style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Cédula de Identidad</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.idNumber || "—"}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Puesto / Departamento</strong>
                          <span style="font-size: 12px; color: #0f172a;">${emp.position || "—"} (${emp.departmentName || "—"})</span>
                        </td>
                        <td style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Fecha de Ingreso</strong>
                          <span style="font-size: 12px; color: #0f172a;">${safeFormatEmployeeDate(emp.hireDate)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 4px 0 0 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Antigüedad</strong>
                          <span style="font-size: 12px; color: #0f172a; font-weight: 600;">${years.toFixed(1)} ${years === 1 ? "año" : "años"}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Detalle del Período de Permiso</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
                <tr>
                  <td width="33%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha de Inicio</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${startDateStr}</span>
                  </td>
                  <td width="33%" style="padding: 12px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha de Finalización</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${endDateStr}</span>
                  </td>
                  <td width="33%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Total Días</span>
                    <span style="font-size: 13px; font-weight: 800; color: #dc2626; background-color: #fef2f2; padding: 2px 8px; border-radius: 12px; display: inline-block;">${unpaid.days} ${unpaid.days === 1 ? "día" : "días"}</span>
                  </td>
                </tr>
              </table>
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 8px; background-color: #ffffff;">
                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Motivo / Justificación</span>
                <span style="font-size: 12px; color: #334155; line-height: 1.5;">${unpaid.reason || "Motivos personales."}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong style="color: #0f172a; display: block; margin-bottom: 4px;">Declaración del Colaborador:</strong>
                Hago constar y acepto que he solicitado voluntariamente un permiso temporal para ausentarme de mis labores ordinarias sin goce de salario durante el período descrito. Comprendo y acepto que los días correspondientes serán rebajados proporcionalmente de mi salario ordinario en la planilla respectiva.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
              <strong style="color: #ffffff;">SmartLogistics CR &bull; San José, Costa Rica</strong><br>
              Documento digital generado automáticamente el ${new Date().toLocaleString("es-CR")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

const buildDeductionBoletaHtml = (emp: Employee, deduction: DeductionRecord, years: number) => {
  const dateStr = deduction.date ? new Date(deduction.date + "T12:00:00").toLocaleDateString("es-CR") : "—";
  const statusStr = deduction.status === "deducted" ? "Cobrado" : "Pendiente";

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Boleta de Retención y Descargos</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="650" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 20px 24px; border-bottom: 2px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <img src="https://smart-portal-admin.web.app/logo-inv.png" alt="SmartLogistics" width="150" style="display: block; border: 0; width: 150px; height: auto;">
                  </td>
                  <td valign="middle" align="right" style="font-size: 11px; color: #475569; line-height: 1.4;">
                    <strong style="color: #0f172a; font-size: 13px;">SmartLogistics Costa Rica</strong><br>
                    Cédula Jurídica: 3-101-4480994<br>
                    Email: rrhh@smartlogistics.cr
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 24px 10px 24px;">
              <div style="background-color: #0f172a; border-radius: 8px; padding: 14px; text-align: center; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">
                BOLETA DE RETENCIÓN Y DESCARGOS
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Colaborador</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.firstName} ${emp.lastName}</span>
                        </td>
                        <td width="50%" style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Cédula de Identidad</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.idNumber || "—"}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Puesto / Departamento</strong>
                          <span style="font-size: 12px; color: #0f172a;">${emp.position || "—"} (${emp.departmentName || "—"})</span>
                        </td>
                        <td style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Fecha de Ingreso</strong>
                          <span style="font-size: 12px; color: #0f172a;">${safeFormatEmployeeDate(emp.hireDate)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 4px 0 0 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Antigüedad</strong>
                          <span style="font-size: 12px; color: #0f172a; font-weight: 600;">${years.toFixed(1)} ${years === 1 ? "año" : "años"}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Detalle del Cargo Especial</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
                <tr>
                  <td width="33%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha Registro</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${dateStr}</span>
                  </td>
                  <td width="33%" style="padding: 12px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Monto Deducción</span>
                    <span style="font-size: 13px; font-weight: 800; color: #dc2626;">${formatCRC(deduction.amount)}</span>
                  </td>
                  <td width="33%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Estado de Cobro</span>
                    <span style="font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase;">${statusStr}</span>
                  </td>
                </tr>
              </table>
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 8px; background-color: #ffffff;">
                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Descripción del Descargo</span>
                <span style="font-size: 12px; color: #334155; line-height: 1.5; font-weight: 600;">${deduction.description}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong style="color: #0f172a; display: block; margin-bottom: 4px;">Autorización del Colaborador:</strong>
                Por medio del presente documento, el colaborador autoriza de forma expresa y voluntaria el rebajo del monto indicado en esta boleta directamente de su salario ordinario, de conformidad con lo conversado y aceptado en virtud de los descargos/ajustes detallados anteriormente.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
              <strong style="color: #ffffff;">SmartLogistics CR &bull; San José, Costa Rica</strong><br>
              Documento digital generado automáticamente el ${new Date().toLocaleString("es-CR")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

const buildSwagBoletaHtml = (emp: Employee, swag: SwagRecord, years: number) => {
  const dateStr = swag.date ? new Date(swag.date + "T12:00:00").toLocaleDateString("es-CR") : "—";
  const items = swag.items && swag.items.length > 0 ? swag.items : [{ name: swag.item, cost: swag.cost }];
  const totalCost = items.reduce((s, it) => s + (Number(it.cost) || 0), 0);

  const itemsTableRows = items.map(it => `
    <tr>
      <td style="padding: 8px 12px; font-size: 12px; color: #0f172a; border-top: 1px solid #e2e8f0; font-weight: 500;">${it.name}</td>
      <td align="right" style="padding: 8px 12px; font-size: 12px; color: #0f172a; border-top: 1px solid #e2e8f0; font-weight: 700;">${formatCRC(it.cost)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Boleta de Asignación de Swag y Activos</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="650" style="max-width: 650px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 20px 24px; border-bottom: 2px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <img src="https://smart-portal-admin.web.app/logo-inv.png" alt="SmartLogistics" width="150" style="display: block; border: 0; width: 150px; height: auto;">
                  </td>
                  <td valign="middle" align="right" style="font-size: 11px; color: #475569; line-height: 1.4;">
                    <strong style="color: #0f172a; font-size: 13px;">SmartLogistics Costa Rica</strong><br>
                    Cédula Jurídica: 3-101-4480994<br>
                    Email: rrhh@smartlogistics.cr
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 24px 10px 24px;">
              <div style="background-color: #0f172a; border-radius: 8px; padding: 14px; text-align: center; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">
                BOLETA DE ASIGNACIÓN DE SWAG Y ACTIVOS
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Colaborador</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.firstName} ${emp.lastName}</span>
                        </td>
                        <td width="50%" style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Cédula de Identidad</strong>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${emp.idNumber || "—"}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 8px 4px 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Puesto / Departamento</strong>
                          <span style="font-size: 12px; color: #0f172a;">${emp.position || "—"} (${emp.departmentName || "—"})</span>
                        </td>
                        <td style="padding: 4px 0 4px 8px; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Fecha de Ingreso</strong>
                          <span style="font-size: 12px; color: #0f172a;">${safeFormatEmployeeDate(emp.hireDate)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 4px 0 0 0; font-size: 12px; color: #64748b;">
                          <strong style="color: #0f172a; display: block; font-size: 10px; text-transform: uppercase;">Antigüedad</strong>
                          <span style="font-size: 12px; color: #0f172a; font-weight: 600;">${years.toFixed(1)} ${years === 1 ? "año" : "años"}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; margin-bottom: 10px;">
                <tr>
                  <td width="50%" style="padding: 12px;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Fecha de Entrega</span>
                    <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${dateStr}</span>
                  </td>
                  <td width="50%" style="padding: 12px; border-left: 1px solid #e2e8f0;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; display: block;">Estado de Activo</span>
                    <span style="font-size: 12px; font-weight: 800; color: #047857; background-color: #ecfdf5; padding: 2px 8px; border-radius: 12px; display: inline-block;">Entregado bajo inventario</span>
                  </td>
                </tr>
              </table>
              
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Artículos y Activos Entregados</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #f1f5f9;">
                  <th align="left" style="padding: 8px 12px; font-size: 11px; color: #475569; font-weight: 700;">Descripción del Artículo / Swag</th>
                  <th align="right" style="padding: 8px 12px; font-size: 11px; color: #475569; font-weight: 700;">Valor Unitario</th>
                </tr>
                ${itemsTableRows}
                <tr style="background-color: #f8fafc;">
                  <td style="padding: 10px 12px; font-size: 12px; font-weight: 800; color: #0f172a; border-top: 2px solid #e2e8f0;">Total Acumulado Boleta</td>
                  <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 800; color: #7c3aed; border-top: 2px solid #e2e8f0;">${formatCRC(totalCost)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 24px;">
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 12px; font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong style="color: #0f172a; display: block; margin-bottom: 4px;">Declaración de Custodia y Recepción de Activos:</strong>
                El colaborador hace constar la recepción satisfactoria de los artículos descritos en el presente documento, comprometiéndose a mantener su adecuada conservación y uso responsable en el ejercicio de sus funciones.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8;">
              <strong style="color: #ffffff;">SmartLogistics CR &bull; San José, Costa Rica</strong><br>
              Documento digital generado automáticamente el ${new Date().toLocaleString("es-CR")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

/* ── component ──────────────────────────────────────────────────────────────── */

const PayrollBenefits = memo(function PayrollBenefits() {
  const { t } = useLocale(["benefits", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("analitica");
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString()
  );

  // Dialog configurations
  const [dialogType, setDialogType] = useState<"vacation" | "unpaid" | "deduction" | "swag" | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [runToDelete, setRunToDelete] = useState<any | null>(null);
  const [activeManageType, setActiveManageType] = useState<"vacation" | "unpaid" | "deduction" | "swag" | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ type: "vacation" | "unpaid" | "deduction" | "swag", empId: string, item: any } | null>(null);

  // Email service and preview state for boletas
  const { sendEmail } = useEmailService();
  const [sendingEmailType, setSendingEmailType] = useState<"vacation" | "unpaid" | "deduction" | "swag" | null>(null);

  const [emailPreviewData, setEmailPreviewData] = useState<{
    type: "vacation" | "unpaid" | "deduction" | "swag";
    title: string;
    recipientEmail: string;
    targetEmail: string;
    recipientName: string;
    subject: string;
    htmlContent: string;
  } | null>(null);

  const handleOpenVacationEmailPreview = () => {
    if (!selectedVacationToPrint) return;
    const emp = selectedVacationToPrint.employee;
    const initialEmail = (emp.email && emp.email.trim()) ? emp.email.trim() : "rrhh@smartlogistics.cr";
    const calc = calcEmployeeVacations(emp);
    const html = buildVacationBoletaHtml(emp, selectedVacationToPrint.vacation, calc);
    setEmailPreviewData({
      type: "vacation",
      title: "Vista Previa — Boleta de Vacaciones",
      recipientEmail: (emp.email && emp.email.trim()) ? emp.email.trim() : "",
      targetEmail: initialEmail,
      recipientName: `${emp.firstName} ${emp.lastName}`,
      subject: `Boleta de Control de Vacaciones — ${emp.firstName} ${emp.lastName}`,
      htmlContent: html,
    });
  };

  const handleOpenUnpaidLeaveEmailPreview = () => {
    if (!selectedUnpaidToPrint) return;
    const emp = selectedUnpaidToPrint.employee;
    const initialEmail = (emp.email && emp.email.trim()) ? emp.email.trim() : "rrhh@smartlogistics.cr";
    const years = yearsFrom(emp.hireDate);
    const html = buildUnpaidBoletaHtml(emp, selectedUnpaidToPrint.unpaid, years);
    setEmailPreviewData({
      type: "unpaid",
      title: "Vista Previa — Boleta de Permiso sin Goce",
      recipientEmail: (emp.email && emp.email.trim()) ? emp.email.trim() : "",
      targetEmail: initialEmail,
      recipientName: `${emp.firstName} ${emp.lastName}`,
      subject: `Boleta de Permiso sin Goce de Salario — ${emp.firstName} ${emp.lastName}`,
      htmlContent: html,
    });
  };

  const handleOpenDeductionEmailPreview = () => {
    if (!selectedDeductionToPrint) return;
    const emp = selectedDeductionToPrint.employee;
    const initialEmail = (emp.email && emp.email.trim()) ? emp.email.trim() : "rrhh@smartlogistics.cr";
    const years = yearsFrom(emp.hireDate);
    const html = buildDeductionBoletaHtml(emp, selectedDeductionToPrint.deduction, years);
    setEmailPreviewData({
      type: "deduction",
      title: "Vista Previa — Boleta de Descargos",
      recipientEmail: (emp.email && emp.email.trim()) ? emp.email.trim() : "",
      targetEmail: initialEmail,
      recipientName: `${emp.firstName} ${emp.lastName}`,
      subject: `Boleta de Retención y Descargos — ${emp.firstName} ${emp.lastName}`,
      htmlContent: html,
    });
  };

  const handleOpenSwagEmailPreview = () => {
    if (!selectedSwagToPrint) return;
    const emp = selectedSwagToPrint.employee;
    const initialEmail = (emp.email && emp.email.trim()) ? emp.email.trim() : "rrhh@smartlogistics.cr";
    const years = yearsFrom(emp.hireDate);
    const html = buildSwagBoletaHtml(emp, selectedSwagToPrint.swag, years);
    setEmailPreviewData({
      type: "swag",
      title: "Vista Previa — Boleta de Entrega de Swag",
      recipientEmail: (emp.email && emp.email.trim()) ? emp.email.trim() : "",
      targetEmail: initialEmail,
      recipientName: `${emp.firstName} ${emp.lastName}`,
      subject: `Boleta de Asignación de Swag y Activos — ${emp.firstName} ${emp.lastName}`,
      htmlContent: html,
    });
  };

  const handleConfirmSendEmail = async () => {
    if (!emailPreviewData) return;
    const destEmail = emailPreviewData.targetEmail.trim();
    if (!destEmail) {
      toast({
        title: "Correo requerido",
        description: "Por favor ingrese una dirección de correo válida.",
        variant: "destructive",
      });
      return;
    }

    setSendingEmailType(emailPreviewData.type);
    try {
      const res = await sendEmail({
        to: destEmail,
        subject: emailPreviewData.subject,
        html: emailPreviewData.htmlContent,
      });

      const isTestMode = destEmail.toLowerCase() !== emailPreviewData.recipientEmail.toLowerCase();

      if (res.success) {
        toast({
          title: isTestMode ? "Correo de prueba enviado" : "Correo enviado exitosamente",
          description: isTestMode
            ? `Se ha enviado el correo de prueba a ${destEmail}.`
            : `Se ha enviado la boleta por correo a ${destEmail}.`,
        });
        setEmailPreviewData(null);
      } else {
        toast({
          title: "Error al enviar correo",
          description: res.error || "No se pudo enviar la boleta por correo.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error de envío",
        description: err?.message || "Ocurrió un error inesperado al enviar el correo.",
        variant: "destructive",
      });
    } finally {
      setSendingEmailType(null);
    }
  };

  // Management Modal Filter & Sorting states
  const [manageSearch, setManageSearch] = useState("");
  const [manageSortKey, setManageSortKey] = useState<string>("date");
  const [manageSortOrder, setManageSortOrder] = useState<"asc" | "desc">("asc"); // Default: oldest to newest

  useEffect(() => {
    if (activeManageType) {
      setManageSearch("");
      setManageSortKey("date");
      setManageSortOrder("asc");
    }
  }, [activeManageType]);

  const handleToggleManageSort = (key: string) => {
    if (manageSortKey === key) {
      setManageSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setManageSortKey(key);
      setManageSortOrder("asc");
    }
  };

  // Date picker popover open states
  const [vacationStartOpen, setVacationStartOpen] = useState(false);
  const [vacationEndOpen, setVacationEndOpen] = useState(false);
  const [unpaidStartOpen, setUnpaidStartOpen] = useState(false);
  const [unpaidEndOpen, setUnpaidEndOpen] = useState(false);
  const [deductionDateOpen, setDeductionDateOpen] = useState(false);
  const [swagDateOpen, setSwagDateOpen] = useState(false);

  const [swagCatalog, setSwagCatalog] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("swag-catalog");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load swag catalog", e);
    }
    return ["Camisa Corporativa", "Abrigo / Jacket", "Gorra", "Uniforme Completo"];
  });

  const [isManagingCatalog, setIsManagingCatalog] = useState(false);
  const [newCatalogItem, setNewCatalogItem] = useState("");

  // Form states
  const [vacationForm, setVacationForm] = useState({ startDate: "", endDate: "", days: "1", notes: "" });
  const [unpaidForm, setUnpaidForm] = useState({ startDate: "", endDate: "", days: "1", reason: "" });
  const [deductionForm, setDeductionForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
  const [swagForm, setSwagForm] = useState({ item: swagCatalog[0] || "Camisa Corporativa", cost: "", date: new Date().toISOString().split("T")[0] });
  const [tempSwagItems, setTempSwagItems] = useState<{ name: string; cost: number }[]>([]);

  useEffect(() => {
    if (dialogType === "swag") {
      if (editingItem) {
        if (editingItem.items && Array.isArray(editingItem.items)) {
          setTempSwagItems(editingItem.items);
        } else {
          setTempSwagItems([{ name: editingItem.item, cost: editingItem.cost }]);
        }
      } else {
        setTempSwagItems([]);
      }
    }
  }, [dialogType, editingItem]);

  const [vacationIncludeSaturdays, setVacationIncludeSaturdays] = useState(false);
  const [unpaidIncludeSaturdays, setUnpaidIncludeSaturdays] = useState(false);

  // Auto-calculate vacation days difference reactively (skipping Sundays, and optionally Saturdays)
  useEffect(() => {
    if (vacationForm.startDate && vacationForm.endDate) {
      const start = new Date(vacationForm.startDate + "T00:00:00Z");
      const end = new Date(vacationForm.endDate + "T00:00:00Z");
      if (end >= start) {
        let count = 0;
        let current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getUTCDay(); // 0 = Sunday, 6 = Saturday
          if (dayOfWeek === 0) {
            // Always skip Sunday
          } else if (dayOfWeek === 6) {
            // Skip Saturday unless vacationIncludeSaturdays is true
            if (vacationIncludeSaturdays) {
              count++;
            }
          } else {
            count++;
          }
          current.setUTCDate(current.getUTCDate() + 1);
        }
        setVacationForm(prev => ({ ...prev, days: count.toString() }));
      }
    }
  }, [vacationForm.startDate, vacationForm.endDate, vacationIncludeSaturdays]);

  // Auto-calculate unpaid leave days difference reactively (skipping Sundays, and optionally Saturdays)
  useEffect(() => {
    if (unpaidForm.startDate && unpaidForm.endDate) {
      const start = new Date(unpaidForm.startDate + "T00:00:00Z");
      const end = new Date(unpaidForm.endDate + "T00:00:00Z");
      if (end >= start) {
        let count = 0;
        let current = new Date(start);
        while (current <= end) {
          const dayOfWeek = current.getUTCDay(); // 0 = Sunday, 6 = Saturday
          if (dayOfWeek === 0) {
            // Always skip Sunday
          } else if (dayOfWeek === 6) {
            // Skip Saturday unless unpaidIncludeSaturdays is true
            if (unpaidIncludeSaturdays) {
              count++;
            }
          } else {
            count++;
          }
          current.setUTCDate(current.getUTCDate() + 1);
        }
        setUnpaidForm(prev => ({ ...prev, days: count.toString() }));
      }
    }
  }, [unpaidForm.startDate, unpaidForm.endDate, unpaidIncludeSaturdays]);

  // Document states
  const [docConfig, setDocConfig] = useState({
    employeeId: "",
    type: "constancia" as "constancia" | "recomendacion" | "despido_con" | "despido_sin" | "cese" | "servicios_profesionales",
    signerName: "",
    signerPosition: "",
  });
  const [previewDoc, setPreviewDoc] = useState(false);

  /* fetch employees */
  const { data: empResp, isLoading: loadingEmps } = useQuery({
    queryKey: ["employees-active"],
    queryFn: () =>
      firestoreApi.employees.list({
        filters: [{ field: "status", op: "==", value: "active" }],
      }),
  });
  const employees: Employee[] = ((empResp as any)?.data as Employee[]) || [];

  const [activeRunDetailId, setActiveRunDetailId] = useState<string | null>(null);
  const [sendingEmailsRunId, setSendingEmailsRunId] = useState<string | null>(null);
  const [selectedVacationToPrint, setSelectedVacationToPrint] = useState<{ employee: Employee; vacation: VacationRecord } | null>(null);
  const [selectedUnpaidToPrint, setSelectedUnpaidToPrint] = useState<{ employee: Employee; unpaid: UnpaidLeaveRecord } | null>(null);
  const [selectedDeductionToPrint, setSelectedDeductionToPrint] = useState<{ employee: Employee; deduction: DeductionRecord } | null>(null);
  const [selectedSwagToPrint, setSelectedSwagToPrint] = useState<{ employee: Employee; swag: SwagRecord } | null>(null);
  const [selectedCalculationToPrint, setSelectedCalculationToPrint] = useState<{
    employee: Employee;
    gross: number;
    years: number;
    monthsWorked: number;
    aguinaldo: number;
    cesantíaDays: number;
    cesantiaAmount: number;
  } | null>(null);

  // Fetch payroll runs history
  const { data: runsResp, isLoading: loadingRuns } = useQuery({
    queryKey: ["payroll-runs-history"],
    queryFn: () =>
      firestoreApi.payrollRuns.list({
        orderByField: "runDate",
        orderDirection: "desc",
      }),
  });
  const runs = ((runsResp as any)?.data as any[]) || [];

  // Delete/Revert Run Mutation
  const deleteRunMutation = useMutation({
    mutationFn: async (run: any) => {
      const promises = (run.lines || []).map(async (line: any) => {
        const emp = (await firestoreApi.employees.get(line.employeeId)) as any;
        if (!emp) return;

        let deductionsChanged = false;
        let swagChanged = false;

        const restoredDeductions: any[] = [];
        (emp.deductions || []).forEach((d: any) => {
          if (d.payrollId === run.id) {
            deductionsChanged = true;
            if (d.description && d.description.includes("(Rebajo parcial)")) {
              const cleanDesc = d.description.replace(" (Rebajo parcial)", "");
              const original = (emp.deductions || []).find(
                (orig: any) => orig.status === "pending" && orig.description === cleanDesc
              );
              if (original) {
                original.amount += d.amount;
              } else {
                restoredDeductions.push({
                  id: Math.random().toString(36).substr(2, 9),
                  amount: d.amount,
                  description: cleanDesc,
                  date: new Date().toISOString().split("T")[0],
                  status: "pending"
                });
              }
            } else {
              restoredDeductions.push({
                ...d,
                status: "pending",
                payrollId: undefined
              });
            }
          } else {
            restoredDeductions.push(d);
          }
        });

        const restoredSwag: any[] = [];
        (emp.swag || []).forEach((s: any) => {
          if (s.payrollId === run.id) {
            swagChanged = true;
            if (s.item && s.item.includes(" (Rebajo parcial)")) {
              const cleanItem = s.item.replace(" (Rebajo parcial)", "");
              const original = (emp.swag || []).find(
                (orig: any) => orig.status === "pending" && orig.item === cleanItem
              );
              if (original) {
                original.cost += s.cost;
              } else {
                restoredSwag.push({
                  id: Math.random().toString(36).substr(2, 9),
                  cost: s.cost,
                  item: cleanItem,
                  date: new Date().toISOString().split("T")[0],
                  status: "pending"
                });
              }
            } else {
              restoredSwag.push({
                ...s,
                status: "pending",
                payrollId: undefined
              });
            }
          } else {
            restoredSwag.push(s);
          }
        });

        const updateData: any = {};
        if (deductionsChanged) updateData.deductions = restoredDeductions;
        if (swagChanged) updateData.swag = restoredSwag;

        if (deductionsChanged || swagChanged) {
          await firestoreApi.employees.update(emp.id, updateData);
        }
      });

      await Promise.all(promises);
      await firestoreApi.payrollRuns.delete(run.id);
      return run;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs-history"] });
      queryClient.invalidateQueries({ queryKey: ["employees-active"] });
      toast({
        title: "Corrida de nómina revertida con éxito",
        description: "Se eliminó el registro e incrementó de nuevo los saldos pendientes de descargos/swags de los empleados.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Error al revertir corrida",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const handleExportBACForRun = (run: any) => {
    const data = (run.lines || []).map((l: any) => {
      const cleanIban = (l.bankAccount || "").replace(/[-\s]/g, "").toUpperCase();
      return {
        "Tipo Identificación": l.idNumber && l.idNumber.length > 9 ? "2" : "1",
        "Identificación": l.idNumber || "",
        "Nombre Completo": l.employeeName,
        "Cuenta IBAN": cleanIban,
        "Monto": l.netSalary,
        "Moneda": "CRC",
        "Referencia": `Planilla ${run.period}`,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Planilla BAC");

    worksheet["!cols"] = [
      { wch: 10 },
      { wch: 15 },
      { wch: 30 },
      { wch: 25 },
      { wch: 12 },
      { wch: 8 },
      { wch: 20 },
    ];

    XLSX.writeFile(workbook, `Planilla_BAC_${run.period.replace(/\s+/g, "_")}.xlsx`);
    toast({ title: "Planilla BAC exportada en Excel con éxito" });
  };

  const handleSendEmailsForRun = async (run: any) => {
    setSendingEmailsRunId(run.id);
    let successCount = 0;
    let failCount = 0;

    for (const line of (run.lines || [])) {
      const emp = employees.find(e => e.id === line.employeeId);
      if (!emp || !emp.email) {
        failCount++;
        continue;
      }

      const frequency = emp.salaryFrequency || (run.period.toLowerCase().includes("sem") ? "weekly" : run.period.toLowerCase().includes("quin") ? "biweekly" : "monthly");
      const frequencyText = frequency === "monthly" ? "Mensual" : frequency === "biweekly" ? "Quincenal" : frequency === "weekly" ? "Semanal" : frequency;
      const weeklyHours = emp.countryCode === "NI" ? 48 : 48; // Default to 48 hours standard

      // Build executive HTML template
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @media screen and (max-width: 520px) {
              .header-cell { display: block !important; width: 100% !important; text-align: center !important; }
              .header-right { text-align: center !important; margin-top: 12px !important; }
              .meta-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; border-bottom: 1px dashed #e4e4e7 !important; }
              .meta-cell:last-child { border-bottom: none !important; }
              .concepts-th, .concepts-td { padding: 8px 6px !important; font-size: 12px !important; }
              .total-cell { display: block !important; width: 100% !important; text-align: center !important; }
              .total-amount-cell { display: block !important; width: 100% !important; text-align: center !important; margin-top: 10px !important; }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #fafafa; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <div style="max-width: 600px; margin: 20px auto; padding: 30px; border: 1px solid #e4e4e7; border-top: 4px solid #9E0A21; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); box-sizing: border-box;">
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td class="header-cell" style="vertical-align: middle;">
                  <img src="https://smart-portal-admin.web.app/logo.png" alt="SmartLogistics Costa Rica" style="display: block; height: 38px; width: auto;" onerror="this.style.display='none'" />
                </td>
                <td class="header-cell header-right" style="vertical-align: middle; text-align: right;">
                  <div style="font-size: 14px; font-weight: 800; color: #9E0A21; text-transform: uppercase; letter-spacing: 1.5px;">Colilla de Pago Oficial</div>
                  <div style="font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-top: 2px;">SmartLogistics Costa Rica</div>
                </td>
              </tr>
            </table>

            <div style="height: 1px; background-color: #e4e4e7; margin: 15px 0 20px 0;"></div>

            <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; padding: 16px 20px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td class="meta-cell" style="width: 50%; padding: 0 12px 8px 0; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Colaborador</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${line.employeeName}</div>
                  </td>
                  <td class="meta-cell" style="width: 50%; padding: 0 0 8px 12px; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Período</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${run.period}</div>
                  </td>
                </tr>
                <tr>
                  <td class="meta-cell" style="padding: 8px 12px 8px 0; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Identificación</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a;">${line.idNumber || "—"}</div>
                  </td>
                  <td class="meta-cell" style="padding: 8px 0 8px 12px; border-bottom: 1px dashed #e4e4e7; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Puesto</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a;">${emp.position || "Colaborador"}</div>
                  </td>
                </tr>
                <tr>
                  <td class="meta-cell" style="padding: 8px 12px 0 0; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Frecuencia / Horas</div>
                    <div style="font-size: 13px; font-weight: 600; color: #27272a; text-transform: capitalize;">
                      ${frequencyText} / ${weeklyHours} hs
                    </div>
                  </td>
                  <td class="meta-cell" style="padding: 8px 0 0 12px; vertical-align: top;">
                    <div style="font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Salario Base Contractual</div>
                    <div style="font-size: 13px; font-weight: 700; color: #18181b;">${formatCRC(emp.baseSalary)}</div>
                  </td>
                </tr>
              </table>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              <thead>
                <tr style="background-color: #f4f4f5;">
                  <th class="concepts-th" style="text-align: left; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-top-left-radius: 4px; border-bottom-left-radius: 4px;">Concepto / Detalle</th>
                  <th class="concepts-th" style="text-align: right; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; width: 25%;">Ingresos (CRC)</th>
                  <th class="concepts-th" style="text-align: right; padding: 8px 12px; color: #52525b; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; width: 25%; border-top-right-radius: 4px; border-bottom-right-radius: 4px;">Deducciones (CRC)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">
                    ${frequency === "weekly" ? "Salario Base Semanal" : frequency === "biweekly" ? "Salario Base Quincenal" : "Salario Base Mensual"}
                  </td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a; font-weight: 600;">${formatCRC(line.baseSalary)}</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                </tr>
                ${line.unpaidLeaveDays > 0 ? `
                <tr style="color: #b91c1c;">
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5;">Permiso sin Goce (${line.unpaidLeaveDays} días)</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.unpaidLeaveDiscount)}</td>
                </tr>
                ` : ""}
                <tr style="background-color: #fafafa; font-weight: 700; color: #18181b;">
                  <td class="concepts-td" style="padding: 10px 12px; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">Salario Bruto Calculado</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; font-weight: 700; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">${formatCRC(line.grossSalary)}</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; border-bottom: 2px double #e4e4e7;">—</td>
                </tr>
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Retención Obrero CCSS (10.83%)</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.ccss)}</td>
                </tr>
                ${line.renta > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Impuesto sobre la Renta</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.renta)}</td>
                </tr>
                ` : ""}
                ${line.privateInsuranceCost > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Seguro Privado Co-pago</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.privateInsuranceCost)}</td>
                </tr>
                ` : ""}
                ${(line.descargosDeducted || 0) > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Descargos / Compras Deducidas</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.descargosDeducted)}</td>
                </tr>
                ` : ""}
                ${(line.swagDeducted || 0) > 0 ? `
                <tr>
                  <td class="concepts-td" style="padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #27272a;">Branding / Swag Deducido</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #a1a1aa;">—</td>
                  <td class="concepts-td" style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #f4f4f5; color: #b91c1c; font-weight: 600;">-${formatCRC(line.swagDeducted)}</td>
                </tr>
                ` : ""}
              </tbody>
            </table>

            <table style="width: 100%; background-color: #fafafa; border: 1px solid #e4e4e7; border-left: 4px solid #059669; border-radius: 6px; margin-top: 24px; border-collapse: collapse;">
              <tr>
                <td class="total-cell" style="padding: 14px 18px; text-align: left; vertical-align: middle;">
                  <div style="font-size: 10px; font-weight: 800; color: #065f46; letter-spacing: 0.5px; text-transform: uppercase;">Salario Neto a Depositar</div>
                  <div style="font-size: 11px; color: #71717a; margin-top: 2px;">Monto total a transferir a su cuenta bancaria</div>
                </td>
                <td class="total-amount-cell" style="padding: 14px 18px; text-align: right; vertical-align: middle;">
                  <div style="font-size: 22px; font-weight: 900; color: #059669; font-family: Arial, sans-serif;">
                    ${formatCRC(line.netSalary)}
                  </div>
                </td>
              </tr>
            </table>

            <div style="text-align: center; margin-top: 30px; color: #a1a1aa; font-size: 11px; border-top: 1px solid #e4e4e7; padding-top: 15px; line-height: 1.5;">
              Este es un documento confidencial e informativo emitido por SmartLogistics Costa Rica S.A.<br/>
              © 2026 SmartLogistics. Todos los derechos reservados.
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        await sendEmail({
          to: emp.email,
          subject: `Colilla de Pago - Período ${run.period} - SmartLogistics`,
          html: htmlContent,
        });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setSendingEmailsRunId(null);
    toast({
      title: "Envío de colillas finalizado",
      description: `Se enviaron ${successCount} correos con éxito y fallaron ${failCount}.`,
    });
  };

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Employee> }) => {
      return firestoreApi.employees.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees-active"] });
      setDialogType(null);
      toast({ title: t("common.success") });
      // Reset forms
      setVacationForm({ startDate: "", endDate: "", days: "1", notes: "" });
      setUnpaidForm({ startDate: "", endDate: "", days: "1", reason: "" });
      setDeductionForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
      setSwagForm({ item: swagCatalog[0] || "Camisa Corporativa", cost: "", date: new Date().toISOString().split("T")[0] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  /* computed metrics */
  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q) ||
        e.idNumber.includes(q)
    );
  }, [employees, search]);

  const stats = useMemo(() => {
    let totalGross = 0;
    let totalNet = 0;
    let totalCCSSPatronal = 0;
    let totalCCSSObrero = 0;
    let totalRenta = 0;
    let totalPrivateInsurance = 0;
    let totalPendingDeductions = 0;
    let totalPendingSwag = 0;

    const deptMap: Record<
      string,
      { count: number; gross: number; patronal: number; obrero: number; net: number }
    > = {};

    employees.forEach((e) => {
      const monthlyGross = toMonthly(e.baseSalary, e.salaryFrequency || "monthly");
      totalGross += monthlyGross;

      const ccssObrero = monthlyGross * 0.1083;
      const ccssPatronal = monthlyGross * 0.2683;
      const renta = calcRentaCR(monthlyGross, !!e.spouseDependent, e.childrenCount || 0);
      const privInsurance = e.privateInsuranceCost || 0;

      totalCCSSObrero += ccssObrero;
      totalCCSSPatronal += ccssPatronal;
      totalRenta += renta;
      totalPrivateInsurance += privInsurance;

      // Pending values
      (e.deductions || []).forEach((d) => {
        if (d.status === "pending") totalPendingDeductions += d.amount;
      });
      (e.swag || []).forEach((s) => {
        if (s.status === "pending") totalPendingSwag += s.cost;
      });

      totalNet += monthlyGross - ccssObrero - renta - privInsurance;

      // Department grouping
      const dept = e.departmentName || "Sin Departamento";
      if (!deptMap[dept]) {
        deptMap[dept] = { count: 0, gross: 0, patronal: 0, obrero: 0, net: 0 };
      }
      deptMap[dept].count += 1;
      deptMap[dept].gross += monthlyGross;
      deptMap[dept].patronal += ccssPatronal;
      deptMap[dept].obrero += ccssObrero;
      deptMap[dept].net += monthlyGross - ccssObrero - renta - privInsurance;
    });

    const provisions = totalGross * 0.1666; // 8.33% Aguinaldo + 8.33% Cesantía
    const totalCompanyCost = totalGross + totalCCSSPatronal + provisions;

    const departmentRows = Object.entries(deptMap).map(([name, d]) => ({
      name,
      count: d.count,
      gross: d.gross,
      patronal: d.patronal,
      obrero: d.obrero,
      net: d.net,
      totalCost: d.gross + d.patronal + d.gross * 0.1666,
      avgSalary: d.gross / d.count,
    }));

    return {
      totalGross,
      totalNet,
      totalCCSSPatronal,
      totalCCSSObrero,
      totalRenta,
      totalPrivateInsurance,
      provisions,
      totalCompanyCost,
      totalPendingDeductions,
      totalPendingSwag,
      departmentRows,
    };
  }, [employees]);

  // Chart data
  const costDistributionData = [
    { name: t("salaryNetWeight"), value: stats.totalNet, color: "#10b981" },
    { name: t("socialChargesWeight"), value: stats.totalCCSSPatronal + stats.totalCCSSObrero, color: "#f59e0b" },
    { name: t("taxWeight"), value: stats.totalRenta, color: "#ef4444" },
    { name: t("provisionWeight"), value: stats.provisions, color: "#6366f1" },
  ];

  /* actions */
  const handleOpenDialog = (type: "vacation" | "unpaid" | "deduction" | "swag", empId: string) => {
    setSelectedEmployeeId(empId);
    setDialogType(type);
    if (type === "vacation") {
      setVacationIncludeSaturdays(false);
      setVacationForm({
        startDate: "",
        endDate: "",
        days: "1",
        notes: ""
      });
    }
    if (type === "unpaid") {
      setUnpaidIncludeSaturdays(false);
      setUnpaidForm({
        startDate: "",
        endDate: "",
        days: "1",
        reason: ""
      });
    }
    if (type === "swag") {
      setIsManagingCatalog(false);
      setNewCatalogItem("");
      setSwagForm({
        item: swagCatalog[0] || "Camisa Corporativa",
        cost: "",
        date: new Date().toISOString().split("T")[0]
      });
    }
  };

  const handleAddCatalogItem = () => {
    const trimmed = newCatalogItem.trim();
    if (!trimmed) return;
    if (swagCatalog.includes(trimmed)) {
      toast({ title: "El artículo ya existe en el catálogo", variant: "destructive" });
      return;
    }
    const updated = [...swagCatalog, trimmed];
    setSwagCatalog(updated);
    localStorage.setItem("swag-catalog", JSON.stringify(updated));
    setNewCatalogItem("");
    setSwagForm((f) => ({ ...f, item: trimmed }));
    toast({ title: "Artículo agregado al catálogo" });
  };

  const handleRemoveCatalogItem = (item: string) => {
    const updated = swagCatalog.filter((i) => i !== item);
    setSwagCatalog(updated);
    localStorage.setItem("swag-catalog", JSON.stringify(updated));
    if (swagForm.item === item) {
      setSwagForm((f) => ({ ...f, item: updated[0] || "" }));
    }
    toast({ title: "Artículo eliminado del catálogo" });
  };

  const handleDeleteVacation = (empId: string, itemToDelete: any) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const updated = (emp.vacationsTaken || []).filter((v: any) => v.id !== itemToDelete.id);
    updateEmployeeMutation.mutate({
      id: emp.id,
      data: {
        vacationsTaken: updated,
      },
    });
  };

  const handleDeleteUnpaidLeave = (empId: string, itemToDelete: any) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const updated = (emp.unpaidLeaves || []).filter((u: any) => u.id !== itemToDelete.id);
    updateEmployeeMutation.mutate({
      id: emp.id,
      data: {
        unpaidLeaves: updated,
      },
    });
  };

  const handleDeleteDeduction = (empId: string, itemToDelete: any) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const updated = (emp.deductions || []).filter((d: any) => d.id !== itemToDelete.id);
    updateEmployeeMutation.mutate({
      id: emp.id,
      data: {
        deductions: updated,
      },
    });
  };

  const handleDeleteSwag = (empId: string, itemToDelete: any) => {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) return;
    const updated = (emp.swag || []).filter((s: any) => s.id !== itemToDelete.id);
    updateEmployeeMutation.mutate({
      id: emp.id,
      data: {
        swag: updated,
      },
    });
  };

  const handleAddVacation = () => {
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    if (!vacationForm.startDate || !vacationForm.endDate) {
      toast({
        title: "Fechas obligatorias",
        description: "Es obligatorio seleccionar las fechas de inicio y fin para guardar las vacaciones.",
        variant: "destructive",
      });
      return;
    }

    if (editingItem) {
      const updated = (emp.vacationsTaken || []).map((v: any) => {
        if (v.id === editingItem.id) {
          return {
            ...v,
            startDate: vacationForm.startDate,
            endDate: vacationForm.endDate,
            days: parseFloat(vacationForm.days),
            notes: vacationForm.notes,
          };
        }
        return v;
      });
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          vacationsTaken: updated,
        },
      });
      setEditingItem(null);
    } else {
      const item: VacationRecord = {
        id: Math.random().toString(36).substring(2, 9),
        startDate: vacationForm.startDate,
        endDate: vacationForm.endDate,
        days: parseFloat(vacationForm.days),
        notes: vacationForm.notes,
        status: "approved",
      };
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          vacationsTaken: [...(emp.vacationsTaken || []), item],
        },
      });
    }
  };

  const handleAddUnpaidLeave = () => {
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    if (!unpaidForm.startDate || !unpaidForm.endDate) {
      toast({
        title: "Fechas obligatorias",
        description: "Es obligatorio seleccionar las fechas de inicio y fin para guardar el permiso sin goce.",
        variant: "destructive",
      });
      return;
    }

    if (editingItem) {
      const updated = (emp.unpaidLeaves || []).map((u: any) => {
        if (u.id === editingItem.id) {
          return {
            ...u,
            startDate: unpaidForm.startDate,
            endDate: unpaidForm.endDate,
            days: parseFloat(unpaidForm.days),
            reason: unpaidForm.reason,
          };
        }
        return u;
      });
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          unpaidLeaves: updated,
        },
      });
      setEditingItem(null);
    } else {
      const item: UnpaidLeaveRecord = {
        id: Math.random().toString(36).substring(2, 9),
        startDate: unpaidForm.startDate,
        endDate: unpaidForm.endDate,
        days: parseFloat(unpaidForm.days),
        reason: unpaidForm.reason,
        status: "approved",
      };
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          unpaidLeaves: [...(emp.unpaidLeaves || []), item],
        },
      });
    }
  };

  const handleAddDeduction = () => {
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    if (!deductionForm.date) {
      toast({
        title: "Fecha obligatoria",
        description: "Es obligatorio seleccionar la fecha para guardar el descargo.",
        variant: "destructive",
      });
      return;
    }

    if (editingItem) {
      const updatedDeductions = (emp.deductions || []).map((d: any) => {
        if (d.id === editingItem.id) {
          return {
            ...d,
            amount: parseFloat(deductionForm.amount),
            description: deductionForm.description,
            date: deductionForm.date
          };
        }
        return d;
      });
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          deductions: updatedDeductions,
        },
      });
      setEditingItem(null);
    } else {
      const item: DeductionRecord = {
        id: Math.random().toString(36).substring(2, 9),
        amount: parseFloat(deductionForm.amount),
        description: deductionForm.description,
        date: deductionForm.date,
        status: "pending",
      };
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          deductions: [...(emp.deductions || []), item],
        },
      });
    }
  };

  const handleAddSwag = () => {
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    if (!swagForm.date) {
      toast({
        title: "Fecha obligatoria",
        description: "Es obligatorio seleccionar la fecha para guardar la regalía / swag.",
        variant: "destructive",
      });
      return;
    }

    const finalItems = tempSwagItems.length > 0 ? tempSwagItems : [
      { name: swagForm.item, cost: parseFloat(swagForm.cost) || 0 }
    ];

    const totalCost = finalItems.reduce((acc, it) => acc + it.cost, 0);
    const combinedItemNames = finalItems.map(it => it.name).join(", ");

    if (editingItem) {
      const updatedSwag = (emp.swag || []).map((s: any) => {
        if (s.id === editingItem.id) {
          return {
            ...s,
            item: combinedItemNames,
            cost: totalCost,
            date: swagForm.date,
            status: s.status || "delivered",
            items: finalItems
          };
        }
        return s;
      });
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          swag: updatedSwag,
        },
      });
      setEditingItem(null);
    } else {
      const item: SwagRecord = {
        id: Math.random().toString(36).substring(2, 9),
        item: combinedItemNames,
        cost: totalCost,
        date: swagForm.date,
        status: "delivered",
        items: finalItems
      };
      updateEmployeeMutation.mutate({
        id: emp.id,
        data: {
          swag: [...(emp.swag || []), item],
        },
      });
    }
    setDialogType(null);
  };

  // Letters Preview Variables
  const selectedDocEmployee = useMemo(() => {
    return employees.find((e) => e.id === docConfig.employeeId);
  }, [employees, docConfig.employeeId]);

  return (
    <DashboardLayout>
      <style>{`
        @page {
          size: letter;
          margin: 0.4in;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white;
            color: black;
            border: none !important;
            border-style: none !important;
            box-shadow: none !important;
            font-size: 11pt;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
          }
          div[role="dialog"], 
          div[data-radix-portal], 
          .fixed, 
          [data-state="open"] {
            position: static !important;
            transform: none !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
        }
      `}</style>
      
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 p-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("common.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-56"
              />
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-full">
            <TabsTrigger value="analitica" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <TrendingUp className="h-4 w-4" />
              {t("hrAnalytics")}
            </TabsTrigger>
            <TabsTrigger value="vacaciones" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Palmtree className="h-4 w-4" />
              {t("vacaciones")}
            </TabsTrigger>
            <TabsTrigger value="permisos" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Calendar className="h-4 w-4" />
              {t("unpaidLeaves")}
            </TabsTrigger>
            <TabsTrigger value="deducciones" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CreditCard className="h-4 w-4" />
              {t("deductions")}
            </TabsTrigger>
            <TabsTrigger value="swag" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Gift className="h-4 w-4" />
              {t("swag")}
            </TabsTrigger>
            <TabsTrigger value="renta" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Percent className="h-4 w-4" />
              {t("ccssAndTaxes")}
            </TabsTrigger>
            <TabsTrigger value="provisión" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Calculator className="h-4 w-4" />
              {t("cesantia") + " & " + t("aguinaldo")}
            </TabsTrigger>
            <TabsTrigger value="documentos" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-4 w-4" />
              {t("documents")}
            </TabsTrigger>
            <TabsTrigger value="historial" className="gap-1.5 py-1.5 px-3 rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <History className="h-4 w-4" />
              Historial
            </TabsTrigger>
          </TabsList>

          {/* ── COSTOS Y PRESUPUESTOS ── */}
          <TabsContent value="analitica" className="space-y-6">
            {loadingEmps ? (
              <SkeletonPayrollTable rows={5} />
            ) : (
              <>
                {/* Costos de la Empresa (Cargas Patronales y Provisiones) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        Salarios Brutos Mensuales
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-foreground">
                        {formatCRC(stats.totalGross)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Costo base total de planillas
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        CCSS Patronal (26.83%)
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                        {formatCRC(stats.totalCCSSPatronal)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Carga obligatoria patronal
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        Pasivo en Provisiones
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                        {formatCRC(stats.provisions)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aguinaldo (8.33%) y Cesantía (8.33%)
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="p-4">
                      <p className="text-xs text-primary font-semibold uppercase">
                        {t("totalCompanyCost")}
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-primary">
                        {formatCRC(stats.totalCompanyCost)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Inversión total real de la planilla
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Retenciones y Neto a Pagar a Empleados */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        CCSS Obrero (10.83%)
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">
                        {formatCRC(stats.totalCCSSObrero)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aporte social total retenido a los trabajadores
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium uppercase">
                        Deducciones Opcionales / Renta
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-rose-600">
                        {formatCRC(stats.totalRenta + stats.totalPrivateInsurance)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Impuesto de renta y seguros médicos privados deducidos
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                    <CardContent className="p-4">
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold uppercase">
                        Neto Total a Depositar
                      </p>
                      <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                        {formatCRC(stats.totalNet)}
                      </h3>
                      <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                        Monto neto líquido total a pagar a los empleados
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Recharts PieChart */}
                  <Card className="col-span-1">
                    <CardHeader>
                      <CardTitle className="text-base">Distribución del Costo</CardTitle>
                      <CardDescription>Composición contable de la nómina</CardDescription>
                    </CardHeader>
                    <CardContent className="h-56 flex flex-col justify-between">
                      <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={costDistributionData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={65}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {costDistributionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatCRC(value as number)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-around text-xs mt-2 flex-wrap gap-2">
                        {costDistributionData.map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="text-muted-foreground">{d.name}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recharts BarChart Department */}
                  <Card className="col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">{t("departmentCost")}</CardTitle>
                      <CardDescription>Inversión por área organizacional</CardDescription>
                    </CardHeader>
                    <CardContent className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.departmentRows}>
                          <XAxis dataKey="name" fontSize={11} stroke="#888888" />
                          <YAxis fontSize={11} stroke="#888888" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(value) => formatCRC(value as number)} />
                          <Bar dataKey="totalCost" fill="#6366f1" radius={[4, 4, 0, 0]} name="Costo Real" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Table by Department */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Presupuesto por Departamentos</CardTitle>
                    <CardDescription>Resumen de costos agrupados</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Departamento</TableHead>
                          <TableHead className="text-center">Personal</TableHead>
                          <TableHead className="text-right">Base Bruta</TableHead>
                          <TableHead className="text-right">CCSS Patronal</TableHead>
                          <TableHead className="text-right text-orange-600">CCSS Obrero (10.83%)</TableHead>
                          <TableHead className="text-right font-semibold text-emerald-600">Neto a Depositar</TableHead>
                          <TableHead className="text-right font-semibold">Costo Real Total</TableHead>
                          <TableHead className="text-right">{t("averageSalary")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.departmentRows.map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-center">{row.count}</TableCell>
                            <TableCell className="text-right">{formatCRC(row.gross)}</TableCell>
                            <TableCell className="text-right">{formatCRC(row.patronal)}</TableCell>
                            <TableCell className="text-right text-orange-600">-{formatCRC(row.obrero)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">
                              {formatCRC(row.net)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary">
                              {formatCRC(row.totalCost)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCRC(row.avgSalary)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── VACACIONES ── */}
          <TabsContent value="vacaciones">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Saldos de Vacaciones</CardTitle>
                <CardDescription>Cálculo de 1 día de vacaciones por cada mes entero cumplido de labores continuas</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Ingreso</TableHead>
                        <TableHead className="text-center">Tiempo Laborado</TableHead>
                        <TableHead className="text-center">Días Devengados</TableHead>
                        <TableHead className="text-center">Días Tomados</TableHead>
                        <TableHead className="text-center font-bold">Saldo Disponible</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const { accrued, taken, balance, timeFormatted } = calcEmployeeVacations(e);

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {safeFormatEmployeeDate(e.hireDate)}
                            </TableCell>
                            <TableCell className="text-center font-medium text-muted-foreground">{timeFormatted}</TableCell>
                            <TableCell className="text-center font-semibold">{accrued}d</TableCell>
                            <TableCell className="text-center text-red-600 dark:text-red-400 font-medium">
                              {taken}d
                            </TableCell>
                            <TableCell className={`text-center font-bold ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {balance}d
                            </TableCell>
                            <TableCell className="text-right space-x-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedEmployeeId(e.id);
                                  setActiveManageType("vacation");
                                }}
                              >
                                <Settings className="h-3.5 w-3.5 mr-1" />
                                Administrar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItem(null);
                                  setVacationForm({
                                    startDate: "",
                                    endDate: "",
                                    days: "1",
                                    notes: ""
                                  });
                                  handleOpenDialog("vacation", e.id);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Tomar Día
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PERMISOS SIN GOCE ── */}
          <TabsContent value="permisos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Permisos sin Goce de Salario</CardTitle>
                <CardDescription>Deducciones proporcionales en el Salario Bruto</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Puesto</TableHead>
                        <TableHead className="text-center">Total Permisos</TableHead>
                        <TableHead className="text-center">Días Totales</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const leaves = e.unpaidLeaves || [];
                        const totalDays = leaves.reduce((s, r) => s + (Number(r.days) || 0), 0);

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {e.position || "—"}
                            </TableCell>
                            <TableCell className="text-center">{leaves.length} eventos</TableCell>
                            <TableCell className="text-center font-bold text-red-600">
                              {totalDays.toFixed(1)}d
                            </TableCell>
                            <TableCell className="text-right space-x-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedEmployeeId(e.id);
                                  setActiveManageType("unpaid");
                                }}
                              >
                                <Settings className="h-3.5 w-3.5 mr-1" />
                                Administrar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItem(null);
                                  setUnpaidForm({
                                    startDate: "",
                                    endDate: "",
                                    days: "1",
                                    reason: ""
                                  });
                                  handleOpenDialog("unpaid", e.id);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Registrar Permiso
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DEDUCCIONES (DESCARGOS) ── */}
          <TabsContent value="deducciones">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Descargos y Deducciones Especiales</CardTitle>
                <CardDescription>Cargos aplicados al neto a pagar</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead className="text-right">Deducciones Aplicadas</TableHead>
                        <TableHead className="text-right font-bold text-amber-600">
                          Pendiente de Cobro
                        </TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const deductions = e.deductions || [];
                        const pending = deductions
                          .filter((d) => d.status === "pending")
                          .reduce((s, d) => s + d.amount, 0);
                        const applied = deductions
                          .filter((d) => d.status === "deducted")
                          .reduce((s, d) => s + d.amount, 0);

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCRC(applied)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-amber-600">
                              {formatCRC(pending)}
                            </TableCell>
                            <TableCell className="text-right space-x-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedEmployeeId(e.id);
                                  setActiveManageType("deduction");
                                }}
                              >
                                <Settings className="h-3.5 w-3.5 mr-1" />
                                Administrar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItem(null);
                                  setDeductionForm({
                                    amount: "",
                                    description: "",
                                    date: new Date().toISOString().split("T")[0]
                                  });
                                  handleOpenDialog("deduction", e.id);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Añadir Descargo
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SWAG BRANDING ── */}
          <TabsContent value="swag">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Swag e Indumentaria Corporativa</CardTitle>
                <CardDescription>Cobro por branding y uniformes asignados</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Artículos Asignados</TableHead>
                        <TableHead className="text-right font-bold text-emerald-600">
                          Valor Swag Entregado
                        </TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const swagItems = e.swag || [];
                        const totalSwagCost = swagItems.reduce((s, r) => s + r.cost, 0);

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {swagItems.map((s) => `${s.item} (${formatCRC(s.cost)})`).join(", ") || "Ninguno"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">
                              {formatCRC(totalSwagCost)}
                            </TableCell>
                            <TableCell className="text-right space-x-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedEmployeeId(e.id);
                                  setActiveManageType("swag");
                                }}
                              >
                                <Settings className="h-3.5 w-3.5 mr-1" />
                                Administrar
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingItem(null);
                                  setSwagForm({
                                    item: swagCatalog[0] || "Camisa Corporativa",
                                    cost: "",
                                    date: new Date().toISOString().split("T")[0]
                                  });
                                  handleOpenDialog("swag", e.id);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Asignar Swag
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CARGAS SOCIALES & IMPUESTOS ── */}
          <TabsContent value="renta">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Simulación de Retenciones e Impuestos (Costa Rica)</CardTitle>
                <CardDescription>Desglose mensual proyectado del salario</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead className="text-right">Base Bruta</TableHead>
                        <TableHead className="text-right text-orange-600">CCSS Obrero (10.83%)</TableHead>
                        <TableHead className="text-right text-red-600">Renta</TableHead>
                        <TableHead className="text-right text-red-600">Seguro Privado</TableHead>
                        <TableHead className="text-right font-bold text-emerald-600">Neto Estimado</TableHead>
                        <TableHead className="text-right text-amber-600">Patronal CCSS (26.83%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const gross = toMonthly(e.baseSalary, e.salaryFrequency || "monthly");
                        const ccssObrero = gross * 0.1083;
                        const ccssPatronal = gross * 0.2683;
                        const renta = calcRentaCR(gross, !!e.spouseDependent, e.childrenCount || 0);
                        const privIns = e.privateInsuranceCost || 0;
                        const net = gross - ccssObrero - renta - privIns;

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                              <div className="text-xs text-muted-foreground">
                                Hijos: {e.childrenCount || 0} · Cónyuge: {e.spouseDependent ? "Sí" : "No"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatCRC(gross)}</TableCell>
                            <TableCell className="text-right text-orange-600">-{formatCRC(ccssObrero)}</TableCell>
                            <TableCell className="text-right text-red-600">-{formatCRC(renta)}</TableCell>
                            <TableCell className="text-right text-red-600">-{formatCRC(privIns)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">{formatCRC(net)}</TableCell>
                            <TableCell className="text-right text-amber-600">{formatCRC(ccssPatronal)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── AGUINALDO Y CESANTÍA ── */}
          <TabsContent value="provisión">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pasivos Laborales Proyectados</CardTitle>
                <CardDescription>Cálculos provisionales acumulados para liquidaciones</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingEmps ? (
                  <SkeletonPayrollTable rows={5} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empleado</TableHead>
                        <TableHead>Antigüedad</TableHead>
                        <TableHead className="text-right">Salario Mensual</TableHead>
                        <TableHead className="text-right font-bold text-indigo-600">
                          Aguinaldo Acumulado
                        </TableHead>
                        <TableHead className="text-center">Días Cesantía</TableHead>
                        <TableHead className="text-right font-bold text-rose-600">
                          Cesantía Proyectada
                        </TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((e) => {
                        const years = yearsFrom(e.hireDate);
                        const gross = toMonthly(e.baseSalary, e.salaryFrequency || "monthly");
                        
                        // Aguinaldo: 1/12 de los salarios ganados en el período noviembre-octubre (simulado con antigüedad)
                        const startOfYear = new Date(`${selectedYear}-01-01`).getTime();
                        const hireTs = new Date(e.hireDate).getTime();
                        const monthsWorked = Math.max(
                          0,
                          ((Date.now() - Math.max(hireTs, startOfYear)) / (1000 * 60 * 60 * 24 * 30.44))
                        );
                        const aguinaldo = (gross * Math.min(monthsWorked, 12)) / 12;

                        // Cesantía Art 29
                        const cesantíaDays = calcCesantiasDays(years);
                        const dailySalary = gross / 30;
                        const cesantiaAmount = dailySalary * cesantíaDays;

                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">
                              {e.firstName} {e.lastName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {years.toFixed(1)} {years === 1 ? "año" : "años"}
                            </TableCell>
                            <TableCell className="text-right">{formatCRC(gross)}</TableCell>
                            <TableCell className="text-right font-semibold text-indigo-600">
                              {formatCRC(aguinaldo)}
                            </TableCell>
                            <TableCell className="text-center">{cesantíaDays.toFixed(1)}d</TableCell>
                            <TableCell className="text-right font-semibold text-rose-600">
                              {formatCRC(cesantiaAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => {
                                  setSelectedCalculationToPrint({
                                    employee: e,
                                    gross,
                                    years,
                                    monthsWorked,
                                    aguinaldo,
                                    cesantíaDays,
                                    cesantiaAmount,
                                  });
                                }}
                                title="Imprimir Detalle de Pasivos"
                              >
                                <Printer className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── GENERADOR DE DOCUMENTOS ── */}
          <TabsContent value="documentos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Generador de Documentos Oficiales</CardTitle>
                <CardDescription>Cree constancias salariales y cartas de recomendación en segundos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Seleccionar Colaborador</Label>
                      <Select
                        value={docConfig.employeeId}
                        onValueChange={(v) => setDocConfig((d) => ({ ...d, employeeId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("selectEmployee")} />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.firstName} {e.lastName} ({e.idNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Tipo de Documento</Label>
                      <Select
                        value={docConfig.type}
                        onValueChange={(v: any) => setDocConfig((d) => ({ ...d, type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="constancia">Constancia Salarial</SelectItem>
                          <SelectItem value="recomendacion">Carta de Recomendación</SelectItem>
                          <SelectItem value="despido_con">Despido con Responsabilidad Patronal</SelectItem>
                          <SelectItem value="despido_sin">Despido sin Responsabilidad Patronal</SelectItem>
                          <SelectItem value="cese">Carta de Cese (Mutuo Acuerdo)</SelectItem>
                          <SelectItem value="servicios_profesionales">Transición a Servicios Profesionales</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Nombre Firmante</Label>
                        <Input
                          placeholder="Firma autorizada"
                          value={docConfig.signerName}
                          onChange={(e) => setDocConfig((d) => ({ ...d, signerName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Puesto Firmante</Label>
                        <Input
                          placeholder="Puesto del firmante"
                          value={docConfig.signerPosition}
                          onChange={(e) => setDocConfig((d) => ({ ...d, signerPosition: e.target.value }))}
                        />
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      disabled={!docConfig.employeeId || !docConfig.signerName}
                      onClick={() => setPreviewDoc(true)}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {t("generateLetter")}
                    </Button>
                  </div>

                  {/* Document Preview Card */}
                  <div className="border rounded-lg p-6 bg-muted/20 min-h-64 flex flex-col justify-between shadow-inner">
                    {previewDoc && selectedDocEmployee ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                          <span className="text-sm font-semibold uppercase text-primary">Vista Previa (Letter US)</span>
                          <Button size="sm" onClick={() => window.print()}>
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            {t("print")}
                          </Button>
                        </div>
                        <div 
                          className="bg-white text-black p-12 rounded border text-sm shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto"
                          style={{ 
                            minHeight: '11in', 
                            boxSizing: 'border-box',
                            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                          }}
                        >
                          {/* Executive Document Header */}
                          <div className="flex justify-between items-center mb-8 border-b pb-4">
                            <img src="/logo.png" className="h-12 w-auto object-contain" alt="SmartLogistics" />
                            <div className="text-right text-xs text-muted-foreground font-sans leading-normal">
                              <span className="font-bold text-foreground">SmartLogistics Costa Rica</span><br />
                              <span>Cédula Jurídica: 3-101-4480994</span><br />
                              <span>Email: rrhh@smartlogistics.cr</span>
                            </div>
                          </div>
                          
                          <div className="text-right text-xs mb-8">
                            San José, Costa Rica, a {new Date().toLocaleDateString("es-CR", { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>

                          {(() => {
                            const employeeName = `${selectedDocEmployee.firstName} ${selectedDocEmployee.lastName}`;
                            const idNumber = selectedDocEmployee.idNumber || "—";
                            const position = selectedDocEmployee.position || "Colaborador";
                            const hireDateStr = safeFormatEmployeeDate(selectedDocEmployee.hireDate);
                            const salaryStr = formatCRC(toMonthly(selectedDocEmployee.baseSalary, selectedDocEmployee.salaryFrequency));
                            const department = selectedDocEmployee.departmentName || "Administración";
                            const currentDateStr = new Date().toLocaleDateString("es-CR", { day: 'numeric', month: 'long', year: 'numeric' });

                            switch (docConfig.type) {
                              case "constancia":
                                return (
                                  <>
                                    <div className="font-bold mb-6">A QUIEN INTERESE:</div>
                                    <p className="mb-6 indent-8">
                                      Por medio de la presente se hace constar formalmente que el señor(a){" "}
                                      <strong>{employeeName}</strong>, con cédula de identidad número <strong>{idNumber}</strong>,
                                      labora para nuestra empresa de forma continua desde el <strong>{hireDateStr}</strong>,
                                      desempeñándose actualmente en el cargo de <strong>{position}</strong>.
                                    </p>
                                    <p className="mb-6">
                                      Actualmente percibe un salario mensual bruto de <strong>{salaryStr}</strong> bajo la modalidad de contrato por tiempo indeterminado.
                                    </p>
                                    <p className="mb-8">
                                      Se extiende la presente solicitud del interesado para los fines que estime convenientes.
                                    </p>
                                  </>
                                );
                              case "recomendacion":
                                return (
                                  <>
                                    <div className="font-bold mb-6">A QUIEN INTERESE:</div>
                                    <p className="mb-6 indent-8">
                                      Por medio de esta misiva, me complace recomendar de forma amplia y detallada al señor(a){" "}
                                      <strong>{employeeName}</strong>, con cédula de identidad número <strong>{idNumber}</strong>,
                                      quien prestó sus servicios en nuestra institución desde el <strong>{hireDateStr}</strong>. Durante
                                      su trayectoria laboral, demostró un excelente desempeño, gran capacidad de trabajo en
                                      equipo, puntualidad e iniciativa propia en sus labores.
                                    </p>
                                    <p className="mb-8">
                                      Se extiende la presente a solicitud del interesado para los fines que estime convenientes.
                                    </p>
                                  </>
                                );
                              case "despido_con":
                                return (
                                  <>
                                    <div className="font-bold mb-6">COMUNICACIÓN DE DESPIDO CON RESPONSABILIDAD PATRONAL</div>
                                    <p className="mb-4">
                                      Estimado(a) <strong>{employeeName}</strong>,
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Por medio de la presente, la empresa SmartLogistics Costa Rica le comunica formalmente la decisión de rescindir su contrato de trabajo por tiempo indeterminado a partir del <strong>{currentDateStr}</strong>, bajo la modalidad de <strong>despido con responsabilidad patronal</strong>, de conformidad con lo establecido en el artículo 85 del Código de Trabajo de Costa Rica.
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Queremos expresarle nuestro más sincero agradecimiento por los valiosos servicios prestados a la organización durante su tiempo de labores desempeñándose en el cargo de <strong>{position}</strong> desde su fecha de ingreso el <strong>{hireDateStr}</strong>.
                                    </p>
                                    <p className="mb-6 text-justify indent-8">
                                      La empresa procederá a realizar la liquidación de sus derechos laborales de ley (preaviso, auxilio de cesantía, vacaciones y aguinaldo proporcionales acumulados) dentro de los plazos que dicta la legislación nacional. Le solicitamos realizar la entrega formal de todas las herramientas de trabajo y activos propiedad de la empresa asignados para sus funciones.
                                    </p>
                                  </>
                                );
                              case "despido_sin":
                                return (
                                  <>
                                    <div className="font-bold mb-6">COMUNICACIÓN DE DESPIDO SIN RESPONSABILIDAD PATRONAL</div>
                                    <p className="mb-4">
                                      Estimado(a) <strong>{employeeName}</strong>,
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Por medio de la presente, la empresa SmartLogistics Costa Rica le comunica formalmente la decisión de dar por finalizado su contrato de trabajo por tiempo indeterminado a partir del <strong>{currentDateStr}</strong>, bajo la modalidad de <strong>despido sin responsabilidad patronal</strong>, según lo estipulado en el artículo 81 del Código de Trabajo de Costa Rica.
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Esta medida se fundamenta en las causales y faltas cometidas en el desempeño de sus labores en el puesto de <strong>{position}</strong>, las cuales constan de forma detallada y documentada en su expediente laboral.
                                    </p>
                                    <p className="mb-6 text-justify indent-8">
                                      En virtud de lo anterior, la empresa procederá exclusivamente al pago de sus derechos laborales irrenunciables de ley (vacaciones y aguinaldos proporcionales acumulados a la fecha de hoy), liberando a la empresa de cualquier otra responsabilidad indemnizatoria por este cese.
                                    </p>
                                  </>
                                );
                              case "cese":
                                return (
                                  <>
                                    <div className="font-bold mb-6">CARTA DE CESE Y RESCISIÓN POR MUTUO ACUERDO</div>
                                    <p className="mb-4">
                                      Estimado(a) <strong>{employeeName}</strong>,
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Por medio de esta acta de cese laboral, se formaliza de común acuerdo la finalización del vínculo de empleo que unía a la empresa SmartLogistics Costa Rica con el señor(a) <strong>{employeeName}</strong>, portador de la cédula de identidad número <strong>{idNumber}</strong>, quien se desempeñó en el cargo de <strong>{position}</strong>.
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Ambas partes convenimos de forma libre y espontánea dar por terminado el contrato laboral que nos vinculaba a partir del <strong>{currentDateStr}</strong>, manifestando conformidad absoluta sobre los términos comerciales y de liquidación pactados.
                                    </p>
                                    <p className="mb-6 text-justify indent-8">
                                      El colaborador declara haber recibido a su entera satisfacción todos sus extremos legales y salarios ordinarios devengados, y que a la fecha no existe reclamo ni saldo pendiente de cobro frente a la empresa por ningún concepto de naturaleza laboral.
                                    </p>
                                  </>
                                );
                              case "servicios_profesionales":
                                return (
                                  <>
                                    <div className="font-bold mb-6">ACUERDO DE TRANSICIÓN A SERVICIOS PROFESIONALES</div>
                                    <p className="mb-4">
                                      Estimado(a) <strong>{employeeName}</strong>,
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Por medio de la presente, se hace constar formalmente la finalización del contrato de trabajo por cuenta ajena y la consecuente transición de la relación entre usted y SmartLogistics Costa Rica hacia un régimen de <strong>contratación por servicios profesionales</strong>, efectivo a partir del <strong>{currentDateStr}</strong>.
                                    </p>
                                    <p className="mb-4 text-justify indent-8">
                                      Bajo esta modalidad, usted prestará servicios de consultoría técnica y asesoramiento especializado en el área de <strong>{department}</strong> como contratista independiente, regulado por la normativa civil y mercantil aplicable en la República de Costa Rica.
                                    </p>
                                    <p className="mb-6 text-justify indent-8">
                                      Con esta transición, queda extinguida y liquidada de común acuerdo toda relación laboral obrero-patronal previa. Se establece que la relación subsistente no conllevará subordinación jurídica ni cumplimiento de horario laboral regular bajo planilla, rigiéndose exclusivamente por lo pactado en el contrato de prestación de servicios profesionales.
                                    </p>
                                  </>
                                );
                              default:
                                return null;
                            }
                          })()}

                          <div className="mt-16">
                            <p className="mb-16 font-bold">Atentamente,</p>
                            
                            {["despido_con", "despido_sin", "cese", "servicios_profesionales"].includes(docConfig.type) ? (
                              <div className="grid grid-cols-2 gap-12 pt-8">
                                <div className="border-t border-black pt-2 font-sans">
                                  <p className="font-bold text-foreground">Firma del Colaborador (Recibido)</p>
                                  <p className="text-xs text-muted-foreground">Nombre: {selectedDocEmployee?.firstName} {selectedDocEmployee?.lastName}</p>
                                  <p className="text-xs text-muted-foreground">Cédula: {selectedDocEmployee?.idNumber || "—"}</p>
                                  <p className="text-xs text-muted-foreground">Fecha: ____ / ____ / ________</p>
                                </div>
                                <div className="border-t border-black pt-2 font-sans">
                                  <p className="font-bold text-foreground">{docConfig.signerName}</p>
                                  <p className="text-xs text-muted-foreground">{docConfig.signerPosition}</p>
                                  <p className="text-xs text-muted-foreground">Representante de SmartLogistics S.A.</p>
                                </div>
                              </div>
                            ) : (
                              <div className="border-t border-black w-60 pt-1 font-sans">
                                <p className="font-bold">{docConfig.signerName}</p>
                                <p className="text-xs">{docConfig.signerPosition}</p>
                                <p className="text-xs text-muted-foreground">SmartLogistics S.A.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16 gap-2">
                        <FileText className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Complete el formulario para ver la carta membretada</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTORIAL DE PLANILLAS ── */}
          <TabsContent value="historial" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground font-bold">Historial de Planillas Ejecutadas</CardTitle>
                <CardDescription>Consulte, descargue y administre el histórico de nóminas ejecutadas</CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingRuns ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : runs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground border-t">
                    No se han registrado ejecuciones de planilla todavía.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead>Frecuencia</TableHead>
                        <TableHead className="text-center">Colaboradores</TableHead>
                        <TableHead className="text-right font-semibold">Monto Neto Total</TableHead>
                        <TableHead className="hidden sm:table-cell">Fecha de Ejecución</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-bold text-foreground">{run.period}</TableCell>
                          <TableCell className="capitalize text-xs text-muted-foreground">
                            {run.frequency === "monthly" ? "Mensual" : run.frequency === "biweekly" ? "Quincenal" : "Semanal"}
                          </TableCell>
                          <TableCell className="text-center text-sm">{run.employeeCount}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatCRC(run.totalNet || 0)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {new Date(run.runDate).toLocaleDateString("es-CR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-[11px] px-2 gap-1 text-foreground"
                                onClick={() => setActiveRunDetailId(run.id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Detalle
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-[11px] px-2 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleExportBACForRun(run)}
                              >
                                <Download className="h-3.5 w-3.5" />
                                BAC Excel
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-[11px] px-2 gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                onClick={() => handleSendEmailsForRun(run)}
                                disabled={sendingEmailsRunId === run.id}
                              >
                                {sendingEmailsRunId === run.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5" />
                                )}
                                Enviar Colillas
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setRunToDelete(run)}
                                disabled={deleteRunMutation.isPending}
                              >
                                {deleteRunMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Run Detail Modal */}
            {(() => {
              const activeRun = runs.find((r) => r.id === activeRunDetailId);
              if (!activeRun) return null;
              return (
                <Dialog open={activeRunDetailId !== null} onOpenChange={(open) => !open && setActiveRunDetailId(null)}>
                  <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto font-sans">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold text-foreground">
                        Detalle de Planilla Ejecutada: {activeRun.period}
                      </DialogTitle>
                      <DialogDescription>
                        Frecuencia: <span className="capitalize">{activeRun.frequency}</span> · Colaboradores: {activeRun.employeeCount}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { label: "Total Salario Bruto", value: activeRun.totalGross || 0, color: "text-foreground" },
                          { label: "Total Retención CCSS", value: activeRun.totalCCSS || 0, color: "text-orange-600" },
                          { label: "Total Impuesto Renta", value: activeRun.totalRenta || 0, color: "text-rose-600" },
                          { label: "Total Salario Neto", value: activeRun.totalNet || 0, color: "text-emerald-600" },
                        ].map((item) => (
                          <div key={item.label} className="p-3 border rounded-lg bg-muted/20">
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase block">{item.label}</span>
                            <span className={cn("text-base font-bold mt-0.5 block", item.color)}>
                              {formatCRC(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="border rounded-lg overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead>Empleado</TableHead>
                              <TableHead className="text-right">Salario Bruto</TableHead>
                              <TableHead className="text-right text-orange-600 font-semibold">CCSS Obrero (10.83%)</TableHead>
                              <TableHead className="text-right text-rose-600 font-semibold">Imp. Renta</TableHead>
                              <TableHead className="text-right text-rose-600 font-semibold">Seguro Priv.</TableHead>
                              <TableHead className="text-right text-rose-600 font-semibold">Deducciones/Swag</TableHead>
                              <TableHead className="text-right font-bold text-emerald-600">Salario Neto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(activeRun.lines || []).map((line: any) => (
                              <TableRow key={line.employeeId}>
                                <TableCell className="font-medium text-foreground">
                                  {line.employeeName}
                                  {line.unpaidLeaveDays > 0 && (
                                    <div className="text-[10px] text-destructive">
                                      Dcto. Suspensión: -{formatCRC(line.unpaidLeaveDiscount)} ({line.unpaidLeaveDays} días)
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-sm">{formatCRC(line.grossSalary)}</TableCell>
                                <TableCell className="text-right text-sm text-orange-600">-{formatCRC(line.ccss)}</TableCell>
                                <TableCell className="text-right text-sm text-rose-600">-{formatCRC(line.renta)}</TableCell>
                                <TableCell className="text-right text-sm text-rose-600">
                                  {line.privateInsuranceCost > 0 ? `-${formatCRC(line.privateInsuranceCost)}` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-sm text-rose-600">
                                  {line.descargosDeducted + line.swagDeducted > 0
                                    ? `-${formatCRC(line.descargosDeducted + line.swagDeducted)}`
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold text-emerald-600">
                                  {formatCRC(line.netSalary)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" onClick={() => setActiveRunDetailId(null)} className="text-foreground">
                        Cerrar Detalle
                      </Button>
                      <Button
                        onClick={() => handleExportBACForRun(activeRun)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        <Download className="h-4 w-4 mr-1.5" />
                        Exportar Excel BAC
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            })()}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* ── MODALS ── */}
      <Dialog open={dialogType !== null} onOpenChange={(open) => {
        if (!open) {
          setDialogType(null);
          setEditingItem(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          {dialogType === "vacation" && (
            <>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Editar Registro de Vacaciones" : "Registrar Vacaciones Tomadas"}</DialogTitle>
                <DialogDescription>{editingItem ? "Modifique los detalles del registro de vacaciones seleccionado." : "Deducir días del saldo de vacaciones acumuladas del colaborador"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("startDate")}</Label>
                    <Popover open={vacationStartOpen} onOpenChange={setVacationStartOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={cn(
                            "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                            !vacationForm.startDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {vacationForm.startDate
                              ? format(new Date(vacationForm.startDate + "T12:00:00"), "PPP", {
                                  locale: es,
                                })
                              : "Seleccionar fecha"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="z-[100] w-auto p-0" 
                        align="start"
                        style={{ pointerEvents: "auto" }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <CalendarComponent
                          mode="single"
                          selected={vacationForm.startDate ? new Date(vacationForm.startDate + "T12:00:00") : undefined}
                          onSelect={(date) => {
                            if (!date) return;
                            const dateStr = format(date, "yyyy-MM-dd");
                            setVacationForm((f) => ({
                              ...f,
                              startDate: dateStr,
                              endDate: dateStr,
                            }));
                            setVacationStartOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("endDate")}</Label>
                    <Popover open={vacationEndOpen} onOpenChange={setVacationEndOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={cn(
                            "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                            !vacationForm.endDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {vacationForm.endDate
                              ? format(new Date(vacationForm.endDate + "T12:00:00"), "PPP", {
                                  locale: es,
                                })
                              : "Seleccionar fecha"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="z-[100] w-auto p-0" 
                        align="start"
                        style={{ pointerEvents: "auto" }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <CalendarComponent
                          mode="single"
                          selected={vacationForm.endDate ? new Date(vacationForm.endDate + "T12:00:00") : (vacationForm.startDate ? new Date(vacationForm.startDate + "T12:00:00") : undefined)}
                          defaultMonth={vacationForm.endDate ? new Date(vacationForm.endDate + "T12:00:00") : (vacationForm.startDate ? new Date(vacationForm.startDate + "T12:00:00") : undefined)}
                          onSelect={(date) => {
                            if (!date) return;
                            setVacationForm((f) => ({
                              ...f,
                              endDate: format(date, "yyyy-MM-dd"),
                            }));
                            setVacationEndOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 rounded-lg p-2.5 text-xs leading-tight">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Selección automática de fecha final</span>
                    La fecha final se ajusta automáticamente al mismo día de inicio. Si el período comprende más de 1 día, por favor verifica y ajusta la fecha final.
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Cantidad de Días</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={vacationForm.days}
                    onChange={(e) => setVacationForm((f) => ({ ...f, days: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 py-1 select-none">
                  <Checkbox
                    id="vacation-saturdays"
                    checked={vacationIncludeSaturdays}
                    onCheckedChange={(checked) => setVacationIncludeSaturdays(!!checked)}
                  />
                  <Label htmlFor="vacation-saturdays" className="text-sm font-medium cursor-pointer">
                    Considerar sábados en el cálculo
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("notes")}</Label>
                  <Textarea
                    placeholder="Concepto o notas de las vacaciones..."
                    value={vacationForm.notes}
                    onChange={(e) => setVacationForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogType(null)}>{t("common.cancel")}</Button>
                <Button onClick={handleAddVacation}>{editingItem ? "Actualizar Registro" : "Guardar Registro"}</Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "unpaid" && (
            <>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Editar Permiso sin Goce" : "Registrar Permiso sin Goce"}</DialogTitle>
                <DialogDescription>{editingItem ? "Modifique los detalles del permiso sin goce de salario." : "Se rebajará del salario bruto proporcional de la planilla"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("startDate")}</Label>
                    <Popover open={unpaidStartOpen} onOpenChange={setUnpaidStartOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={cn(
                            "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                            !unpaidForm.startDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {unpaidForm.startDate
                              ? format(new Date(unpaidForm.startDate + "T12:00:00"), "PPP", {
                                  locale: es,
                                })
                              : "Seleccionar fecha"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="z-[100] w-auto p-0" 
                        align="start"
                        style={{ pointerEvents: "auto" }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <CalendarComponent
                          mode="single"
                          selected={unpaidForm.startDate ? new Date(unpaidForm.startDate + "T12:00:00") : undefined}
                          onSelect={(date) => {
                            if (!date) return;
                            const dateStr = format(date, "yyyy-MM-dd");
                            setUnpaidForm((f) => ({
                              ...f,
                              startDate: dateStr,
                              endDate: dateStr,
                            }));
                            setUnpaidStartOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("endDate")}</Label>
                    <Popover open={unpaidEndOpen} onOpenChange={setUnpaidEndOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className={cn(
                            "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                            !unpaidForm.endDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {unpaidForm.endDate
                              ? format(new Date(unpaidForm.endDate + "T12:00:00"), "PPP", {
                                  locale: es,
                                })
                              : "Seleccionar fecha"}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="z-[100] w-auto p-0" 
                        align="start"
                        style={{ pointerEvents: "auto" }}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => e.preventDefault()}
                      >
                        <CalendarComponent
                          mode="single"
                          selected={unpaidForm.endDate ? new Date(unpaidForm.endDate + "T12:00:00") : (unpaidForm.startDate ? new Date(unpaidForm.startDate + "T12:00:00") : undefined)}
                          defaultMonth={unpaidForm.endDate ? new Date(unpaidForm.endDate + "T12:00:00") : (unpaidForm.startDate ? new Date(unpaidForm.startDate + "T12:00:00") : undefined)}
                          onSelect={(date) => {
                            if (!date) return;
                            setUnpaidForm((f) => ({
                              ...f,
                              endDate: format(date, "yyyy-MM-dd"),
                            }));
                            setUnpaidEndOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 rounded-lg p-2.5 text-xs leading-tight">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">Selección automática de fecha final</span>
                    La fecha final se ajusta automáticamente al mismo día de inicio. Si la suspensión comprende más de 1 día, por favor verifica y ajusta la fecha final.
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Días de Suspensión</Label>
                  <Input
                    type="number"
                    min="1"
                    value={unpaidForm.days}
                    onChange={(e) => setUnpaidForm((f) => ({ ...f, days: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 py-1 select-none">
                  <Checkbox
                    id="unpaid-saturdays"
                    checked={unpaidIncludeSaturdays}
                    onCheckedChange={(checked) => setUnpaidIncludeSaturdays(!!checked)}
                  />
                  <Label htmlFor="unpaid-saturdays" className="text-sm font-medium cursor-pointer">
                    Considerar sábados en el cálculo
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo / Razón</Label>
                  <Textarea
                    placeholder="Escriba la razón de la suspensión..."
                    value={unpaidForm.reason}
                    onChange={(e) => setUnpaidForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogType(null)}>{t("common.cancel")}</Button>
                <Button onClick={handleAddUnpaidLeave}>{editingItem ? "Actualizar Permiso" : "Guardar Permiso"}</Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "deduction" && (
            <>
              <DialogHeader>
                <DialogTitle>{editingItem ? "Editar Descargo Especial" : t("addDeduction")}</DialogTitle>
                <DialogDescription>{editingItem ? "Modifique los detalles del descargo/cobro seleccionado." : t("addDeductionDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>{t("deductionAmount")}</Label>
                  <Input
                    type="number"
                    placeholder="Monto en colones"
                    value={deductionForm.amount}
                    onChange={(e) => setDeductionForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("deductionDescription")}</Label>
                  <Input
                    placeholder="Ej. Compra de celular corporativo, viáticos extras..."
                    value={deductionForm.description}
                    onChange={(e) => setDeductionForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha del Cargo</Label>
                  <Popover open={deductionDateOpen} onOpenChange={setDeductionDateOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        type="button"
                        className={cn(
                          "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                          !deductionForm.date && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {deductionForm.date
                            ? format(new Date(deductionForm.date + "T12:00:00"), "PPP", {
                                locale: es,
                              })
                            : "Seleccionar fecha"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="z-[100] w-auto p-0"
                      align="start"
                      style={{ pointerEvents: "auto" }}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      onPointerDownOutside={(e) => e.preventDefault()}
                    >
                      <CalendarComponent
                        mode="single"
                        selected={deductionForm.date ? new Date(deductionForm.date + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          if (!date) return;
                          setDeductionForm((f) => ({
                            ...f,
                            date: format(date, "yyyy-MM-dd"),
                          }));
                          setDeductionDateOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogType(null)}>{t("common.cancel")}</Button>
                <Button onClick={handleAddDeduction}>{editingItem ? "Actualizar Descargo" : "Registrar Descargo"}</Button>
              </DialogFooter>
            </>
          )}

          {dialogType === "swag" && (
            <>
              {isManagingCatalog ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Gestionar Catálogo de Swag</DialogTitle>
                    <DialogDescription>
                      Agregue o elimine tipos de artículos que los empleados pueden recibir.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ej. Gorra de Invierno"
                        value={newCatalogItem}
                        onChange={(e) => setNewCatalogItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddCatalogItem();
                          }
                        }}
                      />
                      <Button onClick={handleAddCatalogItem} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Agregar
                      </Button>
                    </div>
                    <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                      {swagCatalog.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground text-center">
                          No hay artículos en el catálogo.
                        </p>
                      ) : (
                        swagCatalog.map((item) => (
                          <div key={item} className="flex items-center justify-between p-2.5">
                            <span className="text-sm font-medium">{item}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveCatalogItem(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsManagingCatalog(false)}>
                      Volver
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>{editingItem ? "Editar Boleta de Swag" : "Asignar Swag (Multi-Artículo)"}</DialogTitle>
                    <DialogDescription>Añada múltiples artículos a la boleta. Estos se guardarán como una entrega consolidada de activos.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    {/* Add Item form fields */}
                    <div className="border p-3 rounded-lg bg-muted/20 space-y-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Añadir Artículo a la Boleta</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label>{t("swagItem")}</Label>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-[10px] gap-1"
                              onClick={() => setIsManagingCatalog(true)}
                            >
                              <Settings className="h-3 w-3" />
                              Catálogo
                            </Button>
                          </div>
                          <Select
                            value={swagForm.item}
                            onValueChange={(v) => setSwagForm((f) => ({ ...f, item: v }))}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Seleccione un artículo" />
                            </SelectTrigger>
                            <SelectContent>
                              {swagCatalog.map((item) => (
                                <SelectItem key={item} value={item}>
                                  {item}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 font-sans">
                          <Label>{t("swagCost")}</Label>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              placeholder="Costo"
                              className="h-9"
                              value={swagForm.cost}
                              onChange={(e) => setSwagForm((f) => ({ ...f, cost: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              type="button"
                              className="h-9"
                              onClick={() => {
                                const costVal = parseFloat(swagForm.cost);
                                if (swagForm.item && !isNaN(costVal) && costVal > 0) {
                                  setTempSwagItems((prev) => [
                                    ...prev,
                                    { name: swagForm.item, cost: costVal }
                                  ]);
                                  setSwagForm((f) => ({ ...f, cost: "" }));
                                }
                              }}
                              disabled={!swagForm.item || !swagForm.cost}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Table of added items */}
                    {tempSwagItems.length > 0 && (
                      <div className="border rounded-md overflow-hidden max-h-[160px] overflow-y-auto bg-background">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow className="h-8">
                              <TableHead className="text-[10px] h-8 font-semibold">Artículo</TableHead>
                              <TableHead className="text-right text-[10px] h-8 font-semibold">Costo</TableHead>
                              <TableHead className="text-center text-[10px] h-8 font-semibold w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tempSwagItems.map((it, idx) => (
                              <TableRow key={idx} className="h-8">
                                <TableCell className="py-1.5 text-xs font-medium">{it.name}</TableCell>
                                <TableCell className="py-1.5 text-right text-xs font-semibold">{formatCRC(it.cost)}</TableCell>
                                <TableCell className="py-1.5 text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
                                    onClick={() => {
                                      setTempSwagItems((prev) => prev.filter((_, i) => i !== idx));
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="h-8 bg-muted/20 font-bold border-t">
                              <TableCell className="py-1.5 text-xs text-foreground font-bold">Total Boleta</TableCell>
                              <TableCell className="py-1.5 text-right text-xs text-foreground font-extrabold" colSpan={2}>
                                {formatCRC(tempSwagItems.reduce((s, it) => s + it.cost, 0))}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label>Fecha de Entrega</Label>
                      <Popover open={swagDateOpen} onOpenChange={setSwagDateOpen} modal={true}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            type="button"
                            className={cn(
                              "w-full justify-start text-left font-normal h-10 border-input bg-background text-sm text-foreground",
                              !swagForm.date && "text-muted-foreground"
                            )}
                          >
                            <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">
                              {swagForm.date
                                ? format(new Date(swagForm.date + "T12:00:00"), "PPP", {
                                    locale: es,
                                  })
                                : "Seleccionar fecha"}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="z-[100] w-auto p-0"
                          align="start"
                          style={{ pointerEvents: "auto" }}
                          onCloseAutoFocus={(e) => e.preventDefault()}
                          onPointerDownOutside={(e) => e.preventDefault()}
                        >
                          <CalendarComponent
                            mode="single"
                            selected={swagForm.date ? new Date(swagForm.date + "T12:00:00") : undefined}
                            onSelect={(date) => {
                              if (!date) return;
                              setSwagForm((f) => ({
                                ...f,
                                date: format(date, "yyyy-MM-dd"),
                              }));
                              setSwagDateOpen(false);
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogType(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button 
                      onClick={handleAddSwag} 
                      disabled={tempSwagItems.length === 0 && (!swagForm.item || !swagForm.cost)}
                    >
                      {editingItem ? "Actualizar Asignación" : "Asignar Swag"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete/Rollback Payroll Run Confirmation Dialog */}
      <AlertDialog open={runToDelete !== null} onOpenChange={(open) => !open && setRunToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro de que desea eliminar la planilla?</AlertDialogTitle>
            <AlertDialogDescription>
              {runToDelete && `¿Está seguro de que desea eliminar y revertir la planilla del período "${runToDelete.period}"? Esto devolverá los cobros aplicados a saldos pendientes y esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (runToDelete) {
                  deleteRunMutation.mutate(runToDelete);
                  setRunToDelete(null);
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Logs (Vacation/Unpaid/Deduction/Swag) Dialog */}
      <Dialog open={activeManageType !== null} onOpenChange={(open) => {
        if (!open) {
          setActiveManageType(null);
          setEditingItem(null);
        }
      }}>
        <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[85vh] overflow-y-auto z-[80]" style={{ pointerEvents: "auto" }}>
          {activeManageType === "vacation" && (() => {
            const emp = employees.find(e => e.id === selectedEmployeeId);
            const { accrued, taken, balance, timeFormatted } = emp ? calcEmployeeVacations(emp) : { accrued: 0, taken: 0, balance: 0, timeFormatted: "" };
            const rawList = emp?.vacationsTaken || [];
            let list = [...rawList];

            if (manageSearch.trim()) {
              const q = manageSearch.toLowerCase();
              list = list.filter((item: any) =>
                (item.startDate && item.startDate.toLowerCase().includes(q)) ||
                (item.endDate && item.endDate.toLowerCase().includes(q)) ||
                (item.notes && item.notes.toLowerCase().includes(q)) ||
                (item.days && item.days.toString().includes(q))
              );
            }

            list.sort((a: any, b: any) => {
              let valA: any = a.startDate || "";
              let valB: any = b.startDate || "";
              if (manageSortKey === "endDate") {
                valA = a.endDate || "";
                valB = b.endDate || "";
              } else if (manageSortKey === "days") {
                valA = Number(a.days) || 0;
                valB = Number(b.days) || 0;
              } else if (manageSortKey === "notes") {
                valA = (a.notes || "").toLowerCase();
                valB = (b.notes || "").toLowerCase();
              }
              if (valA < valB) return manageSortOrder === "asc" ? -1 : 1;
              if (valA > valB) return manageSortOrder === "asc" ? 1 : -1;
              return 0;
            });

            const groupedMap = new Map<string, any[]>();
            list.forEach((item: any) => {
              const d = item.startDate || "";
              const y = d ? d.split("-")[0] : "Sin Año";
              if (!groupedMap.has(y)) groupedMap.set(y, []);
              groupedMap.get(y)!.push(item);
            });
            const groupedList = Array.from(groupedMap.entries()).map(([year, items]) => ({ year, items }));

            return (
              <>
                <DialogHeader className="space-y-2">
                  <DialogTitle>Administrar Vacaciones - {emp ? `${emp.firstName} ${emp.lastName}` : ""}</DialogTitle>
                  <DialogDescription>
                    Lista de días de vacaciones tomados por el colaborador.
                  </DialogDescription>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs bg-muted/40 p-2.5 px-3 rounded-lg border border-border/80 text-muted-foreground shadow-xs mt-2">
                    <div>
                      <span className="font-semibold text-foreground">Tiempo Laborado:</span> <span className="font-medium text-foreground">{timeFormatted}</span>
                    </div>
                    <div className="h-3.5 w-px bg-border/80 hidden sm:block" />
                    <div>
                      <span className="font-semibold text-foreground">Devengados:</span> <span className="font-bold text-foreground">{accrued}d</span>
                    </div>
                    <div className="h-3.5 w-px bg-border/80 hidden sm:block" />
                    <div>
                      <span className="font-semibold text-foreground">Tomados:</span> <span className="font-bold text-red-600 dark:text-red-400">{taken}d</span>
                    </div>
                    <div className="h-3.5 w-px bg-border/80 hidden sm:block" />
                    <div>
                      <span className="font-semibold text-foreground">Disponible:</span>{" "}
                      <span className={`font-extrabold ${balance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {balance}d
                      </span>
                    </div>
                  </div>
                </DialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar por fecha o notas..."
                        value={manageSearch}
                        onChange={(e) => setManageSearch(e.target.value)}
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground font-medium self-end sm:self-center">
                      {manageSortOrder === "asc" ? "Ordenado de más viejo a más nuevo" : "Ordenado de más nuevo a más viejo"} ({list.length} {list.length === 1 ? "registro" : "registros"})
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No hay registros de vacaciones {manageSearch ? "que coincidan con la búsqueda" : "tomadas"}.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 border-b">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("date")}>
                                  Inicio
                                  {manageSortKey === "date" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("endDate")}>
                                  Fin
                                  {manageSortKey === "endDate" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[90px] text-center">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("days")}>
                                  Días
                                  {manageSortKey === "days" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-auto">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("notes")}>
                                  Notas
                                  {manageSortKey === "notes" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[125px] text-right pr-4">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                        </Table>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table className="table-fixed w-full">
                          <TableBody>
                            {groupedList.map((group) => {
                              const groupTotalDays = group.items.reduce((sum: number, r: any) => sum + (Number(r.days) || 0), 0);
                              return (
                                <Fragment key={group.year}>
                                  <TableRow className="bg-muted/70 hover:bg-muted/70 font-semibold text-xs border-y">
                                    <TableCell colSpan={5} className="py-2 text-primary font-bold">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <Calendar className="h-3.5 w-3.5 text-primary" />
                                          Año {group.year} ({group.items.length} {group.items.length === 1 ? "registro" : "registros"})
                                        </span>
                                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                          Total: {groupTotalDays}d
                                        </span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {group.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="w-[135px] text-sm font-medium">
                                        {item.startDate ? new Date(item.startDate + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-[135px] text-sm">
                                        {item.endDate ? new Date(item.endDate + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-[90px] text-center text-sm font-semibold text-emerald-600">
                                        {item.days}d
                                      </TableCell>
                                      <TableCell className="w-auto text-sm truncate" title={item.notes}>
                                        {item.notes || "—"}
                                      </TableCell>
                                      <TableCell className="w-[125px] text-right space-x-1 pr-4">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          onClick={() => {
                                            if (emp) {
                                              setSelectedVacationToPrint({ employee: emp, vacation: item });
                                            }
                                          }}
                                          title="Imprimir Boleta"
                                        >
                                          <Printer className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0"
                                          onClick={() => {
                                            setEditingItem(item);
                                            setVacationForm({
                                              startDate: item.startDate,
                                              endDate: item.endDate,
                                              days: item.days.toString(),
                                              notes: item.notes || ""
                                            });
                                            setVacationIncludeSaturdays(false);
                                            setDialogType("vacation");
                                          }}
                                          title="Editar vacaciones"
                                        >
                                          <Edit className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          onClick={() => {
                                            setConfirmDeleteTarget({ type: "vacation", empId: selectedEmployeeId, item });
                                          }}
                                          title="Eliminar vacaciones"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setActiveManageType(null)}>Cerrar</Button>
                  <Button onClick={() => {
                    setEditingItem(null);
                    setVacationForm({
                      startDate: "",
                      endDate: "",
                      days: "1",
                      notes: ""
                    });
                    setVacationIncludeSaturdays(false);
                    setDialogType("vacation");
                  }}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Tomar Día
                  </Button>
                </DialogFooter>
              </>
            );
          })()}

          {activeManageType === "unpaid" && (() => {
            const emp = employees.find(e => e.id === selectedEmployeeId);
            const rawList = emp?.unpaidLeaves || [];
            let list = [...rawList];

            if (manageSearch.trim()) {
              const q = manageSearch.toLowerCase();
              list = list.filter((item: any) =>
                (item.startDate && item.startDate.toLowerCase().includes(q)) ||
                (item.endDate && item.endDate.toLowerCase().includes(q)) ||
                (item.reason && item.reason.toLowerCase().includes(q)) ||
                (item.days && item.days.toString().includes(q))
              );
            }

            list.sort((a: any, b: any) => {
              let valA: any = a.startDate || "";
              let valB: any = b.startDate || "";
              if (manageSortKey === "endDate") {
                valA = a.endDate || "";
                valB = b.endDate || "";
              } else if (manageSortKey === "days") {
                valA = Number(a.days) || 0;
                valB = Number(b.days) || 0;
              } else if (manageSortKey === "reason") {
                valA = (a.reason || "").toLowerCase();
                valB = (b.reason || "").toLowerCase();
              }
              if (valA < valB) return manageSortOrder === "asc" ? -1 : 1;
              if (valA > valB) return manageSortOrder === "asc" ? 1 : -1;
              return 0;
            });

            const groupedMap = new Map<string, any[]>();
            list.forEach((item: any) => {
              const d = item.startDate || "";
              const y = d ? d.split("-")[0] : "Sin Año";
              if (!groupedMap.has(y)) groupedMap.set(y, []);
              groupedMap.get(y)!.push(item);
            });
            const groupedList = Array.from(groupedMap.entries()).map(([year, items]) => ({ year, items }));

            return (
              <>
                <DialogHeader className="space-y-2">
                  <DialogTitle>Administrar Permisos sin Goce - {emp ? `${emp.firstName} ${emp.lastName}` : ""}</DialogTitle>
                  <DialogDescription>
                    Lista de suspensiones o permisos sin goce de salario asignados.
                  </DialogDescription>
                  <div className="flex flex-wrap items-center gap-2.5 text-xs bg-muted/40 p-2.5 px-3 rounded-lg border border-border/80 text-muted-foreground shadow-xs mt-2">
                    <div>
                      <span className="font-semibold text-foreground">Total Permisos:</span> <span className="font-bold text-foreground">{rawList.length} {rawList.length === 1 ? 'registro' : 'registros'}</span>
                    </div>
                    <div className="h-3.5 w-px bg-border/80 hidden sm:block" />
                    <div>
                      <span className="font-semibold text-foreground">Días Sin Goce:</span> <span className="font-bold text-red-600 dark:text-red-400">{rawList.reduce((sum: number, r: any) => sum + (Number(r.days) || 0), 0)}d</span>
                    </div>
                  </div>
                </DialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar por fecha o motivo..."
                        value={manageSearch}
                        onChange={(e) => setManageSearch(e.target.value)}
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground font-medium self-end sm:self-center">
                      {manageSortOrder === "asc" ? "Ordenado de más viejo a más nuevo" : "Ordenado de más nuevo a más viejo"} ({list.length} {list.length === 1 ? "registro" : "registros"})
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No hay permisos {manageSearch ? "que coincidan con la búsqueda" : "registrados"}.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 border-b">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("date")}>
                                  Inicio
                                  {manageSortKey === "date" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("endDate")}>
                                  Fin
                                  {manageSortKey === "endDate" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[90px] text-center">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("days")}>
                                  Días
                                  {manageSortKey === "days" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-auto">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("reason")}>
                                  Motivo
                                  {manageSortKey === "reason" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[125px] text-right pr-4">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                        </Table>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table className="table-fixed w-full">
                          <TableBody>
                            {groupedList.map((group) => {
                              const groupTotalDays = group.items.reduce((sum: number, r: any) => sum + (Number(r.days) || 0), 0);
                              return (
                                <Fragment key={group.year}>
                                  <TableRow className="bg-muted/70 hover:bg-muted/70 font-semibold text-xs border-y">
                                    <TableCell colSpan={5} className="py-2 text-primary font-bold">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <Calendar className="h-3.5 w-3.5 text-primary" />
                                          Año {group.year} ({group.items.length} {group.items.length === 1 ? "registro" : "registros"})
                                        </span>
                                        <span className="text-red-700 dark:text-red-400 font-bold">
                                          Total: {groupTotalDays}d
                                        </span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {group.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="w-[135px] text-sm font-medium">
                                        {item.startDate ? new Date(item.startDate + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-[135px] text-sm">
                                        {item.endDate ? new Date(item.endDate + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-[90px] text-center text-sm font-semibold text-red-600">
                                        {item.days}d
                                      </TableCell>
                                      <TableCell className="w-auto text-sm truncate" title={item.reason}>
                                        {item.reason || "—"}
                                      </TableCell>
                                      <TableCell className="w-[125px] text-right space-x-1 pr-4">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          if (emp) {
                                            setSelectedUnpaidToPrint({ employee: emp, unpaid: item });
                                          }
                                        }}
                                        title="Imprimir Boleta"
                                      >
                                        <Printer className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          setEditingItem(item);
                                          setUnpaidForm({
                                            startDate: item.startDate,
                                            endDate: item.endDate,
                                            days: item.days.toString(),
                                            reason: item.reason || ""
                                          });
                                          setUnpaidIncludeSaturdays(false);
                                          setDialogType("unpaid");
                                        }}
                                        title="Editar permiso"
                                      >
                                        <Edit className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => {
                                          setConfirmDeleteTarget({ type: "unpaid", empId: selectedEmployeeId, item });
                                        }}
                                        title="Eliminar permiso"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActiveManageType(null)}>Cerrar</Button>
                <Button onClick={() => {
                  setEditingItem(null);
                  setUnpaidForm({
                    startDate: "",
                    endDate: "",
                    days: "1",
                    reason: ""
                  });
                  setUnpaidIncludeSaturdays(false);
                  setDialogType("unpaid");
                }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Registrar Permiso
                  </Button>
                </DialogFooter>
              </>
            );
          })()}

          {activeManageType === "deduction" && (() => {
            const emp = employees.find(e => e.id === selectedEmployeeId);
            const rawList = emp?.deductions || [];
            let list = [...rawList];

            if (manageSearch.trim()) {
              const q = manageSearch.toLowerCase();
              list = list.filter((item: any) =>
                (item.date && item.date.toLowerCase().includes(q)) ||
                (item.description && item.description.toLowerCase().includes(q)) ||
                (item.amount && item.amount.toString().includes(q)) ||
                (item.status && item.status.toLowerCase().includes(q))
              );
            }

            list.sort((a: any, b: any) => {
              let valA: any = a.date || "";
              let valB: any = b.date || "";
              if (manageSortKey === "description") {
                valA = (a.description || "").toLowerCase();
                valB = (b.description || "").toLowerCase();
              } else if (manageSortKey === "amount") {
                valA = Number(a.amount) || 0;
                valB = Number(b.amount) || 0;
              } else if (manageSortKey === "status") {
                valA = a.status || "";
                valB = b.status || "";
              }
              if (valA < valB) return manageSortOrder === "asc" ? -1 : 1;
              if (valA > valB) return manageSortOrder === "asc" ? 1 : -1;
              return 0;
            });

            const groupedMap = new Map<string, any[]>();
            list.forEach((item: any) => {
              const d = item.date || "";
              const y = d ? d.split("-")[0] : "Sin Año";
              if (!groupedMap.has(y)) groupedMap.set(y, []);
              groupedMap.get(y)!.push(item);
            });
            const groupedList = Array.from(groupedMap.entries()).map(([year, items]) => ({ year, items }));

            return (
              <>
                <DialogHeader>
                  <DialogTitle>Administrar Descargos - {emp ? `${emp.firstName} ${emp.lastName}` : ""}</DialogTitle>
                  <DialogDescription>
                    Lista de cargos especiales asignados a este colaborador.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar por fecha o descripción..."
                        value={manageSearch}
                        onChange={(e) => setManageSearch(e.target.value)}
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground font-medium self-end sm:self-center">
                      {manageSortOrder === "asc" ? "Ordenado de más viejo a más nuevo" : "Ordenado de más nuevo a más viejo"} ({list.length} {list.length === 1 ? "registro" : "registros"})
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No hay descargos {manageSearch ? "que coincidan con la búsqueda" : "registrados"}.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 border-b">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("date")}>
                                  Fecha
                                  {manageSortKey === "date" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-auto">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("description")}>
                                  Descripción
                                  {manageSortKey === "description" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[135px] text-right">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("amount")}>
                                  Monto
                                  {manageSortKey === "amount" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[110px] text-center">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("status")}>
                                  Estado
                                  {manageSortKey === "status" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[115px] text-right pr-4">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                        </Table>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table className="table-fixed w-full">
                          <TableBody>
                            {groupedList.map((group) => {
                              const groupTotalAmount = group.items.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);
                              return (
                                <Fragment key={group.year}>
                                  <TableRow className="bg-muted/70 hover:bg-muted/70 font-semibold text-xs border-y">
                                    <TableCell colSpan={5} className="py-2 text-primary font-bold">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <Calendar className="h-3.5 w-3.5 text-primary" />
                                          Año {group.year} ({group.items.length} {group.items.length === 1 ? "registro" : "registros"})
                                        </span>
                                        <span className="text-amber-700 dark:text-amber-400 font-bold">
                                          Total acumulado: {formatCRC(groupTotalAmount)}
                                        </span>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {group.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="w-[135px] text-sm font-medium">
                                        {item.date ? new Date(item.date + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-auto text-sm truncate" title={item.description}>
                                        {item.description}
                                      </TableCell>
                                      <TableCell className="w-[135px] text-right text-sm font-medium">
                                        {formatCRC(item.amount)}
                                      </TableCell>
                                      <TableCell className="w-[110px] text-center">
                                        <Badge variant={item.status === "deducted" ? "default" : "outline"} className={item.status === "deducted" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400"}>
                                          {item.status === "deducted" ? "Cobrado" : "Pendiente"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="w-[115px] text-right space-x-1 pr-4">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          if (emp) {
                                            setSelectedDeductionToPrint({ employee: emp, deduction: item });
                                          }
                                        }}
                                        title="Imprimir Boleta"
                                      >
                                        <Printer className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          setEditingItem(item);
                                          setDeductionForm({
                                            amount: item.amount.toString(),
                                            description: item.description,
                                            date: item.date
                                          });
                                          setDialogType("deduction");
                                        }}
                                        disabled={item.status === "deducted"}
                                        title="Editar descargo"
                                      >
                                        <Edit className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => {
                                          if (item.status === "deducted") {
                                            toast({ title: "No se puede eliminar un descargo ya cobrado", variant: "destructive" });
                                            return;
                                          }
                                          setConfirmDeleteTarget({ type: "deduction", empId: selectedEmployeeId, item });
                                        }}
                                        title="Eliminar descargo"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </Fragment>
                            );
                          })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setActiveManageType(null)}>Cerrar</Button>
                  <Button onClick={() => {
                    setEditingItem(null);
                    setDeductionForm({
                      amount: "",
                      description: "",
                      date: new Date().toISOString().split("T")[0]
                    });
                    setDialogType("deduction");
                  }}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Nuevo Descargo
                  </Button>
                </DialogFooter>
              </>
            );
          })()}

          {activeManageType === "swag" && (() => {
            const emp = employees.find(e => e.id === selectedEmployeeId);
            const rawList = emp?.swag || [];
            let list = [...rawList];

            if (manageSearch.trim()) {
              const q = manageSearch.toLowerCase();
              list = list.filter((item: any) =>
                (item.date && item.date.toLowerCase().includes(q)) ||
                (item.item && item.item.toLowerCase().includes(q)) ||
                (item.cost && item.cost.toString().includes(q)) ||
                (item.status && item.status.toLowerCase().includes(q))
              );
            }

            list.sort((a: any, b: any) => {
              let valA: any = a.date || "";
              let valB: any = b.date || "";
              if (manageSortKey === "item") {
                valA = (a.item || "").toLowerCase();
                valB = (b.item || "").toLowerCase();
              } else if (manageSortKey === "cost") {
                valA = Number(a.cost) || 0;
                valB = Number(b.cost) || 0;
              } else if (manageSortKey === "status") {
                valA = a.status || "";
                valB = b.status || "";
              }
              if (valA < valB) return manageSortOrder === "asc" ? -1 : 1;
              if (valA > valB) return manageSortOrder === "asc" ? 1 : -1;
              return 0;
            });

            const groupedMap = new Map<string, any[]>();
            list.forEach((item: any) => {
              const d = item.date || "";
              const y = d ? d.split("-")[0] : "Sin Año";
              if (!groupedMap.has(y)) groupedMap.set(y, []);
              groupedMap.get(y)!.push(item);
            });
            const groupedList = Array.from(groupedMap.entries()).map(([year, items]) => ({ year, items }));

            return (
              <>
                <DialogHeader>
                  <DialogTitle>Administrar Swag - {emp ? `${emp.firstName} ${emp.lastName}` : ""}</DialogTitle>
                  <DialogDescription>
                    Lista de artículos de swag e indumentaria asignados a este colaborador.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-3 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Filtrar por fecha o artículo..."
                        value={manageSearch}
                        onChange={(e) => setManageSearch(e.target.value)}
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground font-medium self-end sm:self-center">
                      {manageSortOrder === "asc" ? "Ordenado de más viejo a más nuevo" : "Ordenado de más nuevo a más viejo"} ({list.length} {list.length === 1 ? "registro" : "registros"})
                    </div>
                  </div>

                  {list.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">No hay swag {manageSearch ? "que coincida con la búsqueda" : "registrado"}.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <div className="bg-muted/40 border-b">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow className="bg-transparent hover:bg-transparent border-none">
                              <TableHead className="w-[135px]">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("date")}>
                                  Fecha
                                  {manageSortKey === "date" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-auto">
                                <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("item")}>
                                  Artículo
                                  {manageSortKey === "item" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[125px] text-right">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("cost")}>
                                  Costo
                                  {manageSortKey === "cost" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[110px] text-center">
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold" onClick={() => handleToggleManageSort("status")}>
                                  Estado
                                  {manageSortKey === "status" ? (manageSortOrder === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />) : <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />}
                                </Button>
                              </TableHead>
                              <TableHead className="w-[115px] text-right pr-4">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                        </Table>
                      </div>
                      <div className="max-h-[500px] overflow-y-auto">
                        <Table className="table-fixed w-full">
                          <TableBody>
                            {groupedList.map((group) => {
                              const groupTotalCost = group.items.reduce((sum: number, r: any) => sum + (Number(r.cost) || 0), 0);
                              return (
                                <Fragment key={group.year}>
                                  <TableRow className="bg-muted/70 hover:bg-muted/70 font-semibold text-xs border-y">
                                    <TableCell colSpan={5} className="py-2 text-primary font-bold">
                                      <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5">
                                          <Calendar className="h-3.5 w-3.5 text-primary" />
                                          Año {group.year} ({group.items.length} {group.items.length === 1 ? "registro" : "registros"})
                                        </span>
                                        {groupTotalCost > 0 && (
                                          <span className="text-purple-700 dark:text-purple-400 font-bold">
                                            Total acumulado: {formatCRC(groupTotalCost)}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                  {group.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell className="w-[135px] text-sm font-medium">
                                        {item.date ? new Date(item.date + "T12:00:00").toLocaleDateString() : ""}
                                      </TableCell>
                                      <TableCell className="w-auto text-sm font-medium truncate" title={item.item}>
                                        {item.item}
                                      </TableCell>
                                      <TableCell className="w-[125px] text-right text-sm">
                                        {formatCRC(item.cost)}
                                      </TableCell>
                                      <TableCell className="w-[110px] text-center">
                                        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                                          Entregado
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="w-[115px] text-right space-x-1 pr-4">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          if (emp) {
                                            setSelectedSwagToPrint({ employee: emp, swag: item });
                                          }
                                        }}
                                        title="Imprimir Boleta"
                                      >
                                        <Printer className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => {
                                          setEditingItem(item);
                                          setSwagForm({
                                            item: item.item,
                                            cost: item.cost.toString(),
                                            date: item.date
                                          });
                                          setDialogType("swag");
                                        }}
                                        disabled={item.status === "deducted" || item.status === "paid"}
                                        title="Editar swag"
                                      >
                                        <Edit className="h-4 w-4 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => {
                                          if (item.status === "deducted" || item.status === "paid") {
                                            toast({ title: "No se puede eliminar swag ya cobrado", variant: "destructive" });
                                            return;
                                          }
                                          setConfirmDeleteTarget({ type: "swag", empId: selectedEmployeeId, item });
                                        }}
                                        title="Eliminar swag"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActiveManageType(null)}>Cerrar</Button>
                <Button onClick={() => {
                  setEditingItem(null);
                  setSwagForm({
                    item: swagCatalog[0] || "Camisa Corporativa",
                    cost: "",
                    date: new Date().toISOString().split("T")[0]
                  });
                  setDialogType("swag");
                }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Asignar Swag
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete Vacation/Unpaid/Deduction/Swag Confirmation Dialog */}
      <AlertDialog open={confirmDeleteTarget !== null} onOpenChange={(open) => !open && setConfirmDeleteTarget(null)}>
        <AlertDialogContent className="z-[90]" overlayClassName="z-[85]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro de que desea eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteTarget && (() => {
                let detailText = "";
                if (confirmDeleteTarget.type === "vacation") {
                  detailText = `las vacaciones del ${confirmDeleteTarget.item.startDate} al ${confirmDeleteTarget.item.endDate} (${confirmDeleteTarget.item.days} días)`;
                } else if (confirmDeleteTarget.type === "unpaid") {
                  detailText = `el permiso sin goce del ${confirmDeleteTarget.item.startDate} al ${confirmDeleteTarget.item.endDate} (${confirmDeleteTarget.item.days} días)`;
                } else if (confirmDeleteTarget.type === "deduction") {
                  detailText = `el descargo de "${confirmDeleteTarget.item.description}" por ${formatCRC(confirmDeleteTarget.item.amount)}`;
                } else {
                  detailText = `el swag "${confirmDeleteTarget.item.item}" por ${formatCRC(confirmDeleteTarget.item.cost)}`;
                }
                return `¿Está seguro de que desea eliminar permanentemente ${detailText}? Esta acción no se puede deshacer.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => {
                if (confirmDeleteTarget) {
                  if (confirmDeleteTarget.type === "vacation") {
                    handleDeleteVacation(confirmDeleteTarget.empId, confirmDeleteTarget.item);
                  } else if (confirmDeleteTarget.type === "unpaid") {
                    handleDeleteUnpaidLeave(confirmDeleteTarget.empId, confirmDeleteTarget.item);
                  } else if (confirmDeleteTarget.type === "deduction") {
                    handleDeleteDeduction(confirmDeleteTarget.empId, confirmDeleteTarget.item);
                  } else {
                    handleDeleteSwag(confirmDeleteTarget.empId, confirmDeleteTarget.item);
                  }
                  setConfirmDeleteTarget(null);
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vacation Slip Print Preview Dialog */}
      <Dialog open={selectedVacationToPrint !== null} onOpenChange={(open) => !open && setSelectedVacationToPrint(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Boleta de Vacaciones
            </DialogTitle>
            <DialogDescription>
              Vista previa del documento oficial para firmar. Se imprimirá únicamente la boleta.
            </DialogDescription>
          </DialogHeader>

          {selectedVacationToPrint && (() => {
            const emp = selectedVacationToPrint.employee;
            const { accrued, taken, balance, timeFormatted } = calcEmployeeVacations(emp);
            const reqDays = Math.round(Number(selectedVacationToPrint.vacation.days) || 0);
            const prevBalance = balance + reqDays;

            return (
              <div className="space-y-4 my-2">
                <div className="flex justify-end gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenVacationEmailPreview}
                    disabled={sendingEmailType !== null}
                  >
                    <Mail className="h-4 w-4 mr-1.5 text-primary" />
                    Enviar por Correo
                  </Button>
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Imprimir Boleta
                  </Button>
                </div>

                <div 
                  className="bg-white text-black p-8 rounded border text-xs shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto font-sans"
                  style={{ 
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}
                >
                  {/* Executive Document Header */}
                  <div className="flex justify-between items-center mb-3 border-b pb-2">
                    <img src="/logo.png" className="h-10 w-auto object-contain" alt="SmartLogistics" />
                    <div className="text-right text-[10px] text-muted-foreground font-sans leading-normal">
                      <span className="font-bold text-foreground text-xs">SmartLogistics Costa Rica</span><br />
                      <span>Cédula Jurídica: 3-101-4480994</span><br />
                      <span>Email: rrhh@smartlogistics.cr</span>
                    </div>
                  </div>

                  <div className="text-center my-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider border-y py-1 text-foreground">
                      BOLETA DE CONTROL DE VACACIONES
                    </h2>
                  </div>

                  {/* Info block */}
                  <div className="grid grid-cols-2 gap-2 border p-2.5 rounded-lg bg-muted/10 my-3 font-sans">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Colaborador</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Cédula de Identidad</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.idNumber || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Puesto / Departamento</span>
                      <span className="text-sm font-semibold text-foreground">
                        {emp.position || "—"} ({emp.departmentName || "—"})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Ingreso</span>
                      <span className="text-sm font-semibold text-foreground">
                        {safeFormatEmployeeDate(emp.hireDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Tiempo Laborado</span>
                      <span className="text-sm font-semibold text-foreground">
                        {timeFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Balance details block */}
                  <div className="my-3 border rounded-lg overflow-hidden bg-background">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="font-bold text-xs h-9 text-foreground text-center">Saldo Previo</TableHead>
                          <TableHead className="font-bold text-xs h-9 text-foreground text-center">Días Solicitados</TableHead>
                          <TableHead className="font-bold text-xs h-9 text-foreground text-center">Nuevo Saldo Restante</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="text-center font-sans h-12">
                          <TableCell className="py-2 text-sm font-bold text-foreground">
                            {prevBalance} días
                          </TableCell>
                          <TableCell className="py-2 text-sm font-extrabold text-amber-600 bg-amber-50/50">
                            {reqDays} días
                          </TableCell>
                          <TableCell className={`py-2 text-sm font-extrabold ${balance < 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                            {balance} días
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Details block */}
                  <div className="space-y-2 my-3 font-sans">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-0.5">Período Solicitado</h3>
                    
                    <div className="grid grid-cols-2 gap-2 text-center border p-3 rounded-lg bg-muted/5">
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Inicio</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedVacationToPrint.vacation.startDate ? new Date(selectedVacationToPrint.vacation.startDate + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Finalización</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedVacationToPrint.vacation.endDate ? new Date(selectedVacationToPrint.vacation.endDate + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="border p-3 rounded-lg min-h-[70px]">
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Observaciones / Notas</span>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-line leading-relaxed">
                        {selectedVacationToPrint.vacation.notes || "Días de vacaciones autorizados por la administración."}
                      </p>
                    </div>
                  </div>

                  {/* Legals / Terms */}
                  <div className="text-[9px] text-muted-foreground bg-muted/5 p-2 rounded border border-dashed my-4">
                    <p className="font-semibold text-foreground mb-1">Declaración del Colaborador:</p>
                    <p>
                      Hago constar que los días aquí indicados corresponden a mi período de vacaciones anuales, solicitados y aprobados de mutuo acuerdo con la empresa. Declaro estar conforme con la cuenta de días devengados y el saldo restante reflejado en mi expediente laboral.
                    </p>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-8 mt-10 pt-4 border-t border-dashed">
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma del Colaborador</span>
                      <span className="text-[9px] text-muted-foreground block">Cédula: {emp.idNumber || "—"}</span>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma Autorizada</span>
                      <span className="text-[9px] text-muted-foreground block">Recursos Humanos / Administración</span>
                    </div>
                  </div>

                  {/* Footer date */}
                  <div className="text-[8px] text-right text-muted-foreground mt-6">
                    Impreso el: {new Date().toLocaleString("es-CR")} · SmartLogistics ERP
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setSelectedVacationToPrint(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unpaid Leave Slip Dialog */}
      <Dialog open={selectedUnpaidToPrint !== null} onOpenChange={(open) => !open && setSelectedUnpaidToPrint(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Boleta de Permiso sin Goce
            </DialogTitle>
            <DialogDescription>
              Vista previa del documento oficial para firmar. Se imprimirá únicamente la boleta.
            </DialogDescription>
          </DialogHeader>

          {selectedUnpaidToPrint && (() => {
            const emp = selectedUnpaidToPrint.employee;
            const years = yearsFrom(emp.hireDate);
            return (
              <div className="space-y-4 my-2">
                <div className="flex justify-end gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenUnpaidLeaveEmailPreview}
                    disabled={sendingEmailType !== null}
                  >
                    <Mail className="h-4 w-4 mr-1.5 text-primary" />
                    Enviar por Correo
                  </Button>
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Imprimir Boleta
                  </Button>
                </div>

                <div 
                  className="bg-white text-black p-8 rounded border text-xs shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto font-sans"
                  style={{ 
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}
                >
                  <div className="flex justify-between items-center mb-3 border-b pb-2">
                    <img src="/logo.png" className="h-8 w-auto object-contain" alt="SmartLogistics" />
                    <div className="text-right text-[10px] text-muted-foreground font-sans leading-normal">
                      <span className="font-bold text-foreground text-xs">SmartLogistics Costa Rica</span><br />
                      <span>Cédula Jurídica: 3-101-4480994</span><br />
                      <span>Email: rrhh@smartlogistics.cr</span>
                    </div>
                  </div>

                  <div className="text-center my-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider border-y py-1 text-foreground">
                      BOLETA DE PERMISO SIN GOCE DE SALARIO
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border p-2.5 rounded-lg bg-muted/10 my-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Colaborador</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Cédula de Identidad</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.idNumber || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Puesto / Departamento</span>
                      <span className="text-sm font-semibold text-foreground">
                        {emp.position || "—"} ({emp.departmentName || "—"})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Ingreso</span>
                      <span className="text-sm font-semibold text-foreground">
                        {safeFormatEmployeeDate(emp.hireDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Antigüedad</span>
                      <span className="text-sm font-semibold text-foreground">
                        {years.toFixed(1)} {years === 1 ? "año" : "años"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 my-3">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-0.5">Detalle del Período de Permiso</h3>
                    
                    <div className="grid grid-cols-3 gap-2 text-center border p-3 rounded-lg">
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Inicio</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedUnpaidToPrint.unpaid.startDate ? new Date(selectedUnpaidToPrint.unpaid.startDate + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Finalización</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedUnpaidToPrint.unpaid.endDate ? new Date(selectedUnpaidToPrint.unpaid.endDate + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Total de Días</span>
                        <span className="text-sm font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                          {selectedUnpaidToPrint.unpaid.days} {selectedUnpaidToPrint.unpaid.days === 1 ? "día" : "días"}
                        </span>
                      </div>
                    </div>

                    <div className="border p-3 rounded-lg min-h-[80px]">
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Motivo / Justificación</span>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-line leading-relaxed">
                        {selectedUnpaidToPrint.unpaid.reason || "Motivos personales."}
                      </p>
                    </div>
                  </div>

                  <div className="text-[9px] text-muted-foreground bg-muted/5 p-2.5 rounded border border-dashed my-4">
                    <p className="font-semibold text-foreground mb-1">Declaración del Colaborador:</p>
                    <p>
                      Hago constar y acepto que he solicitado voluntariamente un permiso temporal para ausentarme de mis labores ordinarias sin goce de salario durante el período descrito. Comprendo y acepto que los días correspondientes serán rebajados proporcionalmente de mi salario ordinario en la planilla respectiva, eximiendo al patrono de cualquier responsabilidad salarial por dichos días.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mt-10 pt-4 border-t border-dashed">
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-6"></div>
                      <span className="text-[9px] text-muted-foreground block uppercase font-semibold">Firma del Colaborador</span>
                      <span className="text-[9px] text-muted-foreground block">Cédula: {emp.idNumber || "—"}</span>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma Autorizada</span>
                      <span className="text-[9px] text-muted-foreground block">Recursos Humanos / Administración</span>
                    </div>
                  </div>

                  {/* Footer date */}
                  <div className="text-[8px] text-right text-muted-foreground mt-6">
                    Impreso el: {new Date().toLocaleString("es-CR")} · SmartLogistics ERP
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setSelectedUnpaidToPrint(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduction Slip Dialog */}
      <Dialog open={selectedDeductionToPrint !== null} onOpenChange={(open) => !open && setSelectedDeductionToPrint(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Boleta de Descargos / Retenciones
            </DialogTitle>
            <DialogDescription>
              Vista previa de la boleta de rebajo salarial. Se imprimirá únicamente la boleta.
            </DialogDescription>
          </DialogHeader>

          {selectedDeductionToPrint && (() => {
            const emp = selectedDeductionToPrint.employee;
            const years = yearsFrom(emp.hireDate);
            return (
              <div className="space-y-4 my-2">
                <div className="flex justify-end gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenDeductionEmailPreview}
                    disabled={sendingEmailType !== null}
                  >
                    <Mail className="h-4 w-4 mr-1.5 text-primary" />
                    Enviar por Correo
                  </Button>
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Imprimir Boleta
                  </Button>
                </div>

                <div 
                  className="bg-white text-black p-8 rounded border text-xs shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto font-sans"
                  style={{ 
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}
                >
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <img src="/logo.png" className="h-10 w-auto object-contain" alt="SmartLogistics" />
                    <div className="text-right text-[10px] text-muted-foreground font-sans leading-normal">
                      <span className="font-bold text-foreground text-xs">SmartLogistics Costa Rica</span><br />
                      <span>Cédula Jurídica: 3-101-4480994</span><br />
                      <span>Email: rrhh@smartlogistics.cr</span>
                    </div>
                  </div>

                  <div className="text-center my-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider border-y py-1 text-foreground">
                      BOLETA DE RETENCIÓN Y DESCARGOS
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border p-2.5 rounded-lg bg-muted/10 my-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Colaborador</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Cédula de Identidad</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.idNumber || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Puesto / Departamento</span>
                      <span className="text-sm font-semibold text-foreground">
                        {emp.position || "—"} ({emp.departmentName || "—"})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Ingreso</span>
                      <span className="text-sm font-semibold text-foreground">
                        {safeFormatEmployeeDate(emp.hireDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Antigüedad</span>
                      <span className="text-sm font-semibold text-foreground">
                        {years.toFixed(1)} {years === 1 ? "año" : "años"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 my-3">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-0.5">Detalle del Cargo Especial</h3>
                    
                    <div className="grid grid-cols-3 gap-2 text-center border p-3 rounded-lg">
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha Registro</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedDeductionToPrint.deduction.date ? new Date(selectedDeductionToPrint.deduction.date + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Monto Deducción</span>
                        <span className="text-sm font-bold text-red-600">
                          {formatCRC(selectedDeductionToPrint.deduction.amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Estado de Cobro</span>
                        <span className="text-sm font-extrabold text-foreground uppercase">
                          {selectedDeductionToPrint.deduction.status === "deducted" ? "Cobrado" : "Pendiente"}
                        </span>
                      </div>
                    </div>

                    <div className="border p-3 rounded-lg min-h-[80px]">
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Descripción del Descargo</span>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-line leading-relaxed font-semibold">
                        {selectedDeductionToPrint.deduction.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-[9px] text-muted-foreground bg-muted/5 p-2.5 rounded border border-dashed my-4">
                    <p className="font-semibold text-foreground mb-1">Autorización del Colaborador:</p>
                    <p>
                      Por medio del presente documento, el colaborador autoriza de forma expresa y voluntaria el rebajo del monto indicado en esta boleta directamente de su salario ordinario, de conformidad con lo conversado y aceptado en virtud de los descargos/ajustes detallados anteriormente.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-12 mt-20 pt-8 border-t border-dashed">
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma del Colaborador</span>
                      <span className="text-[9px] text-muted-foreground block">Cédula: {emp.idNumber || "—"}</span>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma Autorizada</span>
                      <span className="text-[9px] text-muted-foreground block">Recursos Humanos / Administración</span>
                    </div>
                  </div>

                  <div className="text-[8px] text-right text-muted-foreground mt-12">
                    Impreso el: {new Date().toLocaleString("es-CR")} · SmartLogistics ERP
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setSelectedDeductionToPrint(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swag Slip Dialog */}
      <Dialog open={selectedSwagToPrint !== null} onOpenChange={(open) => !open && setSelectedSwagToPrint(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Boleta de Entrega de Swag
            </DialogTitle>
            <DialogDescription>
              Vista previa del acuse de entrega de swag. Se imprimirá únicamente la boleta.
            </DialogDescription>
          </DialogHeader>

          {selectedSwagToPrint && (() => {
            const emp = selectedSwagToPrint.employee;
            const years = yearsFrom(emp.hireDate);
            return (
              <div className="space-y-4 my-2">
                <div className="flex justify-end gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenSwagEmailPreview}
                    disabled={sendingEmailType !== null}
                  >
                    <Mail className="h-4 w-4 mr-1.5 text-primary" />
                    Enviar por Correo
                  </Button>
                  <Button size="sm" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Imprimir Boleta
                  </Button>
                </div>

                <div 
                  className="bg-white text-black p-8 rounded border text-xs shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto font-sans"
                  style={{ 
                    boxSizing: 'border-box',
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                  }}
                >
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <img src="/logo.png" className="h-10 w-auto object-contain" alt="SmartLogistics" />
                    <div className="text-right text-[10px] text-muted-foreground font-sans leading-normal">
                      <span className="font-bold text-foreground text-xs">SmartLogistics Costa Rica</span><br />
                      <span>Cédula Jurídica: 3-101-4480994</span><br />
                      <span>Email: rrhh@smartlogistics.cr</span>
                    </div>
                  </div>

                  <div className="text-center my-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider border-y py-1 text-foreground">
                      BOLETA DE ASIGNACIÓN DE SWAG Y ACTIVOS
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border p-4 rounded-lg bg-muted/10 my-6">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Colaborador</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Cédula de Identidad</span>
                      <span className="text-sm font-bold text-foreground">
                        {emp.idNumber || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Puesto / Departamento</span>
                      <span className="text-sm font-semibold text-foreground">
                        {emp.position || "—"} ({emp.departmentName || "—"})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Ingreso</span>
                      <span className="text-sm font-semibold text-foreground">
                        {safeFormatEmployeeDate(emp.hireDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Antigüedad</span>
                      <span className="text-sm font-semibold text-foreground">
                        {years.toFixed(1)} {years === 1 ? "año" : "años"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 my-3">
                    <div className="grid grid-cols-2 gap-2 border p-2 rounded-lg bg-muted/5">
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Entrega</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedSwagToPrint.swag.date ? new Date(selectedSwagToPrint.swag.date + "T12:00:00").toLocaleDateString("es-CR") : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Estado de Activo</span>
                        <span className="text-sm font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                          Entregado bajo inventario
                        </span>
                      </div>
                    </div>

                    {/* Invoice-style items table */}
                    <div className="my-4">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase border-b pb-1 mb-2">Artículos y Activos Entregados</h3>
                      <div className="border rounded-lg overflow-hidden bg-background">
                        <Table>
                          <TableHeader className="bg-muted/30">
                            <TableRow className="h-8">
                              <TableHead className="font-semibold text-foreground text-xs h-8 py-1">Descripción del Artículo / Swag</TableHead>
                              <TableHead className="text-right font-semibold text-foreground text-xs h-8 py-1">Valor Unitario</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedSwagToPrint.swag.items && selectedSwagToPrint.swag.items.length > 0 ? (
                              selectedSwagToPrint.swag.items.map((it, idx) => (
                                <TableRow key={idx} className="h-8 border-b">
                                  <TableCell className="py-1.5 text-xs text-foreground font-medium">{it.name}</TableCell>
                                  <TableCell className="py-1.5 text-right text-xs text-foreground font-semibold">{formatCRC(it.cost)}</TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow className="h-8 border-b">
                                <TableCell className="py-1.5 text-xs text-foreground font-medium">{selectedSwagToPrint.swag.item}</TableCell>
                                <TableCell className="py-1.5 text-right text-xs text-foreground font-semibold">{formatCRC(selectedSwagToPrint.swag.cost)}</TableCell>
                              </TableRow>
                            )}
                            <TableRow className="bg-muted/10 font-bold border-t">
                              <TableCell className="py-2 text-xs font-bold text-foreground">Total Valor Entregado</TableCell>
                              <TableCell className="py-2 text-right text-xs font-extrabold text-foreground">
                                {formatCRC(selectedSwagToPrint.swag.cost)}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>

                  {/* Legals / Terms according to Costa Rican labor laws */}
                  <div className="text-[9px] text-muted-foreground bg-slate-50 p-2.5 rounded border border-dashed my-4 leading-relaxed font-sans text-justify">
                    <p className="font-bold text-foreground mb-2 uppercase text-[10px] tracking-wider text-rose-700">
                      PAGARÉ Y COMPROMISO DE RETORNO DE ACTIVOS (CÓDIGO DE TRABAJO DE COSTA RICA)
                    </p>
                    <p className="mb-2">
                      Hago constar y acepto expresamente que recibo a entera satisfacción los artículos y swag corporativo arriba detallados, propiedad de <strong>SmartLogistics Costa Rica</strong>. Los mismos son entregados para uso institucional y para el correcto desempeño de mis labores.
                    </p>
                    <p className="mb-2">
                      De conformidad con los artículos 69, 173 y concordantes del Código de Trabajo, me comprometo formalmente a mantenerlos en buen estado de conservación. Convengo expresamente que, <strong>en caso de renuncia voluntaria o cese por cualquier causa en los siguientes seis (6) meses</strong> a partir de la fecha de entrega de esta boleta, me obligo a:
                    </p>
                    <ul className="list-disc pl-5 mb-2 space-y-1">
                      <li>Devolver físicamente y en óptimas condiciones la totalidad de la indumentaria y activos descritos en este documento, <strong>ó en su defecto:</strong></li>
                      <li>Autorizar de forma libre, expresa e irrevocable a la empresa para que deduzca el costo total de adquisición aquí reflejado de <strong>{formatCRC(selectedSwagToPrint.swag.cost)}</strong> de manera retroactiva directamente de mis salarios ordinarios o de mi liquidación final de prestaciones laborales (incluyendo aguinaldo acumulado, vacaciones no gozadas, preaviso o auxilio de cesantía).</li>
                    </ul>
                    <p>
                      Reconozco que la retención o no devolución indebida de estos activos constituye una falta grave al reglamento interno y faculta a la empresa a iniciar los procesos legales correspondientes ante el Ministerio de Trabajo y Seguridad Social (MTSS) y las autoridades judiciales de la República de Costa Rica.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-12 mt-20 pt-8 border-t border-dashed">
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma del Colaborador</span>
                      <span className="text-[9px] text-muted-foreground block">Cédula: {emp.idNumber || "—"}</span>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma Autorizada</span>
                      <span className="text-[9px] text-muted-foreground block">Recursos Humanos / Administración</span>
                    </div>
                  </div>

                  {/* Footer date */}
                  <div className="text-[8px] text-right text-muted-foreground mt-12">
                    Impreso el: {new Date().toLocaleString("es-CR")} · SmartLogistics ERP
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setSelectedSwagToPrint(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Projected Calculations (Cesantía/Aguinaldo) Slip Dialog */}
      <Dialog open={selectedCalculationToPrint !== null} onOpenChange={(open) => !open && setSelectedCalculationToPrint(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto z-[90]" overlayClassName="z-[85]">
          <DialogHeader className="print:hidden">
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Detalle de Pasivos Laborales Proyectados
            </DialogTitle>
            <DialogDescription>
              Vista previa del reporte de proyección de aguinaldos y cesantías.
            </DialogDescription>
          </DialogHeader>

          {selectedCalculationToPrint && (
            <div className="space-y-4 my-2">
              <div className="flex justify-end gap-2 print:hidden">
                <Button size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1.5" />
                  Imprimir Boleta
                </Button>
              </div>

              <div 
                className="bg-white text-black p-8 rounded border text-xs shadow-sm print-area print:border-none print:shadow-none leading-relaxed max-w-[8.5in] mx-auto font-sans"
                style={{ 
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                }}
              >
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                  <img src="/logo.png" className="h-10 w-auto object-contain" alt="SmartLogistics" />
                  <div className="text-right text-[10px] text-muted-foreground font-sans leading-normal">
                    <span className="font-bold text-foreground text-xs">SmartLogistics Costa Rica</span><br />
                    <span>Cédula Jurídica: 3-101-4480994</span><br />
                    <span>Email: rrhh@smartlogistics.cr</span>
                  </div>
                </div>

                <div className="text-center my-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider border-y py-1 text-foreground">
                    ESTADO DE PROYECCIÓN DE PASIVOS LABORALES
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-4 border p-4 rounded-lg bg-muted/10 my-6">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Colaborador</span>
                    <span className="text-sm font-bold text-foreground">
                      {selectedCalculationToPrint.employee.firstName} {selectedCalculationToPrint.employee.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Cédula de Identidad</span>
                    <span className="text-sm font-bold text-foreground">
                      {selectedCalculationToPrint.employee.idNumber || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Puesto / Departamento</span>
                    <span className="text-sm font-semibold text-foreground">
                      {selectedCalculationToPrint.employee.position || "—"} ({selectedCalculationToPrint.employee.departmentName || "—"})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Fecha de Ingreso</span>
                    <span className="text-sm font-semibold text-foreground">
                      {safeFormatEmployeeDate(selectedCalculationToPrint.employee.hireDate)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 my-3">
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-0.5">Desglose de Pasivos Acumulados</h3>
                  
                  <div className="grid grid-cols-2 gap-4 border p-4 rounded-lg bg-muted/5">
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Antigüedad Estimada</span>
                      <span className="text-sm font-bold text-foreground">
                        {selectedCalculationToPrint.years.toFixed(2)} {selectedCalculationToPrint.years === 1 ? "año" : "años"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Salario Bruto Mensual Base</span>
                      <span className="text-sm font-bold text-foreground">
                        {formatCRC(selectedCalculationToPrint.gross)}
                      </span>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10">
                        <TableHead>Concepto Laboral</TableHead>
                        <TableHead className="text-center">Base de Cálculo</TableHead>
                        <TableHead className="text-right">Monto Estimado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-semibold text-indigo-600">Aguinaldo Acumulado</TableCell>
                        <TableCell className="text-center">{selectedCalculationToPrint.monthsWorked.toFixed(2)} meses trabajados en período fiscal</TableCell>
                        <TableCell className="text-right font-bold text-indigo-600">{formatCRC(selectedCalculationToPrint.aguinaldo)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold text-rose-600">Cesantía Proyectada (Art. 29)</TableCell>
                        <TableCell className="text-center">{selectedCalculationToPrint.cesantíaDays.toFixed(1)} días de cesantía legal</TableCell>
                        <TableCell className="text-right font-bold text-rose-600">{formatCRC(selectedCalculationToPrint.cesantiaAmount)}</TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/10 border-t font-extrabold text-foreground">
                        <TableCell>Total Pasivo Estimado</TableCell>
                        <TableCell className="text-center">Suma acumulada a la fecha</TableCell>
                        <TableCell className="text-right text-sm">{formatCRC(selectedCalculationToPrint.aguinaldo + selectedCalculationToPrint.cesantiaAmount)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="text-[9px] text-muted-foreground bg-muted/5 p-2 rounded border border-dashed my-4">
                  <p className="font-semibold text-foreground mb-1">Nota Informativa y Descargo de Responsabilidad:</p>
                  <p>
                    Este documento constituye una proyección técnica estimada de los pasivos laborales acumulados (Aguinaldo y Cesantía) a la fecha de hoy, calculado en estricto apego al Código de Trabajo de Costa Rica (Art. 29). No representa una carta de despido ni una liquidación definitiva, sino un reporte con fines informativos y de planeación financiera.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-12 mt-20 pt-8 border-t border-dashed">
                  <div className="text-center space-y-1">
                    <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma del Colaborador (Recibido)</span>
                    <span className="text-[9px] text-muted-foreground block">Cédula: {selectedCalculationToPrint.employee.idNumber || "—"}</span>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="border-b border-black w-4/5 mx-auto h-8"></div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-semibold">Firma Autorizada</span>
                    <span className="text-[9px] text-muted-foreground block">Recursos Humanos / Administración</span>
                  </div>
                </div>

                <div className="text-[8px] text-right text-muted-foreground mt-12">
                  Impreso el: {new Date().toLocaleString("es-CR")} · SmartLogistics ERP
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setSelectedCalculationToPrint(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview & Confirmation Dialog */}
      <Dialog open={emailPreviewData !== null} onOpenChange={(open) => !open && setEmailPreviewData(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col z-[100]" overlayClassName="z-[95]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Mail className="h-5 w-5 text-primary" />
              {emailPreviewData?.title || "Vista Previa de Correo"}
            </DialogTitle>
            <DialogDescription>
              Revise la información del destinatario y el contenido del correo antes de confirmar el envío.
            </DialogDescription>
          </DialogHeader>

          {emailPreviewData && (
            <div className="flex-1 space-y-3 overflow-hidden flex flex-col min-h-0 my-1">
              {/* Recipient and Test Email Control Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Correo Destinatario ({emailPreviewData.recipientName})
                    </span>
                    {emailPreviewData.recipientEmail && emailPreviewData.targetEmail.toLowerCase() !== emailPreviewData.recipientEmail.toLowerCase() && (
                      <button
                        type="button"
                        className="text-[10px] text-primary hover:underline font-medium"
                        onClick={() => setEmailPreviewData({ ...emailPreviewData, targetEmail: emailPreviewData.recipientEmail })}
                      >
                        Restablecer original
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <Input
                      type="email"
                      value={emailPreviewData.targetEmail}
                      onChange={(e) => setEmailPreviewData({ ...emailPreviewData, targetEmail: e.target.value })}
                      placeholder="correo@ejemplo.com"
                      className="h-8 text-xs font-mono bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] px-2 whitespace-nowrap bg-background"
                      onClick={() => setEmailPreviewData({ ...emailPreviewData, targetEmail: "rrhh@smartlogistics.cr" })}
                      title="Probar envío en correo de Recursos Humanos"
                    >
                      🧪 Usar RRHH
                    </Button>
                  </div>
                  {emailPreviewData.recipientEmail && emailPreviewData.targetEmail.toLowerCase() !== emailPreviewData.recipientEmail.toLowerCase() && (
                    <span className="text-[10px] text-amber-600 font-semibold block mt-1">
                      ⚠️ Modo Prueba: El correo se enviará a {emailPreviewData.targetEmail} en lugar del colaborador.
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                    Asunto del Correo
                  </span>
                  <Input
                    type="text"
                    value={emailPreviewData.subject}
                    onChange={(e) => setEmailPreviewData({ ...emailPreviewData, subject: e.target.value })}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              {/* HTML Live Preview Frame */}
              <div className="flex-1 border rounded-lg overflow-hidden bg-white shadow-inner min-h-[380px]">
                <iframe
                  title="Vista previa del correo"
                  srcDoc={emailPreviewData.htmlContent}
                  className="w-full h-full min-h-[380px] border-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEmailPreviewData(null)}
              disabled={sendingEmailType !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSendEmail}
              disabled={sendingEmailType !== null}
            >
              {sendingEmailType !== null ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Enviando Correo...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-1.5" />
                  {emailPreviewData && emailPreviewData.recipientEmail && emailPreviewData.targetEmail.toLowerCase() !== emailPreviewData.recipientEmail.toLowerCase()
                    ? "Enviar Correo de Prueba"
                    : "Confirmar y Enviar Correo"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
});

export default PayrollBenefits;
