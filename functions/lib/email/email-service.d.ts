/**
 * Email Service Module
 *
 * Handles sending emails using Resend API
 * Based on smart-portal-2 implementation
 */
/**
 * Invoice email data interface
 */
export interface InvoiceEmailData {
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
/**
 * Send invoice email using Resend
 */
export declare function sendInvoiceEmail(data: InvoiceEmailData): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
}>;
/**
 * Email delivery status from Resend API
 */
export interface EmailDeliveryStatus {
    id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    last_event: string;
}
/**
 * Check email delivery status via Resend GET /emails/{id}
 */
export declare function getEmailStatus(resendMessageId: string): Promise<{
    success: boolean;
    status?: EmailDeliveryStatus;
    error?: string;
}>;
/**
 * Check delivery status for multiple Resend message IDs
 */
export declare function getEmailStatusBatch(messageIds: string[]): Promise<Array<{
    messageId: string;
    success: boolean;
    status?: EmailDeliveryStatus;
    error?: string;
}>>;
/**
 * Generic email data interface
 */
export interface GenericEmailData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
}
/**
 * Welcome email data interface
 */
export interface WelcomeEmailData {
    fullName: string;
    email: string;
    role: string;
    appUrl?: string;
}
/**
 * Send welcome email to a newly created user via Resend
 */
export declare function sendWelcomeEmail(data: WelcomeEmailData): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
}>;
/**
 * Send generic email using Resend
 */
export declare function sendEmail(data: GenericEmailData): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
}>;
//# sourceMappingURL=email-service.d.ts.map