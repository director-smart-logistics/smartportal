/**
 * Match Learning Service
 *
 * Stores every admin-confirmed name→slCode mapping in Firestore
 * (`match_feedback` collection) and uses those confirmed pairs to:
 *
 *  1. SHORT-CIRCUIT the matcher with score=1.0 on the next manifest
 *     (exact + normalized variant hit).
 *  2. BOOST scores for fuzzy variants of already-confirmed names
 *     (partial token overlap, Levenshtein distance ≤ 2).
 *  3. Provide a `getLearnedCandidates` tool to the AI disambiguation
 *     pass so Gemini knows which mappings have already been confirmed
 *     by a human admin.
 *
 * Schema — Firestore collection `match_feedback`:
 * ─────────────────────────────────────────────────────────────────
 * {
 *   id:               auto (manifestName_slCode normalized)
 *   manifestName:     string   — raw name from manifest (uppercase)
 *   normalizedName:   string   — accent-stripped, no punctuation
 *   slCode:           string   — confirmed SL code
 *   fullName:         string   — canonical full name from SP1
 *   ruta:             string | null
 *   consolidationEnabled: boolean
 *   source:           'admin_pick' | 'admin_manual' | 'admin_sp2'
 *   confirmedAt:      Timestamp
 *   confirmedBy:      string   — admin UID (if available)
 *   hitCount:         number   — incremented every time this pair resolves a row
 *   lastHitAt:        Timestamp
 * }
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
  documentId,
  deleteDoc,
  type Timestamp,
} from 'firebase/firestore';
import { setLearnedIndex, lookupLearnedEnhanced, getLearnedCandidatesForAIEnhanced } from './matching/learned-lookup';
import { sanitizeName } from './matching/normalize';
import { MATCH_THRESHOLDS } from './matching/thresholds';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MatchFeedback {
  id: string;
  manifestName: string;
  normalizedName: string;
  slCode: string;
  fullName: string;
  ruta?: string | null;
  consolidationEnabled: boolean;
  source: 'admin_pick' | 'admin_manual' | 'admin_sp2' | 'ai_auto' | 'ai_superseded';
  aiConfidence?: number;
  confirmedAt: Timestamp | null;
  confirmedBy?: string;
  hitCount: number;
  lastHitAt: Timestamp | null;
}

export interface LearnedMatch {
  manifestName: string;
  normalizedName: string;
  slCode: string;
  fullName: string;
  ruta?: string | null;
  consolidationEnabled: boolean;
  hitCount: number;
  score: number; // 1.0 for exact, 0.88–0.99 for fuzzy learned
  source?: MatchFeedback['source']; // admin_pick | admin_manual | admin_sp2 | ai_auto — optional for backwards compat
}

// ─── Validation Helpers ────────────────────────────────────────────────────────
export const isValidSlCode = (slCode: string): boolean => {
  if (!slCode) return false;
  return /^SL\d+$/i.test(slCode.trim());
};

export const containsCorporateKeywords = (name: string): boolean => {
  if (!name) return false;
  const normalized = name.toUpperCase();
  const corporateKeywords = [
    'SMARTLOGISTICS',
    'SMARTLOGISTIC',
    'SMART LOGISTICS',
    'SMART LOGISTIC',
    'MLCARGO',
    'ML-CARGO',
    'ML CARGO'
  ];
  return corporateKeywords.some(keyword => normalized.includes(keyword));
};

// ─── In-memory cache ────────────────────────────────────────────────────────────

let learnedCache: LearnedMatch[] = [];
let learnedCacheTs = 0;
const LEARNED_CACHE_TTL = 5 * 60 * 1000; // 5 min — refresh after each session

// O(1) exact-lookup index: normalizedName → best LearnedMatch (admin wins over ai_auto)
let learnedCacheIndex: Map<string, LearnedMatch> = new Map();
// Collision set: normalizedNames with 2+ different slCodes → surface requiresUserChoice
let learnedCollisions: Set<string> = new Set();
// Full collision map: normalizedName → all competing entries (for dominant-winner check)
let learnedCollisionMap: Map<string, LearnedMatch[]> = new Map();

/** Source priority: admin-confirmed entries always outrank AI auto-saves. */
const SOURCE_PRIORITY: Record<MatchFeedback['source'], number> = {
  'admin_pick': 3,
  'admin_manual': 3,
  'admin_sp2': 3,
  'ai_auto': 1,
  'ai_superseded': 0,
};

/**
 * Returns true when the winner of a collision has ≥3× the hitCount of every
 * other competing entry AND was confirmed by a human admin (not ai_auto).
 * Used by batch-matcher to allow the short-circuit even when hasLearnedCollision
 * is true, as long as the intent is unambiguous.
 */
export function isDominantCollisionWinner(normalizedName: string, winnerSlCode: string): boolean {
  const entries = learnedCollisionMap.get(normalizedName);
  if (!entries || entries.length < 2) return false;
  const winner = entries.find(e => e.slCode.toUpperCase() === winnerSlCode.toUpperCase());
  if (!winner) return false;

  // Must be human admin-confirmed (not AI auto-save).
  // Legacy 'admin' source (pre-typed union) with ≥3 hits is also treated as confirmed.
  const isAdminConfirmed = winner.source === 'admin_pick' ||
    winner.source === 'admin_manual' ||
    winner.source === 'admin_sp2' ||
    (String(winner.source) === 'admin' && (winner.hitCount ?? 0) >= 3);
  if (!isAdminConfirmed) return false;

  // Filter competitors to only include valid conflicting entries:
  // - Exclude the winner itself
  // - Exclude temporary customer placeholders (SL-NAN-*) because they shouldn't block a real customer match
  // - Exclude AI auto-saves (which are not human-confirmed)
  const validCompetitors = entries.filter(e => {
    if (e.slCode.toUpperCase() === winnerSlCode.toUpperCase()) return false;
    if (/^SL-NAN-/i.test(e.slCode)) return false;
    if (e.source === 'ai_auto' || e.source === 'ai_superseded') return false;
    return true;
  });

  // If there are no real human-confirmed competitors, then this winner is unambiguous and dominates!
  if (validCompetitors.length === 0) {
    return true;
  }

  // If there are other human-confirmed real customer competitors, then we require:
  // 1. The winner has at least 3 confirmations
  // 2. The winner has at least 3 times the hitCount of each valid competitor
  if (winner.hitCount < 3) return false;
  return validCompetitors.every(o => winner.hitCount >= o.hitCount * 3);
}

const PATTERNS_COL = 'manifest_learning_patterns';

// ─── Routing / city prefix set ─────────────────────────────────────────────────
// In Costa Rican logistics manifests, unregistered customers (no slCode) are
// prefixed with their city or delivery zone:
//   "ALAJUELA FRANCISCO MEJIA"  →  city = ALAJUELA, name = FRANCISCO MEJIA
//   "BB SONIA VALVERDE"         →  zone = BB, name = SONIA VALVERDE
//
// These prefixes are NOT part of the person's name and must never be confused
// with tokens of a registered customer's name.  Any entry whose first normalized
// token is in this set is treated as an unregistered-customer row.
export const ROUTING_PREFIXES = new Set([
  'ALAJUELA', 'HEREDIA', 'CARTAGO', 'LIMON', 'PUNTARENAS',
  'GUANACASTE', 'LIBERIA', 'NICOYA', 'GRECIA', 'ATENAS',
  'DESAMPARADOS', 'BB', 'SAN JOSE', 'SANJOSE',
]);

/** Returns true when the manifest name starts with a known routing/city prefix. */
export function hasRoutingPrefix(manifestName: string): boolean {
  const firstToken = normalizeName(manifestName).split(' ')[0];
  return ROUTING_PREFIXES.has(firstToken);
}

// ─── Normalization (mirrors customer-matcher normalize) ─────────────────────────

function normalizeName(text: string): string {
  if (!text) return '';
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function docId(manifestName: string, slCode: string): string {
  return `${normalizeName(manifestName).replace(/\s+/g, '_')}_${slCode.toUpperCase()}`;
}

// ─── Save feedback (called on every admin selection) ───────────────────────────

export async function saveMatchFeedback(params: {
  manifestName: string;
  slCode: string;
  fullName: string;
  ruta?: string | null;
  consolidationEnabled: boolean;
  source: MatchFeedback['source'];
  confirmedBy?: string;
}): Promise<void> {
  // Prevent saving city/routing-prefixed names into the learned index
  // EXCEPT when an admin explicitly confirms the mapping — if the operator
  // approves a name via the thumbs-up badge or manual pick, that intent must persist.
  const isAdminConfirmed = params.source === 'admin_pick' || params.source === 'admin_manual' || params.source === 'admin_sp2';
  if (hasRoutingPrefix(params.manifestName) && !isAdminConfirmed) {
    console.log(`[MatchLearning] ⚠️ Skipped auto-save for routing-prefixed name: "${params.manifestName}"`);
    return;
  }
  if (hasRoutingPrefix(params.manifestName) && isAdminConfirmed) {
    console.log(`[MatchLearning] ✍️ Admin-confirmed routing-prefixed name — allowing save: "${params.manifestName}"`);
  }

  if (!isValidSlCode(params.slCode)) {
    console.log(`[MatchLearning] ⚠️ Skipped saving feedback due to invalid SL code: "${params.slCode}"`);
    return;
  }
  if (containsCorporateKeywords(params.manifestName) || (params.fullName && containsCorporateKeywords(params.fullName))) {
    console.log(`[MatchLearning] ⚠️ Skipped saving feedback due to corporate keywords in name: "${params.manifestName}" / "${params.fullName}"`);
    return;
  }

  try {
    const sanitizedManifestName = sanitizeName(params.manifestName).toUpperCase().trim();
    const normalizedName = normalizeName(sanitizedManifestName);
    const id = docId(sanitizedManifestName, params.slCode);
    const ref = doc(db, 'match_feedback', id);
    const existing = await getDoc(ref);

    if (existing.exists()) {
      // Increment hit count — this pair has been confirmed before
      await updateDoc(ref, {
        hitCount: increment(1),
        lastHitAt: serverTimestamp(),
        // Update fullName/ruta in case they changed in SP1
        fullName: params.fullName,
        ruta: params.ruta ?? null,
        consolidationEnabled: params.consolidationEnabled,
      });
    } else {
      // New confirmed pair
      await setDoc(ref, {
        id,
        manifestName: sanitizedManifestName,
        normalizedName,
        slCode: params.slCode.toUpperCase().trim(),
        fullName: params.fullName,
        ruta: params.ruta ?? null,
        consolidationEnabled: params.consolidationEnabled,
        source: params.source,
        confirmedAt: serverTimestamp(),
        confirmedBy: params.confirmedBy ?? null,
        hitCount: 1,
        lastHitAt: serverTimestamp(),
      });
    }

    // Sweep and delete any conflicting mappings in both match_feedback and manifest_learning_patterns
    if (params.source === 'admin_pick' || params.source === 'admin_manual' || params.source === 'admin_sp2') {
      try {
        // 1. Delete conflicting match_feedback documents
        const conflictsSnap = await getDocs(query(
          collection(db, 'match_feedback'),
          where('normalizedName', '==', normalizedName),
        ));
        for (const conflictDoc of conflictsSnap.docs) {
          const conflictData = conflictDoc.data() as MatchFeedback;
          if (conflictData.slCode.toUpperCase() !== params.slCode.toUpperCase()) {
            await deleteDoc(conflictDoc.ref);
            console.log(`[MatchLearning] ♻️ Deleted conflicting match_feedback: "${conflictData.manifestName}" → ${conflictData.slCode} (replaced by admin → ${params.slCode})`);
          }
        }

        // 2. Delete conflicting manifest_learning_patterns documents
        const patternsSnap = await getDocs(query(
          collection(db, 'manifest_learning_patterns'),
          where('normalizedName', '==', normalizedName),
        ));
        for (const patDoc of patternsSnap.docs) {
          const patData = patDoc.data() as any;
          if (patData.slCode?.toUpperCase() !== params.slCode.toUpperCase()) {
            await deleteDoc(patDoc.ref);
            console.log(`[MatchLearning] ♻️ Deleted conflicting manifest_learning_patterns: "${patData.pattern || normalizedName}" → ${patData.slCode} (replaced by admin → ${params.slCode})`);
          }
        }
      } catch (err) {
        console.warn('[MatchLearning] Conflict sweeper failed:', err);
      }
    }

    // Invalidate and synchronously reload in-memory cache so current session picks up the new entry immediately
    await reloadLearnedMatches();

    console.log(`[MatchLearning] ✅ Saved: "${params.manifestName}" → ${params.slCode} (${params.source})`);
  } catch (error) {
    // Non-fatal — learning is best-effort
    console.warn('[MatchLearning] Failed to save feedback:', error);
  }
}

/**
 * Force-reloads learned matches from Firestore and updates in-memory indexes.
 */
export async function reloadLearnedMatches(): Promise<LearnedMatch[]> {
  learnedCache = [];
  learnedCacheTs = 0;
  learnedCacheIndex = new Map();
  learnedCollisions = new Set();
  learnedCollisionMap = new Map();
  return loadLearnedMatches();
}

// ─── Load all learned matches (cached) ─────────────────────────────────────────

export async function loadLearnedMatches(): Promise<LearnedMatch[]> {
  const now = Date.now();
  if (learnedCache.length > 0 && now - learnedCacheTs < LEARNED_CACHE_TTL) {
    return learnedCache;
  }

  try {
    // Run both queries in parallel: match_feedback (primary) + manifest_learning_patterns (ThumbsUp approvals)
    const [feedbackResult, patternsResult] = await Promise.allSettled([
      getDocs(query(
        collection(db, 'match_feedback'),
        limit(1000),
      )),
      getDocs(query(
        collection(db, PATTERNS_COL),
        where('type', '==', 'name_association'),
        limit(1000),
      )),
    ]);

    // Primary: match_feedback entries (admin picks + AI auto-saves)
    const feedbackEntries: LearnedMatch[] = feedbackResult.status === 'fulfilled'
      ? feedbackResult.value.docs
          .filter(d => {
            const data = d.data() as MatchFeedback;
            if (data.source === 'ai_superseded') return false; // BUG-ML4: skip invalidated
            if (data.slCode && data.slCode.toUpperCase().includes('SL-NAN')) return false; // Never auto-match temp SL-NAN codes
            return true;
          })
          .map(d => {
            const data = d.data() as MatchFeedback;
            // Hotfix: auto-sanitize existing entries to heal cache
            const sanitizedManifestName = sanitizeName(data.manifestName).toUpperCase().trim();
            const normalizedName = normalizeName(sanitizedManifestName);
            return {
              manifestName: sanitizedManifestName,
              normalizedName: normalizedName,
              slCode: data.slCode,
              fullName: data.fullName,
              ruta: data.ruta,
              consolidationEnabled: data.consolidationEnabled,
              hitCount: data.hitCount ?? 0,
              score: data.source === 'ai_auto' ? 0.92 : 1.0,
              source: data.source,
            };
          })
      : [];

    // Sort by hitCount in memory to prevent Firestore index filtering on undefined fields
    feedbackEntries.sort((a, b) => b.hitCount - a.hitCount);

    // Secondary: manifest_learning_patterns (ThumbsUp approvals from Nova table)
    // Only add entries not already present in match_feedback (feedback takes precedence)
    const seenKeys = new Set(feedbackEntries.map(e => `${e.normalizedName}::${e.slCode.toUpperCase()}`));
    const patternEntries: LearnedMatch[] = patternsResult.status === 'fulfilled'
      ? patternsResult.value.docs
          .map(d => {
            const data = d.data();
            const rawName = (data['rawName'] as string) || '';
            if (!rawName || !data['slCode']) return null;
            const slCode = (data['slCode'] as string).toUpperCase().trim();
            if (slCode.includes('SL-NAN')) return null; // Never match temp SL-NAN codes
            // Hotfix: sanitize old pattern names
            const sanitizedManifestName = sanitizeName(rawName).toUpperCase().trim();
            const normalizedName = normalizeName(sanitizedManifestName);
            const key = `${normalizedName}::${slCode}`;
            if (seenKeys.has(key)) return null; // match_feedback entry takes precedence
            return {
              manifestName: sanitizedManifestName,
              normalizedName,
              slCode,
              fullName: (data['matchedName'] as string) || rawName,
              ruta: undefined,
              consolidationEnabled: false,
              hitCount: (data['approvalCount'] as number) ?? 1,
              score: MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN, // human-approved via ThumbsUp, matches LEARNED_ACCEPT_MIN
              source: 'admin_pick' as const, // ThumbsUp = human confirmation
            } as LearnedMatch;
          })
          .filter((e): e is LearnedMatch => e !== null)
      : [];

    learnedCache = [...feedbackEntries, ...patternEntries];
    learnedCacheTs = now;

    // Build O(1) exact-lookup index.
    // Winner-selection priority (highest → lowest):
    //   1. Source tier: admin_pick/manual/sp2 (tier 3) > ai_auto (tier 1)
    //   2. Within same tier: higher hitCount wins (more confirmations = more trust)
    //   3. Tiebreaker: higher base score (e.g. admin 1.0 > ai_auto 0.92)
    // Also detect collisions (2+ different slCodes for same normalizedName = namesake/family)
    // and build the full collision map for dominant-winner detection.
    learnedCacheIndex = new Map();
    learnedCollisions = new Set();
    learnedCollisionMap = new Map();
    const nameToSlCodes = new Map<string, Set<string>>();
    for (const entry of learnedCache) {
      const existing = learnedCacheIndex.get(entry.normalizedName);
      const entrySourcePri = SOURCE_PRIORITY[entry.source ?? 'ai_auto'] ?? 1;
      const existSourcePri = existing ? (SOURCE_PRIORITY[existing.source ?? 'ai_auto'] ?? 1) : -1;
      const entryWins = !existing
        || entrySourcePri > existSourcePri
        || (entrySourcePri === existSourcePri && entry.hitCount > existing.hitCount)
        || (entrySourcePri === existSourcePri && entry.hitCount === existing.hitCount && entry.score > existing.score);
      if (entryWins) {
        learnedCacheIndex.set(entry.normalizedName, entry);
      }
      // Track distinct slCodes per normalizedName for collision detection
      const codes = nameToSlCodes.get(entry.normalizedName) ?? new Set<string>();
      codes.add(entry.slCode.toUpperCase());
      nameToSlCodes.set(entry.normalizedName, codes);
      // Build full collision map (all entries per name) for dominant-winner check
      const col = learnedCollisionMap.get(entry.normalizedName) ?? [];
      if (!col.some(e => e.slCode.toUpperCase() === entry.slCode.toUpperCase())) {
        col.push(entry);
      } else {
        // Merge: keep highest hitCount for this slCode
        const idx = col.findIndex(e => e.slCode.toUpperCase() === entry.slCode.toUpperCase());
        if (idx >= 0 && entry.hitCount > col[idx].hitCount) col[idx] = entry;
      }
      learnedCollisionMap.set(entry.normalizedName, col);
    }
    for (const [name, codes] of nameToSlCodes) {
      if (codes.size > 1) learnedCollisions.add(name);
    }

    // Sync index with enhanced lookup module
    setLearnedIndex(learnedCacheIndex, learnedCollisions);

    console.log(`[MatchLearning] Loaded: ${feedbackEntries.length} feedback = ${learnedCache.length} total (index: ${learnedCacheIndex.size} keys)`);
    return learnedCache;
  } catch (error) {
    console.warn('[MatchLearning] Failed to load learned matches:', error);
    return learnedCache; // return stale cache on error
  }
}

// ─── Auto-save AI high-confidence matches (non-blocking, best-effort) ────────────

/**
 * Called after AI disambiguation resolves a name with confidence ≥ 88%.
 * Saves to match_feedback with source='ai_auto' so the next manifest uses
 * it as a learned match — no AI call needed.
 *
 * Guards:
 *  - Never overwrites an admin-confirmed entry (admin_pick/manual/sp2)
 *  - Skips if confidence < 88 (threshold passed by caller)
 *  - Skips names that start with a routing/city prefix (unregistered customers)
 *  - Silently non-fatal — learning failures must never affect UI
 */
export async function saveAIAutoMatchFeedback(params: {
  manifestName: string;
  slCode: string;
  fullName: string;
  ruta?: string | null;
  consolidationEnabled: boolean;
  confidence: number;
}): Promise<void> {
  if (params.confidence < 88) return;

  // BUG-ML5: Never auto-save city/routing-prefixed names into the learned index.
  // These names belong to unregistered customers and the AI might have wrongly
  // mapped them to a real customer that shares surname tokens.
  if (hasRoutingPrefix(params.manifestName)) {
    console.log(`[MatchLearning] ⚠️ Skipped ai_auto for routing-prefixed name: "${params.manifestName}"`);
    return;
  }

  if (!isValidSlCode(params.slCode)) {
    return;
  }
  if (containsCorporateKeywords(params.manifestName) || (params.fullName && containsCorporateKeywords(params.fullName))) {
    return;
  }
  try {
    const normalizedName = normalizeName(params.manifestName);
    const id = docId(params.manifestName, params.slCode);
    const ref = doc(db, 'match_feedback', id);
    const existing = await getDoc(ref);

    if (existing.exists()) {
      const data = existing.data() as MatchFeedback;
      // Admin-confirmed entries are authoritative — only bump hitCount
      await updateDoc(ref, {
        hitCount: increment(1),
        lastHitAt: serverTimestamp(),
        // Promote confidence if AI becomes more certain
        ...(data.source === 'ai_auto' && params.confidence > (data.aiConfidence ?? 0)
          ? { aiConfidence: params.confidence }
          : {}),
      });
    } else {
      await setDoc(ref, {
        id,
        manifestName: params.manifestName.toUpperCase().trim(),
        normalizedName,
        slCode: params.slCode.toUpperCase().trim(),
        fullName: params.fullName,
        ruta: params.ruta ?? null,
        consolidationEnabled: params.consolidationEnabled,
        source: 'ai_auto' as const,
        aiConfidence: params.confidence,
        confirmedAt: serverTimestamp(),
        confirmedBy: null,
        hitCount: 1,
        lastHitAt: serverTimestamp(),
      });
    }

    // Invalidate cache so next manifest picks up the new entry
    learnedCacheTs = 0;
    console.log(`[MatchLearning] 🤖 AI-auto learned: "${params.manifestName}" → ${params.slCode} (${params.confidence}%)`);
  } catch {
    // Non-fatal
  }
}

/**
 * Pre-warms the in-memory learned match cache at app startup.
 * Call once on mount so the first manifest has zero cold-start delay.
 */
export async function warmLearnedCache(): Promise<void> {
  if (learnedCache.length > 0) return; // already warm
  await loadLearnedMatches();
}

/**
 * Expose the normalized-name index for O(1) slCode lookups by other modules.
 */
export function getLearnedIndex(): Map<string, LearnedMatch> {
  return learnedCacheIndex;
}

/**
 * Returns true when 2+ different slCodes have been confirmed for the same normalizedName.
 * Used by batchFindCustomerMatchesWithAI to surface requiresUserChoice for namesakes.
 */
export function hasLearnedCollision(normalizedName: string): boolean {
  return learnedCollisions.has(normalizedName);
}

/**
 * Returns a learned match for the given manifest name, or null.
 *
 * DELEGATED to enhanced lookup module which adds:
 *   - Bidirectional nickname resolution (PEPE↔JOSE)
 *   - Double Metaphone phonetic matching
 *   - Hit count tiebreaking for ambiguous matches
 */
export function lookupLearned(
  manifestName: string,
  learned: LearnedMatch[]
): LearnedMatch | null {
  return lookupLearnedEnhanced(manifestName, learned);
}

// ─── Unmatched Route Learning ─────────────────────────────────────────────────
//
// For manifest rows that have NO customer account (slCode = ''), stores
// name → route mappings so future manifests can pre-assign routes automatically.
//
// Collection: unmatched_route_learning
// {
//   id:             normalizedName (doc ID)
//   manifestName:   string  — raw UPPERCASE name from manifest
//   normalizedName: string
//   ruta:           string  — assigned route (e.g. "Encomiendas", "BB")
//   source:         'admin_assign'
//   confirmedAt:    Timestamp
//   hitCount:       number
//   lastHitAt:      Timestamp
// }

const UNMATCHED_ROUTE_COL = 'unmatched_route_learning';

let unmatchedRouteCache: Map<string, string> = new Map(); // normalizedName → ruta
let unmatchedRouteCacheTs = 0;
const ROUTE_CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Persist a name → route assignment for a customer without a slCode.
 * Called after the operator assigns a route on an unmatched row and ingests.
 */
export async function saveUnmatchedRouteLearning(
  manifestName: string,
  ruta: string,
): Promise<void> {
  try {
    const normalized = normalizeName(manifestName);
    if (!normalized || !ruta) return;

    // ── Save full name → ruta ──────────────────────────────────────────────────
    const ref = doc(db, UNMATCHED_ROUTE_COL, normalized);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, { ruta, hitCount: increment(1), lastHitAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        manifestName: manifestName.toUpperCase().trim(),
        normalizedName: normalized,
        ruta,
        source: 'admin_assign',
        confirmedAt: serverTimestamp(),
        hitCount: 1,
        lastHitAt: serverTimestamp(),
      });
    }
    unmatchedRouteCache.set(normalized, ruta);

    // ── Also save first-word prefix (e.g. "BB", "SJ") if it looks like a route key ──
    // GUARD: prefix must equal the normalized route name (prevents "BB LAURA GOMEZ" → "Alajuela"
    // from poisoning the "BB" prefix entry with the wrong route).
    const firstWord = normalized.split(' ')[0];
    const normalizedRuta = normalizeName(ruta);
    if (
      firstWord &&
      firstWord.length >= 2 &&
      firstWord.length <= 6 &&
      /^[A-Z]+$/.test(firstWord) &&
      normalized.includes(' ') && // must be a composite name, not just the prefix itself
      firstWord === normalizedRuta // prefix must BE the route abbreviation
    ) {
      const prefixRef = doc(db, UNMATCHED_ROUTE_COL, firstWord);
      const prefixExisting = await getDoc(prefixRef);
      if (prefixExisting.exists()) {
        await updateDoc(prefixRef, { ruta, hitCount: increment(1), lastHitAt: serverTimestamp() });
      } else {
        await setDoc(prefixRef, {
          manifestName: firstWord,
          normalizedName: firstWord,
          ruta,
          source: 'prefix_learn',
          confirmedAt: serverTimestamp(),
          hitCount: 1,
          lastHitAt: serverTimestamp(),
        });
      }
      unmatchedRouteCache.set(firstWord, ruta);
      console.log(`[MatchLearning] 📍 Prefix learned: "${firstWord}" → ${ruta}`);
    }

    unmatchedRouteCacheTs = Date.now();
    console.log(`[MatchLearning] 📍 Route learned: "${manifestName}" → ${ruta}`);
  } catch {
    // Non-fatal
  }
}

/**
 * Load (with TTL cache) all learned name → route mappings.
 * Returns a Map<normalizedName, ruta>.
 */
export async function loadUnmatchedRouteCache(): Promise<Map<string, string>> {
  const now = Date.now();
  if (unmatchedRouteCache.size > 0 && now - unmatchedRouteCacheTs < ROUTE_CACHE_TTL) {
    return unmatchedRouteCache;
  }
  try {
    const snap = await getDocs(collection(db, UNMATCHED_ROUTE_COL));
    const map = new Map<string, string>();
    snap.forEach(d => {
      const data = d.data();
      if (data['normalizedName'] && data['ruta']) {
        map.set(data['normalizedName'] as string, data['ruta'] as string);
      }
    });
    unmatchedRouteCache = map;
    unmatchedRouteCacheTs = now;
    console.log(`[MatchLearning] 📍 Unmatched routes loaded: ${map.size} entries`);
    return map;
  } catch {
    return unmatchedRouteCache;
  }
}

/**
 * O(1) lookup: returns the learned route for a manifest name, or null.
 * Relies on the in-memory cache populated by loadUnmatchedRouteCache().
 */
export function lookupLearnedRoute(manifestName: string): string | null {
  // Disabled by Product Owner / Admin requirement on 10-08-2026:
  // Unmatched rows (without slCode or customer match) must never automatically get a learned route fallback;
  // they must remain empty ("sin ruta") for manual operator routing.
  return null;
}

/**
 * Returns a compact list of learned pairs for the AI disambiguation prompt.
 *
 * DELEGATED to enhanced module which adds:
 *   - Nickname-aware token matching for broader recall
 *   - Double Metaphone phonetic matching
 *   - Better relevance ranking
 */
export function getLearnedCandidatesForAI(
  manifestName: string,
  learned: LearnedMatch[],
  topN = 5
): Array<{ manifestName: string; slCode: string; fullName: string; confirmedTimes: number }> {
  return getLearnedCandidatesForAIEnhanced(manifestName, learned, topN);
}

// ─── Bulk Save match feedback ──────────────────────────────────────────────────
export async function saveMatchFeedbackBulk(
  items: Array<{
    manifestName: string;
    slCode: string;
    fullName: string;
    ruta?: string | null;
    consolidationEnabled: boolean;
    source: MatchFeedback['source'];
    confirmedBy?: string;
  }>
): Promise<void> {
  if (!items || items.length === 0) return;

  // Filter valid items first
  const validItems = items.filter(item => {
    const isAdminConfirmed = item.source === 'admin_pick' || item.source === 'admin_manual' || item.source === 'admin_sp2';
    if (hasRoutingPrefix(item.manifestName) && !isAdminConfirmed) {
      return false;
    }
    if (!isValidSlCode(item.slCode)) {
      return false;
    }
    if (containsCorporateKeywords(item.manifestName) || (item.fullName && containsCorporateKeywords(item.fullName))) {
      return false;
    }
    return true;
  });

  if (validItems.length === 0) return;

  // Deduplicate and aggregate the items by id
  interface BulkItem {
    id: string;
    manifestName: string;
    normalizedName: string;
    slCode: string;
    fullName: string;
    ruta?: string | null;
    consolidationEnabled: boolean;
    source: MatchFeedback['source'];
    confirmedBy?: string;
    hitCountIncrement: number;
  }

  const aggregatedMap = new Map<string, BulkItem>();
  for (const item of validItems) {
    const sanitizedManifestName = sanitizeName(item.manifestName).toUpperCase().trim();
    const normalizedName = normalizeName(sanitizedManifestName);
    const id = docId(sanitizedManifestName, item.slCode);

    const existingAgg = aggregatedMap.get(id);
    if (existingAgg) {
      existingAgg.hitCountIncrement += 1;
      if (SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[existingAgg.source]) {
        existingAgg.source = item.source;
      }
      existingAgg.fullName = item.fullName;
      existingAgg.ruta = item.ruta ?? null;
      existingAgg.consolidationEnabled = item.consolidationEnabled;
      if (item.confirmedBy) {
        existingAgg.confirmedBy = item.confirmedBy;
      }
    } else {
      aggregatedMap.set(id, {
        id,
        manifestName: sanitizedManifestName,
        normalizedName,
        slCode: item.slCode.toUpperCase().trim(),
        fullName: item.fullName,
        ruta: item.ruta ?? null,
        consolidationEnabled: item.consolidationEnabled,
        source: item.source,
        confirmedBy: item.confirmedBy,
        hitCountIncrement: 1
      });
    }
  }

  const uniqueItems = Array.from(aggregatedMap.values());
  const uniqueIds = uniqueItems.map(item => item.id);

  // Query existing docs in chunks of 30 to see which ones we should update vs set
  const existingIds = new Set<string>();
  const ID_CHUNK_SIZE = 30;
  for (let i = 0; i < uniqueIds.length; i += ID_CHUNK_SIZE) {
    const chunkIds = uniqueIds.slice(i, i + ID_CHUNK_SIZE);
    try {
      const snap = await getDocs(query(
        collection(db, 'match_feedback'),
        where(documentId(), 'in', chunkIds)
      ));
      snap.forEach(d => {
        existingIds.add(d.id);
      });
    } catch (err) {
      console.warn('[MatchLearning] Failed to query existing ids chunk:', err);
    }
  }

  // Write in batches of 500
  const writeChunks: Array<BulkItem[]> = [];
  for (let i = 0; i < uniqueItems.length; i += 500) {
    writeChunks.push(uniqueItems.slice(i, i + 500));
  }

  for (const chunk of writeChunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, 'match_feedback', item.id);
      if (existingIds.has(item.id)) {
        batch.update(ref, {
          hitCount: increment(item.hitCountIncrement),
          lastHitAt: serverTimestamp(),
          fullName: item.fullName,
          ruta: item.ruta ?? null,
          consolidationEnabled: item.consolidationEnabled,
        });
      } else {
        batch.set(ref, {
          id: item.id,
          manifestName: item.manifestName,
          normalizedName: item.normalizedName,
          slCode: item.slCode,
          fullName: item.fullName,
          ruta: item.ruta ?? null,
          consolidationEnabled: item.consolidationEnabled,
          source: item.source,
          confirmedAt: serverTimestamp(),
          confirmedBy: item.confirmedBy ?? null,
          hitCount: item.hitCountIncrement,
          lastHitAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }

  // Handle conflict sweep in bulk for admin mappings
  const adminNormalizedNames = uniqueItems
    .filter(item => item.source === 'admin_pick' || item.source === 'admin_manual' || item.source === 'admin_sp2')
    .map(item => item.normalizedName);

  if (adminNormalizedNames.length > 0) {
    for (let i = 0; i < adminNormalizedNames.length; i += 30) {
      const chunkNames = adminNormalizedNames.slice(i, i + 30);
      try {
        const conflictBatch = writeBatch(db);
        let conflictCount = 0;

        // 1. Sweep match_feedback
        const conflictsSnap = await getDocs(query(
          collection(db, 'match_feedback'),
          where('normalizedName', 'in', chunkNames)
        ));
        conflictsSnap.forEach(d => {
          const data = d.data() as MatchFeedback;
          const savedItem = uniqueItems.find(item => item.normalizedName === data.normalizedName);
          if (savedItem && data.slCode.toUpperCase() !== savedItem.slCode.toUpperCase()) {
            conflictBatch.delete(d.ref);
            conflictCount++;
          }
        });

        // 2. Sweep manifest_learning_patterns
        const patternsSnap = await getDocs(query(
          collection(db, 'manifest_learning_patterns'),
          where('normalizedName', 'in', chunkNames)
        ));
        patternsSnap.forEach(d => {
          const data = d.data() as any;
          const savedItem = uniqueItems.find(item => item.normalizedName === data.normalizedName);
          if (savedItem && data.slCode?.toUpperCase() !== savedItem.slCode.toUpperCase()) {
            conflictBatch.delete(d.ref);
            conflictCount++;
          }
        });

        if (conflictCount > 0) {
          await conflictBatch.commit();
          console.log(`[MatchLearning] ♻️ Bulk swept/deleted ${conflictCount} conflicting entries in learning collections.`);
        }
      } catch (err) {
        console.warn('[MatchLearning] Failed to process bulk conflicts:', err);
      }
    }
  }

  // Invalidate and synchronously reload in-memory cache
  await reloadLearnedMatches();
  console.log(`[MatchLearning] Bulk saved ${uniqueItems.length} unique learned matches.`);
}

// ─── Cleanup: remove routing-prefix-poisoned learned entries ─────────────────

/**
 * One-time (and safe to re-run) cleanup that soft-deletes any `match_feedback`
 * entries whose `manifestName` starts with a known routing/city prefix.
 *
 * These entries are poisonous: the AI previously matched an unregistered
 * customer (e.g. "ALAJUELA FRANCISCO MEJIA") to a real slCode that doesn't
 * belong to them.  Marking them as `ai_superseded` excludes them from the
 * learned cache without destroying audit history.
 *
 * Returns a count of how many entries were cleaned.
 */
export async function cleanRoutingPrefixLearning(): Promise<number> {
  let cleaned = 0;
  try {
    const snap = await getDocs(collection(db, 'match_feedback'));
    const batch: Array<ReturnType<typeof doc>> = [];
    for (const d of snap.docs) {
      const data = d.data() as MatchFeedback;
      if (data.source === 'ai_superseded') continue; // already soft-deleted
      const firstToken = normalizeName(data.manifestName).split(' ')[0];
      if (ROUTING_PREFIXES.has(firstToken)) {
        batch.push(d.ref);
      }
    }
    for (const ref of batch) {
      await updateDoc(ref, { source: 'ai_superseded' as MatchFeedback['source'] });
      cleaned++;
    }
    if (cleaned > 0) {
      learnedCacheTs = 0; // invalidate cache
      console.log(`[MatchLearning] 🧹 Cleaned ${cleaned} routing-prefix-poisoned entries from match_feedback`);
    } else {
      console.log('[MatchLearning] 🧹 No routing-prefix-poisoned entries found — cache is clean');
    }
  } catch (error) {
    console.warn('[MatchLearning] cleanRoutingPrefixLearning failed:', error);
  }
  return cleaned;
}

/**
 * Deletes/purges any Nova learning records (`match_feedback` and `unmatched_route_learning`)
 * associated with a temporary SL code (e.g. SL-NAN-*) or a reassigned manifest name.
 *
 * Call this whenever a temp customer is reassigned or deleted by an admin so that
 * Nova learning never keeps stale associations for SL-NAN-* codes.
 */
export async function deleteLearnedFeedbackForSlCode(slCode: string, manifestName?: string): Promise<number> {
  if (!slCode) return 0;
  const upperSl = slCode.toUpperCase().trim();
  let deletedCount = 0;

  try {
    const refsToDelete: Array<ReturnType<typeof doc>> = [];

    // 1. Find match_feedback docs by slCode
    const qSl = query(collection(db, 'match_feedback'), where('slCode', '==', upperSl));
    const snapSl = await getDocs(qSl);
    snapSl.forEach(d => {
      refsToDelete.push(d.ref);
    });

    // 2. Find manifest_learning_patterns docs by slCode
    const qPatSl = query(collection(db, 'manifest_learning_patterns'), where('slCode', '==', upperSl));
    const snapPatSl = await getDocs(qPatSl);
    snapPatSl.forEach(d => {
      if (!refsToDelete.some(r => r.id === d.ref.id)) {
        refsToDelete.push(d.ref);
      }
    });

    // 3. Also check by manifestName if provided
    if (manifestName) {
      const normName = normalizeName(manifestName);
      if (normName) {
        // Query match_feedback by normalizedName
        const qName = query(collection(db, 'match_feedback'), where('normalizedName', '==', normName));
        const snapName = await getDocs(qName);
        snapName.forEach(d => {
          const data = d.data() as MatchFeedback;
          if (data.slCode?.toUpperCase().includes('SL-NAN') || data.slCode?.toUpperCase() === upperSl) {
            if (!refsToDelete.some(r => r.id === d.ref.id)) {
              refsToDelete.push(d.ref);
            }
          }
        });

        // Query manifest_learning_patterns by normalizedName and rawName (for legacy ones)
        const sanitizedName = sanitizeName(manifestName).toUpperCase().trim();
        const qPatName1 = query(collection(db, 'manifest_learning_patterns'), where('normalizedName', '==', normName));
        const qPatName2 = query(collection(db, 'manifest_learning_patterns'), where('rawName', '==', manifestName));
        const qPatName3 = query(collection(db, 'manifest_learning_patterns'), where('rawName', '==', sanitizedName));

        const [snapPatName1, snapPatName2, snapPatName3] = await Promise.all([
          getDocs(qPatName1),
          getDocs(qPatName2),
          getDocs(qPatName3)
        ]);

        const mergedPatDocs = [...snapPatName1.docs, ...snapPatName2.docs, ...snapPatName3.docs];
        mergedPatDocs.forEach(d => {
          const data = d.data();
          const code = ((data['slCode'] as string) || '').toUpperCase();
          if (code.includes('SL-NAN') || code === upperSl) {
            if (!refsToDelete.some(r => r.id === d.ref.id)) {
              refsToDelete.push(d.ref);
            }
          }
        });

        // Check unmatched_route_learning under both prefix-free and prefixed IDs
        const uDocId1 = normName;
        const uDocId2 = `unmatched_route_${normName}`;
        const [uSnap1, uSnap2] = await Promise.all([
          getDoc(doc(db, 'unmatched_route_learning', uDocId1)),
          getDoc(doc(db, 'unmatched_route_learning', uDocId2))
        ]);

        if (uSnap1.exists()) {
          const ref1 = uSnap1.ref;
          if (!refsToDelete.some(r => r.id === ref1.id)) {
            refsToDelete.push(ref1);
          }
        }
        if (uSnap2.exists()) {
          const ref2 = uSnap2.ref;
          if (!refsToDelete.some(r => r.id === ref2.id)) {
            refsToDelete.push(ref2);
          }
        }
      }
    }

    if (refsToDelete.length > 0) {
      const batch = writeBatch(db);
      refsToDelete.forEach(r => batch.delete(r));
      await batch.commit();
      deletedCount = refsToDelete.length;
      console.log(`[MatchLearning] 🗑️ Deleted ${deletedCount} learning/pattern docs for ${upperSl} / "${manifestName ?? ''}"`);

      // Invalidate and reload caches synchronously
      await Promise.all([
        reloadLearnedMatches(),
        loadUnmatchedRouteCache(),
      ]);
    }
  } catch (err) {
    console.warn(`[MatchLearning] Failed to delete learned feedback for ${upperSl}:`, err);
  }

  return deletedCount;
}

/**
 * Deletes all match feedback and learned routes for a specific manifest name.
 * Called when an admin explicitly unlinks a row or unlinks route assignment.
 */
export async function forgetMatchFeedback(manifestName: string): Promise<void> {
  try {
    const sanitizedManifestName = sanitizeName(manifestName).toUpperCase().trim();
    const normalizedName = normalizeName(sanitizedManifestName);
    if (!normalizedName) return;

    // 1. Delete all match_feedback documents for this name
    const feedbackSnap = await getDocs(query(
      collection(db, 'match_feedback'),
      where('normalizedName', '==', normalizedName)
    ));
    for (const d of feedbackSnap.docs) {
      await deleteDoc(d.ref);
    }

    // 2. Delete all manifest_learning_patterns documents for this name (including legacy rawName ones)
    const patternQueries = [
      query(collection(db, 'manifest_learning_patterns'), where('normalizedName', '==', normalizedName)),
      query(collection(db, 'manifest_learning_patterns'), where('rawName', '==', manifestName)),
      query(collection(db, 'manifest_learning_patterns'), where('rawName', '==', sanitizedManifestName))
    ];
    for (const q of patternQueries) {
      const patternsSnap = await getDocs(q);
      for (const d of patternsSnap.docs) {
        await deleteDoc(d.ref);
      }
    }

    // 3. Delete unmatched_route_learning document if exists under both prefix-free and prefixed IDs
    const routeRef1 = doc(db, 'unmatched_route_learning', normalizedName);
    const routeRef2 = doc(db, 'unmatched_route_learning', `unmatched_route_${normalizedName}`);
    await Promise.all([
      deleteDoc(routeRef1),
      deleteDoc(routeRef2)
    ]);

    // 4. Invalidate and reload caches
    unmatchedRouteCache.delete(normalizedName);
    await Promise.all([
      reloadLearnedMatches(),
      loadUnmatchedRouteCache(),
    ]);

    console.log(`[MatchLearning] 🧹 Forgotten all mappings and patterns for: "${manifestName}"`);
  } catch (error) {
    console.warn('[MatchLearning] Failed to forget match feedback:', error);
  }
}
