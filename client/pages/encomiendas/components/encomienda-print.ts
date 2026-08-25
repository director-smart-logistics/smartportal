/**
 * encomienda-print.ts
 *
 * Self-contained HTML builder for the Encomienda Dispatch "Boleta de Ruta".
 * Visual design matches buildRouteManifestHTML from nova-print.ts:
 *  - Dark #111 thead
 *  - Group-header rows (customer name, SL code, total, service badge)
 *  - Monospace tracking cell
 *  - Signature column + payment checkbox rowspan cell
 *
 * No React dependencies — safe to call from any callback or test.
 */

export interface EncomiendaBoleta {
  customerName: string;
  slCode: string;
  phone?: string;
  encomiendaService?: string;
  invoices: {
    invoiceNumber: string;
    status: string;
    totalAmount: number;
    currency: string;
    items: {
      trackingNumber?: string;
      description?: string;
      unitPrice?: number;
      totalPrice?: number;
    }[];
  }[];
}

function escHtml(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Maps an encomienda service name to a distinct background/foreground
 * color pair for the print badge. Matching is done case-insensitively
 * on keyword substrings so partial names still resolve correctly.
 */
function getServiceColor(service: string | undefined | null): { bg: string; fg: string } {
  if (!service) return { bg: '#f59e0b', fg: '#1a1a1a' };
  const s = service.toLowerCase();

  if (s.includes('pulmitan'))   return { bg: '#1d4ed8', fg: '#ffffff' }; // blue
  if (s.includes('transnica'))  return { bg: '#15803d', fg: '#ffffff' }; // green
  if (s.includes('tica'))       return { bg: '#7c3aed', fg: '#ffffff' }; // purple
  if (s.includes('tracopa'))    return { bg: '#be123c', fg: '#ffffff' }; // rose
  if (s.includes('mepe'))       return { bg: '#b45309', fg: '#ffffff' }; // amber-dark
  if (s.includes('alfaro'))     return { bg: '#0f766e', fg: '#ffffff' }; // teal
  if (s.includes('caribeños'))  return { bg: '#0369a1', fg: '#ffffff' }; // sky
  if (s.includes('costarica'))  return { bg: '#0d9488', fg: '#ffffff' }; // teal-alt
  if (s.includes('autotrans'))  return { bg: '#6d28d9', fg: '#ffffff' }; // violet
  if (s.includes('rapido'))     return { bg: '#c2410c', fg: '#ffffff' }; // orange

  // Default: amber (original)
  return { bg: '#f59e0b', fg: '#1a1a1a' };
}

/** Invoice status → inline badge colors matching nova-print palette */
function statusBadge(status: string): string {
  const map: Record<string, string> = {
    paid:      'background:#dcfce7!important;color:#166534!important;',
    draft:     'background:#f1f5f9!important;color:#64748b!important;',
    pending:   'background:#fef9c3!important;color:#854d0e!important;',
    sent:      'background:#e0f2fe!important;color:#075985!important;',
    overdue:   'background:#fee2e2!important;color:#991b1b!important;',
    cancelled: 'background:#f1f5f9!important;color:#9ca3af!important;',
  };
  const style = map[status?.toLowerCase()] ?? 'background:#f1f5f9!important;color:#64748b!important;';
  return `<span style="display:inline-block;font-size:5.5pt;font-weight:700;border-radius:3px;padding:1px 5px;${style}-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escHtml(status?.toUpperCase())}</span>`;
}

export function buildEncomiendaBoletaHTML(
  boletas: EncomiendaBoleta[],
  groupBy: 'customer' | 'service' | 'invoiceStatus' = 'customer'
): string {
  const printDate = new Date().toLocaleString('es-CR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const totalInvoices = boletas.reduce((s, b) => s + b.invoices.length, 0);

  // ── Group boletas based on active grouping mode ──────────────────────────
  let grouped: Array<{ label: string; items: EncomiendaBoleta[] }> = [];

  if (groupBy === 'service') {
    const map = new Map<string, EncomiendaBoleta[]>();
    for (const b of boletas) {
      const key = b.encomiendaService?.trim() || 'Sin servicio';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    grouped = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label: label.toUpperCase(), items }));
  } else if (groupBy === 'invoiceStatus') {
    const getDominantStatus = (b: EncomiendaBoleta): string => {
      const counts = new Map<string, number>();
      for (const inv of b.invoices) {
        const st = (inv.status || 'draft').toLowerCase();
        counts.set(st, (counts.get(st) || 0) + 1);
      }
      if (counts.size === 0) return 'draft';
      const order = ['paid', 'pending', 'sent', 'overdue', 'draft', 'cancelled', 'annulled'];
      for (const st of order) {
        if (counts.has(st)) return st;
      }
      return counts.keys().next().value ?? 'draft';
    };

    const map = new Map<string, EncomiendaBoleta[]>();
    for (const b of boletas) {
      const key = getDominantStatus(b);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    const order = ['paid', 'pending', 'sent', 'overdue', 'draft', 'cancelled', 'annulled'];
    const statusLabel: Record<string, string> = {
      paid:      'PAGADA',
      pending:   'PENDIENTE',
      sent:      'ENVIADA',
      overdue:   'VENCIDA',
      draft:     'BORRADOR',
      cancelled: 'CANCELADA',
      annulled:  'ANULADA',
    };
    grouped = order
      .filter(st => map.has(st))
      .map(st => ({ label: statusLabel[st] ?? st.toUpperCase(), items: map.get(st)! }));
  } else {
    grouped = [{ label: '', items: boletas }];
  }

  // ── Build tbody blocks grouped by active category ────────────────────────
  const bodiesHtml = grouped.map(group => {
    const groupDivider = group.label
      ? `
      <tbody>
        <tr class="print-group-divider">
          <td colspan="2" style="background:#111!important;color:#fff!important;font-size:9.5pt;font-weight:800;padding:6px 10px;text-align:center;text-transform:uppercase;letter-spacing:1px;border:1px solid #000;-webkit-print-color-adjust:exact;print-color-adjust:exact;page-break-after:avoid;">
            ${escHtml(group.label)} (${group.items.length})
          </td>
        </tr>
      </tbody>`
      : '';

    const itemsHtml = group.items.map(b => {
      // Collect ALL line items across all invoices for this customer
      const allItems: Array<{
        trackingNumber: string;
        invoiceNumber: string;
      }> = [];

      b.invoices.forEach(inv => {
        if (inv.items && inv.items.length > 0) {
          inv.items.forEach(it => {
            allItems.push({
              trackingNumber: it.trackingNumber || '',
              invoiceNumber: inv.invoiceNumber,
            });
          });
        } else {
          // Invoice with no items — still show the invoice row
          allItems.push({
            trackingNumber: '',
            invoiceNumber: inv.invoiceNumber,
          });
        }
      });

      const childRows = allItems.map((it, i) => `
        <tr class="child ${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="center small">${i + 1}</td>
          <td class="track-cell">${escHtml(it.trackingNumber) || '<span class="na">—</span>'}</td>
        </tr>`).join('');

      const slBadge = b.slCode
        ? `<span class="sl">${escHtml(b.slCode)}</span> `
        : '';
      const svcBadge = b.encomiendaService
        ? (() => {
            const { bg, fg } = getServiceColor(b.encomiendaService);
            return `<span style="display:inline-block;font-size:8pt;font-weight:800;border-radius:4px;padding:2px 8px;background:${bg}!important;color:${fg}!important;letter-spacing:.3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${escHtml(b.encomiendaService?.toUpperCase())}</span>`;
          })()
        : '';

      return `
        <tbody>
          <tr class="group-header">
            <td colspan="2" class="client-name">
              <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                <div>${slBadge}${escHtml(b.customerName?.toUpperCase())}&nbsp;&nbsp;${svcBadge}</div>
                <div class="paq-count" style="font-size:12pt;font-weight:900;color:#000;text-transform:uppercase;">${allItems.length}&nbsp;ÍTEM(S)</div>
              </div>
            </td>
          </tr>
          ${childRows}
        </tbody>`;
    }).join('');

    return groupDivider + itemsHtml;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Boleta de Ruta — Encomiendas</title>
  <style>
    @page { size: portrait; margin: 8mm 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #111; }

    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #111; padding-bottom: 3px; }
    header h1 { font-size: 10pt; font-weight: 700; }
    header p  { font-size: 6pt; color: #444; }

    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 1px; }
    col.num   { width: 8%;  }
    col.track { width: 92%; }

    thead th { background: #111 !important; color: #fff !important; font-size: 6pt; font-weight: 700; text-align: left; padding: 3px 4px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead th.center { text-align: center; }

    td { padding: 2px 4px; border: 1px solid #ddd; font-size: 6.5pt; vertical-align: middle; word-break: break-word; line-height: 1.2; min-height: 12px; }
    tr.even td { background: #ffffff; }
    tr.odd  td { background: #f9f9f9; }
    tr.child td { border-left: 3px solid #ccc; height: 32px; overflow: hidden; }

    tr.group-header td {
      background: #e8e8e8 !important; color: #111 !important;
      font-size: 9pt; font-weight: 700; padding: 5px 6px;
      border: 1px solid #bbb; border-top: 2px solid #555;
      height: 40px; overflow: hidden;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      page-break-inside: avoid;
    }

    .client-name  { font-size: 11pt; white-space: nowrap; }
    .sl           { font-family: 'Courier New', monospace; font-size: 8pt; background: rgba(0,0,0,.08); padding: 1px 4px; border-radius: 3px; margin-right: 4px; color: #333; }
    .svc-badge    { display: inline-block; font-size: 6pt; font-weight: 700; background: #f59e0b !important; color: #1a1a1a !important; padding: 1px 5px; border-radius: 3px; margin-right: 4px; vertical-align: middle; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .paq-count    { font-size: 6.5pt; font-weight: 500; color: #555; }

    .track-cell   { font-family: 'Courier New', monospace; font-size: 9pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 3px 4px; }

    .small { font-size: 6pt; }
    .center { text-align: center; }
    .na { color: #999; font-style: italic; }

    /* Summary bar */
    .summary-bar { display: flex; gap: 20px; padding: 4px 0; margin-bottom: 6px; font-size: 7.5pt; border-bottom: 1px solid #ccc; }
    .summary-bar strong { color: #1a4fa8; }

    footer { margin-top: 5px; font-size: 5.5pt; color: #666; display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 3px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Boleta de Ruta — Encomiendas</h1>
      <p>Impreso: ${printDate}</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:7pt;">Clientes: <strong>${boletas.length}</strong> &nbsp;·&nbsp; Facturas: <strong>${totalInvoices}</strong></p>
    </div>
  </header>

  <table>
    <colgroup>
      <col class="num"/><col class="track"/>
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Tracking</th>
      </tr>
    </thead>
    ${bodiesHtml}
  </table>

  <footer>
    <span>SmartLogistics &mdash; Boleta de Ruta de Encomiendas</span>
    <span>Impreso: ${printDate}</span>
  </footer>
</body>
</html>`;
}

/** Opens a print window with the boleta HTML */
export function printEncomiendaBoleta(
  boletas: EncomiendaBoleta[],
  groupBy: 'customer' | 'service' | 'invoiceStatus' = 'customer'
): void {
  const html = buildEncomiendaBoletaHTML(boletas, groupBy);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Por favor permite popups para imprimir.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
