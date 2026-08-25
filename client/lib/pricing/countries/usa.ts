/**
 * USA Pricing Module
 * Handles all pricing logic for shipments from USA
 */

import type { 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  CountryPricingConfig,
  PricingCalculator 
} from '../types';
import { calculateCategoryPrice } from '../calculator';

export const USA_PRICING_CONFIG: CountryPricingConfig = {
  country: 'usa',
  name: 'Estados Unidos',
  flag: '🇺🇸',
  currency: 'USD',
  shippingTypes: {
    air: {
      name: 'Aéreo',
      note: 'Vuelos diarios · 3-4 días hábiles',
      regular: {
        description: 'Ropa, calzado, accesorios, adornos, bisutería, juguetes',
        pricingMode: 'tiered',
        tiers: [
          { minWeight: 0, maxWeight: 0.499, price: 8, label: '0g - 499g' },
          { minWeight: 0.5, maxWeight: 1, price: 12, label: '500g - 1kg' },
          { minWeight: 1.001, maxWeight: 999, price: 12, label: 'Por kg adicional' },
        ],
        permitSurcharge: 3,
      },
      restricted: {
        description: 'Cosméticos, medicamentos, suplementos, alimentos',
        pricingMode: 'tiered',
        tiers: [
          { minWeight: 0, maxWeight: 0.499, price: 8, label: '0g - 499g' },
          { minWeight: 0.5, maxWeight: 1, price: 12, label: '500g - 1kg' },
          { minWeight: 1.001, maxWeight: 999, price: 12, label: 'Por kg adicional' },
        ],
        permitSurcharge: 3,
        trackingFee: 3,
      },
      electronics: {
        description: 'Computadoras, pantallas, celulares, tablets',
        pricingMode: 'quote',
      },
    },
    sea: {
      name: 'Marítimo',
      note: 'Envío económico 15-30 días',
      regular: {
        description: 'Artículos generales por pie cúbico',
        pricingMode: 'per_cubic_foot',
        pricePerCubicFoot: 30,
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

export class USAPricingCalculator implements PricingCalculator {
  private config: CountryPricingConfig;

  constructor(customConfig?: Partial<CountryPricingConfig>) {
    this.config = { ...USA_PRICING_CONFIG, ...customConfig };
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

export const usaPricing = new USAPricingCalculator();
