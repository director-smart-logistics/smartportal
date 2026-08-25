/**
 * Colombia Pricing Module
 * Handles all pricing logic for shipments from Colombia
 */

import type { 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  CountryPricingConfig,
  PricingCalculator 
} from '../types';
import { calculateCategoryPrice } from '../calculator';

export const COLOMBIA_PRICING_CONFIG: CountryPricingConfig = {
  country: 'colombia',
  name: 'Colombia',
  flag: '🇨🇴',
  currency: 'USD',
  shippingTypes: {
    air: {
      name: 'Aéreo',
      note: '',
      regular: {
        description: 'Artículos generales',
        pricingMode: 'per_kg',
        pricePerKg: 12,
      },
      restricted: {
        description: 'Artículos que requieren permisos',
        pricingMode: 'per_kg',
        pricePerKg: 15,
        permitSurcharge: 3,
      },
      electronics: {
        description: 'Electrónicos',
        pricingMode: 'quote',
      },
    },
    sea: {
      name: 'Marítimo',
      note: 'Envío económico',
      regular: {
        description: 'Por peso volumétrico',
        pricingMode: 'per_kg',
        pricePerKg: 7,
      },
      restricted: {
        description: 'Artículos regulados',
        pricingMode: 'per_kg',
        pricePerKg: 7,
        basePrice: 10,
        trackingFee: 3,
        permitSurcharge: 3,
      },
      electronics: {
        description: 'Electrónicos',
        pricingMode: 'quote',
      },
    },
  },
};

export class ColombiaPricingCalculator implements PricingCalculator {
  private config: CountryPricingConfig;

  constructor(customConfig?: Partial<CountryPricingConfig>) {
    this.config = { ...COLOMBIA_PRICING_CONFIG, ...customConfig };
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

export const colombiaPricing = new ColombiaPricingCalculator();
