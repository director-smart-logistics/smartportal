/**
 * Pricing Service
 * Handles pricing data loading from Firebase and local fallback
 * 
 * Features:
 * - Loads pricing from Firebase pricing collection
 * - Falls back to local pricing.json if Firebase fails
 * - Caches pricing data for performance
 * - Supports dynamic pricing updates
 */

import { firestoreApi, COLLECTIONS, createDocument } from '@/lib/firebase/firestore-client';
import { collection, getDocs, query, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { DEFAULT_PRICING, type PricingData, type Country, type ShippingType } from '@/lib/utils/pricing';

export interface PricingDocument {
  id: string;
  branch: string;
  country: string;
  countryName: string;
  countryFlag: string;
  deliveryType: string;
  deliveryTypeName: string;
  deliveryTypeIcon: string;
  note?: string;
  regular?: any;
  restricted?: any;
  electronics?: any;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Cache for pricing data
let pricingCache: Map<string, PricingDocument> | null = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Load all pricing configurations from Firebase
 */
export async function loadAllPricing(): Promise<Map<string, PricingDocument>> {
  const now = Date.now();
  
  // Return cached data if valid
  if (pricingCache && (now - pricingCacheTime) < PRICING_CACHE_TTL) {
    return pricingCache;
  }
  
  const pricingMap = new Map<string, PricingDocument>();
  
  try {
    const pricingRef = collection(db, COLLECTIONS.PRICING);
    const snapshot = await getDocs(pricingRef);
    
    snapshot.forEach((doc) => {
      const data = doc.data() as PricingDocument;
      pricingMap.set(doc.id, { ...data, id: doc.id });
    });
    
    // Cache the results
    if (pricingMap.size > 0) {
      pricingCache = pricingMap;
      pricingCacheTime = now;
    }
  } catch (error) {
    console.error('Error loading pricing from Firebase:', error);
  }
  
  return pricingMap;
}

/**
 * Get pricing for a specific country and delivery type
 */
export async function getPricing(country: Country, deliveryType: ShippingType): Promise<PricingDocument | null> {
  const pricingMap = await loadAllPricing();
  const key = `${country}_${deliveryType}`;
  
  return pricingMap.get(key) || null;
}

/**
 * Initialize pricing in Firebase from DEFAULT_PRICING
 * This should be called once to seed the database
 */
// Canonical USA Air pricing spec — single source of truth for the Firebase document.
// The manifest-processor NEVER reads from Firebase for pricing; it uses calculatePrice()
// from @/lib/utils/pricing directly. This seed is for reference / admin visibility only.
const USA_AIR_CANONICAL = {
  regular: {
    description: 'Ropa, calzado, accesorios, adornos, bisutería, juguetes',
    pricingMode: 'tiered',
    tier_0_499g: 8,
    tier_500g_1kg: 12,
    tier_per_kg_additional: 12,
    tier_fraction_under_500g: 8,
    tier_fraction_500g_plus: 12,
    currency: 'USD',
    note: '0-499g=$8 · 500g-1kg=$12 · >1kg: $12/kg (fracción <500g=$8, ≥500g=$12)',
  },
  restricted: {
    description: 'Cosméticos, medicamentos, suplementos, alimentos',
    pricingMode: 'tiered',
    tier_0_499g: 8,
    tier_500g_1kg: 12,
    tier_per_kg_additional: 12,
    trackingFee: 3,
    currency: 'USD',
  },
  electronics: {
    description: 'Computadoras, pantallas, celulares, tablets',
    pricingMode: 'quote',
    quoteRequired: true,
    currency: 'USD',
  },
  permit: {
    description: 'Manifiestos DANP / PERMISOS / PERMISOSDAN',
    pricingMode: 'tiered_ceil',
    formula: 'ceil(weightKg) × $12 + $3',
    pricePerCeiledKg: 12,
    permitSurcharge: 3,
    currency: 'USD',
    examples: '0.84kg→$15 · 1.14kg→$27 · 1.56kg→$27',
  },
};

export async function seedPricingToFirebase(): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  
  try {
    const pricing = DEFAULT_PRICING;
    
    for (const [countryCode, country] of Object.entries(pricing.countries)) {
      for (const [deliveryType, typeData] of Object.entries(country.types)) {
        const docId = `${countryCode}_${deliveryType}`;
        
        try {
          const docRef = doc(db, COLLECTIONS.PRICING, docId);

          // For usa_air: always write the canonical tiered spec, never per_cubic_foot
          const regularData = (countryCode === 'usa' && deliveryType === 'air')
            ? USA_AIR_CANONICAL.regular
            : (typeData.regular || null);
          const restrictedData = (countryCode === 'usa' && deliveryType === 'air')
            ? USA_AIR_CANONICAL.restricted
            : (typeData.restricted || null);
          const electronicsData = (countryCode === 'usa' && deliveryType === 'air')
            ? USA_AIR_CANONICAL.electronics
            : (typeData.electronics || null);
          const permitData = (countryCode === 'usa' && deliveryType === 'air')
            ? USA_AIR_CANONICAL.permit
            : null;
          
          await setDoc(docRef, {
            id: docId,
            branch: countryCode,
            country: countryCode,
            countryName: country.name,
            countryFlag: country.flag,
            deliveryType: deliveryType,
            deliveryTypeName: typeData.name,
            deliveryTypeIcon: typeData.icon,
            note: typeData.note || null,
            regular: regularData,
            restricted: restrictedData,
            electronics: electronicsData,
            ...(permitData ? { permit: permitData } : {}),
            isActive: true,
            version: 2,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          count++;
          console.log(`✅ Seeded: ${docId}`);
        } catch (err) {
          const errorMsg = `Error seeding ${docId}: ${err}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
    }
    
    // Clear cache to force reload
    pricingCache = null;
    
    return { success: errors.length === 0, count, errors };
  } catch (error) {
    return { 
      success: false, 
      count, 
      errors: [`Fatal error: ${error}`] 
    };
  }
}

/**
 * Update pricing for a specific country and delivery type
 */
export async function updatePricing(
  country: Country,
  deliveryType: ShippingType,
  updates: Partial<Pick<PricingDocument, 'regular' | 'restricted' | 'electronics' | 'note'>>
): Promise<boolean> {
  try {
    const docId = `${country}_${deliveryType}`;
    const docRef = doc(db, COLLECTIONS.PRICING, docId);
    
    await setDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    // Clear cache
    pricingCache = null;
    
    return true;
  } catch (error) {
    console.error('Error updating pricing:', error);
    return false;
  }
}

/**
 * Get pricing data in the format expected by calculatePrice
 */
export async function getPricingData(): Promise<PricingData> {
  const pricingMap = await loadAllPricing();
  
  // If no pricing in Firebase, return default
  if (pricingMap.size === 0) {
    return DEFAULT_PRICING;
  }
  
  // Convert Firebase documents to PricingData format
  const pricingData: PricingData = {
    countries: {} as any,
  };
  
  for (const [key, doc] of pricingMap.entries()) {
    const country = doc.country as Country;
    const deliveryType = doc.deliveryType as ShippingType;
    
    if (!pricingData.countries[country]) {
      pricingData.countries[country] = {
        name: doc.countryName,
        flag: doc.countryFlag,
        types: {} as any,
      };
    }
    
    pricingData.countries[country].types[deliveryType] = {
      name: doc.deliveryTypeName,
      icon: doc.deliveryTypeIcon,
      note: doc.note,
      regular: doc.regular,
      restricted: doc.restricted,
      electronics: doc.electronics,
    };
  }
  
  return pricingData;
}

/**
 * Clear pricing cache
 */
export function clearPricingCache(): void {
  pricingCache = null;
  pricingCacheTime = 0;
}
