import { describe, it, expect } from 'vitest';
import { sanitizeDocument, InvoiceSchema, PackageSchema } from '.././converters';

describe('Firestore Data Converters & Zod Sanitization', () => {
  describe('Invoices Sanitization', () => {
    it('should parse valid numerical values correctly', () => {
      const input = {
        id: 'inv_123',
        invoiceNumber: 'INV-1001',
        totalAmount: 150.50,
        subtotalAmount: 140.00,
        taxAmount: 10.50,
        weight: 2.5,
        realWeight: 2.36,
      };

      const result = sanitizeDocument('invoices', input);
      expect(result.totalAmount).toBe(150.50);
      expect(result.subtotalAmount).toBe(140.00);
      expect(result.realWeight).toBe(2.36);
    });

    it('should convert numerical values from strings to numbers', () => {
      const input = {
        id: 'inv_123',
        totalAmount: '150.50',
        subtotalAmount: '140.00',
        taxAmount: '10.50',
        weight: '2.5',
        realWeight: '2.36',
      };

      const result = sanitizeDocument('invoices', input);
      expect(result.totalAmount).toBe(150.50);
      expect(result.subtotalAmount).toBe(140.00);
      expect(result.taxAmount).toBe(10.50);
      expect(result.weight).toBe(2.5);
      expect(result.realWeight).toBe(2.36);
    });

    it('should handle invalid string numbers by defaulting to 0 or undefined', () => {
      const input = {
        id: 'inv_123',
        totalAmount: 'invalid-number',
        realWeight: 'invalid-weight',
      };

      const result = sanitizeDocument('invoices', input);
      expect(result.totalAmount).toBe(0);
      expect(result.realWeight).toBeUndefined();
    });

    it('should sanitize invoice items correctly', () => {
      const input = {
        id: 'inv_123',
        totalAmount: 100,
        invoiceItems: [
          {
            packageId: 'pkg_1',
            weight: '1.5',
            realWeight: '1.36',
            unitPrice: '50.00',
            subtotal: '75.00',
          }
        ]
      };

      const result = sanitizeDocument('invoices', input);
      expect(result.invoiceItems).toHaveLength(1);
      const item = result.invoiceItems[0];
      expect(item.weight).toBe(1.5);
      expect(item.realWeight).toBe(1.36);
      expect(item.unitPrice).toBe(50);
      expect(item.subtotal).toBe(75);
    });
  });

  describe('Packages Sanitization', () => {
    it('should parse weight and optional realWeight correctly', () => {
      const input = {
        id: 'pkg_123',
        weight: '3.4',
        realWeight: '3.12',
      };

      const result = sanitizeDocument('packages', input);
      expect(result.weight).toBe(3.4);
      expect(result.realWeight).toBe(3.12);
    });

    it('should handle undefined realWeight', () => {
      const input = {
        id: 'pkg_123',
        weight: 3.4,
      };

      const result = sanitizeDocument('packages', input);
      expect(result.weight).toBe(3.4);
      expect(result.realWeight).toBeUndefined();
    });

    it('should default malformed weights to 0', () => {
      const input = {
        id: 'pkg_123',
        weight: 'corrupted-weight',
      };

      const result = sanitizeDocument('packages', input);
      expect(result.weight).toBe(0);
    });
  });
});
