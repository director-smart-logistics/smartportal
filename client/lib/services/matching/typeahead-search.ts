/**
 * Matching Engine — Typeahead Search
 *
 * `searchCustomersLocal()` powers the `CustomerAutocomplete` component.
 * It reuses the customer cache from `customer-loader.ts` and applies a
 * multi-tier scoring strategy optimized for autocomplete UX:
 *
 *   Tier 0: Structured-field bypass (email, digits, SL code)
 *   Tier 1: Exact normalized full-name match
 *   Tier 2: All-tokens-present with order scoring
 *   Tier 3: Token starts-with (partial typing)
 *   Tier 4: Substring match (accent variants)
 *   Tier 5: Fuzzy via `matchName()` (typo correction)
 *   Tier 6: Structured field search (SL partial, email, phone, DNI)
 *
 * @module matching/typeahead-search
 */

import type { CustomerData } from './types';
import { normalize, meaningfulTokens } from './normalize';
import { loadCustomers, findCustomerBySlCode } from './customer-loader';
import { matchName } from './match-engine';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, dbSP2 } from '../../firebase/config';

type Hit = {
  slCode: string;
  fullName: string;
  ruta?: string;
  consolidationEnabled: boolean;
  score: number;
  isTemp?: boolean;
};

/**
 * Local typeahead search — reuses the already-loaded customer cache + matchName.
 * This is the same "load-all → client-side filter" pattern used by SP2 UsersManagement,
 * which is far more powerful than a Firestore prefix-range query.
 *
 * Returns up to `limit` results with score >= minScore, sorted by score desc.
 * Falls back to a broader substring scan when matchName returns nothing (e.g. SL code search).
 */
export async function searchCustomersLocal(
  searchTerm: string,
  options: { limit?: number; minScore?: number } = {}
): Promise<Hit[]> {
  const customers = await loadCustomers();
  if (!searchTerm.trim() && customers.length === 0) return [];

  const { limit: maxResults = 15 } = options;
  const raw = searchTerm.trim();
  const term = raw.toUpperCase();
  const termNorm = normalize(term);

  const seen = new Set<string>();
  const hits: Hit[] = [];

  const push = (c: CustomerData, score: number) => {
    if (options.minScore !== undefined && score < options.minScore) return;
    if (seen.has(c.slCode)) return;
    seen.add(c.slCode);
    hits.push({ slCode: c.slCode, fullName: c.fullName || c.name, ruta: c.ruta, consolidationEnabled: c.consolidationEnabled, score, isTemp: c.isTemp });
  };

  // ── Input-type detection: structured fields bypass all name tiers ─────────
  // Mirrors SP2 adminService client-side filter exactly.
  // These patterns are unambiguous — there is no overlap with name searches.

  // ── Tier 0-A: Email search ─────────────────────────────────────────────────
  if (raw.includes('@')) {
    const emailLower = raw.toLowerCase();
    for (const c of customers) {
      if (c.email && c.email.toLowerCase().includes(emailLower)) push(c, 1.0);
    }
    if (hits.length === 0) {
      try {
        if (dbSP2) {
          const qEmail = query(collection(dbSP2, 'users'), where('email', '==', emailLower), limit(1));
          const snap = await getDocs(qEmail);
          if (!snap.empty) {
            const u = snap.docs[0].data();
            const slCode = (u.slCode || u.sl_code || u.casillero || snap.docs[0].id || '').toUpperCase();
            if (slCode) {
              const live = await findCustomerBySlCode(slCode);
              if (live) push(live, 1.0);
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return hits.sort((a, b) => (b.score - a.score) || ((a.isTemp ? 1 : 0) - (b.isTemp ? 1 : 0))).slice(0, maxResults);
  }

  // ── Tier 0-B: Pure digits — DNI / phone / partial SL number ───────────────
  if (/^\d+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    const targetSL = `SL${digits}`;
    // Exact SL code in memory
    for (const c of customers) {
      if (c.slCode.toUpperCase() === targetSL) push(c, 1.0);
    }
    // DNI/cedula
    for (const c of customers) {
      if (c.dni && c.dni.replace(/\D/g, '').includes(digits)) push(c, 1.0);
    }
    // Phone
    for (const c of customers) {
      if (digits.length >= 4 && c.phone && c.phone.replace(/\D/g, '').includes(digits)) push(c, 0.95);
    }
    // SL number digits (e.g. "1793" → SL1793)
    for (const c of customers) {
      if (c.slCode.replace(/\D/g, '').includes(digits)) push(c, 0.90);
    }
    if (hits.length === 0 && digits.length >= 3) {
      const liveCustomer = await findCustomerBySlCode(targetSL);
      if (liveCustomer) push(liveCustomer, 1.0);

      if (hits.length === 0 && digits.length >= 6) {
        try {
          if (dbSP2) {
            const qDni = query(collection(dbSP2, 'users'), where('dni', '==', digits), limit(1));
            const snap = await getDocs(qDni);
            if (!snap.empty) {
              const u = snap.docs[0].data();
              const slCode = (u.slCode || u.sl_code || u.casillero || snap.docs[0].id || '').toUpperCase();
              if (slCode) {
                const live = await findCustomerBySlCode(slCode);
                if (live) push(live, 1.0);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return hits.sort((a, b) => (b.score - a.score) || ((a.isTemp ? 1 : 0) - (b.isTemp ? 1 : 0))).slice(0, maxResults);
  }

  // ── Tier 0-C: SL code search ("SL1793", "sl 1793", "SL-1793") ─────────────
  const slCodePattern = /^sl[-\s]?(\d+)$/i;
  const slMatch = raw.match(slCodePattern);
  if (slMatch) {
    const digits = slMatch[1];
    const target = `SL${digits}`;
    // Exact match first
    for (const c of customers) {
      if (c.slCode.toUpperCase() === target) push(c, 1.0);
    }
    if (hits.length === 0) {
      const liveCustomer = await findCustomerBySlCode(target);
      if (liveCustomer) push(liveCustomer, 1.0);
    }
    if (hits.length > 0) return hits.slice(0, maxResults);
    // Partial match (e.g. "SL179" matches SL1793, SL17900…)
    for (const c of customers) {
      if (c.slCode.toUpperCase().replace('SL', '').includes(digits)) push(c, 0.90);
    }
    if (hits.length > 0) return hits.slice(0, maxResults);
    // Nothing found — fall through to name-based tiers below
  }

  // ── Tier 1: exact full-name match (normalized) ─────────────────────────────
  for (const c of customers) {
    if (c.normalizedName === termNorm) push(c, 1.0);
  }

  // ── Tier 2: ALL query tokens present — ranked by order match ─────────────
  const queryTokens = termNorm.split(/\s+/).filter(t => t.length >= 2);
  if (queryTokens.length > 0) {
    for (const c of customers) {
      const nameNorm = c.normalizedName;
      const nameTokens = nameNorm.split(/\s+/);

      const allPresent = queryTokens.every(qt => nameTokens.includes(qt));
      if (!allPresent) {
        const allSubstring = queryTokens.every(qt => nameNorm.includes(qt));
        if (!allSubstring) continue;
        const coverRatio = termNorm.length / nameNorm.length;
        push(c, Math.min(0.86, 0.80 + coverRatio * 0.06));
        continue;
      }

      // Sub-tier 2A: consecutive block
      const isConsecutive = (() => {
        for (let i = 0; i <= nameTokens.length - queryTokens.length; i++) {
          if (queryTokens.every((qt, j) => nameTokens[i + j] === qt)) return true;
        }
        return false;
      })();
      if (isConsecutive) {
        const atEnd = nameTokens.slice(-queryTokens.length).every((t, j) => t === queryTokens[j]);
        push(c, atEnd ? 0.99 : 0.97);
        continue;
      }

      // Sub-tier 2B: all tokens in same relative order
      const positions = queryTokens.map(qt => nameTokens.indexOf(qt));
      const inOrder = positions.every((p, i) => i === 0 || p > positions[i - 1]);
      if (inOrder) {
        push(c, 0.93);
        continue;
      }

      // Sub-tier 2C: all tokens present but scrambled
      const coverRatio = termNorm.length / nameNorm.length;
      push(c, Math.min(0.88, 0.84 + coverRatio * 0.04));
    }
  }

  // ── Tier 3: ANY token starts-with match on individual name tokens ──────────
  for (const c of customers) {
    const nameTokens = c.normalizedName.split(/\s+/);
    const qtMatched = queryTokens.filter(qt => nameTokens.some(nt => nt.startsWith(qt)));
    if (qtMatched.length === 0) continue;
    const ratio = qtMatched.length / queryTokens.length;
    if (queryTokens.length >= 2 && qtMatched.length < queryTokens.length) {
      push(c, 0.38 + ratio * 0.14);
      continue;
    }
    push(c, 0.72 + ratio * 0.10);
  }

  // ── Tier 4: substring anywhere (catches middle-name and accent variants) ───
  if (queryTokens.length === 1) {
    const qt = queryTokens[0];
    for (const c of customers) {
      if (c.normalizedName.includes(qt)) push(c, 0.68);
    }
  }

  // ── Tier 5: fuzzy via matchName (covers typos like "UMANNA", "PIERO HUMANA")
  if (hits.length < maxResults) {
    const fuzzy = matchName(term, customers);
    for (const r of fuzzy) {
      if (r.score < 0.45) break;
      push(r.customer, r.score * 0.90); // slight discount vs substring
    }
  }

  // ── Tier 6: structured field search — slCode, email, phone, dni ──────────
  {
    const termLower = raw.toLowerCase();
    const termClean = raw.replace(/[-\s()+]/g, '').toLowerCase();
    const digitsOnly = raw.replace(/\D/g, '');

    const slPartial = termClean.replace(/^sl/, '');
    for (const c of customers) {
      const sl = c.slCode.toLowerCase().replace(/[-\s]/g, '');
      if (sl === termClean || sl.includes(slPartial) || sl.includes(termClean)) {
        push(c, 0.95);
        continue;
      }
      if (c.email && c.email.toLowerCase().includes(termLower)) {
        push(c, 0.85);
        continue;
      }
      if (c.dni) {
        const dniClean = c.dni.replace(/[-\s]/g, '');
        if (dniClean.includes(termClean) || termClean.includes(dniClean)) {
          push(c, 0.90);
          continue;
        }
      }
      if (digitsOnly.length >= 4 && c.phone) {
        const phoneClean = c.phone.replace(/\D/g, '');
        if (phoneClean.includes(digitsOnly)) {
          push(c, 0.80);
        }
      }
    }
  }

  // Sort by score desc, real customers win ties over temp customers
  return hits.sort((a, b) => (b.score - a.score) || ((a.isTemp ? 1 : 0) - (b.isTemp ? 1 : 0))).slice(0, maxResults);
}
