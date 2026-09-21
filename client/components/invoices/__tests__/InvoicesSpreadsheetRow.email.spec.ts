import { describe, it, expect } from 'vitest';
import { getInvoiceEmailInfo } from '../InvoicesSpreadsheetRow';

describe('InvoicesSpreadsheetRow - Email Status & Delivery Proof Logic', () => {
  it('1. Confirmed Delivery (Green / Success): has valid Resend ID and emailSent true', () => {
    const invoice = {
      id: 'inv-1',
      invoiceNumber: 'SL8219-20260914154747724',
      clientEmail: 'vivigats@hotmail.com',
      emailSent: true,
      emailSentAt: '2026-09-14T23:50:15.952Z',
      lastResendMessageId: '75e248da-3369-4133-adba-2056a5372a4a',
      emailStatus: 'delivered',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('success');
    expect(info.lastResendId).toBe('75e248da-3369-4133-adba-2056a5372a4a');
    expect(info.emailDate).toBe('2026-09-14T23:50:15.952Z');
    expect(info.emailRecipient).toBe('vivigats@hotmail.com');
    expect(info.emailStatus).toBe('delivered');
  });

  it('2. False Positive Prevention (Red / Error): emailSent true but lastResendMessageId is null', () => {
    const invoice = {
      id: 'inv-2',
      invoiceNumber: 'SL3301-20260914165218148',
      clientEmail: 'stephmp26@hotmail.com',
      emailSent: true,
      emailSentAt: '2026-09-14T23:49:55.194Z',
      lastResendMessageId: null,
      emailStatus: 'sent',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('error');
    expect(info.isFalsePositive).toBe(true);
    expect(info.lastResendId).toBeNull();
  });

  it('3. Bounced Email (Red / Error): recipient server rejected the email', () => {
    const invoice = {
      id: 'inv-3',
      invoiceNumber: 'SL100-20260914100000000',
      clientEmail: 'invalid@nonexistentdomain12345.com',
      emailSent: true,
      lastResendMessageId: 'abc-123',
      emailStatus: 'bounced',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('error');
    expect(info.isFailedOrBounced).toBe(true);
    expect(info.emailStatus).toBe('bounced');
  });

  it('4. Complained / Spam Report (Red / Error)', () => {
    const invoice = {
      id: 'inv-4',
      invoiceNumber: 'SL200-20260914100000000',
      clientEmail: 'client@domain.com',
      emailSent: true,
      lastResendMessageId: 'def-456',
      emailStatus: 'complained',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('error');
    expect(info.emailStatus).toBe('complained');
  });

  it('5. Not Sent / Draft (Gray / None): invoice has not been sent yet', () => {
    const invoice = {
      id: 'inv-5',
      invoiceNumber: 'SL300-20260914100000000',
      clientEmail: 'customer@domain.com',
      emailSent: false,
      status: 'draft',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('none');
    expect(info.lastResendId).toBeNull();
  });

  it('6. Missing Customer Email: handles empty/null email gracefully', () => {
    const invoice = {
      id: 'inv-6',
      invoiceNumber: 'Encomiendas-20260914155346014',
      clientEmail: '',
      emailSent: false,
      status: 'draft',
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('none');
    expect(info.emailRecipient).toBe('');
  });

  it('7. Multi-Send Logs: picks the latest log for resendMessageId and sentAt', () => {
    const invoice = {
      id: 'inv-7',
      invoiceNumber: 'SL400-20260914100000000',
      clientEmail: 'user@test.com',
      emailSent: true,
      emailSendLogs: [
        { resendMessageId: 'id-old-1', sentAt: '2026-09-14T10:00:00.000Z', sentTo: 'user@test.com' },
        { resendMessageId: 'id-new-2', sentAt: '2026-09-14T12:00:00.000Z', sentTo: 'user@test.com' },
      ],
    };

    const info = getInvoiceEmailInfo(invoice);
    expect(info.state).toBe('success');
    expect(info.lastResendId).toBe('id-new-2');
    expect(info.emailDate).toBe('2026-09-14T12:00:00.000Z');
    expect(info.sendCount).toBe(2);
  });
});
