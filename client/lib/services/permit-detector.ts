/**
 * Permit Detection Service
 * 
 * Detects if a manifest or package requires permits based on:
 * - Manifest number/ID patterns
 * - Description keywords
 * - Item category
 * 
 * Logic extracted from smart-portal-2/src/functions/src/tracking-middleware.ts
 * 
 * IMPORTANT:
 * - "DANP" suffix = requires permit (P = Permisos)
 * - "DAN" alone = destination code, NOT a permit indicator
 * - "PERMISOS" or "PERMIT" anywhere = requires permit
 */

export interface PermitDetectionResult {
  requiresPermit: boolean;
  reason: string;
  confidence: number;
  detectedPattern?: string;
}

/**
 * Permit indicator patterns for manifest IDs
 * From tracking-middleware.ts lines 985-990
 */
const MANIFEST_PERMIT_PATTERNS = [
  { pattern: /PERMISOS/i, name: 'PERMISOS', confidence: 1.0 },
  { pattern: /PERMIT/i, name: 'PERMIT', confidence: 1.0 },
  { pattern: /DANP$/i, name: 'DANP suffix', confidence: 1.0 },
  { pattern: /DANP[^A-Z]/i, name: 'DANP', confidence: 0.95 },
];

/**
 * Description keywords that indicate restricted items
 * These items typically require permits
 */
const RESTRICTED_KEYWORDS = [
  // Cosmetics/Personal Care
  { pattern: /\bCOSMETIC[OS]?\b/i, category: 'cosmetics' },
  { pattern: /\bMAKEUP\b/i, category: 'cosmetics' },
  { pattern: /\bPERFUM[E]?\b/i, category: 'cosmetics' },
  { pattern: /\bLOTION\b/i, category: 'cosmetics' },
  { pattern: /\bCREMA\b/i, category: 'cosmetics' },
  
  // Medications/Supplements
  { pattern: /\bMEDICAMENTO[S]?\b/i, category: 'medications' },
  { pattern: /\bMEDICIN[AE]\b/i, category: 'medications' },
  { pattern: /\bSUPLEMENTO[S]?\b/i, category: 'supplements' },
  { pattern: /\bSUPPLEMENT[S]?\b/i, category: 'supplements' },
  { pattern: /\bVITAMIN[AS]?\b/i, category: 'supplements' },
  { pattern: /\bPROTEIN[A]?\b/i, category: 'supplements' },
  
  // Food Items
  { pattern: /\bALIMENTO[S]?\b/i, category: 'food' },
  { pattern: /\bCOMIDA\b/i, category: 'food' },
  { pattern: /\bFOOD\b/i, category: 'food' },
  { pattern: /\bCHOCOLATE[S]?\b/i, category: 'food' },
  { pattern: /\bCANDY\b/i, category: 'food' },
  { pattern: /\bDULCE[S]?\b/i, category: 'food' },
  { pattern: /\bGALLETA[S]?\b/i, category: 'food' },
  { pattern: /\bCOOKIE[S]?\b/i, category: 'food' },
  
  // Explicit permit indicators
  { pattern: /\bPERMISO[S]?\b/i, category: 'permit' },
  { pattern: /\bRESTRICTED\b/i, category: 'restricted' },
  { pattern: /\bRESTRINGIDO\b/i, category: 'restricted' },
];

/**
 * Detect if a manifest ID indicates permits are required
 * 
 * @param manifestId - The manifest number/ID (e.g., "28-02-2026DANP")
 * @returns Detection result with reason and confidence
 */
export function detectPermitFromManifestId(manifestId: string): PermitDetectionResult {
  if (!manifestId || typeof manifestId !== 'string') {
    return {
      requiresPermit: false,
      reason: 'No manifest ID provided',
      confidence: 0,
    };
  }

  const upperManifest = manifestId.toUpperCase().trim();

  for (const { pattern, name, confidence } of MANIFEST_PERMIT_PATTERNS) {
    if (pattern.test(upperManifest)) {
      return {
        requiresPermit: true,
        reason: `Manifest contains "${name}" pattern`,
        confidence,
        detectedPattern: name,
      };
    }
  }

  return {
    requiresPermit: false,
    reason: 'No permit patterns found in manifest ID',
    confidence: 1.0,
  };
}

/**
 * Detect if a description indicates restricted items
 * 
 * @param description - Item description
 * @returns Detection result with category
 */
export function detectPermitFromDescription(description: string): PermitDetectionResult {
  if (!description || typeof description !== 'string') {
    return {
      requiresPermit: false,
      reason: 'No description provided',
      confidence: 0,
    };
  }

  const upperDesc = description.toUpperCase().trim();

  for (const { pattern, category } of RESTRICTED_KEYWORDS) {
    if (pattern.test(upperDesc)) {
      return {
        requiresPermit: true,
        reason: `Description contains restricted item: ${category}`,
        confidence: 0.85,
        detectedPattern: category,
      };
    }
  }

  return {
    requiresPermit: false,
    reason: 'No restricted keywords found in description',
    confidence: 0.9,
  };
}

/**
 * Detect if a filename indicates permits are required
 * 
 * @param filename - The manifest filename
 * @returns Detection result
 */
export function detectPermitFromFilename(filename: string): PermitDetectionResult {
  if (!filename || typeof filename !== 'string') {
    return {
      requiresPermit: false,
      reason: 'No filename provided',
      confidence: 0,
    };
  }

  const upperFilename = filename.toUpperCase().trim();

  for (const { pattern, name, confidence } of MANIFEST_PERMIT_PATTERNS) {
    if (pattern.test(upperFilename)) {
      return {
        requiresPermit: true,
        reason: `Filename contains "${name}" pattern`,
        confidence,
        detectedPattern: name,
      };
    }
  }

  return {
    requiresPermit: false,
    reason: 'No permit patterns found in filename',
    confidence: 1.0,
  };
}

/**
 * Combined permit detection from multiple sources
 * 
 * @param options - Detection options
 * @returns Combined detection result (returns true if ANY source indicates permit)
 */
export function detectPermit(options: {
  manifestId?: string;
  filename?: string;
  description?: string;
}): PermitDetectionResult {
  const results: PermitDetectionResult[] = [];

  if (options.manifestId) {
    results.push(detectPermitFromManifestId(options.manifestId));
  }

  if (options.filename) {
    results.push(detectPermitFromFilename(options.filename));
  }

  if (options.description) {
    results.push(detectPermitFromDescription(options.description));
  }

  const permitRequired = results.find(r => r.requiresPermit);
  
  if (permitRequired) {
    return permitRequired;
  }

  const highestConfidence = results.reduce(
    (max, r) => (r.confidence > max.confidence ? r : max),
    { requiresPermit: false, reason: 'No permit indicators found', confidence: 0 }
  );

  return highestConfidence;
}

/**
 * Batch detect permits for multiple items
 * 
 * @param items - Array of items with description
 * @param manifestId - Optional manifest ID (applies to all)
 * @returns Map of item index to detection result
 */
export function batchDetectPermits(
  items: Array<{ description?: string; index: number }>,
  manifestId?: string
): Map<number, PermitDetectionResult> {
  const results = new Map<number, PermitDetectionResult>();
  
  const manifestResult = manifestId ? detectPermitFromManifestId(manifestId) : null;

  for (const item of items) {
    if (manifestResult?.requiresPermit) {
      results.set(item.index, manifestResult);
    } else if (item.description) {
      results.set(item.index, detectPermitFromDescription(item.description));
    } else {
      results.set(item.index, {
        requiresPermit: false,
        reason: 'No data to analyze',
        confidence: 0.5,
      });
    }
  }

  return results;
}
