/**
 * Client-side pricing calculator for manifest ingestion
 * Calculates package prices before database insertion
 * Supports dimensional weight calculation and automatic weight rounding
 */

export interface PackagePricingInput {
  weight: number;
  category: 'regular' | 'restricted' | 'electronics';
  branch: 'mexico' | 'china' | 'colombia' | 'other';
  deliveryType: 'air' | 'sea' | 'local';
  // Optional dimensions for dimensional weight calculation
  length?: number;
  width?: number;
  height?: number;
  dimensionalFactor?: number; // Default: 5000 for cm³ to kg conversion
}

export interface PackagePricingResult {
  basePrice: number;
  trackingFee: number;
  totalPrice: number;
  currency: string;
  breakdown: {
    weightTier: string;
    actualWeight: number;
    dimensionalWeight: number | null;
    chargeableWeight: number;
    roundedWeight: number;
    requiresQuote: boolean;
  };
}

export interface PricingConfig {
  regular: {
    '0-499g': number;
    '500g-1kg': number;
    per_kg: number;
  };
  restricted: {
    base: number;
    tracking_fee: number;
    per_kg: number;
  };
  electronics: {
    quote_required: boolean;
  };
  dimensional_factor: number; // Varies by delivery type and branch
  currency: string; // Varies by branch (MXN, CNY, COP, USD)
}

/**
 * Calculate dimensional weight
 * Formula: (Length × Width × Height) / Dimensional Factor
 */
function calculateDimensionalWeight(
  length: number,
  width: number,
  height: number,
  dimensionalFactor: number = 5000
): number {
  if (length <= 0 || width <= 0 || height <= 0) {
    return 0;
  }
  return (length * width * height) / dimensionalFactor;
}

/**
 * Get weight tier for pricing
 */
function getWeightTier(weight: number): '0-499g' | '500g-1kg' | string {
  if (weight < 0.5) return '0-499g';
  if (weight <= 1) return '500g-1kg';
  return `${Math.ceil(weight)}kg`;
}

/**
 * Calculate package price based on weight, category, branch, and delivery type
 * This is the CLIENT-SIDE version that mirrors the server-side logic
 */
export async function calculatePackagePrice(
  input: PackagePricingInput,
  pricingConfig: PricingConfig
): Promise<PackagePricingResult> {
  const {
    weight,
    category,
    branch,
    deliveryType,
    length,
    width,
    height,
    dimensionalFactor, // Optional override
  } = input;

  // Validate weight
  if (weight <= 0) {
    throw new Error('Weight must be greater than 0');
  }

  // Use dimensional factor from config, or override if provided
  const activeDimensionalFactor = dimensionalFactor || pricingConfig.dimensional_factor;

  // Calculate dimensional weight if dimensions are provided
  const actualWeight = weight;
  let dimensionalWeight: number | null = null;

  if (length && width && height) {
    dimensionalWeight = calculateDimensionalWeight(
      length,
      width,
      height,
      activeDimensionalFactor
    );
  }

  // Chargeable weight is the greater of actual weight or dimensional weight
  const chargeableWeight = dimensionalWeight
    ? Math.max(actualWeight, dimensionalWeight)
    : actualWeight;

  // ALWAYS round up the chargeable weight (industry standard)
  const roundedWeight = Math.ceil(chargeableWeight);

  // Check if electronics require quote
  if (category === 'electronics' && pricingConfig.electronics.quote_required) {
    return {
      basePrice: 0,
      trackingFee: 0,
      totalPrice: 0,
      currency: pricingConfig.currency,
      breakdown: {
        weightTier: 'N/A',
        actualWeight,
        dimensionalWeight,
        chargeableWeight,
        roundedWeight,
        requiresQuote: true,
      },
    };
  }

  let basePrice = 0;
  let trackingFee = 0;
  let weightTier = '';

  if (category === 'restricted') {
    // Restricted items: base price + tracking fee
    basePrice = pricingConfig.restricted.base;
    trackingFee = pricingConfig.restricted.tracking_fee;

    // Calculate additional cost for weight over 1kg using ROUNDED weight
    if (roundedWeight > 1) {
      const additionalKg = roundedWeight - 1;
      basePrice += additionalKg * pricingConfig.restricted.per_kg;
    }

    weightTier = roundedWeight <= 1 ? '0-1kg' : `${roundedWeight}kg`;
  } else {
    // Regular items: weight-based pricing using ROUNDED weight
    weightTier = getWeightTier(roundedWeight);

    if (weightTier === '0-499g') {
      basePrice = pricingConfig.regular['0-499g'];
    } else if (weightTier === '500g-1kg') {
      basePrice = pricingConfig.regular['500g-1kg'];
    } else {
      // For weights over 1kg
      basePrice = pricingConfig.regular['500g-1kg'];
      const additionalKg = roundedWeight - 1;
      basePrice += additionalKg * pricingConfig.regular.per_kg;
    }
  }

  const totalPrice = basePrice + trackingFee;

  return {
    basePrice,
    trackingFee,
    totalPrice,
    currency: pricingConfig.currency,
    breakdown: {
      weightTier,
      actualWeight,
      dimensionalWeight,
      chargeableWeight,
      roundedWeight,
      requiresQuote: false,
    },
  };
}

/**
 * Fetch pricing configuration from the server
 */
export async function fetchPricingConfig(
  branch: string,
  deliveryType: string
): Promise<PricingConfig> {
  const response = await fetch(
    `/api/pricing/config/${branch}/${deliveryType}`,
    {
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch pricing configuration');
  }

  const data = await response.json();

  // Determine default dimensional factor based on delivery type
  let defaultFactor = '5000'; // air default
  if (deliveryType === 'sea') {
    defaultFactor = '6000';
  } else if (deliveryType === 'local') {
    defaultFactor = '4000';
  }

  // Determine default currency based on branch
  let defaultCurrency = 'USD';
  if (branch === 'usa') {
    defaultCurrency = 'USD';
  } else if (branch === 'mexico') {
    defaultCurrency = 'MXN';
  } else if (branch === 'china') {
    defaultCurrency = 'CNY';
  } else if (branch === 'colombia') {
    defaultCurrency = 'COP';
  }

  // Transform the API response to match our PricingConfig interface
  return {
    regular: {
      '0-499g': parseFloat(data.regular['0-499g'] || '8'),
      '500g-1kg': parseFloat(data.regular['500g-1kg'] || '12'),
      per_kg: parseFloat(data.regular.per_kg || '12'),
    },
    restricted: {
      base: parseFloat(data.restricted.base || '12'),
      tracking_fee: parseFloat(data.restricted.tracking_fee || '3'),
      per_kg: parseFloat(data.restricted.per_kg || '12'),
    },
    electronics: {
      quote_required: data.electronics.quote_required === 'true',
    },
    dimensional_factor: parseFloat(data.dimensional_factor || defaultFactor),
    currency: data.currency || defaultCurrency,
  };
}

/**
 * Batch calculate prices for multiple packages
 * Useful for manifest ingestion
 */
export async function batchCalculatePackagePrices(
  packages: PackagePricingInput[],
  branch: string,
  deliveryType: string
): Promise<PackagePricingResult[]> {
  // Fetch pricing config once for all packages
  const pricingConfig = await fetchPricingConfig(branch, deliveryType);

  // Calculate prices for all packages
  const results = await Promise.all(
    packages.map((pkg) => calculatePackagePrice(pkg, pricingConfig))
  );

  return results;
}

/**
 * Validate package data before price calculation
 */
export function validatePackageForPricing(pkg: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!pkg.weight || pkg.weight <= 0) {
    errors.push('Weight must be greater than 0');
  }

  if (!pkg.category || !['regular', 'restricted', 'electronics'].includes(pkg.category)) {
    errors.push('Invalid category. Must be: regular, restricted, or electronics');
  }

  if (!pkg.branch || !['mexico', 'china', 'colombia', 'other'].includes(pkg.branch)) {
    errors.push('Invalid branch. Must be: mexico, china, colombia, or other');
  }

  if (!pkg.deliveryType || !['air', 'sea', 'local'].includes(pkg.deliveryType)) {
    errors.push('Invalid delivery type. Must be: air, sea, or local');
  }

  // Validate dimensions if provided
  if (pkg.length || pkg.width || pkg.height) {
    if (!pkg.length || pkg.length <= 0) {
      errors.push('Length must be greater than 0 if dimensions are provided');
    }
    if (!pkg.width || pkg.width <= 0) {
      errors.push('Width must be greater than 0 if dimensions are provided');
    }
    if (!pkg.height || pkg.height <= 0) {
      errors.push('Height must be greater than 0 if dimensions are provided');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
