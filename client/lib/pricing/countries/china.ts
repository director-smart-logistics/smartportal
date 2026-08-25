/**
 * China Pricing Module
 * Handles all pricing logic for shipments from China
 */

import type { 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  CountryPricingConfig,
  PricingCalculator 
} from '../types';
import { calculateCategoryPrice } from '../calculator';

export const CHINA_PRICING_CONFIG: CountryPricingConfig = {
  country: 'china',
  name: 'China',
  flag: '🇨🇳',
  currency: 'USD',
  shippingTypes: {
    air: {
      name: 'Aéreo',
      note: '1-2 cortes semanales · Baiyun',
      regular: {
        description: 'Artículos generales',
        pricingMode: 'per_kg',
        pricePerKg: 20,
      },
      restricted: {
        description: 'Artículos regulados',
        pricingMode: 'quote',
      },
      electronics: {
        description: 'Electrónicos',
        pricingMode: 'quote',
      },
    },
    sea: {
      name: 'Marítimo',
      note: 'Corte cada 15 días',
      regular: {
        description: 'Por pie cúbico',
        pricingMode: 'per_cubic_foot',
        pricePerCubicFoot: 45,
      },
      restricted: {
        description: 'Artículos regulados',
        pricingMode: 'quote',
      },
      electronics: {
        description: 'Electrónicos',
        pricingMode: 'quote',
      },
    },
  },
};

export class ChinaPricingCalculator implements PricingCalculator {
  private config: CountryPricingConfig;

  constructor(customConfig?: Partial<CountryPricingConfig>) {
    this.config = { ...CHINA_PRICING_CONFIG, ...customConfig };
  }

  calculate(
    weightKg: number,
    shippingType: ShippingType,
    category: ItemCategory,
    requiresPermit: boolean
  ): PricingResult {
    const typeConfig = this.config.shippingTypes[shippingType];
    if (!typeConfig) {
      return {
        price: 0,
        currency: this.config.currency,
        breakdown: 'Tipo de envío no disponible',
        quoteRequired: true,
      };
    }

    const categoryConfig = typeConfig[category];
    if (!categoryConfig) {
      return {
        price: 0,
        currency: this.config.currency,
        breakdown: 'Categoría no disponible',
        quoteRequired: true,
      };
    }

    return calculateCategoryPrice(
      weightKg,
      categoryConfig,
      requiresPermit,
      this.config.currency
    );
  }

  getConfig(): CountryPricingConfig {
    return this.config;
  }
}

export const chinaPricing = new ChinaPricingCalculator();
