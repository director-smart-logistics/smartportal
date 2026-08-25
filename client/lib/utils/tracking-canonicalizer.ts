/**
 * Tracking Canonicalizer & Carrier Classifier
 * ───────────────────────────────────────────
 * Standardized GS1 / UPU S10 / USPS Pub 199 Tracking Parser.
 *
 * Classifies tracking numbers into two operational categories:
 * 1. 'POSTAL_COMPOSITE' (USPS, FedEx GS1): Barcode payloads that may contain
 *    application identifiers (e.g. 420 + routing ZIP). Canonical extraction
 *    strips routing prefixes and produces the 20/22-digit IMpb Core.
 * 2. 'DISCRETE_ALPHANUMERIC' (UPS 1Z, Amazon TBA, SpeedLogistics GFUS/GSU,
 *    YunExpress YT, DHL, Cainiao LP, UPU S10 International): Atomic and indivisible
 *    tracking identifiers where letters and digits are bound together. NO suffix slicing allowed.
 *
 * @module utils/tracking-canonicalizer
 */

export type TrackingCategory = 'POSTAL_COMPOSITE' | 'DISCRETE_ALPHANUMERIC';

export interface CanonicalTrackingResult {
  /** Raw, uncleaned input */
  raw: string;
  /** Cleaned, uppercase, trimmed string */
  normalized: string;
  /** Canonical tracking extracted according to carrier specifications */
  canonicalTracking: string;
  /** Categorization for downstream prefix/suffix logic */
  carrierType: TrackingCategory;
  /** Identified carrier brand */
  carrier: 'USPS' | 'UPS' | 'FEDEX' | 'SPEEDLOGISTICS' | 'AMAZON' | 'YUNEXPRESS' | 'DHL' | 'CAINIAO' | 'ONTRAC' | 'SPX' | 'OTHER';
  /** True only for postal composite trackings where suffix probing is valid */
  allowSuffix: boolean;
  /** Array of known valid representation variants for index lookups */
  trackingVariants: string[];
}

/** Known Miami warehouse ZIP codes for USPS predictive expansion */
export const MIAMI_WAREHOUSE_ZIPS = [
  '33166',
  '33122',
  '33192',
  '33178',
  '33172',
  '33126',
  '33169',
  '33182',
];

/**
 * Normalizes input: removes AIM symbology identifiers (e.g. ']C1', ']e0'),
 * whitespace, dashes, underscores, and control characters.
 *
 * @param {string} raw Raw input string
 * @returns {string} Cleaned alphanumeric tracking
 */
export function cleanRawTracking(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
  // Strip AIM barcode symbology identifiers (e.g. ']C1', ']e0', ']d2')
  if (cleaned.startsWith(']') && cleaned.length > 3) {
    cleaned = cleaned.substring(3);
  }
  return cleaned.replace(/[\s\-_]+/g, '').toUpperCase();
}

/**
 * Classifies and canonicalizes a tracking number based on international standards.
 *
 * @param {string} raw Input tracking number from user or barcode scanner
 * @returns {CanonicalTrackingResult} Comprehensive classification result
 */
export function canonicalizeTracking(raw: string): CanonicalTrackingResult {
  const normalized = cleanRawTracking(raw);
  if (!normalized) {
    return {
      raw,
      normalized: '',
      canonicalTracking: '',
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'OTHER',
      allowSuffix: false,
      trackingVariants: [],
    };
  }

  const digitsOnly = normalized.replace(/\D+/g, '');
  const variants = new Set<string>();
  variants.add(normalized);

  // ── 1. SPEEDLOGISTICS / GLOBAL FORWARDING (GFUS / GSU) ───────────────────
  if (/^GFUS[0-9A-Z]{8,24}$/i.test(normalized) || /^GSU[0-9A-Z]{8,24}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'SPEEDLOGISTICS',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 2. UPS 1Z IDENTIFIERS (1Z + 6 alphanumeric account + 2 service + 8 serial + 1 check) ──
  if (/^1Z[A-Z0-9]{16}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'UPS',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 3. AMAZON LOGISTICS (TBA) ───────────────────────────────────────────
  if (/^TBA[0-9]{10,18}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'AMAZON',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 4. YUNEXPRESS (YT) ───────────────────────────────────────────────────
  if (/^YT[0-9]{14,22}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'YUNEXPRESS',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 5. CAINIAO / ALIEXPRESS (LP / CN) ───────────────────────────────────
  if (/^LP[0-9]{12,20}$/i.test(normalized) || /^CN[0-9A-Z]{12,22}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'CAINIAO',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 6. SPX / SHOPEE EXPRESS (SPXMIA / SPX) ─────────────────────────────
  if (/^SPX[0-9A-Z]{10,25}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'SPX',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 7. ONTRAC / LASERSHIP (1LS, C1, etc.) ───────────────────────────────
  if (/^1LS[0-9A-Z]{10,18}$/i.test(normalized) || /^C1[0-9]{12,18}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'ONTRAC',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 7. UPU S10 INTERNATIONAL POSTAL (2 letters + 9 digits + 2 letters, e.g. EA123456789US) ──
  if (/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/i.test(normalized)) {
    const isUspsIntl = normalized.endsWith('US');
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: isUspsIntl ? 'USPS' : 'OTHER',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 8. DHL EXPRESS (10 digits exact or JD / JJD prefix) ──────────────────
  if (/^[0-9]{10}$/.test(normalized) || /^JD[0-9]{16,20}$/i.test(normalized) || /^JJD[0-9]{16,20}$/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'DHL',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 9. USPS COMPOSITE (420 Prefix with ZIP5 or ZIP+4) ────────────────────
  if (digitsOnly.startsWith('420') && digitsOnly.length >= 25) {
    let core = '';
    // Check for 420 + 5-digit ZIP + 20/22-digit IMpb (offset 8)
    if (digitsOnly.length >= 28 && /^[0-9]{5}9/.test(digitsOnly.substring(3))) {
      core = digitsOnly.substring(8);
    }
    // Check for 420 + 9-digit ZIP+4 + 20/22-digit IMpb (offset 12)
    else if (digitsOnly.length >= 32 && /^[0-9]{9}9/.test(digitsOnly.substring(3))) {
      core = digitsOnly.substring(12);
    } else {
      // Fallback: match first occurrence of '9' followed by 19-21 digits
      const match9 = digitsOnly.substring(3).match(/9[0-9]{19,21}/);
      if (match9) {
        core = match9[0];
      }
    }

    if (core && core.length >= 20) {
      variants.add(core);
      variants.add(normalized);
      // Add Miami predictive expansions
      for (const zip of MIAMI_WAREHOUSE_ZIPS) {
        variants.add(`420${zip}${core}`);
      }

      return {
        raw,
        normalized,
        canonicalTracking: core,
        carrierType: 'POSTAL_COMPOSITE',
        carrier: 'USPS',
        allowSuffix: false, // Strict: no partial suffix guessing
        trackingVariants: Array.from(variants),
      };
    }
  }

  // ── 10. FEDEX (12 or 15 digits) & OTHER CARRIER TRACKINGS ────────────────
  if (/^[0-9]{12}$/.test(digitsOnly) || /^[0-9]{15}$/.test(digitsOnly)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'FEDEX',
      allowSuffix: false, // Strict: exact match only
      trackingVariants: [normalized],
    };
  }

  // ── 11. USPS DIRECT IMpb (20, 22, or standard 24 digits starting with 91, 92, 93, 94, 95) ──
  if (/^9[0-9]{19,23}$/.test(digitsOnly)) {
    const core = digitsOnly;
    variants.add(core);
    for (const zip of MIAMI_WAREHOUSE_ZIPS) {
      variants.add(`420${zip}${core}`);
    }

    return {
      raw,
      normalized,
      canonicalTracking: core,
      carrierType: 'POSTAL_COMPOSITE',
      carrier: 'USPS',
      allowSuffix: false, // Strict: no partial suffix guessing
      trackingVariants: Array.from(variants),
    };
  }

  // ── 12. GENERIC ALPHANUMERIC (Fallback for other couriers) ────────────────
  // If string contains letters -> Treat as discrete alphanumeric (no suffix slicing)
  if (/[A-Z]/i.test(normalized)) {
    return {
      raw,
      normalized,
      canonicalTracking: normalized,
      carrierType: 'DISCRETE_ALPHANUMERIC',
      carrier: 'OTHER',
      allowSuffix: false,
      trackingVariants: [normalized],
    };
  }

  // ── 13. PURE NUMERIC (Partial USPS or other courier fallback) ─────────────
  return {
    raw,
    normalized,
    canonicalTracking: normalized,
    carrierType: 'POSTAL_COMPOSITE',
    carrier: digitsOnly.startsWith('9') ? 'USPS' : 'OTHER',
    allowSuffix: false, // Strict: no arbitrary suffix guessing
    trackingVariants: [normalized],
  };
}
