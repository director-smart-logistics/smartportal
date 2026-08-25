import { z } from 'zod';

// Schema for a single manifest row
export const ManifestRowSchema = z.object({
  // Required fields
  trackingNumber: z.string()
    .min(1, 'Tracking number is required')
    .trim(),
  weight: z.union([
    z.number().positive('Weight must be a positive number'),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num)) {
        throw new Error('Weight must be a valid number');
      }
      return num;
    }).refine((num) => num > 0, 'Weight must be positive'),
  ]),
  description: z.string()
    .min(1, 'Description is required')
    .trim(),
  guideId: z.string()
    .min(1, 'Guide ID is required')
    .trim(),
  
  customerName: z.string()
    .min(2, 'Customer name must be at least 2 characters')
    .trim()
    .refine(
      (name) => {
        // Reject single letter names
        if (name.trim().length === 1) {
          return false;
        }
        // Reject names that contain dash
        if (name.includes('-')) {
          return false;
        }
        return true;
      },
      {
        message: 'Customer name cannot be a single letter or contain dashes',
      }
    ),
  
  // Optional fields
  origin: z.string()
    .optional()
    .transform((val) => val === '' || val === undefined ? undefined : val?.trim()),
  destination: z.string()
    .optional()
    .transform((val) => val === '' || val === undefined ? undefined : val?.trim()),
  customerId: z.string()
    .optional()
    .transform((val) => val === '' || val === undefined ? undefined : val),
  type: z.string()
    .optional()
    .default('air')
    .transform((val) => val === '' || val === undefined ? 'air' : val),
  status: z.string()
    .optional()
    .default('pending'),
});

export type ManifestRow = z.infer<typeof ManifestRowSchema>;

// Schema for the full manifest data
export const ManifestDataSchema = z.object({
  rows: z.array(ManifestRowSchema).min(1, 'At least one row is required'),
  mappings: z.record(z.string()).optional(),
  fileName: z.string(),
  fileType: z.enum(['csv', 'xlsx']),
  uploadedAt: z.date().optional(),
});

export type ManifestData = z.infer<typeof ManifestDataSchema>;

// Schema for validation results
export const ValidationErrorSchema = z.object({
  rowIndex: z.number(),
  field: z.string(),
  value: z.any(),
  error: z.string(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

// Schema for duplicate detection result
export const DuplicateDetectionSchema = z.object({
  trackingNumber: z.string(),
  rowIndices: z.array(z.number()).min(2),
  isDuplicate: z.boolean(),
});

export type DuplicateDetection = z.infer<typeof DuplicateDetectionSchema>;

// Schema for manifest row with validation metadata
export const ManifestRowWithMetaSchema = ManifestRowSchema.extend({
  rowIndex: z.number(),
  isDuplicate: z.boolean().default(false),
  duplicateOf: z.array(z.number()).default([]),
  validationErrors: z.array(ValidationErrorSchema).default([]),
  isValid: z.boolean().default(true),
});

export type ManifestRowWithMeta = z.infer<typeof ManifestRowWithMetaSchema>;

// Schema for the request to backend
export const ProcessManifestRequestSchema = z.object({
  rows: z.array(ManifestRowSchema),
  fileName: z.string(),
  fileType: z.enum(['csv', 'xlsx']),
});

export type ProcessManifestRequest = z.infer<typeof ProcessManifestRequestSchema>;

// Schema for backend response
export const ProcessManifestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    created: z.number(),
    duplicates: z.number(),
    failed: z.number(),
    errors: z.array(z.object({
      trackingNumber: z.string(),
      error: z.string(),
    })).optional(),
  }).optional(),
});

export type ProcessManifestResponse = z.infer<typeof ProcessManifestResponseSchema>;
