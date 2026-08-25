/**
 * Zero-Leak Email Template Invariance & Anti-Regression Test Suite
 * ─────────────────────────────────────────────────────────────────
 * Guarantees that the canonical corporate invoice email template
 * (`functions/templates/invoice-email.html`) NEVER leaks unrendered
 * placeholders (`{{...}}`) under any possible combination of billing data.
 *
 * Enforced by: Section 4 & Section 11 of AGENTS.md.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Load canonical production template directly from functions/templates/
const templatePath = path.resolve(__dirname, '../../../../functions/templates/invoice-email.html');
const templateHtml = fs.readFileSync(templatePath, 'utf8');

interface InvoiceEmailData {
  customerName: string;
  customerEmail: string;
  customerDni: string;
  customerAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  paymentStatus: 'pending' | 'paid' | 'overdue';
  items: Array<{
    tracking: string;
    description?: string;
    weight?: number;
    amount: number;
    requiresPermit?: boolean;
    isManual?: boolean;
  }>;
  hasPermitItems?: boolean;
  subtotal: number;
  discountAmount?: number;
  discountPercentage?: number;
  tax: number;
  total: number;
  currencySymbol: string;
  ivaEnabled: boolean;
  exchangeRate?: number;
  totalCRC?: number;
  notes?: string;
  isConsolidation?: boolean;
  source?: string;
}

function getStatusColors(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: '#dcfce7', text: '#166534', label: 'Pagado' };
    case 'overdue':
      return { bg: '#fee2e2', text: '#991b1b', label: 'Vencido' };
    default:
      return { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' };
  }
}

function formatInvoiceItemCaption(
  item: { tracking?: string | null; description?: string | null; isManual?: boolean | null },
  source?: string | null,
): string {
  const tracking = (item.tracking || '').toUpperCase();
  const description = (item.description || '').trim();
  const isManual = !!item.isManual;
  const isMaritime = (source || '').toLowerCase() === 'maritime';

  if (isManual) return description.toUpperCase() || '-';
  if (isMaritime) {
    if (tracking && description) return `${tracking} — ${description.toUpperCase()}`;
    return tracking || description.toUpperCase() || '-';
  }
  return tracking || '-';
}

function generateItemsRows(items: InvoiceEmailData['items'], currencySymbol: string, source?: string): string {
  return items.map(item => {
    const permitBadge = item.requiresPermit
      ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:4px;font-size:9px;font-weight:700;padding:1px 6px;margin-left:6px;vertical-align:middle;">&#9888; PERMISOS</span>`
      : '';
    return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">Servicios Logísticos${permitBadge}</div>
        <div style="font-size: 11px; color: #64748b; font-family: ui-monospace, monospace;">${formatInvoiceItemCaption(item, source)}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #475569;">
        ${item.weight ? `${Number(item.weight).toFixed(2)} ${source === 'maritime' ? 'FT³' : 'kg'}` : '-'}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; font-weight: 700; color: #0f172a;">
        ${currencySymbol}${item.amount.toFixed(2)}
      </td>
    </tr>
  `;
  }).join('');
}

function renderInvoiceEmail(template: string, data: InvoiceEmailData): string {
  let html = template;
  const statusColors = getStatusColors(data.paymentStatus);

  html = html.replace(/{{INVOICE_NUMBER}}/g, data.invoiceNumber || '');
  html = html.replace(/{{INVOICE_DATE}}/g, data.invoiceDate || '');
  html = html.replace(/{{DUE_DATE}}/g, data.dueDate || '');
  html = html.replace(/{{STATUS_BG_COLOR}}/g, statusColors.bg);
  html = html.replace(/{{STATUS_TEXT_COLOR}}/g, statusColors.text);
  html = html.replace(/{{STATUS_LABEL}}/g, statusColors.label);

  const consolidationBadge = data.isConsolidation
    ? `<div style="text-align:right;margin-bottom:8px;"><span style="display:inline-block;background:#0f172a;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Consolidación Aplicada</span></div>`
    : '';
  const maritimeBadge = data.source === 'maritime'
    ? `<div style="text-align:right;margin-bottom:8px;"><span style="display:inline-block;background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Carga Marítima</span></div>`
    : '';
  html = html.replace(/{{CONSOLIDATION_BADGE}}/g, consolidationBadge + maritimeBadge);

  const permitDisclaimer = data.hasPermitItems
    ? `<tr><td style="padding: 0 24px 16px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:800;color:#92400e;margin-bottom:6px;">&#9888; Este envío incluye paquetes con permisos de importación</div>
            <div style="font-size:11px;color:#78350f;line-height:1.5;">Uno o más paquetes requieren trámite especial en aduana. SmartLogistics le informará sobre el proceso y costos adicionales antes de proceder con la entrega.</div>
          </td></tr>
        </table>
      </td></tr>`
    : '';
  html = html.replace(/{{PERMIT_DISCLAIMER}}/g, permitDisclaimer);

  html = html.replace(/{{CUSTOMER_NAME}}/g, data.customerName || 'Cliente SmartLogistics');
  html = html.replace(/{{CUSTOMER_EMAIL}}/g, data.customerEmail || 'N/A');
  html = html.replace(/{{CUSTOMER_DNI}}/g, data.customerDni || 'N/A');
  html = html.replace(/{{CUSTOMER_ADDRESS}}/g, data.customerAddress || 'San José, Costa Rica');

  html = html.replace(/{{ITEMS_ROWS}}/g, generateItemsRows(data.items, data.currencySymbol, data.source));
  html = html.replace(/{{CURRENCY_SYMBOL}}/g, data.currencySymbol);
  html = html.replace(/{{SUBTOTAL}}/g, data.subtotal.toFixed(2));
  html = html.replace(/{{TOTAL}}/g, data.total.toFixed(2));

  if (data.discountAmount && data.discountAmount > 0) {
    const discPctLabel = data.discountPercentage && data.discountPercentage > 0
      ? ` (${data.discountPercentage.toFixed(1)}%)`
      : '';
    html = html.replace(/{{DISCOUNT_ROW}}/g, `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 12px; font-weight: 600; color: #dc2626;">Descuento${discPctLabel}:</td>
              <td align="right" style="font-size: 12px; font-weight: 700; color: #dc2626;">-${data.currencySymbol}${data.discountAmount.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `);
  } else {
    html = html.replace(/{{DISCOUNT_ROW}}/g, '');
  }

  if (data.ivaEnabled && data.tax > 0) {
    html = html.replace(/{{TAX_ROW}}/g, `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 12px; font-weight: 600; color: #475569;">IVA (13%):</td>
              <td align="right" style="font-size: 12px; font-weight: 700; color: #0f172a;">${data.currencySymbol}${data.tax.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `);
  } else {
    html = html.replace(/{{TAX_ROW}}/g, '');
  }

  if (data.exchangeRate && data.exchangeRate > 0 && data.totalCRC && data.totalCRC > 0) {
    html = html.replace(/{{TC_CRC_ROW}}/g, `
      <tr>
        <td style="padding-top: 12px; text-align: right;">
          <div style="font-size: 13px; color: #475569; margin-bottom: 4px; font-weight: 500;">TC: <span style="font-family: ui-monospace, monospace; font-weight: 700;">${data.exchangeRate.toFixed(2)}</span></div>
          <div style="font-size: 16px; font-weight: 700; color: #1e293b;">Total CRC: <span style="font-family: ui-monospace, monospace;">&#x20A1;${Math.round(data.totalCRC).toLocaleString('es-CR')}</span></div>
        </td>
      </tr>
    `);
  } else {
    html = html.replace(/{{TC_CRC_ROW}}/g, '');
  }

  if (data.notes && data.notes.trim()) {
    html = html.replace(/{{NOTES_ROW}}/g, `
      <tr>
        <td style="padding: 0 24px 20px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px;">
            <tr>
              <td style="padding: 16px;">
                <div style="font-size: 10px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">📝 Notas</div>
                <div style="font-size: 11px; color: #0c4a6e; line-height: 1.5;">${data.notes}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `);
  } else {
    html = html.replace(/{{NOTES_ROW}}/g, '');
  }

  return html;
}

describe('ZERO-LEAK INVOICE EMAIL TEMPLATE INVARIANCE TEST SUITE', () => {
  it('1. should verify template file exists and has valid corporate markup', () => {
    expect(templateHtml).toBeDefined();
    expect(templateHtml.length).toBeGreaterThan(1000);
    expect(templateHtml).toContain('TIQUETE ELECTRÓNICO');
    expect(templateHtml).toContain('SmartLogistics');
  });

  it('2. Scenario: Standard single package air invoice with CRC exchange rate (e.g. SL13)', () => {
    const data: InvoiceEmailData = {
      customerName: 'GABRIELA ALFARO SANCHEZ',
      customerEmail: 'gabriela.alfaro.1992@gmail.com',
      customerDni: '114970420',
      customerAddress: 'San Jose Centro',
      invoiceNumber: 'SL13-20260819102028187',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      items: [{ tracking: 'GFUS01065635648649', weight: 0.18, amount: 8.0 }],
      subtotal: 8.0,
      tax: 0,
      total: 8.0,
      currencySymbol: '$',
      ivaEnabled: false,
      exchangeRate: 470,
      totalCRC: 3760,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('GABRIELA ALFARO SANCHEZ');
    expect(rendered).toContain('SL13-20260819102028187');
    expect(rendered).toContain('GFUS01065635648649');
    expect(rendered).toContain('TC: <span style="font-family: ui-monospace, monospace; font-weight: 700;">470.00</span>');
    expect(rendered).toContain('Total CRC: <span style="font-family: ui-monospace, monospace;">&#x20A1;');
    expect(rendered).toContain(Math.round(data.totalCRC!).toLocaleString('es-CR'));
  });

  it('3. Scenario: Multi-package consolidated invoice with Consolidation Badge (e.g. SL26575)', () => {
    const data: InvoiceEmailData = {
      customerName: 'Karla Gabriela Alfaro Rojas',
      customerEmail: 'exclusividadeskarla@yahoo.com',
      customerDni: '114970420',
      customerAddress: 'San Jose Centro',
      invoiceNumber: 'SL26575-20260819101913711-C',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      isConsolidation: true,
      items: [
        { tracking: 'GFUS01065934184451', weight: 0.12, amount: 3.6 },
        { tracking: 'GFUS01066032271808', weight: 0.28, amount: 8.4 },
      ],
      subtotal: 12.0,
      tax: 0,
      total: 12.0,
      currencySymbol: '$',
      ivaEnabled: false,
      exchangeRate: 470,
      totalCRC: 5640,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('Consolidación Aplicada');
    expect(rendered).toContain('GFUS01065934184451');
    expect(rendered).toContain('GFUS01066032271808');
    expect(rendered).toContain('$12.00');
  });

  it('4. Scenario: Invoice with import permit packages (Fitosanitarios)', () => {
    const data: InvoiceEmailData = {
      customerName: 'Juan Pablo Cordero Najera',
      customerEmail: 'jpcordero03@gmail.com',
      customerDni: '110380340',
      customerAddress: 'San Jose Centro',
      invoiceNumber: 'SL1208-20260819100000000',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      hasPermitItems: true,
      items: [
        { tracking: 'TBA333418271432', weight: 0.56, amount: 15.0, requiresPermit: true },
      ],
      subtotal: 15.0,
      tax: 0,
      total: 15.0,
      currencySymbol: '$',
      ivaEnabled: false,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('PERMISOS');
    expect(rendered).toContain('Este envío incluye paquetes con permisos de importación');
  });

  it('5. Scenario: Maritime Cargo invoice (FT³ units and descriptive captions)', () => {
    const data: InvoiceEmailData = {
      customerName: 'Importaciones Caribe S.A.',
      customerEmail: 'compras@caribe.cr',
      customerDni: '3101999888',
      customerAddress: 'Limón Puerto',
      invoiceNumber: 'SL9901-20260819100000000-M',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      source: 'maritime',
      items: [
        { tracking: 'WR-89211', description: 'Repuestos Automotrices 15 Cajas', weight: 14.5, amount: 250.0 },
      ],
      subtotal: 250.0,
      tax: 0,
      total: 250.0,
      currencySymbol: '$',
      ivaEnabled: false,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('Carga Marítima');
    expect(rendered).toContain('14.50 FT³');
    expect(rendered).toContain('WR-89211 — REPUESTOS AUTOMOTRICES 15 CAJAS');
  });

  it('6. Scenario: Invoice with fixed and percentage discount', () => {
    const data: InvoiceEmailData = {
      customerName: 'Cliente Preferencial',
      customerEmail: 'vip@empresa.com',
      customerDni: '111111111',
      customerAddress: 'Escazú',
      invoiceNumber: 'SL100-20260819100000000',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      items: [{ tracking: '1Z9999999999999999', weight: 2.0, amount: 20.0 }],
      subtotal: 20.0,
      discountAmount: 4.0,
      discountPercentage: 20,
      tax: 0,
      total: 16.0,
      currencySymbol: '$',
      ivaEnabled: false,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('Descuento (20.0%):');
    expect(rendered).toContain('-$4.00');
    expect(rendered).toContain('$16.00');
  });

  it('7. Scenario: Invoice with IVA 13% enabled and calculated', () => {
    const data: InvoiceEmailData = {
      customerName: 'Empresa Factura Electrónica',
      customerEmail: 'contabilidad@empresa.cr',
      customerDni: '3101555444',
      customerAddress: 'San Pedro',
      invoiceNumber: 'SL500-20260819100000000',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      items: [{ tracking: '94001000000000000000', weight: 1.0, amount: 10.0 }],
      subtotal: 10.0,
      tax: 1.3,
      total: 11.3,
      currencySymbol: '$',
      ivaEnabled: true,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('IVA (13%):');
    expect(rendered).toContain('$1.30');
    expect(rendered).toContain('$11.30');
  });

  it('8. Scenario: Invoice with custom notes', () => {
    const data: InvoiceEmailData = {
      customerName: 'Mario Vargas',
      customerEmail: 'mario@test.com',
      customerDni: '112233445',
      customerAddress: 'Heredia',
      invoiceNumber: 'SL200-20260819100000000',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'pending',
      items: [{ tracking: 'TBA123456789012', weight: 0.5, amount: 5.0 }],
      subtotal: 5.0,
      tax: 0,
      total: 5.0,
      currencySymbol: '$',
      ivaEnabled: false,
      notes: 'Entregar en portería del condominio después de las 2 PM.',
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('Notas');
    expect(rendered).toContain('Entregar en portería del condominio después de las 2 PM.');
  });

  it('9. Scenario: Invoice without optional fields (Zero-Leak test on all edge tags)', () => {
    const data: InvoiceEmailData = {
      customerName: 'Cliente Simple',
      customerEmail: 'simple@test.com',
      customerDni: '',
      customerAddress: '',
      invoiceNumber: 'SL1-20260819100000000',
      invoiceDate: '19/08/2026',
      dueDate: '22/08/2026',
      paymentStatus: 'paid',
      items: [{ tracking: '1Z1111111111111111', weight: 0, amount: 0 }],
      subtotal: 0,
      tax: 0,
      total: 0,
      currencySymbol: '$',
      ivaEnabled: false,
    };

    const rendered = renderInvoiceEmail(templateHtml, data);
    // ABSOLUTE ASSERTION: No curly braces placeholders ever survive
    expect(rendered).not.toMatch(/{{[A-Z0-9_]+}}/i);
    expect(rendered).toContain('Pagado');
    expect(rendered).not.toContain('{{TC_CRC_ROW}}');
    expect(rendered).not.toContain('{{CONSOLIDATION_BADGE}}');
    expect(rendered).not.toContain('{{PERMIT_DISCLAIMER}}');
    expect(rendered).not.toContain('{{DISCOUNT_ROW}}');
    expect(rendered).not.toContain('{{TAX_ROW}}');
    expect(rendered).not.toContain('{{NOTES_ROW}}');
  });
});
