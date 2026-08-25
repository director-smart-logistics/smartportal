/**
 * Mexico Pricing Module
 * Handles all pricing logic for shipments from Mexico
 */

import type { 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  CountryPricingConfig,
  PricingCalculator 
} from '../types';
import { calculateCategoryPrice } from '../calculator';

export const MEXICO_PRICING_CONFIG: CountryPricingConfig = {
  country: 'mexico',
  name: 'México',
  flag: '🇲🇽',
  currency: 'USD',
  shippingTypes: {
    air: {
      name: 'Aéreo',
      note: '1 vuelo al mes · Ciudad de México',
      regular: {
        description: 'Artículos generales',
        pricingMode: 'per_kg',
        pricePerKg: 16,
      },
      restricted: {
        description: 'Artículos que requieren permisos',
        pricingMode: 'per_kg',
        pricePerKg: 20,
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
        pricePerKg: 5,
      },
      restricted: {
        description: 'Artículos regulados',
        pricingMode: 'per_kg',
        pricePerKg: 5,
        basePrice: 8,
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

export class MexicoPricingCalculator implements PricingCalculator {
  private config: CountryPricingConfig;

  constructor(customConfig?: Partial<CountryPricingConfig>) {
    this.config = { ...MEXICO_PRICING_CONFIG, ...customConfig };
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

export const mexicoPricing = new MexicoPricingCalculator();
