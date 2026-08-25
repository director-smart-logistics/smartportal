/**
 * use-nova-customer-assignment.ts
 *
 * Custom hook that encapsulates all customer-assignment state and logic for
 * the Nova results table:
 *
 *  State managed here:
 *    - unlinkedRows       — indices explicitly detached from any customer
 *    - slCodeOverrides    — per-index customer SL code overrides
 *    - matchOverrides     — per-index full match (slCode + fullName + ruta)
 *    - nameOverrides      — per-index manifest-name corrections
 *    - approvedMatches    — indices where the operator approved a fuzzy match
 *    - recentlyUnlinked   — transient set cleared after 3 s (drives visual flash)
 *
 *  Handlers:
 *    - applyNameAndMatch       — rename a group of rows and attempt auto-match
 *    - handleUnlinkOnly        — detach rows without attempting rematch
 *    - handleUnlinkRow         — detach a single row
 *    - handleUnlinkAndRematch  — detach + attempt confident auto-rematch (0.85)
 *
 *  Effects:
 *    - autoValidation (one-shot) — unlinks & rematches rows whose stored customer
 *      name diverges significantly from the manifest name on first table open.
 *
 * setRutaOverrides is accepted as a parameter (same pattern as useNovaPriceCalcs
 * accepting setPriceOverrides) so route state can be extracted separately in
 * FASE 3 without modifying this hook's interface.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { searchCustomersLocal, getCustomerBySlCode, findCustomerMatch } from '@/lib/services/customer-matcher';
import { MATCH_THRESHOLDS } from '@/lib/services/matching/thresholds';
import { isDivergentMatch, createOrGetTempCustomer } from '@/lib/services/manifest-processor';
import { lookupLearnedRoute, saveMatchFeedback, loadLearnedMatches, reloadLearnedMatches, lookupLearned, hasLearnedCollision, isDominantCollisionWinner } from '@/lib/services/match-learning';
import { deleteTempCustomer } from '@/lib/services/temp-customers-service';
import { updateCustomerRuta } from '@/lib/services/customer-sync';
import type { ManifestRow } from '@/lib/services/manifest-processor';

// ── Parameter types ───────────────────────────────────────────────────────────

export interface UseNovaCustomerAssignmentParams {
  showTable: boolean;
  resultDataRows: ManifestRow[];
  setRutaOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /**
   * When true, the one-shot auto-revalidation rematch is skipped entirely.
   * Set this for data loaded from Firestore (existing saved manifests) so the
   * operator's stored assignments are never silently rewritten just because
   * the manifest `nombre` diverges from the saved `nombreCliente`. Re-linking
   * in that case must be an explicit user action via the Acciones menu.
   */
  skipAutoValidation?: boolean;
  preAlertsMap?: Map<string, any>;
  customerContactMap?: Map<string, any>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNovaCustomerAssignment({
  showTable,
  resultDataRows,
  setRutaOverrides,
  skipAutoValidation = false,
  preAlertsMap,
  customerContactMap,
}: UseNovaCustomerAssignmentParams) {

  // ── Core assignment state ─────────────────────────────────────────────────
  const [unlinkedRows,    setUnlinkedRows]    = useState<Set<number>>(new Set());
  const [slCodeOverrides, setSlCodeOverrides] = useState<Record<number, { slCode: string; ruta: string }>>({});
  const [matchOverrides,  setMatchOverrides]  = useState<Record<number, { slCode: string; fullName: string; ruta: string }>>({});
  const [nameOverrides,   setNameOverrides]   = useState<Record<number, string>>({});
  const [approvedMatches, setApprovedMatches] = useState<Set<number>>(new Set());

  // Transient set of row indices that were just unlinked (cleared after 3 s)
  const [recentlyUnlinked, setRecentlyUnlinked] = useState<Set<number>>(new Set());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashUnlinked = useCallback((indices: number[]) => {
    setRecentlyUnlinked(new Set(indices));
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setRecentlyUnlinked(new Set());
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const applyNameAndMatch = useCallback(async (
    targetIndices: number[],
    newName: string,
  ) => {
    setNameOverrides(prev => {
      const next = { ...prev };
      targetIndices.forEach(i => {
        if (newName.trim()) next[i] = newName.trim().toUpperCase();
        else delete next[i];
      });
      return next;
    });

    if (!newName.trim()) return;

    try {
      const normTokens = newName.trim().split(/\s+/).filter(Boolean);
      const isSingleTokenGeneric = normTokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS;
      const results = isSingleTokenGeneric ? [] : await searchCustomersLocal(newName, { limit: 1, minScore: MATCH_THRESHOLDS.AUTO_ACCEPT_MIN });
      const best = results[0];
      const bestName = best?.fullName || '';
      if (best && !isSingleTokenGeneric && !isDivergentMatch(newName, bestName)) {
        setMatchOverrides(prev => {
          const next = { ...prev };
          targetIndices.forEach(i => {
            next[i] = { slCode: best.slCode, fullName: best.fullName, ruta: best.ruta ?? '' };
          });
          return next;
        });
        setSlCodeOverrides(prev => {
          const next = { ...prev };
          targetIndices.forEach(i => {
            next[i] = { slCode: best.slCode, ruta: best.ruta ?? '' };
          });
          return next;
        });
        if (best.ruta) {
          setRutaOverrides(prev => ({ ...prev, [best.slCode]: best.ruta! }));
        }
        setUnlinkedRows(prev => {
          const next = new Set(prev);
          targetIndices.forEach(i => next.delete(i));
          return next;
        });
      }
    } catch {
      // Non-blocking
    }
  }, [setRutaOverrides]);

  const handleUnlinkOnly = useCallback((indices: number[]) => {
    setUnlinkedRows(prev => {
      const next = new Set(prev);
      indices.forEach(i => next.add(i));
      return next;
    });
    setSlCodeOverrides(prev => {
      const next = { ...prev };
      indices.forEach(i => delete next[i]);
      return next;
    });
    setMatchOverrides(prev => {
      const next = { ...prev };
      indices.forEach(i => delete next[i]);
      return next;
    });
    flashUnlinked(indices);
  }, [flashUnlinked]);

  const handleUnlinkRow = useCallback((rowIndex: number) => {
    handleUnlinkOnly([rowIndex]);
  }, [handleUnlinkOnly]);

  // ── handleUnlinkAndRematch ────────────────────────────────────────────────
  // Detach rows then attempt confident auto-rematch (Pre-alert -> Learned -> Engine -> Preserve).
  const handleUnlinkAndRematch = useCallback(async (
    indices: number[],
    getNombre: (idx: number) => string,
    onProgress?: (current: number, total: number) => void,
    options?: {
      preAlertsMap?: Map<string, any>;
      customerContactMap?: Map<string, any>;
    },
  ) => {
    const activePreAlertMap = options?.preAlertsMap || preAlertsMap;
    const activeContactMap = options?.customerContactMap || customerContactMap;

    // Pass 1: Pre-alert SSOT Check (Highest Priority)
    const preAlertMatchedIndices = new Set<number>();
    const preAlertAssignments: Record<number, { slCode: string; fullName: string; ruta: string }> = {};

    indices.forEach(idx => {
      const row = resultDataRows[idx];
      if (!row) return;
      const trackingKey = (row.tracking || row.guia || "").toUpperCase().trim();
      const preAlert = (activePreAlertMap?.get(trackingKey) || (row as any).preAlert || (row as any).preAlertInfo) as any;
      const preAlertSlCode = (preAlert?.slCode || (row as any).preAlertSlCode || "").toUpperCase().trim();

      if ((preAlert?.found || preAlertSlCode) && preAlertSlCode.startsWith('SL') && !preAlertSlCode.startsWith('SL-NAN-')) {
        preAlertMatchedIndices.add(idx);
        const liveCust = activeContactMap?.get(preAlertSlCode) || getCustomerBySlCode(preAlertSlCode);
        const assignedFullName = liveCust?.fullName || liveCust?.name || preAlert.clientName || preAlert.displayName || row.nombreCliente || row.nombre;
        const assignedRuta = liveCust?.ruta || row.ruta || '';

        preAlertAssignments[idx] = { slCode: preAlertSlCode, fullName: assignedFullName, ruta: assignedRuta };
        if (assignedRuta) {
          setRutaOverrides(prev => ({ ...prev, [preAlertSlCode]: assignedRuta }));
        }
      }
    });

    const nonPreAlertIndices = indices.filter(idx => !preAlertMatchedIndices.has(idx));

    // Step 1 — Unlink only non-pre-alert rows; keep pre-alerts matched
    setUnlinkedRows(prev => {
      const next = new Set(prev);
      preAlertMatchedIndices.forEach(i => next.delete(i));
      nonPreAlertIndices.forEach(i => next.add(i));
      return next;
    });

    setSlCodeOverrides(prev => {
      const next = { ...prev };
      nonPreAlertIndices.forEach(i => delete next[i]);
      Object.entries(preAlertAssignments).forEach(([idxStr, assign]) => {
        next[Number(idxStr)] = { slCode: assign.slCode, ruta: assign.ruta };
      });
      return next;
    });

    setMatchOverrides(prev => {
      const next = { ...prev };
      nonPreAlertIndices.forEach(i => delete next[i]);
      Object.entries(preAlertAssignments).forEach(([idxStr, assign]) => {
        next[Number(idxStr)] = assign;
      });
      return next;
    });

    setNameOverrides(prev => {
      const next = { ...prev };
      indices.forEach(i => {
        const raw = getNombre(i);
        if (raw) next[i] = raw.toUpperCase();
        else delete next[i];
      });
      return next;
    });

    setApprovedMatches(prev => {
      const next = new Set(prev);
      nonPreAlertIndices.forEach(i => next.delete(i));
      return next;
    });

    // Step 2 — group non-pre-alert indices by UPPERCASED name for batched re-matching.
    const byNombre = new Map<string, number[]>();
    nonPreAlertIndices.forEach(idx => {
      const nombre = getNombre(idx).toUpperCase();
      const list = byNombre.get(nombre) ?? [];
      list.push(idx);
      byNombre.set(nombre, list);
    });

    // Step 3 — per unique name: attempt rematch
    let currentProcessed = 0;
    const totalNames = byNombre.size;
    if (onProgress) {
      onProgress(0, totalNames);
    }

    // Force-reload fresh learned matches from Firestore so any recently added learning record is active
    let learnedMatches = await reloadLearnedMatches().catch(() => loadLearnedMatches());

    for (const [nombre, idxs] of byNombre) {
      try {
        let matchFound = false;

        // Priority 2: Learned matches
        try {
          const learnedEntry = lookupLearned(nombre, learnedMatches);
          const hasCollision = learnedEntry ? hasLearnedCollision(learnedEntry.normalizedName) : false;
          const collisionIsDominant = hasCollision && learnedEntry
            ? isDominantCollisionWinner(learnedEntry.normalizedName, learnedEntry.slCode)
            : false;

          if (
            learnedEntry &&
            learnedEntry.score >= MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN &&
            (!hasCollision || collisionIsDominant)
          ) {
            const liveCustomer = getCustomerBySlCode(learnedEntry.slCode) || activeContactMap?.get(learnedEntry.slCode.toUpperCase());
            const activeRuta = liveCustomer ? (liveCustomer.ruta || '') : (learnedEntry.ruta ?? '');
            const activeFullName = liveCustomer ? (liveCustomer.fullName || liveCustomer.name) : learnedEntry.fullName;

            setMatchOverrides(prev => {
              const next = { ...prev };
              idxs.forEach(i => { next[i] = { slCode: learnedEntry.slCode, fullName: activeFullName, ruta: activeRuta }; });
              return next;
            });
            setSlCodeOverrides(prev => {
              const next = { ...prev };
              idxs.forEach(i => { next[i] = { slCode: learnedEntry.slCode, ruta: activeRuta }; });
              return next;
            });
            setUnlinkedRows(prev => { const next = new Set(prev); idxs.forEach(i => next.delete(i)); return next; });
            if (activeRuta) setRutaOverrides(prev => ({ ...prev, [learnedEntry.slCode]: activeRuta }));
            matchFound = true;
          }
        } catch (err) {
          console.warn('[Nova] Learned matching error during rematch:', err);
        }

        if (matchFound) {
          flashUnlinked(idxs);
          currentProcessed++;
          if (onProgress) onProgress(currentProcessed, totalNames);
          continue;
        }

        // Priority 3: Customer match engine & typeahead search
        const normTokens = nombre.trim().split(/\s+/).filter(Boolean);
        const isSingleTokenGeneric = normTokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS;

        let bestMatch: { slCode: string; fullName: string; ruta?: string; score: number } | null = null;

        // Try single-name match engine first
        try {
          const matchRes = await findCustomerMatch(nombre);
          const topCandidate = matchRes.exactMatch
            ? matchRes.candidates[0]
            : matchRes.candidates.find(c => c.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN);

          if (
            topCandidate &&
            (!isSingleTokenGeneric || (topCandidate.customer.fullName || topCandidate.customer.name).toUpperCase().trim() === nombre.toUpperCase().trim()) &&
            !isDivergentMatch(nombre, topCandidate.customer.fullName || topCandidate.customer.name)
          ) {
            bestMatch = {
              slCode: topCandidate.customer.slCode,
              fullName: topCandidate.customer.fullName || topCandidate.customer.name,
              ruta: topCandidate.customer.ruta,
              score: topCandidate.score,
            };
          }
        } catch { /* ignore and fallback to searchCustomersLocal */ }

        if (!bestMatch) {
          const results = isSingleTokenGeneric
            ? []
            : await searchCustomersLocal(nombre, { limit: 1, minScore: MATCH_THRESHOLDS.AUTO_ACCEPT_MIN });
          const best = results[0];
          const bestName = best?.fullName || '';
          if (best && !isSingleTokenGeneric && !isDivergentMatch(nombre, bestName)) {
            bestMatch = {
              slCode: best.slCode,
              fullName: best.fullName,
              ruta: best.ruta,
              score: best.score,
            };
          }
        }

        if (bestMatch) {
          setMatchOverrides(prev => {
            const next = { ...prev };
            idxs.forEach(i => { next[i] = { slCode: bestMatch!.slCode, fullName: bestMatch!.fullName, ruta: bestMatch!.ruta ?? '' }; });
            return next;
          });
          setSlCodeOverrides(prev => {
            const next = { ...prev };
            idxs.forEach(i => { next[i] = { slCode: bestMatch!.slCode, ruta: bestMatch!.ruta ?? '' }; });
            return next;
          });
          if (bestMatch.ruta) setRutaOverrides(prev => ({ ...prev, [bestMatch!.slCode]: bestMatch!.ruta! }));
          setUnlinkedRows(prev => { const next = new Set(prev); idxs.forEach(i => next.delete(i)); return next; });
          matchFound = true;
        }

        if (matchFound) {
          flashUnlinked(idxs);
          currentProcessed++;
          if (onProgress) onProgress(currentProcessed, totalNames);
          continue;
        }

        // Priority 4: Preserve previous valid manifest match if confident (>= 0.85) and not divergent
        const firstIdx = idxs[0];
        const origRow = resultDataRows[firstIdx];
        const origSl = (origRow?.slCode || "").toUpperCase().trim();
        const origScore = Number(origRow?.matchScore ?? 0);

        if (origSl && origSl.startsWith('SL') && !origSl.startsWith('SL-NAN') && origScore >= 0.85) {
          const origCust = activeContactMap?.get(origSl) || getCustomerBySlCode(origSl);
          const origName = origCust?.fullName || origCust?.name || origRow.nombreCliente || origRow.nombre;
          if (!isDivergentMatch(nombre, origName)) {
            setMatchOverrides(prev => {
              const next = { ...prev };
              idxs.forEach(i => { next[i] = { slCode: origSl, fullName: origName, ruta: origCust?.ruta || origRow.ruta || '' }; });
              return next;
            });
            setSlCodeOverrides(prev => {
              const next = { ...prev };
              idxs.forEach(i => { next[i] = { slCode: origSl, ruta: origCust?.ruta || origRow.ruta || '' }; });
              return next;
            });
            if (origCust?.ruta || origRow.ruta) {
              setRutaOverrides(prev => ({ ...prev, [origSl]: origCust?.ruta || origRow.ruta || '' }));
            }
            setUnlinkedRows(prev => { const next = new Set(prev); idxs.forEach(i => next.delete(i)); return next; });
            matchFound = true;
          }
        }

        if (!matchFound) {
          // Genuinely unmatched — set learned route for group if one exists
          const learned = lookupLearnedRoute(nombre);
          if (learned) {
            setRutaOverrides(prev => ({ ...prev, [`__unmatched__${nombre}`]: learned }));
          }
        }
      } catch { /* match failure is non-blocking */ }

      flashUnlinked(idxs);
      currentProcessed++;
      if (onProgress) {
        onProgress(currentProcessed, totalNames);
      }
      // BUG-VER-TABLA-FREEZE 2026-05-26: Yield to the browser every 5
      // names so React can flush state updates + repaint without the loop
      // monopolising the main thread. With ~47 names the loop without this
      // yield would batch 200+ setState calls + DOM mutations before
      // returning control, triggering the "Page Unresponsive" prompt.
      if (currentProcessed % 5 === 0 && currentProcessed < totalNames) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }, [setRutaOverrides, flashUnlinked]);

  // ── Auto-validation on load (one-shot, ref-guarded) ──────────────────────
  // Finds rows whose stored customer name diverges significantly from the
  // manifest name and unlinks + rematches them so the operator sees clean
  // groups from the start, not misleading stale assignments.
  //
  // IMPORTANT: This fires ONLY for fresh Excel parses. When `skipAutoValidation`
  // is true (data loaded from Firestore via loadMegaManFromFirestore) we must
  // keep the stored assignments intact — the operator already curated them
  // before saving, and silently rewriting them here was destroying manual
  // links like "PAULA UMANA" → "ANA PAULA FONSECA QUADROS". Re-linking from a
  // saved manifest now requires an explicit user action (Acciones menu).
  const autoValidationDoneRef = useRef(false);
  useEffect(() => {
    if (skipAutoValidation) {
      // Ensure the guard is consumed so a later showTable toggle in the same
      // session (unlikely, but defensive) does not re-enter this block.
      autoValidationDoneRef.current = true;
      return;
    }
    if (!showTable || resultDataRows.length === 0 || autoValidationDoneRef.current) return;
    autoValidationDoneRef.current = true;

    const toRematch: number[] = [];
    resultDataRows.forEach((row, idx) => {
      if (!row.slCode || !row.nombreCliente || !row.nombre) return;
      if (isDivergentMatch(row.nombre, row.nombreCliente)) toRematch.push(idx);
    });
    if (toRematch.length === 0) return;

    console.log(`[Nova] Auto-validating ${toRematch.length} divergent row(s)`);
    // BUG-VER-TABLA-FREEZE 2026-05-26: Defer the rematch loop to the next
    // idle slot so the initial table paint completes first. Previously the
    // rematch ran synchronously within the same effect tick, competing with
    // the very first render of a 194-row × heavy-cell table — Chrome would
    // show a "Page Unresponsive" prompt for ~10 s while ~47 fuzzy searches
    // + Firestore writes flushed their setState chains through React.
    // requestIdleCallback yields to layout/paint; setTimeout(0) is the
    // Safari/Firefox fallback. The result is identical (same matches happen
    // a few hundred ms later) but the table stays interactive throughout.
    const schedule: (cb: () => void) => number =
      typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function'
        ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 500 })
        : (cb) => window.setTimeout(cb, 0);
    const handle = schedule(() => {
      handleUnlinkAndRematch(toRematch, idx => resultDataRows[idx]?.nombre ?? '');
    });
    return () => {
      if (typeof window === 'undefined') return;
      if (typeof (window as any).cancelIdleCallback === 'function') {
        try { (window as any).cancelIdleCallback(handle); } catch { /* noop */ }
      } else {
        window.clearTimeout(handle);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTable, resultDataRows, skipAutoValidation]);
  // ^ ref-guarded one-shot; resultDataRows dep ensures we don't miss rows
  //   arriving after showTable flips to true. skipAutoValidation is part of
  //   the payload metadata so data origin can be detected without re-parsing.

  // ── Hydration on load for Firestore-loaded manifests (skipAutoValidation === true) ──
  // BUG-UNMATCHED-RELOAD-GROUPING 2026-08-07: For saved manifests, we must restore the unlinked/unmatched
  // status of rows. Any row whose saved slCode is empty or is a route name/placeholder (does not
  // start with 'SL') is unmatched. We populate unlinkedRows and nameOverrides so they are grouped
  // by their saved customer names instead of route names.
  const hydrationDoneRef = useRef(false);
  useEffect(() => {
    if (!skipAutoValidation) return;
    if (!showTable || resultDataRows.length === 0 || hydrationDoneRef.current) return;
    hydrationDoneRef.current = true;

    const initialUnlinked = new Set<number>();
    const initialNames: Record<number, string> = {};
    
    resultDataRows.forEach((row, idx) => {
      const code = (row.slCode || '').toUpperCase().trim();
      if (!code || !code.startsWith('SL')) {
        initialUnlinked.add(idx);
        const name = row.nombreCliente || row.nombre || '';
        if (name) {
          initialNames[idx] = name.toUpperCase();
        }
      }
    });

    if (initialUnlinked.size > 0) {
      setUnlinkedRows(initialUnlinked);
    }
    if (Object.keys(initialNames).length > 0) {
      setNameOverrides(prev => ({ ...prev, ...initialNames }));
    }
  }, [showTable, resultDataRows, skipAutoValidation]);


  // ── applyExplicitMatch ────────────────────────────────────────────────────
  // Force a known customer onto a set of rows WITHOUT running the AI matcher.
  // Used by the group-merge UX: when the operator confirms in the merge
  // modal that an unmatched group should join an existing matched group,
  // we already know the target slCode/fullName/ruta — running the matcher
  // again would only introduce risk of returning a different match.
  //
  // Behaviour:
  //   • Removes the row from `unlinkedRows` (if present) so the matched
  //     slCode drives its group key on the next render tick.
  //   • Sets matchOverrides + slCodeOverrides + nameOverrides in lockstep
  //     so every consumer of the override state agrees on the new
  //     customer assignment.
  //   • Promotes the row into `approvedMatches` — the operator's explicit
  //     confirmation IS approval (no review-pill needed afterwards).
  //   • Updates rutaOverrides keyed on the new slCode so route pickers
  //     reflect the inherited route.
  const applyExplicitMatch = useCallback((
    indices: number[],
    target: { slCode: string; fullName: string; ruta?: string },
  ) => {
    if (!indices.length || !target.slCode) return;

    // Expand indices to include twin rows sharing exact normalized manifest name
    const expandedIndicesSet = new Set<number>(indices);
    indices.forEach(i => {
      const manifestName = (nameOverrides[i] || resultDataRows[i]?.nombre || '').trim().toUpperCase();
      if (!manifestName) return;
      resultDataRows.forEach((r, idx) => {
        const otherName = (nameOverrides[idx] || r.nombre || '').trim().toUpperCase();
        if (otherName === manifestName) {
          expandedIndicesSet.add(idx);
        }
      });
    });
    const effectiveIndices = Array.from(expandedIndicesSet);

    const targetRuta = target.ruta ?? '';

    // Fire-and-forget: delete any old SL-NAN temp customers we are replacing
    const tempSlCodesToDelete = new Set<string>();
    effectiveIndices.forEach(i => {
      const currentSlCode = slCodeOverrides[i]?.slCode || resultDataRows[i]?.slCode;
      if (currentSlCode && currentSlCode.startsWith('SL-NAN-') && currentSlCode !== target.slCode) {
        tempSlCodesToDelete.add(currentSlCode);
      }
    });
    tempSlCodesToDelete.forEach(slCode => {
      deleteTempCustomer(slCode).catch(err => {
        console.warn(`[Nova] Failed to auto-delete temp customer ${slCode} upon explicit reassignment:`, err);
      });
    });

    // Fire-and-forget: learn the new mapping for replaced/assigned customers
    const learnedNames = new Set<string>();
    effectiveIndices.forEach(i => {
      const currentSlCode = slCodeOverrides[i]?.slCode || resultDataRows[i]?.slCode;
      if (currentSlCode !== target.slCode) {
        const row = resultDataRows[i];
        if (row) {
          const manifestName = nameOverrides[i] || row.nombre;
          if (manifestName && !learnedNames.has(manifestName)) {
            learnedNames.add(manifestName);
            saveMatchFeedback({
              manifestName,
              slCode: target.slCode,
              fullName: target.fullName,
              ruta: target.ruta ?? null,
              consolidationEnabled: row.consolidacion ?? false,
              source: 'admin_pick'
            }).catch(err => {
              console.warn(`[Nova] Failed to learn match upon explicit reassignment:`, err);
            });
          }
        }
      }
    });

    setUnlinkedRows(prev => {
      if (effectiveIndices.every(i => !prev.has(i))) return prev;
      const next = new Set(prev);
      effectiveIndices.forEach(i => next.delete(i));
      return next;
    });
    setMatchOverrides(prev => {
      const next = { ...prev };
      effectiveIndices.forEach(i => { next[i] = { slCode: target.slCode, fullName: target.fullName, ruta: targetRuta }; });
      return next;
    });
    setSlCodeOverrides(prev => {
      const next = { ...prev };
      effectiveIndices.forEach(i => { next[i] = { slCode: target.slCode, ruta: targetRuta }; });
      return next;
    });
    setNameOverrides(prev => {
      let changed = false;
      const next = { ...prev };
      effectiveIndices.forEach(i => {
        if (i in next) { delete next[i]; changed = true; }
      });
      return changed ? next : prev;
    });
    setApprovedMatches(prev => {
      const next = new Set(prev);
      effectiveIndices.forEach(i => next.add(i));
      return next;
    });
    if (targetRuta) {
      setRutaOverrides(prev => ({ ...prev, [target.slCode]: targetRuta }));
      updateCustomerRuta(target.slCode, targetRuta, false, 'nova_assignment').catch(console.error);
    }
  }, [resultDataRows, slCodeOverrides, nameOverrides, setRutaOverrides]);

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    unlinkedRows,    setUnlinkedRows,
    slCodeOverrides, setSlCodeOverrides,
    matchOverrides,  setMatchOverrides,
    nameOverrides,   setNameOverrides,
    approvedMatches, setApprovedMatches,
    recentlyUnlinked,
    applyNameAndMatch,
    applyExplicitMatch,
    handleUnlinkOnly,
    handleUnlinkRow,
    handleUnlinkAndRematch,
  };
}
