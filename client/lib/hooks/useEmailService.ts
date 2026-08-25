/**
 * useEmailService Hook
 * 
 * Provides email sending functionality via Firebase callable functions
 */

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

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
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currencySymbol: string;
  ivaEnabled: boolean;
  exchangeRate?: number;
  totalCRC?: number;
  notes?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export function useEmailService() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send invoice email to customer
   */
  const sendInvoiceEmail = useCallback(async (data: InvoiceEmailData): Promise<EmailResult> => {
    setSending(true);
    setError(null);

    try {
      const functions = getFunctions(getApp(), 'us-central1');
      const sendInvoice = httpsCallable<InvoiceEmailData, { success: boolean; messageId?: string }>(
        functions,
        'sendInvoiceEmailFunction'
      );

      const result = await sendInvoice(data);
      
      return {
        success: result.data.success,
        messageId: result.data.messageId,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to send email';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setSending(false);
    }
  }, []);

  /**
   * Send generic email
   */
  const sendEmail = useCallback(async (data: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<EmailResult> => {
    setSending(true);
    setError(null);

    try {
      const functions = getFunctions(getApp(), 'us-central1');
      const send = httpsCallable<typeof data, { success: boolean; messageId?: string }>(
        functions,
        'sendEmailFunction'
      );

      const result = await send(data);
      
      return {
        success: result.data.success,
        messageId: result.data.messageId,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to send email';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setSending(false);
    }
  }, []);

  return {
    sendInvoiceEmail,
    sendEmail,
    sending,
    error,
  };
}

export default useEmailService;
