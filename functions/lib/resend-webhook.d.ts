/**
 * Resend Webhook Handler
 * Processes email delivery events from Resend API
 * Updates invoice email status in Firestore
 */
import * as functions from "firebase-functions";
/**
 * HTTP endpoint for Resend webhooks
 * Endpoint: POST /resendWebhook
 */
export declare const resendWebhook: functions.https.HttpsFunction;
/**
 * Callable function to manually check email status
 * Used when webhook delivery fails or for manual status checks
 */
export declare const checkEmailStatus: functions.https.CallableFunction<any, Promise<{
    success: boolean;
    error: string;
    status?: undefined;
    timestamp?: undefined;
    logs?: undefined;
} | {
    success: boolean;
    status: any;
    timestamp: any;
    logs: any;
    error?: undefined;
}>, unknown>;
/**
 * Callable: fetch real-time delivery status from Resend API for a single invoice.
 * Looks up the lastResendMessageId on the invoice, calls resend.emails.get(),
 * updates emailStatus / emailStatusLogs in Firestore, and returns the new status.
 */
export declare const slRefreshEmailStatus: functions.https.CallableFunction<any, Promise<{
    success: boolean;
    reason: string;
    messageId?: undefined;
    status?: undefined;
} | {
    success: boolean;
    reason: string;
    messageId: string;
    status?: undefined;
} | {
    success: boolean;
    status: "delivered" | "sent" | "failed" | "opened" | "bounced" | "complained" | "clicked";
    reason?: undefined;
    messageId?: undefined;
}>, unknown>;
/**
 * Manual sync function for email statuses
 * Can be called manually or triggered via Cloud Scheduler
 * Note: For automatic daily sync, configure Cloud Scheduler to call this function
 */
export declare const syncEmailStatuses: functions.https.CallableFunction<any, Promise<{
    success: boolean;
    updated: number;
    errors: number;
    total: number;
}>, unknown>;
//# sourceMappingURL=resend-webhook.d.ts.map