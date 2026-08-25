/**
 * Pricing Calculator Utility
 * Based on smart-portal-2 pricing structure
 * 
 * Supports:
 * - Multiple countries (USA, Mexico, China, Colombia)
 * - Shipping types (Air, Sea)
 * - Item categories (Regular, Restricted, Electronics)
 * - Tiered pricing for USA Air regular items
 * - Per kg pricing for other countries
 * - Permit surcharge ($3)
 */

export type Country = 'usa' | 'mexico' | 'china' | 'colombia';
export type ShippingType = 'air' | 'sea';
export type ItemCategory = 'regular' | 'restricted' | 'electronics';

export interface PricingTier {
  range: string;
  price: number;
  currency: string;
  note?: string;
}

export interface RegularPricing {
  description: string;
  tiers?: PricingTier[];
  pricePerKg?: number;
  pricePerCubicFoot?: number;
  currency: string;
  note?: string;
}

export interface RestrictedPricing {
  description: string;
  basePrice?: number;
  trackingFee?: number;
  perKg?: number;
  pricePerKg?: number;
  currency: string;
  quoteRequired?: boolean;
  note?: string;
}

export interface ElectronicsPricing {
  description?: string;
  quoteRequired: boolean;
  chargePerTracking?: boolean;
  note?: string;
}

export interface ShippingTypePricing {
  name: string;
  icon: string;
  note?: string;
  regular?: RegularPricing;
  restricted?: RestrictedPricing;
  electronics?: ElectronicsPricing;
}

export interface CountryPricing {
  name: string;
  flag: string;
  types: Record<ShippingType, ShippingTypePricing>;
}

export interface PricingData {
  countries: Record<Country, CountryPricing>;
}

// Default pricing data matching smart-portal-2 structure
export const DEFAULT_PRICING: PricingData = {
  countries: {
    usa: {
      name: 'Estados Unidos',
      flag: '🇺🇸',
      types: {
        air: {
          name: 'Aéreo',
          icon: 'plane',
          note: 'Vuelos diarios · 3-4 días hábiles',
          regular: {
            description: 'Ropa, calzado, accesorios, adornos, bisutería, juguetes',
            tiers: [
              { range: '0g - 499g', price: 8, currency: 'USD' },
              { range: '500g - 1kg', price: 12, currency: 'USD' },
              { range: 'Cada 500g adicional', price: 8, currency: 'USD', note: 'Fracción >= 0.5kg = $12' },
            ],
            currency: 'USD',
          },
          restricted: {
            description: 'Cosméticos, medicamentos, suplementos, alimentos',
            basePrice: 12,
            trackingFee: 3,
            perKg: 12,
            currency: 'USD',
            note: 'Tarifa de rastreo adicional por paquete',
          },
          electronics: {
            description: 'Computadoras, pantallas, celulares, tablets',
            quoteRequired: true,
            chargePerTracking: true,
            note: 'Se cotizan individualmente',
          },
        },
        sea: {
          name: 'Marítimo',
          icon: 'ship',
          note: 'Envío económico 15-30 días',
          regular: {
            description: 'Artículos generales por pie cúbico',
            pricePerCubicFoot: 30,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos regulados',
            quoteRequired: true,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
          },
        },
      },
    },
    mexico: {
      name: 'México',
      flag: '🇲🇽',
      types: {
        air: {
          name: 'Aéreo',
          icon: 'plane',
          note: '1 vuelo al mes · Ciudad de México',
          regular: {
            description: 'Artículos generales',
            pricePerKg: 16,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos que requieren permisos',
            pricePerKg: 20,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
            chargePerTracking: true,
          },
        },
        sea: {
          name: 'Marítimo',
          icon: 'ship',
          regular: {
            description: 'Por peso volumétrico',
            pricePerKg: 5,
            currency: 'USD',
            note: 'Largo x Ancho x Alto (cm) ÷ 5000',
          },
          restricted: {
            description: 'Artículos regulados',
            basePrice: 8,
            trackingFee: 3,
            pricePerKg: 5,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
            chargePerTracking: true,
          },
        },
      },
    },
    china: {
      name: 'China',
      flag: '🇨🇳',
      types: {
        air: {
          name: 'Aéreo',
          icon: 'plane',
          note: '1-2 cortes semanales · Baiyun',
          regular: {
            description: 'Artículos generales',
            pricePerKg: 20,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos regulados',
            quoteRequired: true,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
            chargePerTracking: true,
          },
        },
        sea: {
          name: 'Marítimo',
          icon: 'ship',
          note: 'Corte cada 15 días',
          regular: {
            description: 'Por pie cúbico',
            pricePerCubicFoot: 45,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos regulados',
            quoteRequired: true,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
          },
        },
      },
    },
    colombia: {
      name: 'Colombia',
      flag: '🇨🇴',
      types: {
        air: {
          name: 'Aéreo',
          icon: 'plane',
          note: '',
          regular: {
            description: 'Artículos generales',
            pricePerKg: 12,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos que requieren permisos',
            pricePerKg: 15,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
            chargePerTracking: true,
          },
        },
        sea: {
          name: 'Marítimo',
          icon: 'ship',
          regular: {
            description: 'Por peso volumétrico',
            pricePerKg: 7,
            currency: 'USD',
          },
          restricted: {
            description: 'Artículos regulados',
            basePrice: 10,
            trackingFee: 3,
            pricePerKg: 7,
            currency: 'USD',
          },
          electronics: {
            quoteRequired: true,
          },
        },
      },
    },
  },
};

// Permit surcharge
export const PERMIT_SURCHARGE = 3;

/**
 * Calculate price based on weight, country, shipping type, and item category
 * Matches the logic from smart-portal-2 BulkCreateInvoice.tsx
 */
export function calculatePrice(
  weightKg: number,
  country: Country = 'usa',
  shippingType: ShippingType = 'air',
  itemCategory: ItemCategory = 'regular',
  requiresPermit: boolean = false,
  pricingData: PricingData = DEFAULT_PRICING
): { price: number; currency: string; quoteRequired: boolean; breakdown: string } {
  
  const countryData = pricingData.countries[country];
  if (!countryData) {
    return { price: 0, currency: 'USD', quoteRequired: true, breakdown: 'País no encontrado' };
  }

  const typeData = countryData.types[shippingType];
  if (!typeData) {
    return { price: 0, currency: 'USD', quoteRequired: true, breakdown: 'Tipo de envío no encontrado' };
  }

  const categoryData = typeData[itemCategory];
  if (!categoryData) {
    return { price: 0, currency: 'USD', quoteRequired: true, breakdown: 'Categoría no encontrada' };
  }

  // Check if quote required (electronics or certain restricted)
  if ('quoteRequired' in categoryData && categoryData.quoteRequired) {
    return { price: 0, currency: 'USD', quoteRequired: true, breakdown: 'Requiere cotización' };
  }

  let price = 0;
  let breakdown = '';
  const currency = ('currency' in categoryData ? categoryData.currency : 'USD') || 'USD';

  // Tiered pricing (USA Air)
  // TWO MODES:
  // 1. PERMIT (requiresPermit=true): Round UP to next kg × $12 + $3
  // 2. REGULAR: 0-499g=$8, 500g-1kg=$12, >1kg: tiered with fraction pricing
  if ('tiers' in categoryData && categoryData.tiers) {
    if (requiresPermit) {
      // PERMIT PRICING: Round UP to next whole kg × $12
      // Examples: 0.84kg→1kg=$12, 1.14kg→2kg=$24, 1.56kg→2kg=$24
      const roundedKg = Math.ceil(weightKg);
      price = roundedKg * 12;
      breakdown = `${weightKg}kg → ${roundedKg}kg × $12 = $${price}`;
    } else {
      // REGULAR PRICING: Tiered with fraction calculation
      // 0-499g = $8, 500g-1kg = $12
      // >1kg: $12 (first kg) + tiered pricing for additional weight
      // Examples: 0.23kg=$8, 0.89kg=$12, 1.30kg=$20, 2.12kg=$32, 2.56kg=$36, 3.50kg=$48
      if (weightKg <= 0.499) {
        price = 8;
        breakdown = `${weightKg}kg (0-499g) = $8`;
      } else if (weightKg <= 1) {
        price = 12;
        breakdown = `${weightKg}kg (500g-1kg) = $12`;
      } else {
        // Weight > 1kg
        price = 12; // First kg = $12
        breakdown = '1kg = $12';
        
        const extraWeight = weightKg - 1;
        const fullKgs = Math.floor(extraWeight);
        const fractionKg = extraWeight - fullKgs;
        
        // Each complete additional kg = $12
        if (fullKgs > 0) {
          price += fullKgs * 12;
          breakdown += ` + ${fullKgs}kg × $12`;
        }
        
        // Fraction pricing: 0-499g = $8, >=500g = $12
        if (fractionKg > 0) {
          const fractionGrams = Math.round(fractionKg * 1000);
          const fractionPrice = fractionGrams >= 500 ? 12 : 8;
          price += fractionPrice;
          breakdown += ` + ${fractionGrams}g = $${fractionPrice}`;
        }
      }
    }
  }
  // Price per kg
  else if ('pricePerKg' in categoryData && categoryData.pricePerKg) {
    price = weightKg * categoryData.pricePerKg;
    breakdown = `${weightKg.toFixed(2)}kg × $${categoryData.pricePerKg}/kg = $${price.toFixed(2)}`;
  }
  // Price per cubic foot
  else if ('pricePerCubicFoot' in categoryData && categoryData.pricePerCubicFoot) {
    // Approximate: 1 cubic foot ≈ 28kg
    const cubicFeet = weightKg / 28;
    price = cubicFeet * categoryData.pricePerCubicFoot;
    breakdown = `${cubicFeet.toFixed(2)} pies³ × $${categoryData.pricePerCubicFoot}/pie³ = $${price.toFixed(2)}`;
  }
  // Base price + per kg (restricted items)
  else if ('basePrice' in categoryData && categoryData.basePrice !== undefined) {
    const trackingFee = ('trackingFee' in categoryData ? categoryData.trackingFee : 0) || 0;
    const perKg = ('perKg' in categoryData ? categoryData.perKg : 0) || 0;
    price = categoryData.basePrice + trackingFee + (weightKg * perKg);
    breakdown = `Base $${categoryData.basePrice} + Tracking $${trackingFee} + ${weightKg.toFixed(2)}kg × $${perKg} = $${price.toFixed(2)}`;
  }

  // Add permit surcharge
  if (requiresPermit) {
    price += PERMIT_SURCHARGE;
    breakdown += ` + Permiso $${PERMIT_SURCHARGE}`;
  }

  return { 
    price: Math.round(price * 100) / 100, 
    currency, 
    quoteRequired: false, 
    breakdown 
  };
}

/**
 * Get available shipping options for a country
 */
export function getShippingOptions(country: Country, pricingData: PricingData = DEFAULT_PRICING) {
  const countryData = pricingData.countries[country];
  if (!countryData) return [];

  return Object.entries(countryData.types).map(([type, data]) => ({
    value: type as ShippingType,
    label: data.name,
    icon: data.icon,
    note: data.note,
  }));
}

/**
 * Get all countries with pricing
 */
export function getCountries(pricingData: PricingData = DEFAULT_PRICING) {
  return Object.entries(pricingData.countries).map(([code, data]) => ({
    value: code as Country,
    label: data.name,
    flag: data.flag,
  }));
}

/**
 * Calculate volumetric weight
 * Formula: (L × W × H cm) / 5000 = volumetric weight in kg
 */
export function calculateVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  divisor: number = 5000
): number {
  return (lengthCm * widthCm * heightCm) / divisor;
}

/**
 * Get billable weight (max of actual and volumetric)
 */
export function getBillableWeight(
  actualWeightKg: number,
  lengthCm?: number,
  widthCm?: number,
  heightCm?: number,
  divisor: number = 5000
): { weight: number; isVolumetric: boolean } {
  if (!lengthCm || !widthCm || !heightCm) {
    return { weight: actualWeightKg, isVolumetric: false };
  }

  const volumetricWeight = calculateVolumetricWeight(lengthCm, widthCm, heightCm, divisor);
  const isVolumetric = volumetricWeight > actualWeightKg;
  
  return {
    weight: Math.max(actualWeightKg, volumetricWeight),
    isVolumetric,
  };
}
