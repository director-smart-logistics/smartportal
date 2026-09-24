/**
 * use-nova-resolved-rows.ts
 *
 * Custom hook that encapsulates the two most complex data-transformation
 * callbacks in the Nova results table:
 *
 *  - buildResolvedRows   — Bakes every operator override (name, route, price,
 *                          SL code) into each row so downstream functions
 *                          (ingest, save, invoice, export) always receive the
 *                          exact data shown in the table. Two-pass algorithm:
 *                          Pass 1 pre-computes consolidated group totals;
 *                          Pass 2 maps rows with all overrides applied.
 *
 *  - saveLearnedRoutes   — Persists unmatched-row route choices to Firestore
 *                          so Nova can pre-fill them on future manifests.
 *
 * Override priority (highest first):
 *   rutaOverrides  > slCodeOverrides[idx].ruta  > matchOverrides[idx].ruta  > row.ruta
 *   matchOverrides > nameOverrides               > row.nombreCliente         > row.nombre
 *   priceOverrides > computedPrices              > row.precio
 *
 * BUG-T1: rutaOverrides were never applied — fixed here.
 * BUG-T2: nameOverrides were never applied — fixed here.
 * BUG-T3: priceOverrides were not reflected in invoice rows — fixed here.
 */

import { useCallback } from 'react';
import { calculatePrice } from '@/lib/utils/pricing';
import { saveUnmatchedRouteLearning } from '@/lib/services/match-learning';
import { resolveEffectiveCustomerName } from '@/lib/utils/customer-name';
import type { ManifestRow, AjustePrecio } from '@/lib/services/manifest-processor';

// ── Parameter types ───────────────────────────────────────────────────────────

interface UseNovaResolvedRowsParams {
  resultDataRows:   ManifestRow[];
  unlinkedRows:     Set<number>;
  slCodeOverrides:  Record<number, { slCode: string; ruta: string }>;
  matchOverrides:   Record<number, { slCode: string; fullName: string; ruta: string }>;
  rutaOverrides:    Record<string, string>;
  nameOverrides:    Record<number, string>;
  priceOverrides:   Record<string, { precio: number; pesoRedondeo: number }>;
  /** User-corrected raw peso values — applied to r.peso in resolved output so
   *  buildInvoiceData, email templates, and route manifest all see the right weight. */
  pesoOverrides?:   Record<number, number>;
  computedPrices:   number[];
  separateInvoices: Record<string, boolean>;
  manifestCountry:  string;
  manifestShipping: string;
  customerContactMap?: Map<string, { ruta?: string; consolidationEnabled?: boolean }>;
  priceAdjustments?: Record<string, AjustePrecio>;
  loadedFromFirestore?: boolean;
  preAlertsMap?: Map<string, any>;
  /** Rows removed from the table — never used as a twin sibling. */
  deletedIndices?: Set<number>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNovaResolvedRows({
  resultDataRows,
  unlinkedRows,
  slCodeOverrides,
  matchOverrides,
  rutaOverrides,
  nameOverrides,
  priceOverrides,
  pesoOverrides = {},
  computedPrices,
  separateInvoices,
  manifestCountry,
  manifestShipping,
  customerContactMap,
  priceAdjustments = {},
  loadedFromFirestore = false,
  preAlertsMap,
  deletedIndices,
}: UseNovaResolvedRowsParams) {

  /**
   * Bake every table-level override into each row so downstream functions
   * (ingest, save, invoice) receive the exact data the operator sees.
   */
  const buildResolvedRows = useCallback((rows: ManifestRow[]) => {
    // PERF-1: pre-build O(1) index map to avoid O(n²) indexOf per row
    const idxOf = new Map<ManifestRow, number>(
      resultDataRows.map((r, i) => [r, i])
    );

    // ── Helper: resolve effective slCode for any row index ────────────────────
    const getBaseSlCode = (row: ManifestRow, idx: number): string => {
      // BUG-RESOLVED-ROWS-SLCODE-FILTER: Only accept valid slCodes starting with 'SL'
      // to prevent route fallbacks from leaking into client identifier slots.
      const baseRaw = unlinkedRows.has(idx) ? '' : (slCodeOverrides[idx]?.slCode
        ?? matchOverrides[idx]?.slCode
        ?? (row.slCode || ''));
      return (baseRaw && baseRaw.toUpperCase().startsWith('SL')) ? baseRaw : '';
    };

    // ── Twin resolution (BUG-TWIN-GROUP-NOT-PERSISTED 2026-09-24) ─────────────
    // NovaTableModal's sortedGroups shows a row with no real SL code (and not
    // unlinked) INSIDE the group of a same-name sibling that has one ("twin").
    // The operator sees it as part of that customer — same header, same route,
    // "2 paq." — but persistence used to keep slCode '' so the save wrote
    // "sin cliente / sin ruta" (incident 26-09-2026DANP: TBA334656337839 shown
    // under SL26519 Jose Brenes, saved unlinked). Mirror the exact display rule
    // here so what is saved is what is on screen. Keep in sync with the
    // `twinSlCode` block in NovaTableModal.tsx sortedGroups. Both sides look
    // at ALL non-deleted rows — never the filtered view — so a text/route
    // filter can't change which customer a row is saved under.
    const REAL_SL = /^SL\d+$/i;
    const nameKey = (row: ManifestRow, idx: number) =>
      (nameOverrides[idx] ?? row.nombre ?? '').trim().toUpperCase();
    const twinByName = new Map<string, { slCode: string; ruta: string }>();
    resultDataRows.forEach((r, i) => {
      if (unlinkedRows.has(i) || deletedIndices?.has(i)) return;
      const sl = getBaseSlCode(r, i).trim();
      const key = nameKey(r, i);
      if (!key || !REAL_SL.test(sl) || twinByName.has(key)) return;
      twinByName.set(key, {
        slCode: sl.toUpperCase(),
        ruta: slCodeOverrides[i]?.ruta || matchOverrides[i]?.ruta || r.ruta || '',
      });
    });
    const getTwin = (row: ManifestRow, idx: number) => {
      if (idx < 0 || unlinkedRows.has(idx)) return undefined;
      if (REAL_SL.test(getBaseSlCode(row, idx).trim())) return undefined;
      return twinByName.get(nameKey(row, idx));
    };

    const getEffSlCode = (row: ManifestRow, idx: number): string =>
      getTwin(row, idx)?.slCode ?? getBaseSlCode(row, idx);

    // ── Pass 1: pre-compute consolidated group totals ─────────────────────────
    // Group by effective slCode for all non-permit rows where consolidation is active
    // (separateInvoices[slc]=true). Does NOT require row.consolidacion — Firestore-loaded
    // manifests may lack that flag while separateInvoices already encodes the intent.
    // Distributor pattern: last row receives exact remainder so sum === groupTotal exactly.
    const consolidatedBilling = (() => {
      const groupPesos = new Map<string, number>();
      const groupIdxs  = new Map<string, number[]>();
      resultDataRows.forEach((row, idx) => {
        if (row.permisos) return;
        const tracking = row.tracking.toUpperCase();
        if (priceOverrides[tracking]?.precio != null) return;
        const slc = getEffSlCode(row, idx);
        if (!slc || !separateInvoices[slc]) return;
        if (
          customerContactMap &&
          customerContactMap.has(slc.toUpperCase()) &&
          !customerContactMap.get(slc.toUpperCase())?.consolidationEnabled
        ) {
          return;
        }
        groupPesos.set(slc, (groupPesos.get(slc) ?? 0) + (row.peso ?? 0));
        if (!groupIdxs.has(slc)) groupIdxs.set(slc, []);
        groupIdxs.get(slc)!.push(idx);
      });
      const priceOut = new Map<number, number>(); // origIdx → proportional price
      const pesoOut  = new Map<number, number>(); // origIdx → proportional billing peso
      groupPesos.forEach((sumPeso, slc) => {
        const idxs = groupIdxs.get(slc)!;
        if (idxs.length < 2 || sumPeso === 0) return;
        if (manifestShipping !== 'air') return; // ceiling billing is air-only — sea uses cubic-foot pricing
        const res = calculatePrice(Math.ceil(sumPeso), manifestCountry as any, manifestShipping as any, 'regular', false);
        if (res.quoteRequired) return;
        const total     = Math.round(res.price * 100) / 100;
        const ceiledSum = Math.ceil(sumPeso);
        let runningPrice = 0;
        let runningPeso  = 0;
        idxs.forEach((idx, i) => {
          const rp = resultDataRows[idx].peso ?? 0;
          if (i === idxs.length - 1) {
            // Last row: exact remainder — no rounding drift
            priceOut.set(idx, Math.round((total     - runningPrice) * 100) / 100);
            pesoOut.set( idx, Math.round((ceiledSum - runningPeso)  * 100) / 100);
          } else {
            const p = Math.round(total     * (rp / sumPeso) * 100) / 100;
            const w = Math.round(ceiledSum * (rp / sumPeso) * 100) / 100;
            priceOut.set(idx, p);
            pesoOut.set( idx, w);
            runningPrice += p;
            runningPeso  += w;
          }
        });
      });
      return { price: priceOut, peso: pesoOut };
    })();

    // ── Pass 2: map rows with all overrides applied ───────────────────────────
    return rows.map(row => {
      const idx       = idxOf.get(row) ?? -1;
      const effSlCode = getEffSlCode(row, idx);
      const tracking  = (row.tracking || '').toUpperCase().trim();

      // AI GUARD: BUG-ROUTE-AUTOCORRECT (2026-09-23) ─────────────────────────
      // INVARIANT: A manifest reopened from Firestore (loadedFromFirestore=
      // true) must NEVER have its saved `ruta` silently replaced by the
      // customer's CURRENT profile route. The row's saved `ruta` (baked in
      // at last save) is authoritative until the operator explicitly
      // reassigns the SL code THIS session (isSlCodeOverridden) — only then
      // does the live customer route become a sane default again.
      // This restores commit d9f14fc ("preserve routes/prices from
      // Firestore", v0.0.1477), which a later unrelated change stripped
      // without noticing the invariant. Mirrors DataOriginPolicy's
      // `allowAutoCustomerRouteFill` flag (client/lib/nova/data-origin) —
      // do NOT remove this guard; see use-nova-resolved-rows.spec.ts
      // ("route resolution — loadedFromFirestore immunity") for the
      // regression test that must stay green.
      const isSlCodeOverridden = slCodeOverrides[idx] !== undefined
        || matchOverrides[idx] !== undefined
        || unlinkedRows.has(idx);
      const dbDefaultRoute = (loadedFromFirestore && !isSlCodeOverridden)
        ? undefined
        : (effSlCode ? customerContactMap?.get(effSlCode.toUpperCase())?.ruta : undefined);

      // BUG-UNMATCHED-ROUTE-KEY (2026-09-24): the table's route picker writes
      // unmatched-group routes under the GROUP key, which is built from
      // `nameOverrides[idx] ?? row.nombre` (reloaded manifests seed
      // nameOverrides with the uppercased saved name). Looking up only the
      // raw `row.nombre` missed the override whenever the two differed, so
      // the UI showed the route but "Guardar en BD" persisted ruta: ''.
      // Twin rows (see getTwin) live under the sibling's group on screen, so
      // they take that group's route — never an __unmatched__ key.
      const twin = getTwin(row, idx);
      const effRuta   = twin
        ? (rutaOverrides[effSlCode] ?? dbDefaultRoute ?? twin.ruta)
        : rutaOverrides[effSlCode]
        ?? rutaOverrides[`__unmatched__${nameOverrides[idx] ?? row.nombre}`]
        ?? rutaOverrides[`__unmatched__${row.nombre}`]
        ?? rutaOverrides[row.slCode ?? '']
        ?? dbDefaultRoute
        ?? slCodeOverrides[idx]?.ruta
        ?? matchOverrides[idx]?.ruta
        ?? (row.ruta || '');

      const contact = effSlCode ? customerContactMap?.get(effSlCode.toUpperCase()) : undefined;
      const livePreAlert = preAlertsMap?.get(tracking);
      const effPreAlert = (livePreAlert && livePreAlert.found)
        ? livePreAlert
        : (row.preAlert && (row.preAlert.found || row.preAlert.slCode) ? row.preAlert : undefined);
      const preAlertName = effPreAlert?.displayName || effPreAlert?.fullName || effPreAlert?.name || effPreAlert?.clientName;

      const isUnlinkedRow = unlinkedRows.has(idx);
      const effName = resolveEffectiveCustomerName({
        overrideName: matchOverrides[idx]?.fullName || nameOverrides[idx],
        contactName: (contact as any)?.fullName,
        preAlertName,
        manifestConsigneeName: row.nombre,
        savedCustomerName: isUnlinkedRow ? undefined : row.nombreCliente,
        slCode: effSlCode,
      });
      // Billing peso:
      // - Consolidated: proportional share of ceil(sumPeso) — matches P.REDN column
      // - Individual / permit: ceil to next whole kg
      const savedPesoRedondeo = (loadedFromFirestore && typeof row.pesoRedondeo === 'number' && row.pesoRedondeo > 0)
        ? row.pesoRedondeo
        : undefined;

      const effPeso   = priceOverrides[tracking]?.pesoRedondeo
        ?? consolidatedBilling.peso.get(idx)
        ?? savedPesoRedondeo
        ?? (row.peso ? Math.ceil(row.peso) : 0);

      // Priority: user override > consolidated proportional share > valid saved price > computedPrice
      // INVARIANT: An item with weight > 0 must NEVER have a price of 0.
      const savedValidPrice = (loadedFromFirestore && typeof row.precio === 'number' && row.precio > 0)
        ? row.precio
        : undefined;

      let effPrice: number = priceOverrides[tracking]?.precio
        ?? consolidatedBilling.price.get(idx)
        ?? savedValidPrice
        ?? computedPrices[idx]
        ?? (typeof row.precio === 'number' && row.precio > 0 ? row.precio : undefined)
        ?? 0;

      // Invariant fallback: if effPrice is 0 but row has weight > 0, calculate dynamically
      if (effPrice === 0 && (row.peso ?? 0) > 0) {
        const fallbackRes = calculatePrice(row.peso ?? 0, manifestCountry as any, manifestShipping as any, 'regular', row.permisos);
        if (!fallbackRes.quoteRequired) {
          effPrice = Math.round(fallbackRes.price * 100) / 100;
        }
      }
      // For price-overridden rows apply the user-corrected raw peso so every
      // downstream consumer (buildInvoiceData, email template, route manifest)
      // receives the actual weight the operator entered, not the original 0.00.
      const effRawPeso = priceOverrides[tracking]?.precio != null
        ? (pesoOverrides[idx] ?? row.peso)
        : row.peso;
        
      const effConsolidacion = separateInvoices[effSlCode] === true;

      // Handle round-trip permit pricing columns for manual overrides
      const hasPriceOverride = priceOverrides[tracking]?.precio != null;
      const effPrecioSinPermiso = hasPriceOverride
        ? (row.permisos ? effPrice - 3 : effPrice)
        : (consolidatedBilling.price.has(idx) ? effPrice : row.precioSinPermiso);
      const effPrecioConPermiso = hasPriceOverride
        ? (row.permisos ? effPrice : effPrice + 3)
        : (consolidatedBilling.price.has(idx) ? effPrice : row.precioConPermiso);

      const effAjustePrecio = priceAdjustments[tracking] || row.ajustePrecio;

      return { 
        ...row, 
        peso: effRawPeso, 
        slCode: effSlCode, 
        ruta: effRuta, 
        nombreCliente: effName, 
        precio: effPrice, 
        pesoRedondeo: effPeso,
        consolidacion: effConsolidacion,
        precioSinPermiso: effPrecioSinPermiso,
        precioConPermiso: effPrecioConPermiso,
        ajustePrecio: effAjustePrecio,
        ...(effPreAlert ? { preAlert: effPreAlert } : {}),
        originalIndex: idx
      };
    });
  }, [resultDataRows, slCodeOverrides, matchOverrides, rutaOverrides, nameOverrides, priceOverrides, pesoOverrides, computedPrices, unlinkedRows, manifestCountry, manifestShipping, separateInvoices, priceAdjustments, customerContactMap, loadedFromFirestore, preAlertsMap, deletedIndices]);

  /**
   * Persist unmatched-row route choices so Nova can pre-fill them on future
   * manifests (learning from operator corrections).
   */
  const saveLearnedRoutes = useCallback((rows: ManifestRow[], resolved: ManifestRow[]) => {
    rows.forEach((origRow, i) => {
      const resolvedRow = resolved[i];
      const idx = resultDataRows.indexOf(origRow);
      const hasManualSlCode = !!slCodeOverrides[idx]?.slCode || !!matchOverrides[idx]?.slCode;
      const wasUnmatched = !origRow.slCode && !hasManualSlCode;
      // Twin rows resolve to their group's SL (BUG-TWIN-GROUP-NOT-PERSISTED) —
      // they are no longer unmatched, so don't teach the unmatched-name cache.
      if (wasUnmatched && !resolvedRow.slCode && resolvedRow.ruta) {
        saveUnmatchedRouteLearning(origRow.nombre, resolvedRow.ruta).catch(() => {});
      }
    });
  }, [resultDataRows, slCodeOverrides, matchOverrides]);

  return { buildResolvedRows, saveLearnedRoutes };
}
