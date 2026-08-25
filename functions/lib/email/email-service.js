"use strict";
/**
 * Email Service Module
 *
 * Handles sending emails using Resend API
 * Based on smart-portal-2 implementation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceEmail = sendInvoiceEmail;
exports.getEmailStatus = getEmailStatus;
exports.getEmailStatusBatch = getEmailStatusBatch;
exports.sendWelcomeEmail = sendWelcomeEmail;
exports.sendEmail = sendEmail;
const v2_1 = require("firebase-functions/v2");
const resend_1 = require("resend");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./config");
let resendClient = null;
/**
 * Get or create Resend client
 */
function getResendClient() {
    if (!config_1.RESEND_CONFIG.apiKey) {
        v2_1.logger.warn('[getResendClient] Resend API key not configured');
        return null;
    }
    if (!resendClient) {
        resendClient = new resend_1.Resend(config_1.RESEND_CONFIG.apiKey);
        v2_1.logger.info('[getResendClient] Resend client initialized');
    }
    return resendClient;
}
/**
 * Get status color configuration
 */
function getStatusColors(status) {
    switch (status) {
        case 'paid':
            return { bg: '#dcfce7', text: '#166534', label: 'Pagado' };
        case 'overdue':
            return { bg: '#fee2e2', text: '#991b1b', label: 'Vencido' };
        default:
            return { bg: '#fef3c7', text: '#92400e', label: 'Pendiente' };
    }
}
/**
 * formatInvoiceItemCaption — server mirror of the client-side helper in
 * NovaInvoicePreview.tsx. Three cases:
 *   1. isManual=true        → description (operator-entered third-party charge)
 *   2. source==='maritime'  → tracking + description (WR + dimensional info)
 *   3. otherwise            → tracking only (regular tracked package)
 *
 * Keep this in lock-step with `client/components/nova/NovaInvoicePreview.tsx`
 * — the contract is enforced by NovaInvoicePreview.spec.tsx on the client
 * and by the customer email QA check on the server.
 */
function formatInvoiceItemCaption(item, source) {
    const tracking = (item.tracking || '').toUpperCase();
    const description = (item.description || '').trim();
    const isManual = !!item.isManual;
    const isMaritime = (source || '').toLowerCase() === 'maritime';
    if (isManual)
        return description.toUpperCase() || '-';
    if (isMaritime) {
        if (tracking && description)
            return `${tracking} — ${description.toUpperCase()}`;
        return tracking || description.toUpperCase() || '-';
    }
    return tracking || '-';
}
/**
 * Generate items rows HTML for invoice email
 */
function generateItemsRows(items, currencySymbol, source) {
    return items.map(item => {
        const permitBadge = item.requiresPermit
            ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:4px;font-size:9px;font-weight:700;padding:1px 6px;margin-left:6px;vertical-align:middle;">&#9888; PERMISOS</span>`
            : '';
        return `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-size: 12px; font-weight: 600; color: #0f172a; margin-bottom: 2px;">Servicios Log&#237;sticos${permitBadge}</div>
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
/**
 * Load invoice email template
 */
function loadInvoiceEmailTemplate() {
    try {
        const templatePath = path.join(__dirname, '..', '..', 'templates', 'invoice-email.html');
        return fs.readFileSync(templatePath, 'utf8');
    }
    catch (error) {
        v2_1.logger.error('[loadInvoiceEmailTemplate] Error loading template:', error);
        throw new Error('Failed to load invoice email template');
    }
}
/**
 * Replace invoice template variables with actual data
 */
function replaceInvoiceTemplateVariables(template, data) {
    let html = template;
    const statusColors = getStatusColors(data.paymentStatus);
    html = html.replace(/{{INVOICE_NUMBER}}/g, data.invoiceNumber || '');
    html = html.replace(/{{INVOICE_DATE}}/g, data.invoiceDate || '');
    html = html.replace(/{{DUE_DATE}}/g, data.dueDate || '');
    html = html.replace(/{{STATUS_BG_COLOR}}/g, statusColors.bg);
    html = html.replace(/{{STATUS_TEXT_COLOR}}/g, statusColors.text);
    html = html.replace(/{{STATUS_LABEL}}/g, statusColors.label);
    const consolidationBadge = data.isConsolidation
        ? `<div style="text-align:right;margin-bottom:8px;"><span style="display:inline-block;background:#0f172a;color:#fff;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Consolidaci&#243;n Aplicada</span></div>`
        : '';
    const maritimeBadge = data.source === 'maritime'
        ? `<div style="text-align:right;margin-bottom:8px;"><span style="display:inline-block;background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd;border-radius:4px;font-size:9px;font-weight:700;padding:3px 10px;text-transform:uppercase;letter-spacing:0.08em;">Carga Mar&#237;tima</span></div>`
        : '';
    html = html.replace(/{{CONSOLIDATION_BADGE}}/g, consolidationBadge + maritimeBadge);
    const permitDisclaimer = data.hasPermitItems
        ? `<tr><td style="padding: 0 24px 16px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:800;color:#92400e;margin-bottom:6px;">&#9888; Este env&#237;o incluye paquetes con permisos de importaci&#243;n</div>
            <div style="font-size:11px;color:#78350f;line-height:1.5;">Uno o m&#225;s paquetes requieren tr&#225;mite especial en aduana. SmartLogistics le informar&#225; sobre el proceso y costos adicionales antes de proceder con la entrega.</div>
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
    }
    else {
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
    }
    else {
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
    }
    else {
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
    }
    else {
        html = html.replace(/{{NOTES_ROW}}/g, '');
    }
    return html;
}
/**
 * Generate plain text version of invoice email
 */
function generatePlainTextInvoice(data) {
    const itemsList = data.items.map(item => `- ${formatInvoiceItemCaption(item, data.source)}: ${data.currencySymbol}${item.amount.toFixed(2)}`).join('\n');
    return `
Recibo de Envío - SmartLogistics

Hola ${data.customerName},

Se ha generado un nuevo recibo para usted.

N° Recibo: ${data.invoiceNumber}
Fecha: ${data.invoiceDate}
Pago: DE CONTADO
Estado: ${getStatusColors(data.paymentStatus).label}

DETALLE:
${itemsList}

Subtotal: ${data.currencySymbol}${data.subtotal.toFixed(2)}
${data.ivaEnabled ? `IVA (13%): ${data.currencySymbol}${data.tax.toFixed(2)}` : ''}
TOTAL: ${data.currencySymbol}${data.total.toFixed(2)}
${data.exchangeRate && data.totalCRC ? `TC: ${data.exchangeRate.toFixed(2)} | Total CRC: ₡${Math.round(data.totalCRC).toLocaleString('es-CR')}` : ''}

INFORMACIÓN DE PAGO:
${config_1.EMAIL_DEFAULTS.companyName}
${config_1.EMAIL_DEFAULTS.companyId}
BAC Colones: ${config_1.EMAIL_DEFAULTS.bankAccountColones}
BAC Dólares: ${config_1.EMAIL_DEFAULTS.bankAccountDollars}
SINPE Móvil: ${config_1.EMAIL_DEFAULTS.sinpeMobile}

⚠️ IMPORTANTE: El pago debe realizarse en los próximos 2-3 días hábiles.

Gracias por confiar en SmartLogistics.
${config_1.EMAIL_DEFAULTS.website}
  `.trim();
}
/**
 * Send invoice email using Resend
 */
async function sendInvoiceEmail(data) {
    const resend = getResendClient();
    if (!resend) {
        v2_1.logger.error('[sendInvoiceEmail] Resend client not available');
        return { success: false, error: 'Resend client not configured. Set RESEND_API_KEY environment variable.' };
    }
    if (!data.customerEmail) {
        v2_1.logger.warn('[sendInvoiceEmail] No customer email provided');
        return { success: false, error: 'No customer email provided' };
    }
    try {
        const template = loadInvoiceEmailTemplate();
        const htmlContent = replaceInvoiceTemplateVariables(template, data);
        const plainText = generatePlainTextInvoice(data);
        const messageId = `SL-INV-${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const { data: responseData, error } = await resend.emails.send({
            from: `${config_1.RESEND_CONFIG.invoiceSenderName} <${config_1.RESEND_CONFIG.invoiceSenderEmail}>`,
            to: [data.customerEmail],
            replyTo: config_1.RESEND_CONFIG.invoiceSenderEmail,
            subject: `Recibo ${data.invoiceNumber} - SmartLogistics${data.source === 'maritime' ? ' (Marítimo)' : ''}`,
            html: htmlContent,
            text: plainText,
            headers: {
                'X-Entity-Ref-ID': messageId,
                'X-Mailer': 'SmartLogistics-Mailer/2.0',
                'Feedback-ID': 'SL:invoice:smartlogistics:transactional',
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'high',
            }
        });
        if (error) {
            v2_1.logger.error('[sendInvoiceEmail] Resend API error:', {
                to: data.customerEmail,
                invoiceNumber: data.invoiceNumber,
                error: error.message
            });
            return { success: false, error: error.message };
        }
        v2_1.logger.info('[sendInvoiceEmail] Invoice email sent successfully:', {
            messageId: responseData?.id || messageId,
            to: data.customerEmail,
            invoiceNumber: data.invoiceNumber
        });
        return { success: true, messageId: responseData?.id || messageId };
    }
    catch (error) {
        v2_1.logger.error('[sendInvoiceEmail] Error sending invoice email:', {
            to: data.customerEmail,
            invoiceNumber: data.invoiceNumber,
            error: error?.message || 'Unknown error'
        });
        return { success: false, error: error?.message || 'Unknown error' };
    }
}
/**
 * Check email delivery status via Resend GET /emails/{id}
 */
async function getEmailStatus(resendMessageId) {
    const resend = getResendClient();
    if (!resend) {
        return { success: false, error: 'Resend client not configured' };
    }
    if (!resendMessageId) {
        return { success: false, error: 'No Resend message ID provided' };
    }
    try {
        const { data, error } = await resend.emails.get(resendMessageId);
        if (error) {
            v2_1.logger.error('[getEmailStatus] Resend API error:', {
                messageId: resendMessageId,
                error: error.message,
            });
            return { success: false, error: error.message };
        }
        const status = {
            id: data?.id || resendMessageId,
            from: data?.from || '',
            to: data?.to || [],
            subject: data?.subject || '',
            created_at: data?.created_at || '',
            last_event: data?.last_event || 'unknown',
        };
        v2_1.logger.info('[getEmailStatus] Status retrieved:', {
            messageId: resendMessageId,
            lastEvent: status.last_event,
        });
        return { success: true, status };
    }
    catch (error) {
        v2_1.logger.error('[getEmailStatus] Error checking status:', {
            messageId: resendMessageId,
            error: error?.message || 'Unknown error',
        });
        return { success: false, error: error?.message || 'Unknown error' };
    }
}
/**
 * Check delivery status for multiple Resend message IDs
 */
async function getEmailStatusBatch(messageIds) {
    const results = [];
    for (const messageId of messageIds) {
        const result = await getEmailStatus(messageId);
        results.push({ messageId, ...result });
    }
    return results;
}
/**
 * Send welcome email to a newly created user via Resend
 */
async function sendWelcomeEmail(data) {
    const resend = getResendClient();
    if (!resend) {
        v2_1.logger.warn('[sendWelcomeEmail] Resend client not available — skipping welcome email');
        return { success: false, error: 'Resend client not configured' };
    }
    try {
        const templatePath = path.join(__dirname, '..', '..', 'templates', 'welcome-email.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        const appUrl = data.appUrl || 'https://portal.smartlogisticscr.com';
        const roleLabel = data.role.replace(/_/g, ' ');
        html = html.replace(/{{FULL_NAME}}/g, data.fullName || 'Usuario');
        html = html.replace(/{{USER_EMAIL}}/g, data.email);
        html = html.replace(/{{USER_ROLE}}/g, roleLabel);
        html = html.replace(/{{APP_URL}}/g, appUrl);
        const plainText = `Hola ${data.fullName},\n\nTu cuenta ha sido creada en el Portal Administrativo de SmartLogistics.\n\nCorreo: ${data.email}\nRol: ${roleLabel}\n\nIngresa en: ${appUrl}\n\nUsa el botón "Continuar con Google" con tu correo para acceder. El acceso es exclusivamente mediante Google.\n\nSmartLogistics\nwww.smartlogisticscr.com`;
        const messageId = `SL-WEL-${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const { data: responseData, error } = await resend.emails.send({
            from: `DA SmartLogistics Costa Rica - Depto. De Tecnología <${config_1.RESEND_CONFIG.senderEmail}>`,
            to: [data.email],
            replyTo: config_1.RESEND_CONFIG.replyTo,
            subject: 'Acceso al Portal Administrativo — Depto. de Tecnología · SmartLogistics',
            html,
            text: plainText,
            headers: {
                'X-Entity-Ref-ID': messageId,
                'X-Mailer': 'SmartLogistics-Mailer/2.0',
            },
        });
        if (error) {
            v2_1.logger.error('[sendWelcomeEmail] Resend error', { to: data.email, error: error.message });
            return { success: false, error: error.message };
        }
        v2_1.logger.info('[sendWelcomeEmail] Welcome email sent', { to: data.email, messageId: responseData?.id || messageId });
        return { success: true, messageId: responseData?.id || messageId };
    }
    catch (err) {
        v2_1.logger.error('[sendWelcomeEmail] Error sending welcome email', { to: data.email, error: err?.message });
        return { success: false, error: err?.message || 'Unknown error' };
    }
}
/**
 * Send generic email using Resend
 */
async function sendEmail(data) {
    const resend = getResendClient();
    if (!resend) {
        return { success: false, error: 'Resend client not configured' };
    }
    try {
        const messageId = `SL-${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;
        const { data: responseData, error } = await resend.emails.send({
            from: `${config_1.RESEND_CONFIG.senderName} <${config_1.RESEND_CONFIG.senderEmail}>`,
            to: [data.to],
            replyTo: data.replyTo || config_1.RESEND_CONFIG.replyTo,
            subject: data.subject,
            html: data.html,
            text: data.text,
            headers: {
                'X-Entity-Ref-ID': messageId,
                'X-Mailer': 'SmartLogistics-Mailer/2.0'
            }
        });
        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true, messageId: responseData?.id || messageId };
    }
    catch (error) {
        return { success: false, error: error?.message || 'Unknown error' };
    }
}
//# sourceMappingURL=email-service.js.map