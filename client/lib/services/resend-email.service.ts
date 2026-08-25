/**
 * Resend Email Service
 * Handles invoice email sending with delivery tracking
 * Uses Resend API for reliable email delivery and status tracking
 */

import { firebaseApi } from "@/lib/firebase/callable";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface InvoiceEmailData {
  invoiceId: string;
  invoiceNumber: string;
  recipient: EmailRecipient;
  pdfUrl?: string;
  customMessage?: string;
  language?: "en" | "es";
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt?: string;
}

export interface EmailStatusUpdate {
  messageId: string;
  status: "sent" | "delivered" | "opened" | "bounced" | "failed";
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Send invoice email via Resend
 * Returns message ID for tracking
 */
export async function sendInvoiceEmail(
  data: InvoiceEmailData
): Promise<EmailSendResult> {
  try {
    const result = await (firebaseApi.invoices as any).sendEmail({
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      recipientEmail: data.recipient.email,
      recipientName: data.recipient.name,
      pdfUrl: data.pdfUrl,
      customMessage: data.customMessage,
      language: data.language || "es",
    });

    if (result.success) {
      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        error: result.error || "Failed to send email",
      };
    }
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Resend invoice email (for already sent invoices)
 */
export async function resendInvoiceEmail(
  data: InvoiceEmailData
): Promise<EmailSendResult> {
  // Same as sendInvoiceEmail but logs as resend
  return sendInvoiceEmail(data);
}

/**
 * Get email status from Resend
 * Note: This requires webhook integration for real-time updates
 */
export async function getEmailStatus(
  messageId: string
): Promise<EmailStatusUpdate | null> {
  try {
    const result = await (firebaseApi.invoices as any).getEmailStatus({
      messageId,
    });

    if (result.success && result.status) {
      return {
        messageId,
        status: result.status,
        timestamp: result.timestamp || new Date().toISOString(),
        metadata: result.metadata,
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting email status:", error);
    return null;
  }
}

/**
 * Batch send emails for multiple invoices
 * Implements rate limiting and error handling
 */
export async function batchSendInvoiceEmails(
  invoices: InvoiceEmailData[],
  onProgress?: (completed: number, total: number, errors: number) => void
): Promise<{
  successful: number;
  failed: number;
  results: Array<{ invoiceId: string; result: EmailSendResult }>;
}> {
  const results: Array<{ invoiceId: string; result: EmailSendResult }> = [];
  let successful = 0;
  let failed = 0;

  // Rate limiting: max 10 concurrent requests
  const batchSize = 10;
  const batches: InvoiceEmailData[][] = [];
  
  for (let i = 0; i < invoices.length; i += batchSize) {
    batches.push(invoices.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(async (invoice) => {
        const result = await sendInvoiceEmail(invoice);
        return { invoiceId: invoice.invoiceId, result };
      })
    );

    for (const promiseResult of batchResults) {
      if (promiseResult.status === "fulfilled") {
        const { invoiceId, result } = promiseResult.value;
        results.push({ invoiceId, result });
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        failed++;
        results.push({
          invoiceId: "unknown",
          result: {
            success: false,
            error: promiseResult.reason?.message || "Unknown error",
          },
        });
      }

      if (onProgress) {
        onProgress(successful + failed, invoices.length, failed);
      }
    }

    // Small delay between batches to respect rate limits
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    successful,
    failed,
    results,
  };
}

/**
 * Format email status for display
 */
export function formatEmailStatus(
  status: string | undefined,
  t: (key: string) => string
): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case "delivered":
      return {
        label: t("invoices.email.delivered"),
        color: "text-green-600 bg-green-50 border-green-200",
        icon: "✓",
      };
    case "opened":
      return {
        label: t("invoices.email.opened"),
        color: "text-blue-600 bg-blue-50 border-blue-200",
        icon: "👁",
      };
    case "sent":
      return {
        label: t("invoices.email.sent"),
        color: "text-cyan-600 bg-cyan-50 border-cyan-200",
        icon: "📧",
      };
    case "bounced":
      return {
        label: t("invoices.email.bounced"),
        color: "text-orange-600 bg-orange-50 border-orange-200",
        icon: "⚠",
      };
    case "failed":
      return {
        label: t("invoices.email.failed"),
        color: "text-red-600 bg-red-50 border-red-200",
        icon: "✗",
      };
    case "not_sent":
    default:
      return {
        label: t("invoices.email.notSent"),
        color: "text-gray-600 bg-gray-50 border-gray-200",
        icon: "○",
      };
  }
}

/**
 * Check if invoice can be sent via email
 */
export function canSendEmail(invoice: {
  status: string;
  clientEmail?: string;
  customer?: { email?: string };
}): { canSend: boolean; reason?: string } {
  const email = invoice.clientEmail || invoice.customer?.email;

  if (!email) {
    return {
      canSend: false,
      reason: "No email address available for this customer",
    };
  }

  if (invoice.status === "annulled") {
    return {
      canSend: false,
      reason: "Cannot send annulled invoices",
    };
  }

  return { canSend: true };
}

/**
 * Validate email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export interface WelcomeEmailCustomerData {
  customerId: string;
  email: string;
  fullName: string;
  slCode?: string;
  customMessage?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  videoUrl?: string;
  videoTitle?: string;
  videoUrl2?: string;
  videoTitle2?: string;
  guideUrl?: string;
  guideTitle?: string;
}

/**
 * Generate invoice-branded welcome email HTML
 */
export function buildWelcomeEmailHtml(data: WelcomeEmailCustomerData): string {
  const slCodeBadge = data.slCode
    ? `<span style="color:#2563eb;font-weight:700;font-family:ui-monospace,monospace;background:#dbeafe;padding:3px 8px;border-radius:4px;font-size:13px;">${data.slCode}</span>`
    : '<span style="color:#64748b;font-style:italic;">En asignación</span>';

  const heroTitle = data.heroTitle?.trim() || "¡Bienvenido a SmartLogistics!";
  const heroSubtitle = data.heroSubtitle?.trim() || "Tu casillero y portal de entregas internacionales ha sido activado con éxito.";

  const noteBox = data.customMessage?.trim()
    ? `
      <tr>
        <td style="padding: 0 24px 16px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-left: 4px solid #0f172a; border-radius: 4px;">
            <tr>
              <td style="padding: 14px 16px;">
                <div style="font-size: 14px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">${data.customMessage.trim()}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
    : "";

  const videoUrl1 = data.videoUrl?.trim() || "https://www.youtube.com/shorts/UfI309_tPS4";
  const videoTitle1 = data.videoTitle?.trim() || "▶ ¿Cómo funciona tu casillero? (Ver Video)";
  const videoUrl2 = data.videoUrl2?.trim() || "https://www.youtube.com/watch?v=oTo8yYFYdKM";
  const videoTitle2 = data.videoTitle2?.trim() || "▶ Tutorial de Envíos y Compras Paso a Paso";

  const resourcesBox = `
      <tr>
        <td style="padding: 0 24px 18px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
            <tr>
              <td style="padding: 16px;">
                <div style="font-size: 11px; font-weight: 800; color: #9f1239; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">🎥 Videos Instructivos y Guías de Usuario</div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  ${videoUrl1 ? `
                    <tr>
                      <td style="padding: 4px 0;">
                        <a href="${videoUrl1}" target="_blank" style="display: block; background-color: #ff0000; color: #ffffff; text-decoration: none; padding: 10px 16px; font-size: 13px; font-weight: 700; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(255, 0, 0, 0.15);">
                          ${videoTitle1}
                        </a>
                      </td>
                    </tr>
                  ` : ""}
                  ${videoUrl2 ? `
                    <tr>
                      <td style="padding: 4px 0;">
                        <a href="${videoUrl2}" target="_blank" style="display: block; background-color: #cc0000; color: #ffffff; text-decoration: none; padding: 10px 16px; font-size: 13px; font-weight: 700; border-radius: 6px; text-align: center; box-shadow: 0 2px 4px rgba(204, 0, 0, 0.15);">
                          ${videoTitle2}
                        </a>
                      </td>
                    </tr>
                  ` : ""}
                  ${data.guideUrl?.trim() ? `
                    <tr>
                      <td style="padding: 4px 0;">
                        <a href="${data.guideUrl.trim()}" target="_blank" style="display: block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 16px; font-size: 13px; font-weight: 700; border-radius: 6px; text-align: center;">
                          ${data.guideTitle?.trim() || "📄 Ver Guía Digital de Envíos"}
                        </a>
                      </td>
                    </tr>
                  ` : ""}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Bienvenido a SmartLogistics!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <!-- System Header Bar (Only Logo) -->
          <tr>
            <td style="padding: 22px 24px; border-bottom: 2px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td valign="middle">
                    <img src="https://smart-portal-admin.web.app/logo-inv.png" alt="SmartLogistics" width="140" style="display: block; border: 0; width: 140px; max-width: 140px; height: auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome Dark Banner -->
          <tr>
            <td style="padding: 20px 24px 10px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0f172a; border-radius: 10px; text-align: center;">
                <tr>
                  <td style="padding: 24px 20px;">
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 6px; letter-spacing: -0.3px;">${heroTitle}</div>
                    <div style="font-size: 13px; color: #94a3b8; line-height: 1.4;">${heroSubtitle}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding: 16px 24px 8px 24px; font-size: 14px; color: #334155; line-height: 1.6;">
              Hola <strong style="color: #0f172a;">${data.fullName}</strong>, es un gusto darle la bienvenida a nuestra plataforma. A partir de este momento cuenta con acceso completo a nuestros servicios de transporte marítimo, aéreo y entregas locales.
            </td>
          </tr>

          <!-- Customer Account Details Card -->
          <tr>
            <td style="padding: 8px 24px 16px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 18px;">
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">Información de la Cuenta</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="40%" style="font-size: 12px; color: #64748b; padding: 4px 0;">Nombre del Cliente:</td>
                        <td width="60%" style="font-size: 13px; font-weight: 700; color: #0f172a; padding: 4px 0;">${data.fullName}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #64748b; padding: 4px 0;">Correo Electrónico:</td>
                        <td style="font-size: 13px; font-weight: 600; color: #0f172a; padding: 4px 0;">${data.email}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; color: #64748b; padding: 4px 0;">Código de Casillero (SL):</td>
                        <td style="padding: 4px 0;">${slCodeBadge}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Custom Body Message -->
          ${noteBox}

          <!-- Video / Guide Resources -->
          ${resourcesBox}

          <!-- Call to Action -->
          <tr>
            <td style="padding: 10px 24px 24px 24px; text-align: center;">
              <div style="font-size: 13px; color: #475569; margin-bottom: 16px; line-height: 1.5;">
                Ingrese al Portal de Clientes para rastrear paquetes, consultar recibos y gestionar sus envíos:
              </div>
              <a href="https://smartlogisticscr.com" target="_blank" style="background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 13px; font-weight: 800; border-radius: 8px; display: inline-block; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.15);">
                Ingresar al Portal SmartLogistics
              </a>
            </td>
          </tr>

          <!-- Bank & Contact Info Card (Invoice System Style) -->
          <tr>
            <td style="padding: 0 24px 20px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">🏦 Canales Oficiales y Cuentas Bancarias</div>
                    <div style="font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">DA SMART LOGISTICS</div>
                    <div style="font-size: 11px; color: #475569;">Céd. Jur. 3102843818</div>
                    
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
                      <tr>
                        <td style="font-size: 11px; color: #475569; padding: 2px 0;"><strong>BAC Colones:</strong> CR17010200009534930951</td>
                      </tr>
                      <tr>
                        <td style="font-size: 11px; color: #475569; padding: 2px 0;"><strong>BAC Dólares:</strong> CR75010200009534930877</td>
                      </tr>
                      <tr>
                        <td style="font-size: 11px; color: #475569; padding: 2px 0;"><strong>SINPE Móvil:</strong> 7105-7790</td>
                      </tr>
                    </table>

                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 10px; margin-bottom: 8px;">📱 Canales de Atención WhatsApp</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 11px; color: #475569; padding: 3px 0;">
                          <strong style="color: #0f172a;">💬 WhatsApp Servicio al Cliente (7193-5962):</strong><br>
                          <span style="color: #64748b; font-size: 10.5px;">Para consultas generales e información de casillero. <em>(El seguimiento y rastreo de paquetes en tránsito debe realizarse directamente desde nuestro sitio web: <a href="https://smartlogisticscr.com" target="_blank" style="color: #0f172a; text-decoration: underline; font-weight: 600;">smartlogisticscr.com</a>).</em></span>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 11px; color: #475569; padding: 5px 0 0 0;">
                          <strong style="color: #0f172a;">🧾 WhatsApp Facturación y Pagos (7105-7790):</strong><br>
                          <span style="color: #64748b; font-size: 10.5px;">Para envío de comprobantes de pago (SINPE / Transferencia) y estado de recibos.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #ffffff; margin-bottom: 4px;">SmartLogistics CR &bull; San José, Costa Rica</div>
              <div style="margin-bottom: 8px;"><a href="https://smartlogisticscr.com" target="_blank" style="color: #38bdf8; text-decoration: none;">www.smartlogisticscr.com</a></div>
              <div>© ${new Date().getFullYear()} SmartLogistics Costa Rica. Todos los derechos reservados.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send welcome email to a newly registered customer
 */
export async function sendWelcomeCustomerEmail(
  data: WelcomeEmailCustomerData
): Promise<EmailSendResult> {
  try {
    const htmlContent = buildWelcomeEmailHtml(data);

    const plainText = `Hola ${data.fullName},\n\n¡Bienvenido a SmartLogistics! Tu cuenta ha sido registrada exitosamente.\n\nCorreo: ${data.email}${data.slCode ? `\nCasillero (SL): ${data.slCode}` : ""}\n\nIngresa en: https://smartlogisticscr.com\n\nSmartLogistics Costa Rica`;

    const result = await firebaseApi.email.sendEmail({
      to: data.email,
      subject: `¡Bienvenido a SmartLogistics! ${data.slCode ? `— Casillero ${data.slCode}` : ""}`,
      html: htmlContent,
      text: plainText,
    });

    if (result.success && result.data?.success !== false) {
      return {
        success: true,
        messageId: result.data?.messageId,
        sentAt: new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        error: result.error || "No se pudo enviar el correo de bienvenida",
      };
    }
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

