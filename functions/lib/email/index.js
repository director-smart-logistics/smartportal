"use strict";
/**
 * Email Functions
 *
 * Firebase Cloud Functions for sending emails via Resend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailStatusBatch = exports.getEmailStatus = exports.sendEmail = exports.sendInvoiceEmail = exports.getEmailStatusBatchFunction = exports.getEmailStatusFunction = exports.sendEmailFunction = exports.sendInvoiceEmailFunction = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const email_service_1 = require("./email-service");
Object.defineProperty(exports, "sendInvoiceEmail", { enumerable: true, get: function () { return email_service_1.sendInvoiceEmail; } });
Object.defineProperty(exports, "sendEmail", { enumerable: true, get: function () { return email_service_1.sendEmail; } });
Object.defineProperty(exports, "getEmailStatus", { enumerable: true, get: function () { return email_service_1.getEmailStatus; } });
Object.defineProperty(exports, "getEmailStatusBatch", { enumerable: true, get: function () { return email_service_1.getEmailStatusBatch; } });
/**
 * Send Invoice Email Cloud Function
 *
 * Callable function to send invoice emails to customers
 */
exports.sendInvoiceEmailFunction = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
}, async (request) => {
    const data = request.data;
    if (!data.customerEmail) {
        throw new https_1.HttpsError('invalid-argument', 'Customer email is required');
    }
    if (!data.invoiceNumber) {
        throw new https_1.HttpsError('invalid-argument', 'Invoice number is required');
    }
    if (!data.items || data.items.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'At least one item is required');
    }
    v2_1.logger.info('[sendInvoiceEmailFunction] Sending invoice email', {
        to: data.customerEmail,
        invoiceNumber: data.invoiceNumber,
        itemCount: data.items.length
    });
    const result = await (0, email_service_1.sendInvoiceEmail)(data);
    if (!result.success) {
        v2_1.logger.error('[sendInvoiceEmailFunction] Failed to send email', {
            error: result.error,
            to: data.customerEmail
        });
        throw new https_1.HttpsError('internal', result.error || 'Failed to send email');
    }
    return {
        success: true,
        messageId: result.messageId
    };
});
/**
 * Send Generic Email Cloud Function
 *
 * Callable function to send generic emails
 */
exports.sendEmailFunction = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
}, async (request) => {
    const data = request.data;
    if (!data.to) {
        throw new https_1.HttpsError('invalid-argument', 'Recipient email is required');
    }
    if (!data.subject) {
        throw new https_1.HttpsError('invalid-argument', 'Subject is required');
    }
    if (!data.html) {
        throw new https_1.HttpsError('invalid-argument', 'HTML content is required');
    }
    v2_1.logger.info('[sendEmailFunction] Sending email', {
        to: data.to,
        subject: data.subject
    });
    const result = await (0, email_service_1.sendEmail)(data);
    if (!result.success) {
        throw new https_1.HttpsError('internal', result.error || 'Failed to send email');
    }
    return {
        success: true,
        messageId: result.messageId
    };
});
/**
 * Get Email Delivery Status Cloud Function
 *
 * Checks delivery status of a single email via Resend API
 */
exports.getEmailStatusFunction = (0, https_1.onCall)({
    cors: true,
    maxInstances: 10,
}, async (request) => {
    const { messageId } = request.data;
    if (!messageId) {
        throw new https_1.HttpsError('invalid-argument', 'Resend messageId is required');
    }
    v2_1.logger.info('[getEmailStatusFunction] Checking status', { messageId });
    const result = await (0, email_service_1.getEmailStatus)(messageId);
    if (!result.success) {
        throw new https_1.HttpsError('internal', result.error || 'Failed to get email status');
    }
    return {
        success: true,
        status: result.status,
    };
});
/**
 * Get Email Delivery Status Batch Cloud Function
 *
 * Checks delivery status of multiple emails via Resend API
 */
exports.getEmailStatusBatchFunction = (0, https_1.onCall)({
    cors: true,
    maxInstances: 5,
}, async (request) => {
    const { messageIds } = request.data;
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'messageIds array is required');
    }
    if (messageIds.length > 50) {
        throw new https_1.HttpsError('invalid-argument', 'Maximum 50 message IDs per request');
    }
    v2_1.logger.info('[getEmailStatusBatchFunction] Checking batch status', { count: messageIds.length });
    const results = await (0, email_service_1.getEmailStatusBatch)(messageIds);
    return {
        success: true,
        results,
    };
});
//# sourceMappingURL=index.js.map