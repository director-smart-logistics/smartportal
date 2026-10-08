import { describe, it, expect } from 'vitest';
import { invoiceBadge, shortInvoiceNumber } from '../invoice-badge';

describe('Nova invoice badge (…number [estado])', () => {
  it('short number: last 6 digits; consolidated invoices keep -C', () => {
    expect(shortInvoiceNumber('SL261404-20260925162655257')).toBe('…655257');
    expect(shortInvoiceNumber('SL900-202609201234230-C')).toBe('…234230-C');
    expect(shortInvoiceNumber('')).toBe('—');
  });
  it('state in Spanish', () => {
    expect(invoiceBadge('SL1-20260925162655257', 'draft').text).toBe('…655257 [Borrador]');
    expect(invoiceBadge('SL1-202609201234230-C', 'sent').text).toBe('…234230-C [Enviada]');
    expect(invoiceBadge('X-123456', 'paid').status).toBe('Pagada');
    expect(invoiceBadge('X-123456', 'overdue').status).toBe('Vencida');
    expect(invoiceBadge('X-123456', undefined).status).toBe('Borrador');
  });
});
