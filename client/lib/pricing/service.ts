/**
 * Pricing Service
 * 
 * Provides unified access to country-specific pricing calculators
 * with Firebase integration for dynamic pricing configs
 * 
 * Pricing data source:
 * 1. Firebase 'pricing' collection (if available)
 * 2. Default configs as fallback
 * 
 * USA Air Tiered Pricing (from BulkCreateInvoice.tsx):
 * - 0-499g = $8
 * - 500g-1kg = $12
 * - >1kg: first kg = $12, each additional full kg = $12
 * - Fraction: < 0.5 = $8, >= 0.5 = $12
 * - PERMITS: round UP to nearest kg × $12 + $3 permit fee
 */

import type { 
  Country, 
  ShippingType, 
  ItemCategory, 
  PricingResult, 
  PricingCalculator,
  CountryPricingConfig
} from './types';
import { USAPricingCalculator } from './countries/usa';
import { MexicoPricingCalculator } from './countries/mexico';
import { ChinaPricingCalculator } from './countries/china';
import { ColombiaPricingCalculator } from './countries/colombia';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

type PricingCalculatorMap = {
  [K in Country]: PricingCalculator;
};

interface FirebasePricingData {
  countries: Record<string, {
    name: string;
    flag: string;
    types: Record<string, {
      name: string;
      icon: string;
      note?: string;
      regular?: {
        description: string;
        tiers?: Array<{ range: string; price: number; currency: string }>;
        pricePerKg?: number;
        pricePerCubicFoot?: number;
        currency?: string;
      };
      restricted?: {
        description: string;
        basePrice?: number;
        trackingFee?: number;
        perKg?: number;
        pricePerKg?: number;
        quoteRequired?: boolean;
        currency?: string;
      };
      electronics?: {
        description?: string;
        quoteRequired: boolean;
        chargePerTracking?: boolean;
      };
    }>;
  }>;
}

class PricingService {
  private calculators: PricingCalculatorMap;
  private firebasePricingData: FirebasePricingData | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000;
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    this.calculators = {
      usa: new USAPricingCalculator(),
      mexico: new MexicoPricingCalculator(),
      china: new ChinaPricingCalculator(),
      colombia: new ColombiaPricingCalculator(),
    };
  }

  /**
   * Load pricing data from Firebase 'pricing' collection
   */
  async loadFromFirebase(): Promise<void> {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (this.firebasePricingData && Date.now() < this.cacheExpiry) {
      return;
    }

    this.loadingPromise = (async () => {
      try {
        const pricingRef = collection(db, 'pricing');
        const snapshot = await getDocs(pricingRef);
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          this.firebasePricingData = doc.data() as FirebasePricingData;
          this.cacheExpiry = Date.now() + this.CACHE_DURATION_MS;
          console.log('[PricingService] Loaded pricing from Firebase');
        }
      } catch (error) {
        console.warn('[PricingService] Could not load from Firebase, using defaults:', error);
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Check if Firebase pricing is loaded
   */
  hasFirebasePricing(): boolean {
    return this.firebasePricingData !== null;
  }

  /**
   * Calculate price for a package
   */
  calculate(
    weightKg: number,
    country: Country = 'usa',
    shippingType: ShippingType = 'air',
    category: ItemCategory = 'regular',
    requiresPermit: boolean = false
  ): PricingResult {
    const calculator = this.calculators[country];
    if (!calculator) {
      return {
        price: 0,
        currency: 'USD',
        breakdown: `País no soportado: ${country}`,
        quoteRequired: true,
      };
    }

    return calculator.calculate(weightKg, shippingType, category, requiresPermit);
  }

  /**
   * Get calculator for specific country
   */
  getCalculator(country: Country): PricingCalculator | undefined {
    return this.calculators[country];
  }

  /**
   * Get pricing config for a country
   */
  getConfig(country: Country): CountryPricingConfig | undefined {
    return this.calculators[country]?.getConfig();
  }

  /**
   * Get all available countries
   */
  getCountries(): Array<{ code: Country; name: string; flag: string }> {
    return Object.entries(this.calculators).map(([code, calc]) => {
      const config = calc.getConfig();
      return {
        code: code as Country,
        name: config.name,
        flag: config.flag,
      };
    });
  }

  /**
   * Get shipping types for a country
   */
  getShippingTypes(country: Country): Array<{ code: ShippingType; name: string; note?: string }> {
    const config = this.getConfig(country);
    if (!config) return [];

    return Object.entries(config.shippingTypes).map(([code, type]) => ({
      code: code as ShippingType,
      name: type.name,
      note: type.note,
    }));
  }

  /**
   * Batch calculate prices for multiple items
   */
  batchCalculate(
    items: Array<{
      weightKg: number;
      country?: Country;
      shippingType?: ShippingType;
      category?: ItemCategory;
      requiresPermit?: boolean;
    }>
  ): PricingResult[] {
    return items.map(item => this.calculate(
      item.weightKg,
      item.country || 'usa',
      item.shippingType || 'air',
      item.category || 'regular',
      item.requiresPermit || false
    ));
  }

  /**
   * Calculate total for manifest
   */
  calculateManifestTotal(
    weights: number[],
    country: Country = 'usa',
    shippingType: ShippingType = 'air',
    category: ItemCategory = 'regular',
    requiresPermit: boolean = false
  ): { total: number; count: number; breakdown: PricingResult[] } {
    const results = weights.map(w => this.calculate(w, country, shippingType, category, requiresPermit));
    const total = results.reduce((sum, r) => sum + r.price, 0);
    
    return {
      total: Math.round(total * 100) / 100,
      count: weights.length,
      breakdown: results,
    };
  }
}

export const pricingService = new PricingService();

export function calculatePrice(
  weightKg: number,
  country: Country = 'usa',
  shippingType: ShippingType = 'air',
  category: ItemCategory = 'regular',
  requiresPermit: boolean = false
): PricingResult {
  return pricingService.calculate(weightKg, country, shippingType, category, requiresPermit);
}
