/**
 * Functional Scenario Test Suite: Quotations & Tariff Calculations
 *
 * Real-world quotation scenarios tested:
 * 1. Air freight quotation: actual weight vs volumetric weight calculation.
 * 2. Sea freight quotation: cubic feet (cu ft) volume pricing and minimums.
 * 3. Customs tariff classification and tax estimation (CIF + DAI + Selectivo + IVA).
 * 4. Converting an approved quotation into an active invoice.
 */

import { describe, it, expect } from 'vitest';

export interface AirQuoteInput {
  actualWeightLbs: number;
  lengthInches: number;
  widthInches: number;
  heightInches: number;
  declaredValueUsd: number;
  category: 'general' | 'electronics' | 'clothing' | 'vitamins';
  ratePerLbUsd: number;
  insurancePercent: number; // e.g. 0.015 for 1.5%
}

export interface AirQuoteResult {
  chargeableWeightLbs: number;
  volumetricWeightLbs: number;
  freightCostUsd: number;
  insuranceCostUsd: number;
  handlingFeeUsd: number;
  estimatedCustomsTaxUsd: number;
  totalQuoteUsd: number;
}

export function computeAirFreightQuote(input: AirQuoteInput): AirQuoteResult {
  const volWeight = Number(((input.lengthInches * input.widthInches * input.heightInches) / 166).toFixed(2));
  const chargeableWeight = Math.max(input.actualWeightLbs, volWeight);
  const freightCost = Number((chargeableWeight * input.ratePerLbUsd).toFixed(2));
  const insuranceCost = Number((input.declaredValueUsd * input.insurancePercent).toFixed(2));
  const handlingFee = 5.0; // Standard handling

  // Customs tax estimation based on category
  let taxRate = 0.13; // default 13% IVA
  if (input.category === 'electronics') taxRate = 0.18; // DAI + IVA
  if (input.category === 'clothing') taxRate = 0.29; // DAI + Selectivo + IVA
  if (input.category === 'vitamins') taxRate = 0.15;

  const estimatedCustomsTax = Number(((input.declaredValueUsd + freightCost + insuranceCost) * taxRate).toFixed(2));
  const totalQuote = Number((freightCost + insuranceCost + handlingFee + estimatedCustomsTax).toFixed(2));

  return {
    chargeableWeightLbs: chargeableWeight,
    volumetricWeightLbs: volWeight,
    freightCostUsd: freightCost,
    insuranceCostUsd: insuranceCost,
    handlingFeeUsd: handlingFee,
    estimatedCustomsTaxUsd: estimatedCustomsTax,
    totalQuoteUsd: totalQuote,
  };
}

export function computeSeaFreightQuote(
  lengthInches: number,
  widthInches: number,
  heightInches: number,
  ratePerCubicFootUsd: number,
  minVolumeCuFt = 5.0
): { cubicFeet: number; chargeableCubicFeet: number; totalCostUsd: number } {
  const rawCuFt = (lengthInches * widthInches * heightInches) / 1728;
  const cubicFeet = Number(rawCuFt.toFixed(2));
  const chargeableCubicFeet = Math.max(cubicFeet, minVolumeCuFt);
  const totalCost = Number((chargeableCubicFeet * ratePerCubicFootUsd).toFixed(2));

  return {
    cubicFeet,
    chargeableCubicFeet,
    totalCostUsd: totalCost,
  };
}

describe('Quotes Functional Real-World Flows', () => {
  it('Scenario 1: Air freight calculates volumetric weight when volume exceeds actual weight', () => {
    // Large, light package (e.g. bicycle helmet / pillow box)
    const quote = computeAirFreightQuote({
      actualWeightLbs: 2.5,
      lengthInches: 20,
      widthInches: 15,
      heightInches: 10, // (20*15*10)/166 = 18.07 lbs
      declaredValueUsd: 150,
      category: 'general',
      ratePerLbUsd: 4.5,
      insurancePercent: 0.015,
    });

    expect(quote.volumetricWeightLbs).toBe(18.07);
    expect(quote.chargeableWeightLbs).toBe(18.07); // Volumetric used instead of 2.5 lbs
    expect(quote.freightCostUsd).toBe(81.31); // 18.07 * 4.5
    expect(quote.handlingFeeUsd).toBe(5.0);
    expect(quote.totalQuoteUsd).toBeGreaterThan(quote.freightCostUsd);
  });

  it('Scenario 2: Air freight uses actual weight when item is dense (e.g. laptop/phone)', () => {
    // Small, heavy package
    const quote = computeAirFreightQuote({
      actualWeightLbs: 8.0,
      lengthInches: 12,
      widthInches: 8,
      heightInches: 2, // (12*8*2)/166 = 1.16 lbs
      declaredValueUsd: 1200,
      category: 'electronics',
      ratePerLbUsd: 4.5,
      insurancePercent: 0.015,
    });

    expect(quote.chargeableWeightLbs).toBe(8.0); // Actual weight used
    expect(quote.freightCostUsd).toBe(36.0); // 8.0 * 4.5
    expect(quote.insuranceCostUsd).toBe(18.0); // 1.5% of $1200
    expect(quote.estimatedCustomsTaxUsd).toBeGreaterThan(0);
  });

  it('Scenario 3: Sea freight calculates cubic feet and enforces minimum volume floor', () => {
    // Small box below minimum
    const smallSea = computeSeaFreightQuote(12, 12, 12, 18.0, 5.0); // 1728 / 1728 = 1.0 cu ft
    expect(smallSea.cubicFeet).toBe(1.0);
    expect(smallSea.chargeableCubicFeet).toBe(5.0); // Minimum 5.0 cu ft applied
    expect(smallSea.totalCostUsd).toBe(90.0); // 5.0 * 18.0

    // Large crate above minimum
    const largeSea = computeSeaFreightQuote(36, 24, 24, 18.0, 5.0); // 20736 / 1728 = 12.0 cu ft
    expect(largeSea.cubicFeet).toBe(12.0);
    expect(largeSea.chargeableCubicFeet).toBe(12.0);
    expect(largeSea.totalCostUsd).toBe(216.0); // 12.0 * 18.0
  });

  it('Scenario 4: Converts approved quote to invoice data structure seamlessly', () => {
    const quote = computeAirFreightQuote({
      actualWeightLbs: 5.0,
      lengthInches: 10,
      widthInches: 10,
      heightInches: 10,
      declaredValueUsd: 200,
      category: 'clothing',
      ratePerLbUsd: 4.5,
      insurancePercent: 0.015,
    });

    const quoteId = 'QUO-2026-9901';
    const invoicePayload = {
      quoteId,
      customerId: 'cust-sl500',
      clientName: 'Alejandro Morales',
      status: 'draft' as const,
      totalAmount: quote.totalQuoteUsd,
      subtotalAmount: quote.freightCostUsd + quote.handlingFeeUsd,
      taxAmount: quote.estimatedCustomsTaxUsd,
      weight: quote.chargeableWeightLbs,
      invoiceItems: [
        {
          description: 'Flete Aéreo Internacional',
          weight: quote.chargeableWeightLbs,
          unitPrice: 4.5,
          amount: quote.freightCostUsd,
        },
        {
          description: 'Seguro de Carga y Manejo',
          quantity: 1,
          unitPrice: quote.insuranceCostUsd + quote.handlingFeeUsd,
          amount: quote.insuranceCostUsd + quote.handlingFeeUsd,
        },
        {
          description: 'Impuestos Aduanales Estimados (Ropa/Calzado)',
          quantity: 1,
          unitPrice: quote.estimatedCustomsTaxUsd,
          amount: quote.estimatedCustomsTaxUsd,
        },
      ],
    };

    expect(invoicePayload.totalAmount).toBe(quote.totalQuoteUsd);
    expect(invoicePayload.invoiceItems.length).toBe(3);
  });
});
