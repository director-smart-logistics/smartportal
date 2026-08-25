import { z } from 'zod';

// Helper to safely parse numbers, defaulting to 0 if invalid/null
const safeNumber = z.union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  });

// Helper to safely parse optional numbers, defaulting to undefined if invalid/null
const safeOptionalNumber = z.union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  });

// Schema for Invoice items
const InvoiceItemSchema = z.object({
  packageId: z.string().optional(),
  description: z.string().optional(),
  weight: safeNumber,
  realWeight: safeOptionalNumber,
  quantity: safeNumber.default(1),
  unitPrice: safeNumber,
  amount: safeNumber.optional(),
  subtotal: safeNumber.optional(),
}).passthrough();

// Schema for Invoice document
export const InvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string().optional().default(''),
  customerId: z.string().optional().default(''),
  status: z.string().optional().default('draft'),
  totalAmount: safeNumber,
  subtotalAmount: safeNumber.optional(),
  discountAmount: safeNumber.optional(),
  taxAmount: safeNumber.optional(),
  weight: safeNumber.optional(),
  realWeight: safeOptionalNumber,
  exchangeRate: safeNumber.optional(),
  invoiceItems: z.array(InvoiceItemSchema).optional(),
}).passthrough();

// Schema for Package document
export const PackageSchema = z.object({
  id: z.string(),
  trackingNumber: z.string().optional().default(''),
  customerId: z.string().optional().default(''),
  customerName: z.string().optional().default(''),
  status: z.string().optional().default('pending'),
  weight: safeNumber,
  realWeight: safeOptionalNumber,
  price: safeNumber.optional(),
  subtotal: safeNumber.optional(),
  tax: safeNumber.optional(),
}).passthrough();

/**
 * Sanitizes a raw document from Firestore based on its collection name
 */
export function sanitizeDocument(collectionName: string, data: any): any {
  if (!data) return data;
  try {
    if (collectionName === 'invoices') {
      return InvoiceSchema.parse({ id: data.id || '', ...data });
    }
    if (collectionName === 'packages') {
      return PackageSchema.parse({ id: data.id || '', ...data });
    }
  } catch (err) {
    console.error(`[Sanitization] Failed to parse document in ${collectionName}:`, err);
  }
  return data;
}
