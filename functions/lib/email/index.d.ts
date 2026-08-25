/**
 * Email Functions
 *
 * Firebase Cloud Functions for sending emails via Resend
 */
import { sendInvoiceEmail, sendEmail, getEmailStatus, getEmailStatusBatch, InvoiceEmailData, GenericEmailData, EmailDeliveryStatus } from './email-service';
/**
 * Send Invoice Email Cloud Function
 *
 * Callable function to send invoice emails to customers
 */
export declare const sendInvoiceEmailFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    messageId: string | undefined;
}>, unknown>;
/**
 * Send Generic Email Cloud Function
 *
 * Callable function to send generic emails
 */
export declare const sendEmailFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    messageId: string | undefined;
}>, unknown>;
/**
 * Get Email Delivery Status Cloud Function
 *
 * Checks delivery status of a single email via Resend API
 */
export declare const getEmailStatusFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: EmailDeliveryStatus | undefined;
}>, unknown>;
/**
 * Get Email Delivery Status Batch Cloud Function
 *
 * Checks delivery status of multiple emails via Resend API
 */
export declare const getEmailStatusBatchFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    results: {
        messageId: string;
        success: boolean;
        status?: EmailDeliveryStatus;
        error?: string;
    }[];
}>, unknown>;
export { sendInvoiceEmail, sendEmail, getEmailStatus, getEmailStatusBatch, InvoiceEmailData, GenericEmailData, EmailDeliveryStatus };
//# sourceMappingURL=index.d.ts.map