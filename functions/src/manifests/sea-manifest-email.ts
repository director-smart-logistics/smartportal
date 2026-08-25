import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as fs from 'fs';
import * as path from 'path';
import { sendEmail } from '../email/email-service';


export interface SeaManifestInvoiceEmailData {
  customerName: string;
  customerEmail: string;
  customerDni: string;
  customerAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  tracking: string;
  length: string;
  width: string;
  height: string;
  volume: number;
  basePrice: number;
  bodegajeCost: number;
  permisoCost: number;
  subtotal: number;
  tax: number;
  total: number;
  exchangeRate: number;
  totalCRC: number;
  ivaEnabled: boolean;
}

function loadSeaInvoiceTemplate(): string {
  try {
    const templatePath = path.join(__dirname, '..', '..', 'templates', 'sea-invoice-email.html');
    return fs.readFileSync(templatePath, 'utf8');
  } catch (error) {
    logger.error('[loadSeaInvoiceTemplate] Error loading template:', error);
    throw new Error('Failed to load sea invoice email template');
  }
}

function replaceTemplateVariables(template: string, data: SeaManifestInvoiceEmailData): string {
  let html = template;
  
  html = html.replace(/{{INVOICE_NUMBER}}/g, data.invoiceNumber || '');
  html = html.replace(/{{INVOICE_DATE}}/g, data.invoiceDate || '');
  html = html.replace(/{{DUE_DATE}}/g, data.invoiceDate || ''); // Contado
  html = html.replace(/{{STATUS_BG_COLOR}}/g, '#fef3c7');
  html = html.replace(/{{STATUS_TEXT_COLOR}}/g, '#92400e');
  html = html.replace(/{{STATUS_LABEL}}/g, 'Pendiente');
  
  html = html.replace(/{{CONSOLIDATION_BADGE}}/g, '');
  html = html.replace(/{{PERMIT_DISCLAIMER}}/g, data.permisoCost > 0 ? 
    `<tr><td style="padding: 0 24px 16px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:11px;font-weight:800;color:#92400e;margin-bottom:6px;">&#9888; Este env&#237;o incluye cobros por trámites o permisos</div>
        </td></tr>
      </table>
    </td></tr>` : '');

  html = html.replace(/{{CUSTOMER_NAME}}/g, data.customerName || 'Cliente No Identificado');
  html = html.replace(/{{CUSTOMER_EMAIL}}/g, data.customerEmail || 'N/A');
  html = html.replace(/{{CUSTOMER_DNI}}/g, data.customerDni || 'N/A');
  html = html.replace(/{{CUSTOMER_ADDRESS}}/g, data.customerAddress || 'N/A');
  
  let itemsHtml = `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">Servicios Log&#237;sticos Marítimo</div>
        <div style="font-size: 11px; color: #64748b; font-family: ui-monospace, monospace;">Trk: ${data.tracking} / Dim: ${data.length}x${data.width}x${data.height}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #475569;">
        ${data.volume ? `${data.volume} PIES³` : '-'}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; font-weight: 700; color: #0f172a;">
        $${data.basePrice.toFixed(2)}
      </td>
    </tr>
  `;

  if (data.bodegajeCost > 0) {
    itemsHtml += `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">Bodegaje</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #475569;">—</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; font-weight: 700; color: #0f172a;">
        $${data.bodegajeCost.toFixed(2)}
      </td>
    </tr>`;
  }

  if (data.permisoCost > 0) {
    itemsHtml += `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">Permisos / Trámites</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #475569;">—</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 12px; font-weight: 700; color: #0f172a;">
        $${data.permisoCost.toFixed(2)}
      </td>
    </tr>`;
  }

  html = html.replace(/{{ITEMS_ROWS}}/g, itemsHtml);
  html = html.replace(/{{CURRENCY_SYMBOL}}/g, '$');
  html = html.replace(/{{SUBTOTAL}}/g, data.subtotal.toFixed(2));
  html = html.replace(/{{TOTAL}}/g, data.total.toFixed(2));
  html = html.replace(/{{DISCOUNT_ROW}}/g, '');

  if (data.ivaEnabled && data.tax > 0) {
    html = html.replace(/{{TAX_ROW}}/g, `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size: 12px; font-weight: 600; color: #475569;">IVA (13%):</td>
              <td align="right" style="font-size: 12px; font-weight: 700; color: #0f172a;">$${data.tax.toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    `);
  } else {
    html = html.replace(/{{TAX_ROW}}/g, '');
  }
  
  if (data.exchangeRate > 0 && data.totalCRC > 0) {
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
  
  html = html.replace(/{{NOTES_ROW}}/g, '');
  return html;
}

export const slSendSeaManifestInvoiceEmail = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const data = request.data as SeaManifestInvoiceEmailData;
  
  if (!data.customerEmail) {
    throw new HttpsError('invalid-argument', 'Customer email is required');
  }
  
  logger.info('[slSendSeaManifestInvoiceEmail] Sending sea invoice email', {
    to: data.customerEmail,
    invoiceNumber: data.invoiceNumber
  });
  
  try {
    const template = loadSeaInvoiceTemplate();
    const htmlContent = replaceTemplateVariables(template, data);

    const result = await sendEmail({
      to: data.customerEmail,
      subject: `Recibo ${data.invoiceNumber} - SmartLogistics (Marítimo)`,
      html: htmlContent,
      text: `Recibo Marítimo ${data.invoiceNumber}. Total: $${data.total.toFixed(2)}`,
    });

    if (!result.success) {
      logger.error('[slSendSeaManifestInvoiceEmail] Failed to send email', { error: result.error });
      throw new HttpsError('internal', result.error || 'Failed to send email');
    }
    
    return {
      success: true,
      messageId: result.messageId
    };
  } catch (error: any) {
    logger.error('[slSendSeaManifestInvoiceEmail] Error', { error: error.message });
    throw new HttpsError('internal', error.message || 'Unknown error');
  }
});
