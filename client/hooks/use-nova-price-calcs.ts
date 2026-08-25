/**
 * use-nova-price-calcs.ts
 *
 * Custom hook that encapsulates all price-calculation logic for the Nova
 * results table:
 *
 *  - computedPrices         — Per-row calculated price from raw peso
 *  - tc                     — Parsed exchange rate (CRC/USD)
 *  - getEffectivePrice      — Price with operator override applied
 *  - getEffectivePesoRedondeo — Rounded peso with operator override applied
 *  - applyRecalc            — Recalculate/round prices for a target set of rows
 *  - recalcFlash            — Transient UI flash state after a recalc/round action
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { calculatePrice } from '@/lib/utils/pricing';
import type { ManifestRow } from '@/lib/services/manifest-processor';

// ── Parameter types ───────────────────────────────────────────────────────────

interface UseNovaPriceCalcsParams {
  resultDataRows:   ManifestRow[];
  manifestCountry:  string;
  manifestShipping: string;
  exchangeRate:     string;
  priceOverrides:   Record<string, { precio: number; pesoRedondeo: number }>;
  setPriceOverrides: React.Dispatch<React.SetStateAction<Record<string, { precio: number; pesoRedondeo: number }>>>;
  loadedFromFirestore?: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNovaPriceCalcs({
  resultDataRows,
  manifestCountry,
  manifestShipping,
  exchangeRate,
  priceOverrides,
  setPriceOverrides,
  loadedFromFirestore = false,
}: UseNovaPriceCalcsParams) {

  const [recalcFlash, setRecalcFlash] = useState<'recalc' | 'round' | null>(null);
  const recalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute individual per-row prices using raw peso — matches applyRecalc first-click behavior.
  // - Individual / permit: calculatePrice(peso)
  // - Consolidated group totals are computed separately as calculatePrice(ceil(sum(pesos))).
  // - DUA / Zero-weight items (peso <= 0) strictly return 0 without triggering min weight tiers.
  const computedPrices = useMemo(() =>
    resultDataRows.map(row => {
      const billingPeso = row.peso ?? 0;
      if (billingPeso <= 0) return 0;
      const result = calculatePrice(billingPeso, manifestCountry as any, manifestShipping as any, 'regular', row.permisos);
      return result.quoteRequired ? 0 : Math.round(result.price * 100) / 100;
    }),
    [resultDataRows, manifestCountry, manifestShipping]
  );

  const tc = useMemo(() => parseFloat(exchangeRate) || 0, [exchangeRate]);

  // Effective price/pesoRedondeo for a row index (override takes priority over computed)
  // INVARIANT 1: An item with weight > 0 must NEVER have a price of 0.
  // INVARIANT 2: A DUA / zero-weight item (weight <= 0) must stay 0 unless explicitly overridden by operator.
  const getEffectivePrice = useCallback((idx: number, row: ManifestRow) => {
    const tracking = (row.tracking || '').toUpperCase();
    const overridePrice = priceOverrides[tracking]?.precio;
    if (overridePrice != null) return overridePrice;

    // DUA / zero-weight case: if row has peso <= 0 and no manual override, price is 0
    if ((row.peso ?? 0) <= 0) {
      const savedZeroPrice = (loadedFromFirestore && typeof row.precio === 'number' && row.precio > 0)
        ? row.precio
        : 0;
      return savedZeroPrice;
    }

    // Only trust saved Firestore price if it's genuinely positive (> 0)
    const savedPrice = (loadedFromFirestore && typeof row.precio === 'number' && row.precio > 0)
      ? row.precio
      : undefined;

    const price = savedPrice ?? computedPrices[idx] ?? (typeof row.precio === 'number' && row.precio > 0 ? row.precio : undefined);
    
    // Invariant fallback: if price is still 0/undefined but row has weight > 0, calculate deterministically
    if ((price == null || price === 0) && (row.peso ?? 0) > 0) {
      const fallbackResult = calculatePrice(row.peso ?? 0, manifestCountry as any, manifestShipping as any, 'regular', row.permisos);
      return fallbackResult.quoteRequired ? 0 : Math.round(fallbackResult.price * 100) / 100;
    }

    return price ?? 0;
  }, [priceOverrides, computedPrices, loadedFromFirestore, manifestCountry, manifestShipping]);

  const getEffectivePesoRedondeo = useCallback((idx: number, row: ManifestRow) => {
    const tracking = (row.tracking || '').toUpperCase();
    const savedPeso = (loadedFromFirestore && typeof row.pesoRedondeo === 'number' && row.pesoRedondeo > 0)
      ? row.pesoRedondeo
      : undefined;
    return priceOverrides[tracking]?.pesoRedondeo
      ?? savedPeso
      ?? row.pesoRedondeo
      ?? (row.peso ? Math.ceil(row.peso) : 0);
  }, [priceOverrides, loadedFromFirestore]);

  /**
   * Recalculate prices for a set of row indices.
   * - roundTo = false → Recalcular: uses pesoRedondeo if previously rounded, else raw peso
   * - roundTo = number → Redondear: rounds peso UP to the given granularity
   */
  const applyRecalc = useCallback((targetIdxs: number[], roundTo: number | false) => {
    setPriceOverrides(prev => {
      const next = { ...prev };
      targetIdxs.forEach(idx => {
        const row = resultDataRows[idx];
        if (!row) return;
        const tracking = (row.tracking || '').toUpperCase();
        if (!tracking) return;
        let peso: number;
        if (roundTo !== false) {
          peso = Math.round(Math.ceil(row.peso / roundTo) * roundTo * 1000) / 1000;
        } else {
          // Recalcular: use pesoRedondeo if row was previously rounded, else raw peso
          peso = prev[tracking]?.pesoRedondeo ?? row.peso;
        }
        const result = calculatePrice(peso, manifestCountry as any, manifestShipping as any, 'regular', row.permisos);
        const precio = result.quoteRequired ? 0 : Math.round(result.price * 100) / 100;
        if (roundTo !== false) {
          next[tracking] = { precio, pesoRedondeo: peso };
        } else {
          next[tracking] = { precio, pesoRedondeo: prev[tracking]?.pesoRedondeo ?? row.peso };
        }
      });
      return next;
    });
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    setRecalcFlash(roundTo !== false ? 'round' : 'recalc');
    recalcTimerRef.current = setTimeout(() => setRecalcFlash(null), 1800);
  }, [resultDataRows, manifestCountry, manifestShipping, setPriceOverrides]);

  return {
    computedPrices,
    tc,
    getEffectivePrice,
    getEffectivePesoRedondeo,
    applyRecalc,
    recalcFlash,
  };
}
