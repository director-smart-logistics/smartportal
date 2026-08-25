import React, { memo, useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Printer,
  Send,
  Loader2,
  Plus,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { CalculatedSeaManifestRow } from "./useSpreadsheetCalculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";

export interface SeaManifestInvoicePreviewProps {
  row: CalculatedSeaManifestRow;
  siblingRows?: CalculatedSeaManifestRow[];
  exchangeRate: number;
  onClose?: () => void;
  onConfirmSend?: (data: any, testEmail?: string) => Promise<void>;
  onSaveDraft?: (data: any) => Promise<void>;
  inline?: boolean;
  readOnly?: boolean;
  invoiceNumber?: string;
  manifestName?: string;
}

import { parseInvoiceCreationDate } from "@/components/nova/NovaInvoicePreview";

function fmt(iso?: any, fallbackInvoiceNum?: string) {
  if (typeof iso === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(iso.trim())) {
    return iso.trim();
  }
  const d = parseInvoiceCreationDate(iso, fallbackInvoiceNum);
  return d.toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" });
}

export const SeaManifestInvoicePreview = memo(
  function SeaManifestInvoicePreview({
    row,
    siblingRows,
    exchangeRate,
    onClose = () => {},
    onConfirmSend,
    onSaveDraft,
    inline = false,
    readOnly = false,
    invoiceNumber: propInvoiceNumber,
    manifestName,
  }: SeaManifestInvoicePreviewProps) {
    const { t } = useTranslation("manifests");
    const [bodegajeCost, setBodegajeCost] = useState<number>(() => {
      if (siblingRows && siblingRows.length > 0) {
        return siblingRows.reduce((sum, r) => sum + (r.bodegajeCost || 0), 0);
      }
      return row.bodegajeCost || 0;
    });
    const [permisoCost, setPermisoCost] = useState<number>(() => {
      if (siblingRows && siblingRows.length > 0) {
        return siblingRows.reduce((sum, r) => sum + (r.permisoCost || 0), 0);
      }
      return row.permisoCost || 0;
    });
    const [ivaEnabled, setIvaEnabled] = useState<boolean>(() => {
      if (siblingRows && siblingRows.length > 0) {
        return siblingRows.some((r) => r.ivaEnabled);
      }
      return row.ivaEnabled || false;
    });
    const [isSending, setIsSending] = useState(false);
    const [sendDone, setSendDone] = useState(false);
    const [testEmail, setTestEmail] = useState("");
    const [isTestingEmail, setIsTestingEmail] = useState(false);
    const [packages, setPackages] = useState<any[]>([]);

    // Fetch real packages from manifest
    useEffect(() => {
      if (!manifestName || manifestName === "NEW" || !row.slCode) return;
      const q = query(
        collection(db, "packages"),
        where("manifestNumber", "==", manifestName),
        where("slCode", "==", row.slCode),
      );
      getDocs(q)
        .then((snap) => {
          const pkgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setPackages(pkgs);
        })
        .catch((err) =>
          console.error("Error fetching packages for preview:", err),
        );
    }, [manifestName, row.slCode]);

    // Derived Calculations
    const basePrice = useMemo(() => {
      if (siblingRows && siblingRows.length > 0) {
        return siblingRows.reduce((sum, r) => sum + (r.price || 0), 0);
      }
      return row.price || 0;
    }, [row.price, siblingRows]);
    const subtotal = basePrice + bodegajeCost + permisoCost;
    const tax = ivaEnabled ? subtotal * 0.13 : 0;
    const total = subtotal + tax;
    const totalCRC = total * exchangeRate;

    const invoiceNumber =
      propInvoiceNumber || (siblingRows && siblingRows.length > 1
        ? `PREV-${row.slCode || "####"}-C`
        : `PREV-${row.warehouseId || "####"}`);
    const today = fmt(new Date().toISOString());
    const sym = "$";

    const clientName = row.customerName || "Cliente No Identificado";
    const slCode = row.slCode || "---";
    const clientRoute = row.ruta || "---";

    const [clientEmail, setClientEmail] = useState(row.customerEmail || "");

    useEffect(() => {
      if (row.customerEmail) {
        setClientEmail(row.customerEmail);
        return;
      }
      if (row.slCode && row.slCode !== "---") {
        const q = query(
          collection(db, "customers"),
          where("slCode", "==", row.slCode),
        );
        getDocs(q)
          .then((snap) => {
            if (!snap.empty) {
              setClientEmail(snap.docs[0].data().email || "No registrado");
            } else {
              setClientEmail("No registrado");
            }
          })
          .catch((err) => {
            console.error("Error fetching customer email:", err);
            setClientEmail("No registrado");
          });
      } else {
        setClientEmail("No registrado");
      }
    }, [row.customerEmail, row.slCode]);

    const displayEmail = clientEmail || "Cargando...";

    const handleConfirmSend = async () => {
      if (!onConfirmSend || isSending) return;
      setIsSending(true);
      try {
        await onConfirmSend({
          row: {
            ...row,
            customerEmail: clientEmail === "No registrado" ? "" : clientEmail,
          },
          bodegajeCost,
          permisoCost,
          subtotal,
          tax,
          total,
          totalCRC,
          ivaEnabled,
          invoiceNumber,
        });
        setSendDone(true);
        setTimeout(onClose, 1500);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSending(false);
      }
    };

    const handleTestEmail = async () => {
      if (!onConfirmSend || isTestingEmail || !testEmail.trim()) return;
      setIsTestingEmail(true);
      try {
        await onConfirmSend(
          {
            row,
            bodegajeCost,
            permisoCost,
            subtotal,
            tax,
            total,
            totalCRC,
            ivaEnabled,
            invoiceNumber,
          },
          testEmail.trim(),
        );
        setTestEmail("");
      } catch (err) {
        console.error(err);
      } finally {
        setIsTestingEmail(false);
      }
    };

    const handleSaveDraft = async () => {
      if (!onSaveDraft || isSending) return;
      setIsSending(true);
      try {
        await onSaveDraft({
          row: {
            ...row,
            customerEmail: clientEmail === "No registrado" ? "" : clientEmail,
          },
          bodegajeCost,
          permisoCost,
          subtotal,
          tax,
          total,
          totalCRC,
          ivaEnabled,
          invoiceNumber,
        });
        setSendDone(true);
        setTimeout(onClose, 1000);
      } catch (err) {
        console.error(err);
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

      let itemsHtml = "";

      if (siblingRows && siblingRows.length > 0) {
        itemsHtml = siblingRows
          .map(
            (r) => {
              const mult = parseFloat(r.multiplier || "1") || 1;
              const suffix = mult > 1 ? `X${mult}` : "";
              return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:2px;">Servicios Logísticos Marítimo</div>
            <div style="color:#64748b;font-size:9px;">Trk: ${escHtml(r.warehouseId + suffix)} / Dim: ${r.length}x${r.width}x${r.height}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;">
            ${r.roundedVolume ? r.roundedVolume + " FT³" : "—"}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">
            ${sym}${Number(r.price || 0).toFixed(2)}
          </td>
        </tr>
      `;
            }
          )
          .join("");
      } else if (packages.length > 0) {
        itemsHtml = packages
          .map(
            (pkg) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:2px;">Servicios Logísticos Marítimo</div>
            <div style="color:#64748b;font-size:9px;">Trk: ${escHtml(pkg.trackingNumber)} / ${escHtml(pkg.description)}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;">
            ${pkg.weight ? pkg.weight + " FT³" : "—"}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">
            ${sym}${Number(pkg.cost || pkg.calculatedCost || 0).toFixed(2)}
          </td>
        </tr>
      `,
          )
          .join("");
      } else {
        const multiplierNum = parseFloat(row.multiplier || "1") || 1;
        const descSuffix = multiplierNum > 1 ? `X${multiplierNum}` : "";
        itemsHtml = `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:600;color:#0f172a;margin-bottom:2px;">Servicios Logísticos Marítimo</div>
            <div style="color:#64748b;font-size:9px;">Trk: ${escHtml(row.warehouseId + descSuffix)} / Dim: ${row.length}x${row.width}x${row.height}</div>
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:10px;">
            ${row.roundedVolume ? row.roundedVolume + " FT³" : "—"}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">
            ${sym}${basePrice.toFixed(2)}
          </td>
        </tr>
      `;
      }

      if (bodegajeCost > 0) {
        itemsHtml += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <div style="font-weight:600;color:#0f172a;">Bodegaje</div>
        </td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">—</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">
          ${sym}${bodegajeCost.toFixed(2)}
        </td>
      </tr>`;
      }

      if (permisoCost > 0) {
        itemsHtml += `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <div style="font-weight:600;color:#0f172a;">Permisos / Trámites</div>
        </td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">—</td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">
          ${sym}${permisoCost.toFixed(2)}
        </td>
      </tr>`;
      }

      const tcHtml =
        exchangeRate > 0
          ? `
      <div style="margin-top:12px;text-align:right;">
        <p style="font-size:13px;color:#475569;margin:0;font-weight:500;">TC: <span style="font-family:monospace;font-weight:700;">${exchangeRate.toFixed(2)}</span></p>
        <p style="font-size:16px;font-weight:700;color:#1e293b;margin:4px 0 0 0;">Total CRC: <span style="font-family:monospace;">₡${Math.round(totalCRC).toLocaleString("es-CR")}</span></p>
      </div>`
          : "";

      const ivaHtml =
        ivaEnabled && tax > 0
          ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:10px;"><span style="font-weight:600;color:#475569;">IVA (13%):</span><span style="font-weight:700;color:#0f172a;">${sym}${tax.toFixed(2)}</span></div>`
          : "";

      win.document.open();
      win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tiquete Electrónico ${escHtml(invoiceNumber)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:8.5in;min-height:11in;margin:0 auto;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#1e293b;background:#fff;font-size:11px;padding:0.5in;}
    .invoice-wrapper{max-width:7.5in;margin:0 auto;}
    .invoice-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0f172a;}
    .invoice-title{font-size:28px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:-0.02em;margin-bottom:8px;}
    .items-table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;}
    .items-table thead{background:#0f172a;color:#fff;}
    .items-table th{padding:10px 12px;text-align:left;font-size:9px;text-transform:uppercase;}
    .items-table th:last-child{text-align:right;}
    .totals-section{display:flex;justify-content:flex-end;margin-bottom:16px;}
    .totals-box{width:240px;}
    .totals-total{display:flex;justify-content:space-between;background:#0f172a;color:#fff;padding:12px;border-radius:6px;font-size:14px;font-weight:800;margin-top:8px;}
    @media print{
      body{padding:0;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
      .items-table thead,.totals-total{background-color:#0f172a !important;-webkit-print-color-adjust:exact !important;}
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    <div class="invoice-header">
      <div>
        <div style="margin-bottom:12px;">
          <img src="/logo-inv.png" alt="SmartLogistics" style="height:48px;object-fit:contain;" />
        </div>
      </div>
      <div style="text-align:right;">
        <div class="invoice-title">TIQUETE ELECTRÓNICO</div>
        <table style="margin-left:auto;">
          <tbody>
            <tr><td style="padding-right:10px;">N° Recibo:</td><td><strong>${escHtml(invoiceNumber)}</strong></td></tr>
            <tr><td style="padding-right:10px;">Fecha:</td><td><strong>${today}</strong></td></tr>
            <tr><td style="padding-right:10px;">Pago:</td><td><strong>DE CONTADO</strong></td></tr>
            <tr><td style="padding-right:10px;">Estado:</td><td><span style="background:#fef3c7;color:#a16207;padding:2px 6px;border-radius:4px;font-weight:700;">PENDIENTE</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="font-size:10px;font-weight:800;color:#64748b;margin-bottom:8px;">INFORMACIÓN DEL CLIENTE</div>
      <div style="display:flex;gap:40px;">
        <div>
          <div style="color:#64748b;">Nombre:</div><div style="font-weight:600;">${escHtml(clientName)}</div>
          <div style="color:#64748b;margin-top:6px;">SmartId:</div><div style="font-weight:600;">${escHtml(slCode)}</div>
        </div>
        <div>
          <div style="color:#64748b;">Ruta:</div><div style="font-weight:600;">${escHtml(clientRoute)}</div>
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Descripción</th>
          <th style="text-align:center;">Volumen</th>
          <th>Precio</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:10px;">
          <span style="font-weight:600;color:#475569;">Subtotal:</span>
          <span style="font-weight:700;color:#0f172a;">${sym}${subtotal.toFixed(2)}</span>
        </div>
        ${ivaHtml}
        <div class="totals-total">
          <span>TOTAL:</span>
          <span>${sym}${total.toFixed(2)}</span>
        </div>
        ${tcHtml}
      </div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
      win.document.close();
    };

    return (
      <div
        className={`${inline ? "h-full flex flex-col" : "fixed inset-0 z-[100] flex flex-col bg-slate-900/40 backdrop-blur-sm sm:p-6"}`}
      >
        <div
          className={`${inline ? "flex-1 rounded-xl border border-slate-200" : "mx-auto w-full max-w-4xl flex-1 rounded-2xl shadow-2xl"} bg-white overflow-hidden flex flex-col`}
        >
          {/* Header & Controls */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {t("spreadsheet.seaPreviewTitle", "Vista Previa - Marítimo")}
                </h2>
                <p className="text-xs text-muted-foreground">{invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!row.invoiceNumber && onSaveDraft && (
                <Button
                  onClick={handleSaveDraft}
                  disabled={isSending || sendDone}
                  variant="outline"
                  className="h-9 px-4 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border-amber-200 transition-colors"
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t("spreadsheet.saveDraft", "Guardar Temporal")}
                </Button>
              )}
              {onConfirmSend && (
                <Button
                  onClick={handleConfirmSend}
                  disabled={isSending || sendDone}
                  className="h-9 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {isSending
                    ? t("spreadsheet.sending", "Enviando…")
                    : sendDone
                      ? t("spreadsheet.sent", "Enviado")
                      : t("spreadsheet.generateAndSend", "Generar y Enviar")}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              {!inline && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-9 w-9"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {/* Dynamic Items Control */}
          {!readOnly && (
            <div className="px-5 py-4 border-b border-border bg-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  {t("spreadsheet.warehouseCost", "Cargo por Bodegaje ($)")}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bodegajeCost || ""}
                  onChange={(e) =>
                    setBodegajeCost(parseFloat(e.target.value) || 0)
                  }
                  className="h-8 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  {t("spreadsheet.permitCost", "Cargo por Permisos ($)")}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={permisoCost || ""}
                  onChange={(e) =>
                    setPermisoCost(parseFloat(e.target.value) || 0)
                  }
                  className="h-8 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-end pb-1">
                <Label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    id="ivaEnabled"
                    checked={ivaEnabled}
                    onChange={(e) => setIvaEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  {t("spreadsheet.applyIva", "Aplicar IVA (13%)")}
                </Label>
              </div>
            </div>
          )}

          {/* Test Email Section */}
          {onConfirmSend && (
            <div className="px-5 py-3 border-b border-border bg-slate-50 flex items-center justify-between gap-4">
              <Label className="text-xs text-muted-foreground">
                {t(
                  "spreadsheet.testEmailLabel",
                  "Prueba de correo electrónico:",
                )}
              </Label>
              <div className="flex-1 max-w-md flex items-center gap-2">
                {isTestingEmail ? (
                  <div className="flex items-center gap-2 w-full text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enviando prueba a {testEmail}...
                  </div>
                ) : (
                  <>
                    <Input
                      type="email"
                      placeholder={t(
                        "spreadsheet.testEmailPlaceholder",
                        "Correo para prueba...",
                      )}
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1 h-8 px-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && testEmail.trim()) {
                          handleTestEmail();
                        }
                      }}
                    />
                    <button
                      onClick={handleTestEmail}
                      disabled={!testEmail.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      <FlaskConical className="h-3 w-3" aria-hidden="true" />
                      Enviar prueba
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Invoice Preview Render */}
          <div className="flex-1 overflow-y-auto bg-[#f1f5f9] p-4">
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
                          marginBottom: 10,
                        }}
                      >
                        TIQUETE ELECTRÓNICO
                      </div>
                      <table style={{ marginLeft: "auto" }}>
                        <tbody>
                          {[
                            ["N° Recibo:", invoiceNumber],
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
                                  backgroundColor: "#fef3c7",
                                  color: "#92400e",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  textTransform: "uppercase",
                                }}
                              >
                                Pendiente
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
                        ["Nombre:", clientName],
                        ["Email:", clientEmail],
                        ["SmartId:", slCode],
                        ["Ruta:", clientRoute],
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
                          Volumen
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
                      {siblingRows && siblingRows.length > 0 ? (
                        siblingRows.map((r) => (
                          <tr key={r.id}>
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
                                Servicios Logísticos Marítimo
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  fontFamily: "ui-monospace,monospace",
                                }}
                              >
                                Trk: {r.warehouseId}
                                {(parseFloat(r.multiplier || "1") || 1) > 1
                                  ? `X${parseFloat(r.multiplier || "1") || 1}`
                                  : ""}{" "}
                                / Dim: {r.length}x{r.width}x{r.height}
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
                              {r.roundedVolume ? `${r.roundedVolume} FT³` : "\u2014"}
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
                              {Number(r.price || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : packages.length > 0 ? (
                        packages.map((pkg) => (
                          <tr key={pkg.id}>
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
                                Servicios Logísticos Marítimo
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  fontFamily: "ui-monospace,monospace",
                                }}
                              >
                                Trk: {pkg.trackingNumber} / {pkg.description}
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
                              {pkg.weight ? `${pkg.weight} FT³` : "\u2014"}
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
                              {Number(
                                pkg.cost || pkg.calculatedCost || 0,
                              ).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
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
                              Servicios Logísticos Marítimo
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                fontFamily: "ui-monospace,monospace",
                              }}
                            >
                              Trk: {row.warehouseId}
                              {(parseFloat(row.multiplier || "1") || 1) > 1
                                ? `X${parseFloat(row.multiplier || "1") || 1}`
                                : ""}{" "}
                              / Dim: {row.length}x{row.width}x{row.height}
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
                            {row.roundedVolume
                              ? `${row.roundedVolume} FT³`
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
                            {basePrice.toFixed(2)}
                          </td>
                        </tr>
                      )}
                      {bodegajeCost > 0 && (
                        <tr>
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
                              Bodegaje
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
                            —
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
                            {bodegajeCost.toFixed(2)}
                          </td>
                        </tr>
                      )}
                      {permisoCost > 0 && (
                        <tr>
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
                              Permisos / Trámites
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
                            —
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
                            {permisoCost.toFixed(2)}
                          </td>
                        </tr>
                      )}
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
                        {subtotal.toFixed(2)}
                      </span>
                    </div>
                    {ivaEnabled && tax > 0 && (
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
                          {tax.toFixed(2)}
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
                          {total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {exchangeRate > 0 && (
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
                            {exchangeRate.toFixed(2)}
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
                            ₡{Math.round(totalCRC).toLocaleString("es-CR")}
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
                      }}
                    >
                      🏦 Información de Pago
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
                      }}
                    >
                      ⚠️ Condiciones de Servicio
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
                      }}
                    >
                      <strong>ℹ️ Comparta su comprobante:</strong> Es importante
                      que comparta su comprobante de pago para confirmación ya
                      sea en el WhatsApp de ruta de entrega o el WhatsApp de
                      facturación <strong>7105-7790</strong>
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
        </div>
      </div>
    );
  },
);
