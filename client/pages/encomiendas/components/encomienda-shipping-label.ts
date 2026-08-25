/**
 * encomienda-shipping-label.ts
 *
 * Amazon / FedEx-style physical shipping label.
 * Black & white. One label per letter page.
 * Designed to be affixed to a package — not a receipt.
 *
 * Layout:
 *  ┌──────────────────────────────────────┐
 *  │  [LOGO + APP NAME]       [QR = SL#]  │
 *  ├──────────────────────────────────────┤
 *  │  TO (big name + SL badge + phone)    │
 *  │─────────────────────  │  FROM        │
 *  │  DIRECCIÓN DE ENTREGA │              │
 *  ├──────────────────────────────────────┤
 *  │  RASTREO (small) + BARCODE           │
 *  ├───────────────────────┬──────────────┤
 *  │  SERVICIO (big/merged)│ ARTS | FECHA │
 *  ├──────────────────────────────────────┤
 *  │  ████ SMARTLOGISTICS CR · FOOTER ████│
 *  └──────────────────────────────────────┘
 */

export interface ShippingLabelData {
  customerName: string;
  slCode: string;
  phone?: string;
  dni?: string;           // cédula / DNI del cliente
  address?: string;       // delivery address / notes
  notes?: string;         // customer instructions / notes
  encomiendaService?: string;
  invoiceNumber: string;
  manifestNumber?: string;
  invoiceStatus: string;
  totalAmount: number;
  currency?: string;
  items: {
    trackingNumber?: string;
    description?: string;
    unitPrice?: number;
    totalPrice?: number;
  }[];
  streetAddress?: string;
  details?: string;
  deliveryInstructions?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** QR encodes the tracking/invoice number so it can be scanned directly in the warehouse */
function getQrUrl(data: string, size = 130): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&color=000000&bgcolor=ffffff&margin=2&qzone=1`;
}

function getManifestDate(manifestNumber: string | undefined | null): string {
  if (!manifestNumber) return '';
  
  // Format 1: DD-MM-YYYY
  const matchDmy = manifestNumber.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (matchDmy) {
    return `${matchDmy[1]}/${matchDmy[2]}/${matchDmy[3]}`;
  }
  
  // Format 2: YYYYMMDD
  const matchYmd = manifestNumber.match(/(\d{4})(\d{2})(\d{2})/);
  if (matchYmd) {
    return `${matchYmd[3]}/${matchYmd[2]}/${matchYmd[1]}`;
  }
  
  return '';
}


// ── Per-label page ─────────────────────────────────────────────────────────

function buildLabelPage(label: ShippingLabelData, index: number, total: number): string {
  const printDate = new Date().toLocaleDateString('es-CR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'America/Costa_Rica',
  });

  const manifestDate = getManifestDate(label.manifestNumber) || printDate;

  const allTrackings = label.items
    .filter(it => it.trackingNumber)
    .map(it => it.trackingNumber as string);

  const qrUrl = getQrUrl(label.invoiceNumber, 200);

  const deliveryAddress = label.address?.trim() || '';

  return `
<div class="label-page">
<div class="label-card">

  <!-- ══ HEADER: Logo + QR ══════════════════════════════════════════ -->
  <div class="header-row">
    <!-- Logo -->
    <div class="logo-block" style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <img
          src="/logo.svg"
          alt="SmartLogistics"
          style="height:48px;width:auto;object-fit:contain;filter:brightness(0);"
          onerror="this.style.display='none'"
        />
        <div>
          <div class="logo-text">SMARTLOGISTICS</div>
          <div class="logo-sub">GUÍA DE ENVÍO</div>
        </div>
      </div>
      ${manifestDate ? `
      <div style="display:flex;flex-direction:column;gap:1px;margin-top:4px;">
        <div class="section-label" style="margin-bottom:0;">FECHA MANIFIESTO</div>
        <div style="font-size:12pt;font-weight:800;color:#000;">${manifestDate}</div>
      </div>` : ''}
    </div>
    <!-- QR: encodes Tracking Number -->
    <div class="qr-block">
      <div class="label-counter">${index + 1} / ${total}</div>
      <div class="qr-border">
        <img src="${qrUrl}" width="130" height="130" alt="QR ${esc(label.invoiceNumber)}" />
      </div>
      <div class="qr-caption">${esc(label.invoiceNumber)}</div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- ══ ADDRESS: To / From ══════════════════════════════════════════ -->
  <div class="address-row">
    <!-- TO -->
    <div class="to-block">
      <div class="section-label">ENVIAR A:</div>
      <div class="recipient-name">${esc(label.customerName.toUpperCase())}</div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div class="sl-badge">${esc(label.slCode)}</div>
        ${label.phone ? `<div class="recipient-phone-inline">${esc(label.phone)}</div>` : ''}
        ${label.dni   ? `<div class="recipient-dni-inline">CED.&nbsp;${esc(label.dni)}</div>` : ''}
      </div>

      <!-- Delivery address / notes — big & visible -->
      <div style="margin-top:10px;">
        <div class="section-label">DIRECCIÓN DE ENTREGA:</div>
        ${label.streetAddress ? `
        <div class="delivery-address" style="font-size:12.5pt; font-weight:800; color:#000; line-height:1.4;">
          ${esc(label.streetAddress)}
          ${label.details ? `<div style="font-size:10.5pt; font-weight:600; color:#333; margin-top:4px;"><strong>Detalles:</strong> ${esc(label.details)}</div>` : ''}
        </div>
        ` : deliveryAddress ? `
        <div class="delivery-address">${esc(deliveryAddress)}</div>
        ` : `
        <div class="delivery-address delivery-blank">Consultar en oficina — ${esc(label.slCode)}</div>
        `}
      </div>

      ${label.notes ? `
      <div style="margin-top:10px; border-top: 1.5px dashed #000; padding-top: 8px;">
        <div class="section-label">NOTAS / INSTRUCCIONES:</div>
        <div style="font-size:12pt; font-weight:800; color:#000; line-height:1.4; white-space:pre-wrap;">${esc(label.notes)}</div>
      </div>` : ''}
    </div><!-- /to-block -->

    <!-- Package Count Box on the right -->
    <div class="pkg-count-card">
      <div class="pkg-count-value">${allTrackings.length}</div>
      <div class="pkg-count-label">PAQ</div>
    </div>
  </div><!-- /address-row -->

  <div class="divider"></div>

  <!-- ══ TRACKING ════════════════════════════════════════════════════ -->
  <div class="tracking-section">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <div class="section-label" style="margin-bottom:0;">NÚMERO(S) DE RASTREO</div>
      <span class="item-badge">${allTrackings.length} art.</span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">
      ${allTrackings.length > 0
        ? allTrackings.map(t => `<span class="tracking-plain">${esc(t)}</span>`).join('')
        : `<span class="tracking-plain tracking-none">SIN TRACKING ASIGNADO</span>`
      }
    </div>
  </div>

  <div class="divider"></div>

  <!-- ══ META: Service ═════════════════════════════════════════ -->
  <div class="meta-row">
    <!-- SERVICIO — now takes all space -->
    <div class="meta-cell service-cell">
      <div class="section-label">SERVICIO DE TRANSPORTE</div>
      <div class="service-value">${esc(label.encomiendaService?.toUpperCase() || '—')}</div>
    </div>
  </div>

</div><!-- /label-card -->
</div><!-- /label-page -->
`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function buildShippingLabelsHTML(labels: ShippingLabelData[]): string {
  if (labels.length === 0) return '';

  const pages = labels
    .map((label, i) => buildLabelPage(label, i, labels.length))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Etiquetas de Envío — SmartLogistics</title>
<style>
  /* ── Reset ─────────────────────────────────────────────── */
  *,*::before,*::after{
    box-sizing:border-box;margin:0;padding:0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  body{ font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000; }

  /* ── Page ──────────────────────────────────────────────── */
  @page{ size:letter portrait;margin:0; }
  .label-page{
    width:100%;min-height:100vh;
    display:flex;align-items:flex-start;justify-content:flex-start;
    padding:6mm 8mm;
    page-break-after:always;
  }
  .label-page:last-child{ page-break-after:auto; }

  /* ── Card ──────────────────────────────────────────────── */
  .label-card{
    width:150mm;max-width:150mm;
    border:2px solid #000;background:#fff;overflow:hidden;
  }

  /* ── Shared ─────────────────────────────────────────────── */
  .divider{ border-top:1.5px solid #000; }
  .section-label{
    font-size:6.5pt;font-weight:700;
    text-transform:uppercase;letter-spacing:.14em;
    color:#000;margin-bottom:4px;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .header-row{
    padding:12px 16px;
    display:flex;justify-content:space-between;align-items:center;
  }
  .logo-text{
    font-size:20pt;font-weight:800;
    letter-spacing:-.02em;color:#000;line-height:1;
    text-transform:uppercase;
  }
  .logo-sub{ font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.22em;color:#000;margin-top:4px; }
  .qr-block{ display:flex;flex-direction:column;align-items:center;gap:3px; }
  .label-counter{ font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#000; }
  .qr-border{ border:2px solid #000;padding:3px; }
  .qr-border img{ display:block; }
  .qr-caption{
    font-family:'Courier New',monospace;font-size:6.5pt;
    font-weight:900;color:#000;letter-spacing:.02em;text-align:center;
    word-break:break-all;max-width:130px;margin-top:2px;
  }

  /* ── Address ─────────────────────────────────────────────── */
  .address-row{ display:flex;align-items:flex-start;padding:16px 24px;gap:0; }
  .to-block{ flex:1.3;padding-right:20px; }
  .recipient-name{ font-size:18pt;font-weight:800;color:#000;line-height:1.1;margin-bottom:6px; }
  .sl-badge{
    display:inline-flex;align-items:center;border:1.5px solid #000;padding:3px 10px;
    font-family:'Courier New',monospace;font-size:12pt;font-weight:700;
    color:#000;letter-spacing:.04em;
  }
  .recipient-phone{ font-size:11pt;font-weight:700;color:#000; }
  .recipient-phone-inline{ font-size:12pt;font-weight:700;color:#000;letter-spacing:0.5px; }
  .recipient-dni-inline{ font-size:10pt;font-weight:600;color:#444;letter-spacing:0.3px;border-left:1.5px solid #555;padding-left:12px; }

  .delivery-address{
    font-size:11pt;font-weight:700;color:#000;
    line-height:1.4;margin-top:2px;
  }
  .delivery-blank{ font-style:italic;font-weight:700;color:#444; }

  .pkg-count-card{
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    border:2.5px solid #000;padding:6px 12px;min-width:85px;height:85px;
    text-align:center;flex-shrink:0;
  }
  .pkg-count-value{
    font-size:32pt;font-weight:900;line-height:0.95;color:#000;
  }
  .pkg-count-label{
    font-size:10pt;font-weight:900;letter-spacing:.08em;color:#000;
  }

  .from-block{
    flex:1;border-left:2px solid #000;padding-left:16px;
  }
  .sender-name{ font-size:11pt;font-weight:900;color:#000;margin-bottom:4px; }
  .sender-detail{ font-size:9pt;font-weight:600;color:#000; }

  /* ── Tracking ─────────────────────────────────────────────── */
  .tracking-section{ padding:10px 24px; }
  .tracking-plain{
    font-family:'Courier New',monospace;font-size:9pt;
    font-weight:700;color:#000;
    display:inline-block;white-space:nowrap;
  }
  .tracking-none{ font-style:italic;color:#666; }
  .item-badge{
    display:inline-flex;align-items:center;
    background:transparent;color:#000;
    border:1.5px solid #000;
    font-size:6pt;font-weight:700;letter-spacing:.08em;
    padding:2px 7px;border-radius:999px;
    text-transform:uppercase;white-space:nowrap;
  }

  /* ── Meta row ─────────────────────────────────────────────── */
  .meta-row{ display:flex;align-items:stretch; }
  .meta-cell{ flex:1;padding:12px 18px; }
  .service-cell{ flex:2.2; }
  .border-left{ border-left:2px solid #000; }
  .service-value{ font-size:24pt;font-weight:800;color:#000;line-height:1.1;margin-top:2px; }
  .meta-value{ font-size:20pt;font-weight:800;color:#000; }
  .meta-value-sm{ font-size:11pt;font-weight:700;color:#000; }

  /* ── Footer ─────────────────────────────────────────────── */
  .footer-bar{
    background:transparent;color:#000;
    padding:5px 18px;
    display:flex;justify-content:space-between;
    font-size:7pt;font-weight:700;letter-spacing:.05em;
    border-top:2px solid #000;
  }

  /* ── Screen preview ──────────────────────────────────────── */
  @media screen{
    body{ background:#9ca3af;padding:24px 0; }
    .label-page{ background:transparent;margin-bottom:28px;padding:20px; }
    .label-card{ box-shadow:0 10px 40px rgba(0,0,0,.5); }
  }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/**
 * Opens a print window with one physical shipping label per page.
 * QR encodes the SL code. Tracking numbers shown small.
 * Delivery address shown large.
 */
export function printShippingLabels(labels: ShippingLabelData[]): void {
  if (labels.length === 0) return;

  const html = buildShippingLabelsHTML(labels);
  const win = window.open('', '_blank', 'width=960,height=840');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Por favor permite popups para imprimir las etiquetas.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Wait for QR + logo to load before print dialog
  setTimeout(() => win.print(), 900);
}
