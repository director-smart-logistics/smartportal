import { z } from 'zod';

/**
 * Customer Import Validation Schema
 * 
 * Validates CSV rows for customer import with comprehensive rules:
 * - Required fields: fullName, idNumber, email, phone
 * - Unique constraints: email, idNumber, slCode
 * - Format validation: email, phone, UUID
 * - Length constraints on all string fields
 */
export const CustomerImportSchema = z.object({
  // Required: Name fields
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name must not exceed 255 characters')
    .trim(),

  // Optional: Name components (auto-populated on backend if not provided)
  firstName: z
    .string()
    .max(100, 'First name must not exceed 100 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  lastName: z
    .string()
    .max(155, 'Last name must not exceed 155 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Required: Identity
  idNumber: z
    .string()
    .min(5, 'ID number must be at least 5 characters')
    .max(50, 'ID number must not exceed 50 characters')
    .trim(),

  // Required: Contact
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must not exceed 255 characters')
    .trim()
    .toLowerCase(),

  phone: z
    .string()
    .regex(/^[\d\s\+\-\(\)]+$/, 'Phone must contain only numbers, spaces, +, -, ( )')
    .min(1, 'Phone number is required')
    .max(20, 'Phone must not exceed 20 characters')
    .trim(),

  // Optional: Address fields
  address: z
    .string()
    .max(255, 'Address must not exceed 255 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  city: z
    .string()
    .max(100, 'City must not exceed 100 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  country: z
    .string()
    .max(100, 'Country must not exceed 100 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  zipCode: z
    .string()
    .max(20, 'Zip code must not exceed 20 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Optional: Account code (must be unique if provided)
  slCode: z
    .string()
    .max(50, 'SL account code must not exceed 50 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Optional: Delivery addresses
  deliveryAddress1: z
    .string()
    .max(255, 'Delivery address 1 must not exceed 255 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  deliveryAddress2: z
    .string()
    .max(255, 'Delivery address 2 must not exceed 255 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  deliveryAddress3: z
    .string()
    .max(255, 'Delivery address 3 must not exceed 255 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Optional: Route preference (must be valid UUID if provided)
  preferredRouteId: z
    .string()
    .uuid('Preferred route ID must be a valid UUID')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Optional: Notes
  notes: z
    .string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .trim()
    .optional()
    .nullable()
    .transform(val => val || null),

  // Optional: Status with default
  status: z
    .enum(['active', 'inactive', 'suspended'], {
      errorMap: () => ({ message: 'Status must be one of: active, inactive, suspended' }),
    })
    .default('active'),
});

export type CustomerImportRow = z.infer<typeof CustomerImportSchema>;

/**
 * Validation result for a single row
 */
export interface InvalidRow {
  row: number; // Row number in CSV (1-indexed, accounting for header)
  data: any; // Original row data
  errors: string[]; // List of validation errors
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  valid: CustomerImportRow[];
  invalid: InvalidRow[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

/**
 * Validate CSV rows for customer import
 * 
 * Performs:
 * 1. Schema validation (Zod)
 * 2. Uniqueness checks within CSV
 * 3. Uniqueness checks against existing database records
 * 
 * @param rows - Parsed CSV rows
 * @param existingCustomers - Existing customers from database
 * @returns Validation result with valid/invalid rows
 */
export async function validateCustomerCSV(
  rows: any[],
  existingCustomers: any[]
): Promise<ValidationResult> {
  const valid: CustomerImportRow[] = [];
  const invalid: InvalidRow[] = [];

  // Track uniqueness within CSV
  const emailsInCSV = new Set<string>();
  const idNumbersInCSV = new Set<string>();
  const slCodesInCSV = new Set<string>();

  // Track existing data (case-insensitive)
  const existingEmails = new Set(
    existingCustomers.map((c) => c.email.toLowerCase())
  );
  const existingIdNumbers = new Set(
    existingCustomers
      .filter((c) => c.idNumber)
      .map((c) => c.idNumber.toLowerCase())
  );
  const existingSlCodes = new Set(
    existingCustomers
      .filter((c) => c.slCode)
      .map((c) => c.slCode.toLowerCase())
  );

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // +2 for header row and 1-based indexing
    const errors: string[] = [];

    try {
      // Validate with Zod schema
      const parsedRow = CustomerImportSchema.parse(row);

      // Check uniqueness constraints
      const email = parsedRow.email.toLowerCase();
      const idNumber = parsedRow.idNumber.toLowerCase();
      const slCode = parsedRow.slCode?.toLowerCase();

      // Email uniqueness
      if (existingEmails.has(email)) {
        errors.push('Email already exists in database');
      } else if (emailsInCSV.has(email)) {
        errors.push('Duplicate email in CSV');
      } else {
        emailsInCSV.add(email);
      }

      // ID Number uniqueness
      if (existingIdNumbers.has(idNumber)) {
        errors.push('ID number already exists in database');
      } else if (idNumbersInCSV.has(idNumber)) {
        errors.push('Duplicate ID number in CSV');
      } else {
        idNumbersInCSV.add(idNumber);
      }

      // SL Account Code uniqueness (if provided)
      if (slCode) {
        if (existingSlCodes.has(slCode)) {
          errors.push('SL account code already exists in database');
        } else if (slCodesInCSV.has(slCode)) {
          errors.push('Duplicate SL account code in CSV');
        } else {
          slCodesInCSV.add(slCode);
        }
      }

      if (errors.length === 0) {
        valid.push(parsedRow);
      } else {
        invalid.push({ row: rowNumber, data: row, errors });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
      } else {
        errors.push('Unknown validation error');
      }
      invalid.push({ row: rowNumber, data: row, errors });
    }
  }

  return {
    valid,
    invalid,
    summary: {
      total: rows.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: invalid.filter((r) =>
        r.errors.some((e) => e.includes('Duplicate') || e.includes('already exists'))
      ).length,
    },
  };
}
