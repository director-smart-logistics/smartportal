/**
 * Modular Pricing System
 * 
 * Architecture:
 * - Each country has its own pricing module
 * - Pricing can be loaded from Firebase or use defaults
 * - Supports tiered, per-kg, and per-cubic-foot pricing
 * 
 * Usage:
 * import { pricingService, calculatePrice } from '@/lib/pricing';
 * const result = calculatePrice(1.5, 'usa', 'air', 'regular', false);
 */

export type { 
  Country, 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  PricingCalculator,
  CountryPricingConfig,
  PricingTier,
  CategoryPricing,
  ShippingTypePricing
} from './types';

export { 
  calculateTieredPrice, 
  calculatePerKgPrice, 
  calculatePerCubicFootPrice,
  applyPermitSurcharge,
  calculateCategoryPrice,
  PERMIT_SURCHARGE 
} from './calculator';

export { USAPricingCalculator, USA_PRICING_CONFIG, usaPricing } from './countries/usa';
export { MexicoPricingCalculator, MEXICO_PRICING_CONFIG, mexicoPricing } from './countries/mexico';
export { ChinaPricingCalculator, CHINA_PRICING_CONFIG, chinaPricing } from './countries/china';
export { ColombiaPricingCalculator, COLOMBIA_PRICING_CONFIG, colombiaPricing } from './countries/colombia';

export { pricingService, calculatePrice } from './service';
