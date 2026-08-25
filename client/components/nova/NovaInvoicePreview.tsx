/**
 * NovaInvoicePreview
 *
 * Full invoice preview modal — mirrors SP2's InvoiceModal / email design.
 * Accepts:
 *  - InvoiceRecord from invoice-service (Nova-created invoices)
 *  - Raw SP1 Invoice shape from InvoiceGeneration.tsx (fetched from Firestore)
 * Both are normalised internally to a single PreviewData shape.
 */

import { memo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FileText,
  Printer,
  Send,
  Loader2,
  FlaskConical,
  AlertTriangle,
  Building2,
  Info,
} from "lucide-react";
import {
  isConsolidatedInvoice,
  type InvoiceRecord,
} from "@/lib/services/invoice-service";
import { resolveEffectiveCustomerName } from "@/lib/utils/customer-name";

// ─────────────────────────────────────────────────────────────────────────────
//  formatInvoiceItemCaption
//
//  Single source of truth for the small caption rendered under the
//  "Servicios Logísticos" line in the on-screen preview AND the email HTML.
//
//  CONTRACT (locked by NovaInvoicePreview.spec.tsx) — three cases:
//
//   1. MANUAL items (`item.isManual === true` — Servicio de Terceros entries
//      added by the operator on /invoices/create or /invoices via
//      "Agregar item"): show ONLY the description. There is no tracking
//      number for these — they represent ad-hoc charges (customs, courier
//      surcharges, etc.) and the description IS the line item.
//
//   2. MARITIME items (top-level `source === 'maritime'`): show the
//      tracking (work-order WR) followed by the description, because the
//      description carries dimensional info ("DIM: 60x40x40 cm") that the
//      customer needs to see alongside the WR.
//
//   3. REGULAR items (air manifest / encomiendas — `isManual` falsy and
//      `source` not maritime): show ONLY the tracking number, uppercased.
//      NEVER fall back to `item.description` — operator-entered package
//      descriptions must not appear here (decided in commit 53d8cd3f4
//      "fix: eliminar descripción del paquete del invoice preview y modal";
//      silently regressed by a77fccf38 which re-introduced the description
//      fallback while adding `.toUpperCase()`. Customers were confused into
//      thinking the description WAS the line item).
//
//  If you need to change any of these three branches, update the spec
//  FIRST so the regression cannot sneak back in via a one-line edit.
// ─────────────────────────────────────────────────────────────────────────────
export function formatInvoiceItemCaption(
  item: {
    tracking?: string | null;
    description?: string | null;
    isManual?: boolean | null;
  },
  ctx?: { source?: string | null },
): string {
  const tracking = (item.tracking || "").toUpperCase();
  const description = (item.description || "").trim();
  const isManual = !!item.isManual;
  const isMaritime = (ctx?.source || "").toLowerCase() === "maritime";

  // 1. Manual line items — description is the line item itself.
  if (isManual) return description.toUpperCase() || "—";

  // 2. Maritime — pair the WR with its dimensional description.
  if (isMaritime) {
    if (tracking && description)
      return `${tracking} — ${description.toUpperCase()}`;
    return tracking || description.toUpperCase() || "—";
  }

  // 3. Regular tracked package — tracking only, never the description.
  return tracking || "—";
}

// ── Loose SP1 Invoice shape (as returned by InvoiceGeneration.tsx handlePreviewInvoice) ──
export interface SP1InvoiceShape {
  id: string;
  invoiceNumber: string;
  status?: string;
  totalAmount?: number;
  subtotalAmount?: number;
  taxAmount?: number;
  discountAmount?: number;
  discountPercentage?: number;
  currency?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  emailSent?: boolean;
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
    slCode?: string;
    cedula?: string;
    identificationNumber?: string;
    ruta?: string | null;
    consolidationEnabled?: boolean;
  };
  invoiceItems?: Array<{
    packageId?: string;
    description?: string;
    trackingNumber?: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice?: number;
    requiresPermit?: boolean;
    package?: {
      requiresPermit?: boolean;
      trackingNumber?: string;
      exchangeRate?: number;
      costCRC?: number;
      price?: number;
    };
    weight?: number;
    isManual?: boolean;
    exchangeRate?: number;
  }>;
  manifestNumber?: string;
  // Nova extra fields that may also be present
  exchangeRate?: number;
  amountCRC?: number;
  ivaEnabled?: boolean;
  source?: string;
}

export type PreviewableInvoice = InvoiceRecord | SP1InvoiceShape;

interface NovaInvoicePreviewProps {
  invoice: PreviewableInvoice;
  onClose?: () => void;
  /** Renders as an inline card instead of a full-screen modal */
  inline?: boolean;
  /** When provided, shows a red "Confirmar y enviar" button in the footer */
  onConfirmSend?: (invoice: PreviewableInvoice) => Promise<void>;
  /** When provided (alongside onConfirmSend), shows an amber test-send row — sends ONLY to testEmail, never to the real client */
  onTestSend?: (
    invoice: PreviewableInvoice,
    testEmail: string,
  ) => Promise<void>;
  customerConsolidationEnabled?: boolean;
}

// ── Normalise both shapes into one flat structure ─────────────────────────────
interface PreviewData {
  invoiceNumber: string;
  status: string;
  clientName: string;
  clientEmail: string;
  clientDni: string;
  clientRoute: string;
  slCode: string;
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  iva: number;
  total: number;
  exchangeRate: number;
  totalCRC: number;
  ivaEnabled: boolean;
  isConsolidation: boolean;
  invoiceDate: string;
  dueDate: string;
  source?: string;
  items: Array<{
    description: string;
    tracking: string;
    weight: number;
    realWeight?: number;
    amount: number;
    requiresPermit?: boolean;
    isManual?: boolean;
  }>;
}

function normalise(inv: PreviewableInvoice, customerConsolidationEnabled?: boolean): PreviewData {
  const isRecord = "amount" in inv;
  if (isRecord) {
    const r = inv as InvoiceRecord;
    // Prefer invoiceItems when it has more entries than items — this happens when
    // manual/third-party cost items have been added via arrayUnion to invoiceItems.
    const sp1Items = (r as any).invoiceItems as Array<any> | undefined;
    const itemsArr = r.items || [];
    const displayItems =
      sp1Items && sp1Items.length > 0
        ? sp1Items.map((i: any, idx: number) => ({
            description: i.description || i.trackingNumber || "—",
            tracking: i.trackingNumber || "",
            // Fallback to items[].weight when invoiceItems[].weight is missing (legacy invoices)
            weight:
              i.weight && i.weight > 0
                ? i.weight
                : (itemsArr[idx]?.weight ?? 0),
            realWeight: i.realWeight != null ? i.realWeight : undefined,
            amount: i.totalPrice ?? i.unitPrice ?? 0,
            requiresPermit: !!(
              i.isPermiso ||
              i.requiresPermit ||
              i.package?.requiresPermit
            ),
            isManual: !!i.isManual,
          }))
        : itemsArr.map((i) => ({
            description: i.description,
            tracking: i.tracking,
            weight: i.weight,
            realWeight: (i as any).realWeight ?? undefined,
            amount: i.amount,
            requiresPermit:
              !!(i as any).isPermiso || !!(i as any).requiresPermit,
            isManual: !!(i as any).isManual,
          }));
    // Use stored subtotal/discount/tax/total directly — re-deriving from items is incorrect
    // when a discount has been applied because totalAmount already has discount baked in.
    const storedDiscount = Number((r as any).discountAmount ?? 0);
    const storedDiscPct = Number((r as any).discountPercentage ?? 0);
    const storedSub = Number((r as any).subtotalAmount ?? 0);
    const storedTax = Number((r as any).taxAmount ?? r.iva ?? 0);
    const storedTotal = Number((r as any).totalAmount ?? r.amount ?? 0);
    const ivaOn = r.ivaEnabled || storedTax > 0;
    // Fall back to item-sum only when stored amounts are unavailable (e.g. legacy records)
    const itemsSum = displayItems.reduce((s, i) => s + i.amount, 0);

    const hasManual = displayItems.some(i => i.isManual);
    let total = 0;
    let discountAmount = storedDiscount;
    if (hasManual) {
      if (storedDiscPct > 0 && discountAmount === 0) {
        discountAmount = Math.round(itemsSum * (storedDiscPct / 100) * 100) / 100;
      }
      total = itemsSum - discountAmount;
    } else {
      total = storedTotal > 0 ? storedTotal : itemsSum > 0 ? itemsSum : Number(r.amount ?? 0);
    }

    const sub = (hasManual || !(storedSub > 0))
      ? (ivaOn ? Math.round((total / 1.13) * 100) / 100 : total)
      : storedSub;

    const tax = (hasManual || !(storedTax > 0))
      ? (ivaOn ? Math.round((total - sub) * 100) / 100 : 0)
      : storedTax;
    // TC: top-level field → item-level → derive from stored amountCRC/amount
    const itemTc =
      ((r as any).invoiceItems as Array<any> | undefined)?.find(
        (i: any) => (i.exchangeRate ?? 0) > 0,
      )?.exchangeRate ?? 0;
    const storedAmtCRC = Number((r as any).amountCRC ?? 0);
    const storedAmt = Number(r.amount ?? 0);
    const derivedTc =
      storedAmtCRC > 0 && storedAmt > 0
        ? Math.round((storedAmtCRC / storedAmt) * 100) / 100
        : 0;
    const tc =
      Number(r.exchangeRate ?? 0) > 0
        ? Number(r.exchangeRate)
        : itemTc > 0
          ? itemTc
          : derivedTc;
    // Use live computation; fall back to stored amountCRC so TC/CRC never disappears
    const computedCRC = tc > 0 ? Math.round(total * tc) : 0;
    const totalCRCVal = computedCRC > 0 ? computedCRC : storedAmtCRC;
    const rawCreationDate = r.invoiceDate || (r as any).createdAt || (r as any).created_at || (r as any).date || (r as any).timestamp;
    const invDateObj = parseInvoiceCreationDate(rawCreationDate, r.invoiceNumber);
    const invDateStr = invDateObj.toISOString();
    const dueDateStr = r.dueDate || new Date(invDateObj.getTime() + 3 * 86400000).toISOString();

    return {
      invoiceNumber: r.invoiceNumber,
      status: r.status || "pending",
      clientName: resolveEffectiveCustomerName({
        contactName: (r.customer as any)?.fullName,
        manifestConsigneeName: (r as any).nombre,
        savedCustomerName: r.clientName || (r as any).customerName,
        slCode: r.slCode,
      }),
      clientEmail: r.clientEmail,
      clientDni: r.clientDni,
      clientRoute: r.clientRoute,
      slCode: r.slCode,
      subtotal: sub,
      discountAmount: storedDiscount,
      discountPercentage: storedDiscPct,
      iva: tax,
      total,
      exchangeRate: tc,
      totalCRC: totalCRCVal,
      ivaEnabled: ivaOn,
      isConsolidation: customerConsolidationEnabled === false ? false : isConsolidatedInvoice(r),
      invoiceDate: invDateStr,
      dueDate: dueDateStr,
      source: r.source,
      items: displayItems,
    };
  }
  const s = inv as SP1InvoiceShape;
  // Use stored fields directly — re-deriving totals from items is incorrect when a
  // discount has been applied because totalAmount already has discount baked in.
  const sp1Discount = Number(s.discountAmount ?? 0);
  const sp1DiscPct = Number(s.discountPercentage ?? 0);
  const ivaOn2 = (s.ivaEnabled ?? false) || (s.taxAmount ?? 0) > 0;
  const storedTotal2 = Number(s.totalAmount ?? 0);
  const storedSub2 = Number(s.subtotalAmount ?? 0);
  const storedTax2 = Number(s.taxAmount ?? 0);
  const sp1ItemsList = s.invoiceItems || [];
  const itemsSum2 = sp1ItemsList.reduce(
    (acc, i) => acc + (i.totalPrice ?? i.unitPrice ?? 0),
    0,
  );
  const hasManual = sp1ItemsList.some(i => i.isManual);
  let total = 0;
  let discountAmount = sp1Discount;
  if (hasManual) {
    if (sp1DiscPct > 0 && discountAmount === 0) {
      discountAmount = Math.round(itemsSum2 * (sp1DiscPct / 100) * 100) / 100;
    }
    total = itemsSum2 - discountAmount;
  } else {
    total = storedTotal2 > 0 ? storedTotal2 : itemsSum2 > 0 ? itemsSum2 : 0;
  }

  const sub = (hasManual || !(storedSub2 > 0))
    ? (ivaOn2 ? Math.round((total / 1.13) * 100) / 100 : total)
    : storedSub2;

  const tax = (hasManual || !(storedTax2 > 0))
    ? (ivaOn2 ? Math.round((total - sub) * 100) / 100 : 0)
    : storedTax2;
  const itemExchangeRate = sp1ItemsList.find((i) => (i.exchangeRate ?? 0) > 0);
  const sp1AmtCRC = Number(s.amountCRC ?? 0);
  const sp1DerivedTc =
    sp1AmtCRC > 0 && total > 0
      ? Math.round((sp1AmtCRC / total) * 100) / 100
      : 0;
  const tc =
    (s.exchangeRate ?? 0) > 0
      ? (s.exchangeRate ?? 0)
      : (itemExchangeRate?.exchangeRate ?? 0) > 0
        ? (itemExchangeRate?.exchangeRate ?? 0)
        : sp1DerivedTc;

  const rawCreationDate = s.invoiceDate || (s as any).createdAt || (s as any).created_at || (s as any).date || (s as any).timestamp;
  const invDateObj = parseInvoiceCreationDate(rawCreationDate, s.invoiceNumber);
  const invDateStr = invDateObj.toISOString();
  const dueDateStr = s.dueDate || new Date(invDateObj.getTime() + 3 * 86400000).toISOString();

  return {
    invoiceNumber: s.invoiceNumber,
    status: s.status || "draft",
    clientName: resolveEffectiveCustomerName({
      contactName: s.customer?.fullName,
      manifestConsigneeName: (s as any).nombre,
      savedCustomerName: (s as any).clientName || (s as any).customerName,
      slCode: s.customer?.slCode || (s as any).slCode,
    }),
    clientEmail: (s as any).clientEmail || s.customer?.email || "—",
    clientDni:
      (s as any).clientDni ||
      s.customer?.cedula ||
      s.customer?.identificationNumber ||
      "—",
    clientRoute: s.customer?.ruta || "—",
    slCode: s.customer?.slCode || "—",
    subtotal: sub,
    discountAmount: sp1Discount,
    discountPercentage: sp1DiscPct,
    iva: tax,
    total,
    exchangeRate: tc,
    totalCRC: tc > 0 ? Math.round(total * tc) : 0,
    ivaEnabled: ivaOn2,
    isConsolidation: customerConsolidationEnabled === false
      ? false
      : (isConsolidatedInvoice(s) && (s.customer?.consolidationEnabled !== false)),
    invoiceDate: invDateStr,
    dueDate: dueDateStr,
    source: s.source,
    items: (() => {
      const isPermitManifest = !!(
        s.manifestNumber && s.manifestNumber.toUpperCase().includes("DANP")
      );
      return (s.invoiceItems || []).map((i) => ({
        description: i.description || i.trackingNumber || i.packageId || "—",
        tracking: i.trackingNumber || "",
        isManual: !!(i as any).isManual,
        // Also check package.weight as fallback for SP1 invoices that may store weight there
        weight: i.weight && i.weight > 0 ? i.weight : 0,
        realWeight:
          (i as any).realWeight != null ? (i as any).realWeight : undefined,
        amount: i.totalPrice ?? i.unitPrice ?? 0,
        requiresPermit:
          isPermitManifest || !!(i.requiresPermit || i.package?.requiresPermit),
      }));
    })(),
  };
}

/**
 * Safely parses an invoice creation date from any raw input shape:
 * - ISO string ("2026-07-27T17:12:02.470Z")
 * - Formatted date string ("27/7/2026" or "2026-07-27")
 * - Firestore Timestamp object ({ toDate: () => Date } or { seconds: number })
 * - Epoch timestamp (number)
 * - Fallback: Parse timestamp embedded in invoice number (e.g. SL800-20260727171202470 -> 2026-07-27)
 */
export function parseInvoiceCreationDate(rawDate: any, fallbackInvoiceNum?: string): Date {
  if (rawDate) {
    if (typeof rawDate === 'object' && typeof rawDate.toDate === 'function') {
      try {
        const d = rawDate.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {}
    }

    if (typeof rawDate === 'object' && typeof rawDate.seconds === 'number') {
      try {
        const d = new Date(rawDate.seconds * 1000);
        if (!isNaN(d.getTime())) return d;
      } catch {}
    }

    if (typeof rawDate === 'number' && rawDate > 0) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) return d;
      } catch {}
    }

    if (typeof rawDate === 'string' && rawDate.trim()) {
      const str = rawDate.trim();

      const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (ddmmyyyyMatch) {
        const day = parseInt(ddmmyyyyMatch[1], 10);
        const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
        const year = parseInt(ddmmyyyyMatch[3], 10);
        const d = new Date(year, month, day, 12, 0, 0);
        if (!isNaN(d.getTime())) return d;
      }

      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
    }
  }

  if (fallbackInvoiceNum) {
    const match = String(fallbackInvoiceNum).match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [, y, m, d, hh, mm] = match;
      const year = parseInt(y, 10);
      const month = parseInt(m, 10) - 1;
      const day = parseInt(d, 10);
      const hour = parseInt(hh, 10);
      const min = parseInt(mm, 10);
      if (year >= 2020 && year <= 2030 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        const parsed = new Date(year, month, day, hour, min);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }
  }

  return new Date();
}

function fmt(iso?: any, fallbackInvoiceNum?: string): string {
  if (typeof iso === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(iso.trim())) {
    return iso.trim();
  }
  const d = parseInvoiceCreationDate(iso, fallbackInvoiceNum);
  return d.toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" });
}

export const NovaInvoicePreview = memo(function NovaInvoicePreview({
  invoice,
  onClose = () => {},
  inline = false,
  onConfirmSend,
  onTestSend,
  customerConsolidationEnabled,
}: NovaInvoicePreviewProps) {
  const d = normalise(invoice, customerConsolidationEnabled);
  const today = fmt(d.invoiceDate, d.invoiceNumber);
  const due = fmt(d.dueDate);
  const sym = "$";
  const [isSending, setIsSending] = useState(false);
  const [sendDone, setSendDone] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [isTestSending, setIsTestSending] = useState(false);
  const [testSendDone, setTestSendDone] = useState(false);
  const [showTestConfirm, setShowTestConfirm] = useState(false);

  const handleTestSend = useCallback(async () => {
    if (!onTestSend || isTestSending || !testEmail.trim()) return;
    setIsTestSending(true);
    try {
      await onTestSend(invoice, testEmail.trim());
      setTestSendDone(true);
      setShowTestConfirm(false);
      setTimeout(() => setTestSendDone(false), 4000);
    } finally {
      setIsTestSending(false);
    }
  }, [onTestSend, isTestSending, testEmail, invoice]);

  const handleConfirmSend = async () => {
    if (!onConfirmSend || isSending) return;
    setIsSending(true);
    try {
      await onConfirmSend(invoice);
      setSendDone(true);
      setTimeout(onClose, 1500);
    } finally {
      setIsSending(false);
    }
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;

    const escHtml = (t: string | undefined | null) => {
      if (!t) return "";
      const el = document.createElement("div");
      el.textContent = String(t);
      return el.innerHTML;
    };

    const hasPermits = d.items.some((i) => i.requiresPermit);
    const consolidationBadgeHtml = d.isConsolidation
      ? `<div style="margin-top:4px;"><span style="display:inline-block;background:#0f172a;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Consolidaci&oacute;n Aplicada</span></div>`
      : "";
    const maritimeBadgeHtml =
      d.source === "maritime"
        ? `<div style="margin-top:4px;"><span style="display:inline-block;background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Carga Marítima</span></div>`
        : "";

    const itemsHtml = d.items
      .map(
        (item) => `
      <tr>
        <td>
          <div class="item-name">Servicios Logísticos${item.requiresPermit ? ' <span class="permit-badge">&#9888; PERMISOS</span>' : ""}</div>
          <div class="item-desc">${escHtml(formatInvoiceItemCaption(item, { source: d.source }))}</div>
        </td>
        <td style="text-align:center;">${item.weight || item.realWeight ? `${Number(item.realWeight ?? item.weight).toFixed(2)} ${d.source === "maritime" ? "FT³" : "kg"}` : "\u2014"}</td>
        <td style="text-align:right;">${sym}${item.amount.toFixed(2)}</td>
      </tr>
    `,
      )
      .join("");

    const tcHtml =
      d.exchangeRate > 0
        ? `
      <div style="margin-top:12px;text-align:right;">
        <p style="font-size:13px;color:#475569;margin:0;font-weight:500;">TC: <span style="font-family:monospace;font-weight:700;">${d.exchangeRate.toFixed(2)}</span></p>
        <p style="font-size:16px;font-weight:700;color:#1e293b;margin:4px 0 0 0;">Total CRC: <span style="font-family:monospace;">₡${Math.round(d.totalCRC).toLocaleString("es-CR")}</span></p>
      </div>`
        : "";

    const discountHtml =
      d.discountAmount > 0
        ? `<div class="totals-row" style="color:#dc2626;"><span class="totals-row-label">Descuento (${d.discountPercentage > 0 ? d.discountPercentage.toFixed(1) + "%" : ""}):</span><span class="totals-row-value">-${sym}${d.discountAmount.toFixed(2)}</span></div>`
        : "";

    const ivaHtml =
      d.ivaEnabled && d.iva > 0
        ? `<div class="totals-row"><span class="totals-row-label">IVA (13%):</span><span class="totals-row-value">${sym}${d.iva.toFixed(2)}</span></div>`
        : "";

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tiquete Electrónico ${escHtml(d.invoiceNumber)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:8.5in;min-height:11in;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.5;color:#1e293b;background:#fff;font-size:11px;padding:0.5in;}
    .invoice-wrapper{max-width:7.5in;margin:0 auto;}
    .invoice-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0f172a;}
    .company-name{font-size:24px;font-weight:800;color:#0f172a;margin-bottom:4px;}
    .company-tagline{font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;}
    .invoice-title{font-size:28px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:-0.02em;margin-bottom:8px;}
    .invoice-meta{font-size:10px;color:#475569;text-align:right;}
    .invoice-meta-row{margin-bottom:4px;}
    .invoice-meta-label{font-weight:600;color:#0f172a;display:inline-block;min-width:70px;}
    .status-badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;}
    .status-paid{background:#dcfce7;color:#166534;border:1px solid #86efac;}
    .status-pending{background:#fef3c7;color:#a16207;border:1px solid #fde047;}
    .status-overdue{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;}
    .info-box{background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #e2e8f0;margin-bottom:16px;}
    .info-box-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #cbd5e1;display:flex;align-items:center;justify-content:space-between;}
    .info-box-content{font-size:10px;color:#475569;line-height:1.6;}
    .info-box-content strong{color:#0f172a;font-weight:600;}
    .items-table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;}
    .items-table thead{background:#0f172a;color:#fff;}
    .items-table th{padding:10px 12px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;}
    .items-table th:last-child{text-align:right;}
    .items-table td{padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;}
    .items-table td:last-child{text-align:right;font-weight:700;color:#0f172a;}
    .item-name{font-weight:600;color:#0f172a;margin-bottom:2px;}
    .item-desc{color:#64748b;font-size:9px;}
    .totals-section{display:flex;justify-content:flex-end;margin-bottom:16px;}
    .totals-box{width:240px;}
    .totals-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:10px;}
    .totals-row-label{font-weight:600;color:#475569;}
    .totals-row-value{font-weight:700;color:#0f172a;}
    .totals-total{display:flex;justify-content:space-between;background:#0f172a;color:#fff;padding:12px;border-radius:6px;font-size:14px;font-weight:800;margin-top:8px;}
    .notes-box{background:#fff7ed;border:1px solid #fed7aa;padding:10px;border-radius:6px;margin-bottom:10px;}
    .notes-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#7c2d12;margin-bottom:4px;}
    .notes-content{font-size:9px;color:#9a3412;line-height:1.5;}
    .comprobante-box{background:#fef2f2;border:1px solid #ef4444;padding:10px;border-radius:6px;margin-bottom:10px;}
    .comprobante-content{font-size:9px;color:#991b1b;line-height:1.5;}
    .invoice-footer{text-align:center;padding-top:12px;border-top:1px solid #e2e8f0;margin-top:16px;}
    .footer-thanks{font-size:11px;font-weight:600;color:#0f172a;margin-bottom:4px;}
    .footer-company{font-size:9px;color:#64748b;}
    .footer-legal{font-size:8px;color:#94a3b8;margin-top:8px;font-style:italic;}
    .permit-badge{display:inline-block;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;border-radius:9999px;font-size:8px;font-weight:700;padding:1px 6px;text-transform:uppercase;letter-spacing:0.05em;vertical-align:middle;margin-left:4px;}
    .permit-notice{background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:10px 12px;border-radius:6px;margin-bottom:14px;}
    .permit-notice-title{font-size:10px;font-weight:700;color:#c2410c;margin-bottom:4px;}
    .permit-notice-content{font-size:9px;color:#9a3412;line-height:1.5;}
    @media print{
      body{padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
      .items-table thead,.totals-total{background-color:#0f172a !important;-webkit-print-color-adjust:exact !important;}
      .info-box,.notes-box,.comprobante-box,.status-badge{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
    }
    @page{size:letter;margin:0.5in;}
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="invoice-header">
      <div>
        <div style="margin-bottom:12px;">
          <img src="/logo-inv.png" alt="SmartLogistics" style="height:48px;width:auto;object-fit:contain;" loading="eager" decoding="async" />
        </div>
      </div>
      <div style="text-align:right;">
        <div class="invoice-title">TIQUETE ELECTRÓNICO</div>
        ${consolidationBadgeHtml}
        ${maritimeBadgeHtml}
        <div class="invoice-meta">
          <div class="invoice-meta-row"><span class="invoice-meta-label">N° Recibo:</span> <span style="font-family:monospace;">${escHtml(d.invoiceNumber)}</span></div>
          <div class="invoice-meta-row"><span class="invoice-meta-label">Fecha:</span> ${today}</div>
          <div class="invoice-meta-row"><span class="invoice-meta-label">Pago:</span> DE CONTADO</div>
          <div class="invoice-meta-row"><span class="invoice-meta-label">Estado:</span> <span class="status-badge status-${d.status === "paid" ? "paid" : d.status === "overdue" ? "overdue" : "pending"}">${d.status === "paid" ? "Pagado" : d.status === "overdue" ? "Vencido" : "Pendiente"}</span></div>
        </div>
      </div>
    </div>

    <div class="info-box">
      <div class="info-box-title">Información del Cliente</div>
      <div class="info-box-content" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <p><strong>Nombre:</strong> ${escHtml(d.clientName)}</p>
        <p><strong>Email:</strong> ${escHtml(d.clientEmail)}</p>
        <p><strong>SmartId:</strong> ${escHtml(d.slCode)}</p>
        <p><strong>Ruta:</strong> ${escHtml(d.clientRoute)}</p>
      </div>
    </div>

    ${hasPermits ? `<div class="permit-notice"><div class="permit-notice-title">&#9888; Este envío incluye paquetes con permisos de importación</div><div class="permit-notice-content">Uno o más paquetes requieren trámite especial en aduana. SmartLogistics le informará sobre el proceso y costos adicionales antes de proceder con la entrega.</div></div>` : ""}
    <table class="items-table">
      <thead>
        <tr>
          <th>Descripción</th>
          <th style="text-align:center;">${d.source === "maritime" ? "Volumen" : "Peso"}</th>
          <th>Precio</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="totals-row"><span class="totals-row-label">Subtotal:</span><span class="totals-row-value">${sym}${d.subtotal.toFixed(2)}</span></div>
        ${discountHtml}
        ${ivaHtml}
        <div class="totals-total"><span>TOTAL:</span><span>${sym}${d.total.toFixed(2)}</span></div>
        ${tcHtml}
      </div>
    </div>

    <div class="info-box">
      <div class="info-box-title">
        <span>
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-top:-2px;"><rect x="2" y="22" width="20" height="2"/><path d="M4 22V10h16v12"/><path d="m12 2-8 6h16z"/><path d="M12 10v12"/><path d="M8 14v4"/><path d="M16 14v4"/></svg>
          Información de Pago
        </span>
      </div>
      <div class="info-box-content">
        <strong>DA SMART LOGISTICS</strong><br/>
        Ced. Jur. 3102843818<br/><br/>
        <strong>BAC Colones:</strong> CR17010200009534930951<br/>
        <strong>BAC Dólares:</strong> CR75010200009534930877<br/>
        <strong>SINPE Móvil:</strong> 7105-7790
      </div>
    </div>

    <div class="notes-box">
      <div class="notes-title">
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-top:-2px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Condiciones de Servicio
      </div>
      <div class="notes-content">
        • En caso de consolidación se otorgan dos semanas o bien 10 paquetes máximo, acorde a los términos y condiciones de la página.<br/>
        • En Caso de no ser recibido el paquete en ruta podria devengar costos de bodegaje ver terminos y condiciones.<br/>
        • En caso de encomienda, los envíos se realizan con el corte de las 4PM del día en que se envía la factura; posterior a eso, todo lo que se cancela se asigna a la próxima ruta hábil.<br/>
        • Los paquetes con permiso de importación <strong>no se consolidan</strong> y se facturan de forma individual.<br/><br/>
        <strong>Métodos aceptados:</strong> Transferencia bancaria, SINPE Móvil o Efectivo.<br/><br/>
        Para más detalles sobre términos y condiciones ingresa a nuestra página web: <a href="https://www.smartlogisticscr.com/terms" target="_blank" rel="noopener noreferrer" style="color:#92400e;font-weight:700;">www.smartlogisticscr.com/terms</a>
      </div>
    </div>

    <div class="comprobante-box">
      <div class="comprobante-content">
        <strong>
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-top:-2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Comparta su comprobante:
        </strong> Es importante que comparta su comprobante de pago para confirmación ya sea en el WhatsApp de ruta de entrega o el WhatsApp de facturación <strong>7105-7790</strong>
      </div>
    </div>

    <div class="invoice-footer">
      <div class="footer-thanks">¡Gracias por confiar en SmartLogistics!</div>
      <div class="footer-company">SmartLogistics Premium Courier Service | Miami, FL | San José, Costa Rica</div>
      <div class="footer-company">www.smartlogisticscr.com | info@smartlogisticscr.com</div>
      <div class="footer-legal">Este documento fue generado electrónicamente y es válido sin firma física.</div>
      <div class="footer-legal">Este documento no es una factura digital, ni es válida para efectos tributarios.</div>
    </div>
  </div>
</body>
</html>`);
    win.document.close();
    setTimeout(() => {
      win.print();
      win.close();
    }, 250);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={
          inline
            ? "contents"
            : "fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-2 sm:p-4"
        }
        onClick={(e) => {
          if (!inline && e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2 }}
          className={
            inline
              ? "bg-background rounded-2xl border border-border overflow-hidden"
              : "w-full max-w-[98vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[92vh]"
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {d.invoiceNumber}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-accent transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir
              </button>
              {!inline && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Confirm-send footer — only shown when onConfirmSend is provided */}
          {!inline && onConfirmSend && (
            <div className="px-5 py-3 border-b border-border bg-red-50 dark:bg-red-950/20 flex items-center justify-between gap-3">
              <div className="text-xs text-red-700 dark:text-red-400 font-medium">
                {sendDone ? (
                  "✓ Recibo enviado exitosamente"
                ) : d.clientEmail ? (
                  <>
                    Enviar recibo a{" "}
                    <span className="font-mono font-semibold">
                      {d.clientEmail}
                    </span>
                  </>
                ) : (
                  "Sin email — no se puede enviar"
                )}
              </div>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={isSending || sendDone || !d.clientEmail}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isSending ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isSending
                  ? "Enviando…"
                  : sendDone
                    ? "Enviado"
                    : "Confirmar y enviar"}
              </button>
            </div>
          )}

          {/* Test-send row — amber; only when both onTestSend and onConfirmSend are provided */}
          {!inline && onTestSend && onConfirmSend && !sendDone && (
            <div
              role="region"
              aria-label="Envío de prueba"
              className="px-5 py-2.5 border-b border-border bg-amber-50 dark:bg-amber-950/20"
            >
              {showTestConfirm ? (
                <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      ¿Confirmar envío de prueba?
                    </p>
                    <p className="text-[10px] text-amber-600/80 dark:text-amber-500/70 mt-0.5">
                      Se enviará <strong>únicamente</strong> a{" "}
                      <span className="font-mono font-bold">{testEmail}</span>.{" "}
                      No se enviará al cliente real.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowTestConfirm(false)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleTestSend}
                      disabled={isTestSending}
                      aria-busy={isTestSending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isTestSending ? (
                        <Loader2
                          className="h-3 w-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Send className="h-3 w-3" aria-hidden="true" />
                      )}
                      {isTestSending ? "Enviando…" : "Confirmar envío"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <FlaskConical
                    className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium shrink-0">
                    Enviar a otro correo:
                  </span>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && testEmail.trim())
                        setShowTestConfirm(true);
                    }}
                    placeholder="correo@prueba.com"
                    aria-label="Correo de prueba"
                    className="flex-1 min-w-[160px] text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-950/30 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-shadow"
                  />
                  {testSendDone ? (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                      ✓ Enviado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (testEmail.trim()) setShowTestConfirm(true);
                      }}
                      disabled={!testEmail.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      <FlaskConical className="h-3 w-3" aria-hidden="true" />
                      Enviar prueba
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Scrollable invoice body */}
          <div
            className={`${inline ? "" : "flex-1 "}overflow-y-auto bg-[#f1f5f9] p-2 sm:p-4`}
          >
            <div className="overflow-x-auto">
              <div
                id="nova-invoice-print-area"
                className="min-w-[320px] max-w-[600px] mx-auto bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200"
                style={{
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
              >
                {/* ── Header ── */}
                <div
                  style={{
                    padding: "20px 16px 16px",
                    borderBottom: "2px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    {/* Left: logo + brand */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 6,
                      }}
                    >
                      <img
                        src="/logo-inv.png"
                        alt="SmartLogistics"
                        style={{
                          width: 180,
                          height: "auto",
                          display: "block",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                    {/* Right: receipt metadata */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: -0.5,
                          marginBottom: d.isConsolidation ? 4 : 10,
                        }}
                      >
                        TIQUETE ELECTRÓNICO
                      </div>
                      {d.isConsolidation && (
                        <div style={{ textAlign: "right", marginBottom: 10 }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: "#0f172a",
                              color: "#fff",
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "3px 10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            Consolidación Aplicada
                          </span>
                        </div>
                      )}
                      {d.source === "maritime" && (
                        <div style={{ textAlign: "right", marginBottom: 10 }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: "#e0f2fe",
                              color: "#0284c7",
                              border: "1px solid #bae6fd",
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "3px 10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}
                          >
                            Carga Marítima
                          </span>
                        </div>
                      )}
                      <table style={{ marginLeft: "auto" }}>
                        <tbody>
                          {[
                            ["N° Recibo:", d.invoiceNumber],
                            ["Fecha:", today],
                            ["Pago:", "DE CONTADO"],
                          ].map(([label, value]) => (
                            <tr key={label}>
                              <td
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  paddingRight: 10,
                                  paddingBottom: 2,
                                  textAlign: "left",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {label}
                              </td>
                              <td
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: "#0f172a",
                                  paddingBottom: 2,
                                  fontFamily: "ui-monospace,monospace",
                                  textAlign: "right",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {value}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                paddingRight: 10,
                                textAlign: "left",
                              }}
                            >
                              Estado:
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  backgroundColor:
                                    d.status === "paid"
                                      ? "#dcfce7"
                                      : d.status === "overdue"
                                        ? "#fee2e2"
                                        : "#fef3c7",
                                  color:
                                    d.status === "paid"
                                      ? "#166534"
                                      : d.status === "overdue"
                                        ? "#991b1b"
                                        : "#92400e",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  textTransform: "uppercase",
                                }}
                              >
                                {d.status === "paid"
                                  ? "Pagado"
                                  : d.status === "overdue"
                                    ? "Vencido"
                                    : "Pendiente"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ── Client info ── */}
                <div style={{ padding: "16px 16px 0" }}>
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 12,
                      }}
                    >
                      Información del Cliente
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {[
                        ["Nombre:", d.clientName],
                        ["Email:", d.clientEmail],
                        ["SmartId:", d.slCode],
                        ["Ruta:", d.clientRoute],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#0f172a",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Permit notice ── */}
                {d.items.some((i) => i.requiresPermit) && (
                  <div
                    style={{
                      margin: "12px 16px 12px",
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderLeft: "4px solid #f97316",
                      borderRadius: 6,
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#c2410c",
                        marginBottom: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <AlertTriangle style={{ width: 14, height: 14 }} className="text-orange-600 shrink-0" />
                      <span>Este envío incluye paquetes con permisos de importación</span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#9a3412",
                        lineHeight: 1.5,
                      }}
                    >
                      Uno o más paquetes requieren trámite especial en aduana.
                      SmartLogistics le informará sobre el proceso y costos
                      adicionales antes de proceder con la entrega.
                    </div>
                  </div>
                )}

                {/* ── Items table ── */}
                <div style={{ padding: "16px 16px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th
                          style={{
                            background: "#0f172a",
                            color: "#fff",
                            padding: "10px 12px",
                            textAlign: "left",
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontWeight: 700,
                            borderRadius: "6px 0 0 0",
                          }}
                        >
                          Descripción
                        </th>
                        <th
                          style={{
                            background: "#0f172a",
                            color: "#fff",
                            padding: "10px 12px",
                            textAlign: "center",
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontWeight: 700,
                          }}
                        >
                          {d.source === "maritime" ? "Volumen" : "Peso"}
                        </th>
                        <th
                          style={{
                            background: "#0f172a",
                            color: "#fff",
                            padding: "10px 12px",
                            textAlign: "right",
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontWeight: 700,
                            borderRadius: "0 6px 0 0",
                          }}
                        >
                          Precio
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((item, i) => (
                        <tr key={i}>
                          <td
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid #e2e8f0",
                              verticalAlign: "top",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#0f172a",
                                marginBottom: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              Servicios Logísticos
                              {item.requiresPermit && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    background: "#fff7ed",
                                    border: "1px solid #fed7aa",
                                    color: "#c2410c",
                                    borderRadius: 9999,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "1px 6px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                  }}
                                >
                                  <AlertTriangle style={{ width: 10, height: 10 }} className="text-orange-600 shrink-0" />
                                  PERMISOS
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                fontFamily: "ui-monospace,monospace",
                              }}
                            >
                              {formatInvoiceItemCaption(item, {
                                source: d.source,
                              })}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid #e2e8f0",
                              textAlign: "center",
                              fontSize: 12,
                              color: "#475569",
                            }}
                          >
                            {item.weight || item.realWeight
                              ? `${Number(item.realWeight ?? item.weight).toFixed(2)} ${d.source === "maritime" ? "FT³" : "kg"}`
                              : "\u2014"}
                          </td>
                          <td
                            style={{
                              padding: "10px 12px",
                              borderBottom: "1px solid #e2e8f0",
                              textAlign: "right",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#0f172a",
                            }}
                          >
                            {sym}
                            {item.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Totals ── */}
                <div
                  style={{
                    padding: "0 16px 16px",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <div style={{ width: 240 }}>
                    <div
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        Subtotal:
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        {sym}
                        {d.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {d.discountAmount > 0 && (
                      <div
                        style={{
                          padding: "8px 0",
                          borderBottom: "1px solid #e2e8f0",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#dc2626",
                          }}
                        >
                          Descuento
                          {d.discountPercentage > 0
                            ? ` (${d.discountPercentage.toFixed(1)}%)`
                            : ""}
                          :
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#dc2626",
                          }}
                        >
                          -{sym}
                          {d.discountAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {d.ivaEnabled && d.iva > 0 && (
                      <div
                        style={{
                          padding: "8px 0",
                          borderBottom: "1px solid #e2e8f0",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#475569",
                          }}
                        >
                          IVA (13%):
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#0f172a",
                          }}
                        >
                          {sym}
                          {d.iva.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div style={{ paddingTop: 8 }}>
                      <div
                        style={{
                          background: "#0f172a",
                          borderRadius: 6,
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#fff",
                          }}
                        >
                          TOTAL:
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#fff",
                          }}
                        >
                          {sym}
                          {d.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {d.exchangeRate > 0 && (
                      <>
                        <div
                          style={{
                            padding: "6px 0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#475569",
                            }}
                          >
                            TC:
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#475569",
                              fontFamily: "ui-monospace,monospace",
                            }}
                          >
                            {d.exchangeRate.toFixed(2)}
                          </span>
                        </div>
                        <div
                          style={{
                            padding: "6px 0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#1e293b",
                            }}
                          >
                            Total CRC:
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: "#1e293b",
                              fontFamily: "ui-monospace,monospace",
                            }}
                          >
                            ₡{Math.round(d.totalCRC).toLocaleString("es-CR")}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Payment info ── */}
                <div style={{ padding: "0 16px 14px" }}>
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Building2 style={{ width: 12, height: 12 }} className="text-slate-500 shrink-0" />
                      <span>Información de Pago</span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#0f172a",
                        marginBottom: 4,
                      }}
                    >
                      DA SMART LOGISTICS
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#475569",
                        marginBottom: 8,
                      }}
                    >
                      Ced. Jur. 3102843818
                    </div>
                    {[
                      ["BAC Colones:", "CR17010200009534930951"],
                      ["BAC Dólares:", "CR75010200009534930877"],
                      ["SINPE Móvil:", "7105-7790"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          fontSize: 11,
                          color: "#475569",
                          marginBottom: 2,
                        }}
                      >
                        <strong>{label}</strong> {value}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Payment terms ── */}
                <div style={{ padding: "0 16px 14px" }}>
                  <div
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #f59e0b",
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#92400e",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <AlertTriangle style={{ width: 12, height: 12 }} className="text-amber-600 shrink-0" />
                      <span>Condiciones de Servicio</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#78350f",
                        lineHeight: 1.6,
                      }}
                    >
                      • En caso de consolidación se otorgan dos semanas o bien
                      10 paquetes máximo, acorde a los términos y condiciones de
                      la página.
                      <br />
                      • En Caso de no ser recibido el paquete en ruta podria devengar costos de bodegaje ver terminos y condiciones.
                      <br />
                      • En caso de encomienda, los envíos se realizan con el
                      corte de las 4PM del día en que se envía la factura;
                      posterior a eso, todo lo que se cancela se asigna a la
                      próxima ruta hábil.
                      <br />• Los paquetes con permiso de importación{" "}
                      <strong>no se consolidan</strong> y se facturan de forma
                      individual.
                      <br />
                      <br />
                      <strong>Métodos aceptados:</strong> Transferencia
                      bancaria, SINPE Móvil o Efectivo.
                      <br />
                      <br />
                      Para más detalles sobre términos y condiciones ingresa a
                      nuestra página web:{" "}
                      <a
                        href="https://www.smartlogisticscr.com/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#92400e", fontWeight: 700 }}
                      >
                        www.smartlogisticscr.com/terms
                      </a>
                    </div>
                  </div>
                </div>

                {/* ── Comprobante notice ── */}
                <div style={{ padding: "0 16px 14px" }}>
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #ef4444",
                      borderRadius: 8,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#991b1b",
                        lineHeight: 1.5,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                      }}
                    >
                      <Info style={{ width: 14, height: 14 }} className="text-red-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Comparta su comprobante:</strong> Es importante
                        que comparta su comprobante de pago para confirmación ya
                        sea en el WhatsApp de ruta de entrega o el WhatsApp de
                        facturación <strong>7105-7790</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Footer ── */}
                <div
                  style={{
                    padding: "16px",
                    background: "#f8fafc",
                    borderTop: "2px solid #e2e8f0",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f172a",
                      marginBottom: 6,
                    }}
                  >
                    ¡Gracias por confiar en SmartLogistics!
                  </div>
                  <div
                    style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}
                  >
                    SmartLogistics Premium Courier Service | Miami, FL | San
                    José, Costa Rica
                  </div>
                  <div
                    style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}
                  >
                    www.smartlogisticscr.com | info@smartlogisticscr.com
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#94a3b8",
                      fontStyle: "italic",
                      marginBottom: 2,
                    }}
                  >
                    Este documento fue generado electrónicamente y es válido sin
                    firma física.
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#94a3b8",
                      fontStyle: "italic",
                    }}
                  >
                    Este documento no es una factura digital, ni es válida para
                    efectos tributarios.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

NovaInvoicePreview.displayName = "NovaInvoicePreview";
