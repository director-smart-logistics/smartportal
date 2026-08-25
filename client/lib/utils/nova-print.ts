/**
 * nova-print.ts
 *
 * Pure HTML string builders for Nova print features.
 * No React dependencies — safe to call from any useCallback or test.
 *
 * Exports:
 *  - buildBoletaHTML        — Warehouse verification boleta (landscape)
 *  - buildRouteManifestHTML — Per-route delivery manifest (portrait)
 *  - RouteManifestRow       — Row shape expected by buildRouteManifestHTML
 */
import { formatCostaRicaDate, formatCostaRicaDateTime } from './date-utils';

const ENABLE_GOOGLE_MAPS = false;

/** Portable CSS identifier escape (safe in browser + Node/Vitest; avoids CSS.escape browser-only API) */
function escapeCssId(s: string): string {
  return s.replace(/[^a-zA-Z0-9\-_]/g, c => `\\${c.codePointAt(0)!.toString(16)} `);
}

// ── Boleta de bodega ──────────────────────────────────────────────────────────

export interface BoletaPrintRow {
  slCode:       string;
  customerName: string;
  manifestName: string;
  tracking:     string;
  ruta:         string;
  consolidacion?: boolean;
  permisos?: boolean;
}

const ROUTE_PALETTE = [
  '#1a4fa8', '#b45309', '#047857', '#7c3aed', '#be123c',
  '#0369a1', '#92400e', '#065f46', '#5b21b6', '#9f1239',
  '#0e7490', '#78350f', '#134e4a', '#4c1d95', '#881337',
];

/**
 * Build the full HTML document for the warehouse verification boleta.
 *
 * @param printRows      Pre-sorted rows (caller is responsible for sort order).
 * @param manifestNumber  Manifest identifier shown in header/footer.
 * @param groupByRoute    When true (default) inserts a colored route-group header row
 *                        before each route change. When false (Boleta ALFA mode) rows
 *                        appear in a flat sequential list without route grouping.
 */
export function buildBoletaHTML(
  printRows: BoletaPrintRow[],
  manifestNumber: string,
  groupByRoute = true,
): string {
  const uniqueRoutes = Array.from(new Set(printRows.map(r => r.ruta).filter(Boolean))).sort();
  const routeColorMap: Record<string, string> = {};
  uniqueRoutes.forEach((ruta, i) => {
    routeColorMap[ruta] = ROUTE_PALETTE[i % ROUTE_PALETTE.length];
  });
  const routeStyles = uniqueRoutes
    .map(ruta => `.ruta-${escapeCssId(ruta.replace(/\s+/g, '-'))} { color: ${routeColorMap[ruta]}; font-weight: 700; }`)
    .join('\n    ');

  // Build rows — with or without route-group header rows
  let currentRuta = Symbol(); // sentinel — guaranteed !== any string
  let groupSeq = 0;
  const rows = printRows.map((r, i) => {
    const rutaKey = r.ruta || '';
    const isNewGroup = groupByRoute && (rutaKey as any) !== currentRuta;
    if (isNewGroup || !groupByRoute) {
      if (isNewGroup) { currentRuta = rutaKey as any; groupSeq = 0; }
    }
    groupSeq++;
    const seq = groupByRoute ? groupSeq : i + 1;
    const color = (r.ruta && routeColorMap[r.ruta]) ? routeColorMap[r.ruta] : '#555';
    const headerRow = (groupByRoute && isNewGroup) ? `
      <tr class="route-header">
        <td colspan="7" style="background:${color}!important;color:#fff!important;font-weight:700;font-size:9pt;padding:4px 6px;border:1px solid #000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
          ${r.ruta || 'Sin Ruta'} <span style="font-weight:400;font-size:7.5pt;opacity:.85;">(${printRows.filter(x => (x.ruta||'') === rutaKey).length} paq.)</span>
        </td>
      </tr>` : '';
    const rutaStyle = ` style="color:${color};font-weight:700"`;  // always color the ruta cell
    return `${headerRow}
      <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
        <td class="center">${seq}</td>
        <td class="mono bold">
          ${r.slCode || '<span class="na">—</span>'}
          ${r.consolidacion ? ' <span class="cons-badge">CONS</span>' : ''}
          ${r.permisos ? ' <span class="perm-badge">PERM</span>' : ''}
        </td>
        <td>${r.customerName ? r.customerName.toUpperCase() : '<span class="na">—</span>'}</td>
        <td>${r.manifestName ? r.manifestName.toUpperCase() : '<span class="na">—</span>'}</td>
        <td class="mono small track-num">${r.permisos ? '<span class="perm-flag">P</span> ' : ''}${r.tracking || '<span class="na">—</span>'}</td>
        <td${rutaStyle}>${r.ruta || '<span class="na">Sin ruta</span>'}</td>
        <td class="check"></td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${groupByRoute ? 'Boleta de Bodega' : 'Boleta de Bodega ALFA'} — ${manifestNumber || 'Manifiesto'}</title>
  <style>
    @page { size: landscape; margin: 8mm 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #111; }
    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #111; padding-bottom: 3px; }
    header h1 { font-size: 10pt; font-weight: 700; }
    header p  { font-size: 6pt; color: #444; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 1px; }
    col.num   { width: 4%; }
    col.sl    { width: 7%; }
    col.cust  { width: 26%; }
    col.mani  { width: 19%; }
    col.track { width: 22%; }
    col.ruta  { width: 14%; }
    col.chk   { width: 8%; }
    thead th { background: #111 !important; color: #fff !important; font-size: 6pt; font-weight: 700; text-align: left; padding: 3px 4px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead th.center { text-align: center; }
    td { padding: 2px 4px; border: 1px solid #ddd; font-size: 6.5pt; vertical-align: middle; word-break: break-word; line-height: 1.2; min-height: 12px; }
    tr.even td { background: #ffffff; }
    tr.odd  td { background: #f9f9f9; }
    tr.route-header td { -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; }
    .mono  { font-family: 'Courier New', monospace; font-size: 8pt; }
    .small { font-size: 6pt; }
    .bold  { font-weight: 700; }
    .ruta  { font-weight: 700; }
    ${routeStyles}
    .na    { color: #999; font-style: italic; }
    .track-num { color: #111; font-weight: 700; }
    .na-cell { color: #bbb; }
    .check { border: 1px solid #aaa; height: 16px; display: inline-block; width: 16px; margin: 0 auto; }
    .cons-badge { display: inline-block; font-size: 5.5pt; font-weight: 700; background: #1d4ed8 !important; color: #fff !important; padding: 1px 4px; border-radius: 3px; margin-left: 4px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .perm-badge { display: inline-block; font-size: 5.5pt; font-weight: 700; background: #c2410c !important; color: #fff !important; padding: 1px 4px; border-radius: 3px; margin-left: 4px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .perm-flag  { display: inline-block; font-size: 5.5pt; font-weight: 900; background: #c2410c !important; color: #fff !important; padding: 0px 3px; border-radius: 2px; margin-right: 3px; vertical-align: middle; letter-spacing: 0.2px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    footer { margin-top: 5px; font-size: 5.5pt; color: #666; display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 3px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${groupByRoute ? 'Boleta de Bodega' : 'Boleta de Bodega ALFA'} — ${manifestNumber || 'Manifiesto'}</h1>
      <p>Impreso: ${formatCostaRicaDateTime(new Date())} &nbsp;·&nbsp; ${printRows.length} paquetes</p>
    </div>
    <p>Verificación manual de paquetes en bodega</p>
  </header>
  <table>
    <colgroup>
      <col class="num"/><col class="sl"/><col class="cust"/><col class="mani"/><col class="track"/><col class="ruta"/><col class="chk"/>
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>SL Code</th>
        <th>Nombre Cliente (Sistema)</th>
        <th>Nombre en Manifiesto</th>
        <th>Tracking</th>
        <th>Ruta</th>
        <th class="center">✓ Verificado</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>
    <span>SmartLogistics — Boleta de Verificación de Bodega</span>
    <span>Manifiesto: ${manifestNumber || '—'}</span>
  </footer>
</body>
</html>`;
}

// ── Route manifest ────────────────────────────────────────────────────────────

export interface RouteManifestRow {
  slCode:        string;
  customerName:  string;
  manifestName:  string;
  tracking:      string;
  price:         number;
  descripcion:   string;
  peso:          number;
  /** True when the customer has consolidation billing enabled */
  consolidacion?: boolean;
  /** True when any package in this row requires a customs permit (permiso) */
  permisos?: boolean;
  /** Optional active invoice ID or number attached to this row */
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceAmountUSD?: number;
  invoiceAmountCRC?: number;
  /** True if package was returned or reassigned from another manifest */
  isReturned?: boolean;
  isReassigned?: boolean;
  /** Origin manifest if package came from a previous manifest */
  originManifest?: string;
}

/**
 * Build the full HTML document for the per-route delivery manifest.
 *
 * @param filteredRows  Rows already filtered to the target route.
 * @param routeFilter   Route name shown in headers.
 * @param manifestNumber Manifest identifier.
 * @param tc            Exchange rate (CRC/USD); pass 0 to omit CRC totals.
 */
export function buildRouteManifestHTML(
  filteredRows:   RouteManifestRow[],
  routeFilter:    string,
  manifestNumber: string,
  tc:             number,
): string {
  const groupMap = new Map<string, { label: string; slCode: string; rows: RouteManifestRow[] }>();
  filteredRows.forEach(r => {
    // If the slCode is exactly the route name, it's a fallback generated by getEffSlCode
    // for an unassigned package. Clear it so unrelated clients don't merge under one name.
    const isFallback = (r.slCode || '').trim().toLowerCase() === (routeFilter || '').trim().toLowerCase();
    const effSlCode = isFallback ? '' : r.slCode;
    
    const key = effSlCode || `__nocode__${(r.customerName || r.manifestName).toUpperCase()}`;
    if (!groupMap.has(key)) {
      // UPPERCASE the label so the printed group header always reads in caps,
      // matching the on-screen NovaTableModal customer-name presentation.
      groupMap.set(key, { label: (r.customerName || r.manifestName || key).toUpperCase(), slCode: effSlCode, rows: [] });
    }
    groupMap.get(key)!.rows.push(r);
  });

  const groupsHtml = Array.from(groupMap.values())
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
    .map(g => {
    const isConsolidation = g.rows.some(r => r.consolidacion);
    const hasPermiso = g.rows.some(r => r.permisos);

    // Count returned / reassigned packages in this customer group
    const returnedCount = g.rows.filter(r => r.isReturned === true).length;
    const hasReturnedInGroup = returnedCount > 0;
    const returnedBadgeHeader = hasReturnedInGroup
      ? ` <span class="ret-count-badge">+${returnedCount}</span>`
      : '';

    // Track unique active invoices in this customer group
    const activeInvoiceMap = new Map<string, { number: string; usd: number; crc?: number }>();
    let uninvoicedPriceSum = 0;

    g.rows.forEach(r => {
      if (r.invoiceId || r.invoiceNumber) {
        const invKey = r.invoiceId || r.invoiceNumber!;
        if (!activeInvoiceMap.has(invKey)) {
          activeInvoiceMap.set(invKey, {
            number: r.invoiceNumber || r.invoiceId!,
            usd: r.invoiceAmountUSD ?? r.price ?? 0,
            crc: r.invoiceAmountCRC,
          });
        }
      } else {
        uninvoicedPriceSum += r.price || 0;
      }
    });

    const activeInvoices = Array.from(activeInvoiceMap.values());
    const activeInvoicesUSD = activeInvoices.reduce((s, inv) => s + (inv.usd || 0), 0);
    const total = activeInvoices.length > 0 ? (activeInvoicesUSD + uninvoicedPriceSum) : g.rows.reduce((s, r) => s + r.price, 0);
    
    let totalCRC = '';
    if (tc > 0) {
      const activeInvoicesCRC = activeInvoices.reduce((s, inv) => s + (inv.crc || (inv.usd * tc)), 0);
      const groupCRC = activeInvoices.length > 0 ? (activeInvoicesCRC + Math.round(uninvoicedPriceSum * tc)) : Math.round(total * tc);
      totalCRC = `&#8353;${groupCRC.toLocaleString('es-CR')}`;
    }

    const invoiceSublineHtml = activeInvoices.length > 0
      ? `<div class="inv-subline">${activeInvoices.map(inv => `#${String(inv.number).replace(/^#+/, '')}`).join(', ')}</div>`
      : '';

    const rowspan = g.rows.length + 1;
    const childRows = g.rows.map((r, i) => {
      const isPkgReturned = r.isReturned === true;
      const originMf = isPkgReturned ? (r.originManifest || '') : '';

      const originMfBadge = (isPkgReturned && originMf)
        ? ` <span class="ret-mani-badge" title="Manifiesto de Origen">${originMf}</span>`
        : '';

      let amtHtml = '';
      if (hasReturnedInGroup) {
        const priceUSD = r.price || 0;
        const priceCRC = tc > 0 ? Math.round(priceUSD * tc) : 0;
        amtHtml = `<div class="child-amt-split">
             <span class="child-usd">$${priceUSD.toFixed(2)}</span>
             ${tc > 0 ? `<span class="child-crc">&#8353;${priceCRC.toLocaleString('es-CR')}</span>` : ''}
           </div>`;
      }

      const showLineInvoice = hasReturnedInGroup && Boolean(r.invoiceNumber);
      const invoiceNumHtml = showLineInvoice
        ? ` <span class="mono small text-muted">(${r.invoiceNumber})</span>`
        : '';

      const sigCell = i === 0
        ? `<td class="sig" rowspan="${g.rows.length}"></td>`
        : '';

      const hasMeta = Boolean(originMfBadge || invoiceNumHtml);
      const metaHtml = hasMeta
        ? `<div class="track-meta">${originMfBadge}${invoiceNumHtml}</div>`
        : '';

      return `
        <tr class="child ${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="center small">${i + 1}</td>
          <td class="track-cell"><div class="track-main">${r.permisos ? '<span class="perm-flag">P</span> ' : ''}${r.tracking || '<span class="na">—</span>'}</div>${metaHtml}</td>
          ${sigCell}
          <td class="child-amt">${amtHtml}</td>
        </tr>`;
    }).join('');
    return `
        <tbody>
          <tr class="group-header">
            <td colspan="2" class="client-name">
              <div class="client-name-line">${g.slCode ? `<span class="sl">${g.slCode}</span> ` : ''}${g.label}${returnedBadgeHeader}${isConsolidation ? ' <span class="cons-badge">Consolidado</span>' : ''}${hasPermiso ? ' <span class="perm-badge">Permisos</span><span class="perm-note">(Prohibida la consolidación)</span>' : ''}</div>
              ${invoiceSublineHtml}
            </td>
            <td class="center paq-count"></td>
            <td class="total-amt">
              <div class="total-split">
                <span class="total-usd-block">
                  <span class="total-line">$${total.toFixed(2)}</span>
                </span>
                <span class="total-crc">${totalCRC || ''}</span>
              </div>
            </td>
            <td class="pago-cell" rowspan="${rowspan}"><span class="pago-opt"><span class="chk">&#9744;</span> Ef</span><span class="pago-opt"><span class="chk">&#9744;</span> Tr</span><span class="pago-opt"><span class="chk">&#9744;</span> Sinpe</span></td>
          </tr>
          ${childRows}
        </tbody>`;
  }).join('');

  const grandTotal    = filteredRows.reduce((s, r) => s + r.price, 0);
  const grandTotalCRC = tc > 0 ? ` · ₡${Math.round(grandTotal * tc).toLocaleString('es-CR')}` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Manifiesto de Ruta — ${routeFilter} — ${manifestNumber || 'Manifiesto'}</title>
  <style>
    @page { size: portrait; margin: 8mm 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #111; }
    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #111; padding-bottom: 3px; }
    header h1 { font-size: 10pt; font-weight: 700; }
    header p  { font-size: 6pt; color: #444; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 1px; }
    col.num   { width: 4%; }
    col.track { width: 44%; }
    col.firma { width: 26%; }
    col.amt   { width: 18%; }
    col.pago  { width: 8%; }
    thead th { background: #111 !important; color: #fff !important; font-size: 6pt; font-weight: 700; text-align: left; padding: 3px 4px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead th.center { text-align: center; }
    td { padding: 2px 4px; border: 1px solid #ddd; font-size: 6.5pt; vertical-align: middle; word-break: break-word; line-height: 1.2; min-height: 12px; }
    tr.even td { background: #ffffff; }
    tr.odd  td  { background: #ffffff; }
    tr.child td { border-left: 3px solid #ccc; min-height: 36px; }
    tr.group-header td { background: #e8e8e8 !important; color: #111 !important; font-size: 9pt; font-weight: 700; padding: 5px 6px; border: 1px solid #bbb; border-top: 2px solid #555; height: 44px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-inside: avoid; }
    .client-name { font-size: 12pt; }
    .cons-badge { display: inline-block; font-size: 5.5pt; font-weight: 700; background: #1d4ed8 !important; color: #fff !important; padding: 1px 4px; border-radius: 3px; margin-left: 4px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .perm-badge { display: inline-block; font-size: 5.5pt; font-weight: 700; background: #c2410c !important; color: #fff !important; padding: 1px 4px; border-radius: 3px; margin-left: 4px; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .ret-count-badge { display: inline-block; font-size: 6pt; font-weight: 900; background: #dc2626 !important; color: #fff !important; padding: 1px 5px; border-radius: 3px; margin-left: 5px; vertical-align: middle; letter-spacing: 0.3px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .ret-flag { display: inline-block; font-size: 6pt; font-weight: 900; background: #dc2626 !important; color: #fff !important; padding: 0.5px 3.5px; border-radius: 2px; margin-left: 4px; vertical-align: middle; letter-spacing: 0.2px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .ret-mani-badge { display: inline-block; font-size: 5.5pt; font-weight: 700; background: #fee2e2 !important; color: #991b1b !important; border: 1px solid #f87171 !important; padding: 0.5px 3.5px; border-radius: 2px; margin-left: 3px; vertical-align: middle; font-family: 'Courier New', monospace; letter-spacing: 0.1px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .client-name-line { display: inline-block; }
    .inv-subline { font-size: 7.5pt; font-weight: 500 !important; color: #64748b !important; font-family: 'Courier New', monospace; margin-top: 1px; line-height: 1.1; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .perm-note  { display: inline-block; font-size: 5pt; font-weight: 600; color: #c2410c !important; margin-left: 4px; vertical-align: middle; font-style: italic; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .perm-flag  { display: inline-block; font-size: 5.5pt; font-weight: 900; background: #c2410c !important; color: #fff !important; padding: 0px 3px; border-radius: 2px; margin-right: 3px; vertical-align: middle; letter-spacing: 0.2px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .paq-count { font-size: 6.5pt; font-weight: 500; color: #555; }
    .sl { font-family: 'Courier New', monospace; font-size: 9pt; background: rgba(0,0,0,0.08); padding: 1px 3px; border-radius: 3px; margin-right: 3px; color: #333; }
    .total-amt { font-size: 7pt; font-weight: 800; color: #111; padding: 3px 5px; }
    .total-split { display: flex; justify-content: space-between; align-items: flex-start; width: 100%; }
    .total-crc { font-size: 10pt; font-weight: 800; text-align: right; }
    .total-usd-block { text-align: left; }
    .total-line { display: block; font-size: 10pt; font-weight: 800; }
    .child-amt { font-size: 7.5pt; font-weight: 700; color: #111; padding: 2px 5px; vertical-align: middle; }
    .child-amt-split { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .child-usd { font-size: 8.5pt; font-weight: 700; text-align: left; }
    .child-crc { font-size: 7.5pt; font-weight: 600; color: #444; text-align: right; }
    .tc-line { display: block; font-size: 7pt; font-weight: 600; color: #444; }
    .tc-global { font-size: 11pt; color: #111; margin-top: 2px; }
    .pago-cell { font-size: 9.5pt; color: #222; font-weight: 700; white-space: normal; vertical-align: middle; text-align: left; padding: 6px 6px; border: 1px solid #bbb; }
    td.pago-cell, tr.group-header td.pago-cell { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pago-opt  { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; white-space: nowrap; }
    .pago-opt:last-child { margin-bottom: 0; }
    .chk { font-size: 16pt; line-height: 1; }
    .track-cell { font-family: 'Courier New', monospace; font-size: 9.5pt; font-weight: 700; line-height: 1.2; padding: 3px 4px; }
    .track-main { word-break: break-all; }
    .track-meta { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 6pt; }
    .mono  { font-family: 'Courier New', monospace; font-size: 6pt; font-weight: 700; }
    .small { font-size: 6pt; }
    .center { text-align: center; }
    .amount { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-weight: 700; font-size: 9pt; }
    .usd { white-space: nowrap; }
    .crc { font-size: 7.5pt; color: #555; white-space: nowrap; text-align: right; }
    .zona { font-size: 6pt; text-align: center; font-weight: 600; color: #444; }
    .sig  { border-bottom: 1px solid #aaa !important; background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .na   { color: #999; font-style: italic; }
    footer { margin-top: 5px; font-size: 5.5pt; color: #666; display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 3px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Manifiesto de Ruta — ${routeFilter}</h1>
      <p>Manifiesto: ${manifestNumber || '—'} &nbsp;·&nbsp; ${filteredRows.length} paquetes &nbsp;·&nbsp; ${groupMap.size} clientes</p>
      <p>Impreso: ${formatCostaRicaDateTime(new Date())}</p>
    </div>
    <div style="text-align:right;">
      ${tc > 0 ? `<p class="tc-global"><strong>Tipo de Cambio: &#8353;${tc.toLocaleString('es-CR')}</strong></p>` : ''}
      <p style="font-size:7pt;">Ruta: <strong>${routeFilter}</strong></p>
    </div>
  </header>
  <table>
    <colgroup>
      <col class="num"/><col class="track"/><col class="firma"/><col class="amt"/><col class="pago"/>
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Tracking</th>
        <th class="center">Firma</th>
        <th class="center">Monto</th>
        <th class="center">M&eacute;todo de Pago</th>
      </tr>
    </thead>
    ${groupsHtml}
  </table>
  <footer>
    <span>SmartLogistics — Manifiesto de Ruta</span>
    <span>Total: $${grandTotal.toFixed(2)}${grandTotalCRC}</span>
  </footer>
</body>
</html>`;
}

// ── Encomienda service manifest ───────────────────────────────────────────────

export interface EncomiendaServiceManifestRow {
  slCode:        string;
  customerName:  string;
  tracking:      string;
  description:   string;
  peso:          number;
  price:         number;
  /** Courier service name — used as the section grouping key */
  courierService: string;
}

/**
 * Build the full HTML document for the encomienda manifest grouped by courier service.
 *
 * @param rows           All rows for the manifest (across all services).
 * @param manifestNumber Manifest identifier shown in header/footer.
 * @param tc             Exchange rate (CRC/USD); pass 0 to omit CRC totals.
 */
export function buildEncomiendaServiceManifestHTML(
  rows:           EncomiendaServiceManifestRow[],
  manifestNumber: string,
  tc:             number,
): string {
  const NO_SERVICE = 'Sin Servicio Asignado';

  // Group by service → customer
  const serviceMap = new Map<string, Map<string, { customerName: string; slCode: string; rows: EncomiendaServiceManifestRow[] }>>();
  rows.forEach(r => {
    const sKey = r.courierService?.trim() || NO_SERVICE;
    if (!serviceMap.has(sKey)) serviceMap.set(sKey, new Map());
    const cMap = serviceMap.get(sKey)!;
    const cKey = r.slCode || `__nocode__${r.customerName}`;
    if (!cMap.has(cKey)) cMap.set(cKey, { customerName: (r.customerName || '').toUpperCase(), slCode: r.slCode, rows: [] });
    cMap.get(cKey)!.rows.push(r);
  });

  // Sort services (NO_SERVICE last)
  const sortedServices = Array.from(serviceMap.entries()).sort(([a], [b]) => {
    if (a === NO_SERVICE) return 1;
    if (b === NO_SERVICE) return -1;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });

  const servicesHtml = sortedServices.map(([serviceName, cMap]) => {
    const serviceTotal    = Array.from(cMap.values()).reduce((s, c) => s + c.rows.reduce((rs, r) => rs + r.price, 0), 0);
    const serviceTotalCRC = tc > 0 ? ` · &#8353;${Math.round(serviceTotal * tc).toLocaleString('es-CR')}` : '';

    const customersHtml = Array.from(cMap.values())
      .sort((a, b) => a.customerName.localeCompare(b.customerName, 'es', { sensitivity: 'base' }))
      .map(c => {
        const custTotal    = c.rows.reduce((s, r) => s + r.price, 0);
        const custTotalCRC = tc > 0 ? `<span class="crc">&#8353;${Math.round(custTotal * tc).toLocaleString('es-CR')}</span>` : '';
        const rowspan      = c.rows.length + 1;
        const pkgRows = c.rows.map((r, i) => `
          <tr class="child ${i % 2 === 0 ? 'even' : 'odd'}">
            <td class="center small">${i + 1}</td>
            <td class="track-cell">${r.tracking || '<span class="na">—</span>'}</td>
            <td class="desc-cell">${r.description ? r.description.toUpperCase() : '<span class="na">—</span>'}</td>
            <td class="center">${r.peso > 0 ? `${r.peso.toFixed(2)} kg` : '<span class="na">—</span>'}</td>
            <td class="sig"></td>
          </tr>`).join('');
        return `
        <tbody>
          <tr class="customer-header">
            <td colspan="3" class="client-name">${c.slCode ? `<span class="sl">${c.slCode}</span> ` : ''}${c.customerName}</td>
            <td class="center paq-count">${c.rows.length}&nbsp;paq.</td>
            <td class="total-amt">
              <span class="total-line">$${custTotal.toFixed(2)}</span>
              ${custTotalCRC}
            </td>
            <td class="pago-cell" rowspan="${rowspan}"><span class="pago-opt"><span class="chk">&#9744;</span>&nbsp;Ef</span><span class="pago-opt"><span class="chk">&#9744;</span>&nbsp;Tr</span><span class="pago-opt"><span class="chk">&#9744;</span>&nbsp;Sinpe</span></td>
          </tr>
          ${pkgRows}
        </tbody>`;
      }).join('');

    return `
    <tbody>
      <tr class="service-header">
        <td colspan="6" class="service-name">${serviceName}<span class="service-total">&nbsp;— $${serviceTotal.toFixed(2)}${serviceTotalCRC}</span></td>
      </tr>
    </tbody>
    ${customersHtml}`;
  }).join('');

  const grandTotal    = rows.reduce((s, r) => s + r.price, 0);
  const grandTotalCRC = tc > 0 ? ` · &#8353;${Math.round(grandTotal * tc).toLocaleString('es-CR')}` : '';
  const uniqueCustomers = new Set(rows.map(r => r.slCode || r.customerName)).size;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Manifiesto Encomiendas — ${manifestNumber || 'Manifiesto'}</title>
  <style>
    @page { size: portrait; margin: 8mm 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #111; }
    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px; border-bottom: 2px solid #111; padding-bottom: 3px; }
    header h1 { font-size: 10pt; font-weight: 700; }
    header p  { font-size: 6pt; color: #444; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 1px; }
    col.num   { width: 4%; }
    col.track { width: 26%; }
    col.desc  { width: 32%; }
    col.peso  { width: 10%; }
    col.firma { width: 16%; }
    col.pago  { width: 12%; }
    thead th { background: #111 !important; color: #fff !important; font-size: 6pt; font-weight: 700; text-align: left; padding: 3px 4px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    thead th.center { text-align: center; }
    td { padding: 2px 4px; border: 1px solid #ddd; font-size: 6.5pt; vertical-align: middle; word-break: break-word; line-height: 1.2; min-height: 12px; }
    tr.service-header td { background: #1a4fa8 !important; color: #fff !important; font-size: 9pt; font-weight: 700; padding: 4px 7px; border: 2px solid #0e3a80; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .service-name  { font-size: 9pt; font-weight: 800; letter-spacing: 0.2px; }
    .service-total { font-size: 7.5pt; font-weight: 600; opacity: 0.9; }
    tr.customer-header td { background: #e8e8e8 !important; color: #111 !important; font-size: 8.5pt; font-weight: 700; padding: 4px 6px; border: 1px solid #bbb; border-top: 1.5px solid #555; height: 36px; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-inside: avoid; }
    .client-name { font-size: 9pt; }
    .sl { font-family: 'Courier New', monospace; font-size: 8pt; background: rgba(0,0,0,0.08); padding: 1px 3px; border-radius: 3px; margin-right: 3px; color: #333; }
    .paq-count { font-size: 6pt; font-weight: 500; color: #555; text-align: center; }
    .total-amt  { font-size: 7pt; font-weight: 800; color: #111; padding: 3px 5px; }
    .total-line { display: block; font-size: 9.5pt; font-weight: 800; }
    .crc  { display: block; font-size: 7pt; color: #555; }
    .pago-cell { font-size: 9pt; color: #222; font-weight: 700; white-space: normal; vertical-align: middle; text-align: left; padding: 5px 5px; border: 1px solid #bbb; }
    td.pago-cell, tr.customer-header td.pago-cell { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pago-opt  { display: flex; align-items: center; gap: 3px; margin-bottom: 2px; white-space: nowrap; }
    .pago-opt:last-child { margin-bottom: 0; }
    .chk  { font-size: 14pt; line-height: 1; }
    tr.child td { border-left: 3px solid #ccc; height: 28px; overflow: hidden; }
    tr.even td { background: #ffffff; }
    tr.odd  td { background: #f9f9f9; }
    .track-cell { font-family: 'Courier New', monospace; font-size: 8pt; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .desc-cell  { font-size: 6.5pt; }
    .sig  { border-bottom: 1px solid #aaa !important; background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .center { text-align: center; }
    .small  { font-size: 6pt; }
    .na     { color: #999; font-style: italic; }
    .tc-global { font-size: 10pt; color: #111; }
    footer { margin-top: 5px; font-size: 5.5pt; color: #666; display: flex; justify-content: space-between; border-top: 1px solid #ccc; padding-top: 3px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Manifiesto Encomiendas &mdash; ${manifestNumber || '&mdash;'}</h1>
      <p>${rows.length} paquetes &nbsp;&middot;&nbsp; ${uniqueCustomers} clientes &nbsp;&middot;&nbsp; ${sortedServices.length} servicio${sortedServices.length !== 1 ? 's' : ''}</p>
      <p>Impreso: ${formatCostaRicaDateTime(new Date())}</p>
    </div>
    <div style="text-align:right;">
      ${tc > 0 ? `<p class="tc-global"><strong>TC: &#8353;${tc.toLocaleString('es-CR')}</strong></p>` : ''}
    </div>
  </header>
  <table>
    <colgroup>
      <col class="num"/><col class="track"/><col class="desc"/><col class="peso"/><col class="firma"/><col class="pago"/>
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Tracking</th>
        <th>Descripci&oacute;n</th>
        <th class="center">Peso</th>
        <th class="center">Firma</th>
        <th class="center">M&eacute;todo de Pago</th>
      </tr>
    </thead>
    ${servicesHtml}
  </table>
  <footer>
    <span>SmartLogistics &mdash; Manifiesto de Encomiendas por Servicio</span>
    <span>Total: $${grandTotal.toFixed(2)}${grandTotalCRC}</span>
  </footer>
</body>
</html>`;
}

// ── Shipping labels ───────────────────────────────────────────────────────────

export interface ShippingLabelRow {
  slCode:           string;
  recipientName:    string;
  recipientPhone:   string;
  recipientDni:     string;
  deliveryAddress:  string;
  ruta:             string;
  courierService:   string;
  trackings:        string[];
  createdAt:        string | number;
  /** Phone/DNI fallback when customer record is present */
  customerPhone?:   string;
  customerDni?:     string;
}

function escH(v: string | undefined | null): string {
  if (!v) return "";
  const d = document?.createElement?.("div");
  if (d) { d.textContent = String(v); return d.innerHTML; }
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildLabelCardHtml(r: ShippingLabelRow, origin: string): string {
  const phone = r.customerPhone || r.recipientPhone || "Sin teléfono";
  const dni   = r.customerDni   || r.recipientDni   || "N/A";
  const date  = formatCostaRicaDate(r.createdAt);
  const qrUrl = ENABLE_GOOGLE_MAPS && r.deliveryAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.deliveryAddress))}`
    : null;

  const trackingItems = r.trackings
    .map(t => `<div class="tracking-num">&#x2022; ${escH(t)}</div>`)
    .join("");

  const qrBlock = qrUrl
    ? `<div class="qr-wrap">
         <div class="section-label">Ver en Mapa</div>
         <img src="${qrUrl}" alt="QR" class="qr-img" />
       </div>`
    : "";

  const rutaLine = r.ruta
    ? `<div class="ruta-line">Ruta: <span>${escH(r.ruta)}</span></div>`
    : "";

  return `
    <div class="label-card">
      <div class="label-header">
        <div class="header-left">
          <img src="${origin}/logo.svg" alt="SmartLogistics" class="logo" />
          <div class="company-name">
            <div class="company-title">SMARTLOGISTICS</div>
            <div class="company-sub">Gu&iacute;a de Env&iacute;o</div>
          </div>
        </div>
        <div class="header-right">
          <div class="sl-code">${escH(r.slCode)}</div>
        </div>
      </div>

      <div class="tracking-box">
        <div class="section-label">N&uacute;meros de Rastreo</div>
        <div class="tracking-grid">${trackingItems}</div>
      </div>

      <div class="address-section">
        <div class="address-left">
          <div class="section-label">Entregar A</div>
          <div class="recipient-name">${escH(r.recipientName)}</div>
          <div class="contact-info">${escH(phone)}</div>
          <div class="contact-info">C&eacute;dula: ${escH(dni)}</div>
          <div class="delivery-block">
            <div class="delivery-label">Direcci&oacute;n de entrega:</div>
            <div class="delivery-addr">${escH(r.deliveryAddress) || "___________________________"}</div>
          </div>
          ${rutaLine}
        </div>
        <div class="address-right">
          <div class="section-label">Servicio de Encomienda</div>
          <div class="service-box">
            <div class="service-name">${escH(r.courierService) || ""}</div>
          </div>
          ${qrBlock}
        </div>
      </div>

      <div class="summary-row">
        <div class="summary-cell">
          <div class="summary-label">Fecha</div>
          <div class="summary-value">${date}</div>
        </div>
      </div>

      <div class="label-footer">
        <div>SmartLogistics CR &bull; San Jos&eacute;, Costa Rica</div>
        <div>www.smartlogisticscr.com</div>
      </div>
    </div>`;
}

const LABEL_BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 17px; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
                 "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    background: #fff; color: #000;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* ── Label card ─────────────────────────────────────────────────────── */
  /* height is set explicitly via JS-generated pageCSS so it fills the col */
  .label-card {
    border: 2px solid #000;
    background: #fff;
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }

  /* Header — scaled for 5in-wide landscape column */
  .label-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem 1.2rem;
    border-bottom: 2px solid #000;
    flex-shrink: 0;
  }
  .header-left  { display: flex; align-items: center; gap: 0.9rem; }
  .header-right { text-align: right; }
  .logo         { height: 2.8rem; width: auto; filter: brightness(0); }
  .company-title { font-size: 1.7rem; font-weight: 900; letter-spacing: -0.02em; }
  .company-sub   { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-top: 3px; }
  .sl-label      { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 3px; }
  .sl-code       { font-size: 2.4rem; font-weight: 900; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; letter-spacing: -0.02em; }

  /* Tracking box */
  .tracking-box  { border: 2px solid #000; margin: 0.7rem 1.2rem; padding: 0.7rem 0.9rem; flex-shrink: 0; }
  .section-label { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 0.4rem; }
  .tracking-grid { columns: 2; column-gap: 0.5rem; }
  .tracking-num  { font-size: 0.72rem; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; break-inside: avoid; line-height: 1.5; word-break: break-all; }

  /* Address section — absorbs remaining vertical space */
  .address-section {
    display: flex; gap: 1.1rem;
    padding: 1rem 1.2rem;
    border-top: 2px solid #000; border-bottom: 2px solid #000;
    flex: 1 1 auto;
  }
  .address-left  { flex: 1; min-width: 0; }
  .address-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.8rem; }
  .recipient-name { font-size: 2.4rem; font-weight: 900; margin-bottom: 0.4rem; line-height: 1.1; }
  .contact-info   { font-size: 1.05rem; font-weight: 600; line-height: 1.6; }
  .delivery-block { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #000; }
  .delivery-label { font-size: 0.9rem; font-weight: 700; margin-bottom: 0.3rem; }
  .delivery-addr  { font-size: 1.05rem; font-weight: 600; white-space: pre-wrap; line-height: 1.5; }
  .ruta-line      { font-size: 0.9rem; font-weight: 700; margin-top: 0.5rem; }
  .ruta-line span { font-weight: 500; }
  .service-box    { border: 2px solid #000; padding: 0.8rem; min-height: 5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .service-sub    { font-size: 0.9rem; margin-bottom: 0.35rem; }
  .service-name   { font-size: 2.5rem; font-weight: 900; line-height: 1.1; text-transform: uppercase; }
  .remitente-block { }
  .remitente-name { font-size: 1.15rem; font-weight: 700; }
  .remitente-city { font-size: 1rem; font-weight: 600; }
  .qr-wrap        { display: flex; flex-direction: column; align-items: flex-end; margin-top: auto; padding-top: 0.5rem; }
  .qr-img         { width: 5rem; height: 5rem; image-rendering: pixelated; }

  /* Summary */
  .summary-row  { display: flex; border-bottom: 2px solid #000; flex-shrink: 0; }
  .summary-cell { flex: 1; text-align: center; padding: 0.5rem; }
  .summary-cell + .summary-cell { border-left: 2px solid #000; }
  .summary-label { font-size: 0.85rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; }
  .summary-value { font-size: 2.2rem; font-weight: 900; }

  /* Footer */
  .label-footer { padding: 0.6rem; text-align: center; font-size: 0.95rem; font-weight: 600; line-height: 1.6; flex-shrink: 0; }
`;

/**
 * Build a self-contained HTML document for printing shipping labels.
 * Always portrait letter, 1 label per page — works for single and bulk.
 *
 * @param labels  Array of label rows.
 * @param bulk    Unused layout flag kept for API compatibility.
 * @param origin  window.location.origin — used to build the absolute logo URL.
 */
export function buildShippingLabelHTML(
  labels: ShippingLabelRow[],
  _bulk: boolean,
  origin: string,
): string {
  const title = labels.length === 1
    ? `Etiqueta — ${labels[0]?.slCode ?? ""}`
    : "Etiquetas de Envío";

  /* Portrait letter: 8.5in × 11in, margins 0.25in → usable 8in × 10.5in */
  const pageCSS = `
    @page { size: letter portrait; margin: 0.5in 0.25in 0.25in 0.25in; }
    body { display: flex; flex-direction: column; align-items: center; }
    .label-page {
      width: 8in;
      min-height: 10.2in;
      break-after: page;
      page-break-after: always;
      break-inside: avoid;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
    }
    .label-page:last-child { break-after: avoid; page-break-after: avoid; }
    .label-card  { flex: 1 0 auto; }
    .address-section { min-height: 6.5in; }
  `;

  const bodyHtml = labels.map(r => `
    <div class="label-page">${buildLabelCardHtml(r, origin)}</div>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${LABEL_BASE_CSS}
    ${pageCSS}
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
