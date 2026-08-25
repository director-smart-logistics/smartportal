/**
 * Pricing Types
 * Shared types for the modular pricing system
 */

export type Country = 'usa' | 'mexico' | 'china' | 'colombia';
export type ShippingType = 'air' | 'sea';
export type ItemCategory = 'regular' | 'restricted' | 'electronics';

export interface PricingTier {
  minWeight: number;
  maxWeight: number;
  price: number;
  label: string;
}

export interface PricingResult {
  price: number;
  currency: string;
  breakdown: string;
  quoteRequired: boolean;
  tierApplied?: string;
}

export interface CountryPricingConfig {
  country: Country;
  name: string;
  flag: string;
  currency: string;
  shippingTypes: {
    air: ShippingTypePricing;
    sea: ShippingTypePricing;
  };
}

export interface ShippingTypePricing {
  name: string;
  note?: string;
  regular: CategoryPricing;
  restricted: CategoryPricing;
  electronics: CategoryPricing;
}

export interface CategoryPricing {
  description: string;
  pricingMode: 'tiered' | 'per_kg' | 'per_cubic_foot' | 'quote';
  tiers?: PricingTier[];
  pricePerKg?: number;
  pricePerCubicFoot?: number;
  permitSurcharge?: number;
  trackingFee?: number;
  basePrice?: number;
}

export interface PricingCalculator {
  calculate(
    weightKg: number,
    shippingType: ShippingType,
    category: ItemCategory,
    requiresPermit: boolean
  ): PricingResult;
  
  getConfig(): CountryPricingConfig;
}
