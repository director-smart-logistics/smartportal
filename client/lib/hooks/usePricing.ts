/**
 * usePricing Hook
 * 
 * Provides pricing calculation functionality for invoices and packages
 * Uses Firestore pricing data with fallback to defaults
 */

import { useQuery } from '@tanstack/react-query';
import { firestoreApi } from '@/lib/firebase/firestore-client';
import {
  calculatePrice,
  getCountries,
  getShippingOptions,
  getBillableWeight,
  DEFAULT_PRICING,
  type Country,
  type ShippingType,
  type ItemCategory,
  type PricingData,
} from '@/lib/utils/pricing';

export function usePricing() {
  // Fetch pricing data from Firestore
  const { data: pricingRecords, isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => {
      const result = await firestoreApi.pricing.list();
      return result.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Convert Firestore records to PricingData format
  // For now, use default pricing as the Firestore structure is simpler
  const pricingData: PricingData = DEFAULT_PRICING;

  /**
   * Calculate shipping price for a package
   */
  const calculate = (
    weightKg: number,
    options?: {
      country?: Country;
      shippingType?: ShippingType;
      itemCategory?: ItemCategory;
      requiresPermit?: boolean;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
    }
  ) => {
    const {
      country = 'usa',
      shippingType = 'air',
      itemCategory = 'regular',
      requiresPermit = false,
      lengthCm,
      widthCm,
      heightCm,
    } = options || {};

    // Get billable weight (actual or volumetric)
    const { weight: billableWeight, isVolumetric } = getBillableWeight(
      weightKg,
      lengthCm,
      widthCm,
      heightCm
    );

    // Calculate price
    const result = calculatePrice(
      billableWeight,
      country,
      shippingType,
      itemCategory,
      requiresPermit,
      pricingData
    );

    return {
      ...result,
      billableWeight,
      isVolumetric,
      actualWeight: weightKg,
    };
  };

  /**
   * Calculate price in local currency (CRC)
   */
  const calculateWithExchange = (
    weightKg: number,
    exchangeRate: number,
    options?: Parameters<typeof calculate>[1]
  ) => {
    const result = calculate(weightKg, options);
    
    return {
      ...result,
      priceUSD: result.price,
      priceCRC: result.price * exchangeRate,
      exchangeRate,
    };
  };

  /**
   * Calculate total for multiple packages
   */
  const calculateTotal = (
    packages: Array<{
      weightKg: number;
      country?: Country;
      shippingType?: ShippingType;
      itemCategory?: ItemCategory;
      requiresPermit?: boolean;
    }>,
    exchangeRate?: number
  ) => {
    let totalUSD = 0;
    const details: Array<ReturnType<typeof calculate> & { index: number }> = [];

    packages.forEach((pkg, index) => {
      const result = calculate(pkg.weightKg, {
        country: pkg.country,
        shippingType: pkg.shippingType,
        itemCategory: pkg.itemCategory,
        requiresPermit: pkg.requiresPermit,
      });
      
      if (!result.quoteRequired) {
        totalUSD += result.price;
      }
      
      details.push({ ...result, index });
    });

    return {
      totalUSD,
      totalCRC: exchangeRate ? totalUSD * exchangeRate : undefined,
      packageCount: packages.length,
      quoteRequiredCount: details.filter(d => d.quoteRequired).length,
      details,
    };
  };

  return {
    isLoading,
    pricingData,
    calculate,
    calculateWithExchange,
    calculateTotal,
    getCountries: () => getCountries(pricingData),
    getShippingOptions: (country: Country) => getShippingOptions(country, pricingData),
  };
}

export default usePricing;
