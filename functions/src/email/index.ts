/**
 * Email Functions
 * 
 * Firebase Cloud Functions for sending emails via Resend
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { sendInvoiceEmail, sendEmail, getEmailStatus, getEmailStatusBatch, InvoiceEmailData, GenericEmailData, EmailDeliveryStatus } from './email-service';

/**
 * Send Invoice Email Cloud Function
 * 
 * Callable function to send invoice emails to customers
 */
export const sendInvoiceEmailFunction = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const data = request.data as InvoiceEmailData;
  
  if (!data.customerEmail) {
    throw new HttpsError('invalid-argument', 'Customer email is required');
  }
  
  if (!data.invoiceNumber) {
    throw new HttpsError('invalid-argument', 'Invoice number is required');
  }
  
  if (!data.items || data.items.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one item is required');
  }
  
  logger.info('[sendInvoiceEmailFunction] Sending invoice email', {
    to: data.customerEmail,
    invoiceNumber: data.invoiceNumber,
    itemCount: data.items.length
  });
  
  const result = await sendInvoiceEmail(data);
  
  if (!result.success) {
    logger.error('[sendInvoiceEmailFunction] Failed to send email', {
      error: result.error,
      to: data.customerEmail
    });
    throw new HttpsError('internal', result.error || 'Failed to send email');
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
export const sendEmailFunction = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const data = request.data as GenericEmailData;
  
  if (!data.to) {
    throw new HttpsError('invalid-argument', 'Recipient email is required');
  }
  
  if (!data.subject) {
    throw new HttpsError('invalid-argument', 'Subject is required');
  }
  
  if (!data.html) {
    throw new HttpsError('invalid-argument', 'HTML content is required');
  }
  
  logger.info('[sendEmailFunction] Sending email', {
    to: data.to,
    subject: data.subject
  });
  
  const result = await sendEmail(data);
  
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Failed to send email');
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
export const getEmailStatusFunction = onCall({
  cors: true,
  maxInstances: 10,
}, async (request) => {
  const { messageId } = request.data as { messageId: string };
  
  if (!messageId) {
    throw new HttpsError('invalid-argument', 'Resend messageId is required');
  }
  
  logger.info('[getEmailStatusFunction] Checking status', { messageId });
  
  const result = await getEmailStatus(messageId);
  
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Failed to get email status');
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
export const getEmailStatusBatchFunction = onCall({
  cors: true,
  maxInstances: 5,
}, async (request) => {
  const { messageIds } = request.data as { messageIds: string[] };
  
  if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
    throw new HttpsError('invalid-argument', 'messageIds array is required');
  }
  
  if (messageIds.length > 50) {
    throw new HttpsError('invalid-argument', 'Maximum 50 message IDs per request');
  }
  
  logger.info('[getEmailStatusBatchFunction] Checking batch status', { count: messageIds.length });
  
  const results = await getEmailStatusBatch(messageIds);
  
  return {
    success: true,
    results,
  };
});

export { sendInvoiceEmail, sendEmail, getEmailStatus, getEmailStatusBatch, InvoiceEmailData, GenericEmailData, EmailDeliveryStatus };
