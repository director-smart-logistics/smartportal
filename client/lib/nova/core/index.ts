/**
 * Nova Module — Core Processing
 *
 * Manifest file parsing, pricing, permit detection.
 * These are deterministic, side-effect-free functions used
 * to transform raw Excel/CSV data into structured ManifestRow[].
 */

export {
  processManifestFile,
  generateCSV,
  generateXLSX,
  downloadCSV,
  downloadXLSX,
  generateMultiMatchCSV,
  downloadMultiMatchCSV,
} from '@/lib/services/manifest-processor';

export type {
  ManifestRow,
  ProcessingResult,
  ManifestConfig,
  ManifestType,
  ProcessingStep,
  StepCallback,
  MultiMatchRow,
  ReviewReason,
} from '@/lib/services/manifest-processor';

export {
  detectPermit,
  detectPermitFromManifestId,
  detectPermitFromDescription,
} from '@/lib/services/permit-detector';

export { getPricingData } from '@/lib/services/pricing-service';
