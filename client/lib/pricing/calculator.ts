/**
 * Base Pricing Calculator
 * Provides common calculation logic for all countries
 */

import type { 
  Country, 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  CountryPricingConfig,
  CategoryPricing,
  PricingTier
} from './types';

export const PERMIT_SURCHARGE = 3;

/**
 * Calculate price using tiered pricing (USA Air style)
 * 
 * Logic from BulkCreateInvoice.tsx:
 * - 0-499g = $8
 * - 500g-1kg = $12
 * - >1kg: first kg = $12, each additional full kg = $12
 * - Fraction: < 0.5 = $8, >= 0.5 = $12
 * 
 * PERMITS: round weight UP to nearest kg × $12 (permit fee added separately)
 * Examples: 0.3kg→1kg=$12, 0.6kg→1kg=$12, 1.2kg→2kg=$24, 1.6kg→2kg=$24
 */
export function calculateTieredPrice(
  weightKg: number,
  _tiers: PricingTier[],
  requiresPermit: boolean
): { price: number; breakdown: string } {
  if (requiresPermit) {
    const roundedKg = Math.ceil(weightKg);
    const price = roundedKg * 12;
    return {
      price,
      breakdown: `${weightKg}kg → ${roundedKg}kg × $12 = $${price}`,
    };
  }

  if (weightKg <= 0.499) {
    return { price: 8, breakdown: `${weightKg}kg (0-499g) = $8` };
  }
  
  if (weightKg <= 1) {
    return { price: 12, breakdown: `${weightKg}kg (500g-1kg) = $12` };
  }

  const extraWeight = weightKg - 1;
  const fullKgs = Math.floor(extraWeight);
  const fraction = extraWeight - fullKgs;
  
  let price = 12;
  let breakdown = '1kg = $12';
  
  price += fullKgs * 12;
  if (fullKgs > 0) {
    breakdown += ` + ${fullKgs}kg × $12`;
  }
  
  if (fraction > 0) {
    const fractionPrice = fraction >= 0.5 ? 12 : 8;
    price += fractionPrice;
    const fractionGrams = Math.round(fraction * 1000);
    breakdown += ` + ${fractionGrams}g = $${fractionPrice}`;
  }
  
  return { price, breakdown };
}

/**
 * Calculate price per kilogram
 */
export function calculatePerKgPrice(
  weightKg: number,
  pricePerKg: number
): { price: number; breakdown: string } {
  const price = weightKg * pricePerKg;
  return {
    price: Math.round(price * 100) / 100,
    breakdown: `${weightKg.toFixed(2)}kg × $${pricePerKg}/kg = $${price.toFixed(2)}`,
  };
}

/**
 * Calculate price per cubic foot
 */
export function calculatePerCubicFootPrice(
  weightKg: number,
  pricePerCubicFoot: number,
  kgPerCubicFoot: number = 28
): { price: number; breakdown: string } {
  const cubicFeet = weightKg / kgPerCubicFoot;
  const price = cubicFeet * pricePerCubicFoot;
  return {
    price: Math.round(price * 100) / 100,
    breakdown: `${cubicFeet.toFixed(2)} pies³ × $${pricePerCubicFoot}/pie³ = $${price.toFixed(2)}`,
  };
}

/**
 * Apply permit surcharge if required
 */
export function applyPermitSurcharge(
  price: number,
  breakdown: string,
  requiresPermit: boolean,
  surcharge: number = PERMIT_SURCHARGE
): { price: number; breakdown: string } {
  if (requiresPermit) {
    return {
      price: price + surcharge,
      breakdown: `${breakdown} + Permiso $${surcharge}`,
    };
  }
  return { price, breakdown };
}

/**
 * Generic category pricing calculator
 */
export function calculateCategoryPrice(
  weightKg: number,
  categoryPricing: CategoryPricing,
  requiresPermit: boolean,
  currency: string
): PricingResult {
  if (categoryPricing.pricingMode === 'quote') {
    return {
      price: 0,
      currency,
      breakdown: 'Requiere cotización',
      quoteRequired: true,
    };
  }

  let result: { price: number; breakdown: string };

  switch (categoryPricing.pricingMode) {
    case 'tiered':
      result = calculateTieredPrice(
        weightKg,
        categoryPricing.tiers || [],
        requiresPermit
      );
      break;

    case 'per_kg':
      result = calculatePerKgPrice(
        weightKg,
        categoryPricing.pricePerKg || 0
      );
      break;

    case 'per_cubic_foot':
      result = calculatePerCubicFootPrice(
        weightKg,
        categoryPricing.pricePerCubicFoot || 0
      );
      break;

    default:
      return {
        price: 0,
        currency,
        breakdown: 'Modo de pricing no soportado',
        quoteRequired: true,
      };
  }

  const finalResult = applyPermitSurcharge(
    result.price,
    result.breakdown,
    requiresPermit,
    categoryPricing.permitSurcharge || PERMIT_SURCHARGE
  );

  return {
    price: Math.round(finalResult.price * 100) / 100,
    currency,
    breakdown: finalResult.breakdown,
    quoteRequired: false,
  };
}
