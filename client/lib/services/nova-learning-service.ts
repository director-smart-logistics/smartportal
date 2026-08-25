/**
 * Nova Learning Service
 *
 * CRUD operations for the two Firestore collections that drive Nova's
 * automatic customer-matching learning engine:
 *
 *  • `match_feedback`           — Admin/AI confirmed name→slCode pairs
 *  • `manifest_learning_patterns` — ThumbsUp pattern approvals from Nova table
 *
 * These collections are the primary sources Nova consults before running
 * algorithmic or AI matching, so cleaning up bad entries here directly
 * improves match quality on the next manifest run.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
  getCountFromServer,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { reloadLearnedMatches } from './match-learning';

// ── Collection names ──────────────────────────────────────────────────────────

export const MATCH_FEEDBACK_COL    = 'match_feedback';
export const LEARNING_PATTERNS_COL = 'manifest_learning_patterns';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MatchFeedbackSource =
  | 'admin_pick'
  | 'admin_manual'
  | 'admin_sp2'
  | 'ai_auto'
  | 'ai_superseded';

export interface MatchFeedbackRecord {
  id: string;
  manifestName: string;
  normalizedName: string;
  slCode: string;
  fullName: string;
  ruta?: string | null;
  consolidationEnabled: boolean;
  source: MatchFeedbackSource;
  aiConfidence?: number;
  confirmedAt: Timestamp | null;
  confirmedBy?: string | null;
  hitCount: number;
  lastHitAt: Timestamp | null;
}

export interface LearningPatternRecord {
  id: string;
  type: string;
  rawName: string;
  matchedName: string;
  slCode: string;
  matchScore: number;
  approvalCount: number;
  approvedAt: Timestamp | null;
  approvedBy: string;
}

export interface MatchFeedbackPatch {
  manifestName?: string;
  normalizedName?: string;
  slCode?: string;
  fullName?: string;
  ruta?: string | null;
  consolidationEnabled?: boolean;
  source?: MatchFeedbackSource;
  hitCount?: number;
}

// ── Aggregation & On-Demand Search ───────────────────────────────────────────

/**
 * Retrieves aggregate counts for NovaLearning header cards using getCountFromServer.
 * Generates 0 document body downloads, only lightweight metadata aggregation.
 */
export async function getNovaLearningStats(): Promise<{
  feedbackTotal: number;
  aiAuto: number;
  admin: number;
  superseded: number;
  patternsTotal: number;
  strongPatterns: number;
}> {
  try {
    const feedbackCol = collection(db, MATCH_FEEDBACK_COL);
    const patternsCol = collection(db, LEARNING_PATTERNS_COL);

    const [
      totalSnap,
      aiAutoSnap,
      adminSnap,
      supersededSnap,
      patternsTotalSnap,
    ] = await Promise.all([
      getCountFromServer(feedbackCol).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(query(feedbackCol, where('source', '==', 'ai_auto'))).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(query(feedbackCol, where('source', 'in', ['admin_pick', 'admin_manual', 'admin_sp2']))).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(query(feedbackCol, where('source', '==', 'ai_superseded'))).catch(() => ({ data: () => ({ count: 0 }) })),
      getCountFromServer(patternsCol).catch(() => ({ data: () => ({ count: 0 }) })),
    ]);

    return {
      feedbackTotal: totalSnap.data().count,
      aiAuto: aiAutoSnap.data().count,
      admin: adminSnap.data().count,
      superseded: supersededSnap.data().count,
      patternsTotal: patternsTotalSnap.data().count,
      strongPatterns: 0,
    };
  } catch (err) {
    console.error('[NovaLearning] Failed to fetch learning stats:', err);
    return {
      feedbackTotal: 0,
      aiAuto: 0,
      admin: 0,
      superseded: 0,
      patternsTotal: 0,
      strongPatterns: 0,
    };
  }
}

export interface SearchFeedbackParams {
  query?: string;
  source?: string;
  ruta?: string;
  consolidation?: string;
  limitN?: number;
}

/**
 * Pure On-Demand Search on match_feedback.
 * Returns [] with 0 Firestore reads if query is empty.
 * Optimizes for single-document / exact targeted reads.
 */
export async function searchMatchFeedbackRecords(
  params: SearchFeedbackParams = {}
): Promise<MatchFeedbackRecord[]> {
  const { query: rawQuery = '', source = 'all', ruta = 'all', consolidation = 'all', limitN = 25 } = params;
  const cleanQ = rawQuery.trim();

  // 🚨 CRITICAL RULE: If no search query is typed, DO NOT query Firestore (0 reads on page mount)
  if (!cleanQ && source === 'all' && ruta === 'all' && consolidation === 'all') {
    return [];
  }

  const feedbackCol = collection(db, MATCH_FEEDBACK_COL);

  // 1. Direct Document ID lookup (1 read)
  if (/^[a-zA-Z0-9_-]{15,35}$/.test(cleanQ) && !cleanQ.toUpperCase().startsWith('SL')) {
    try {
      const directSnap = await getDoc(doc(db, MATCH_FEEDBACK_COL, cleanQ));
      if (directSnap.exists()) {
        return [{ ...(directSnap.data() as Omit<MatchFeedbackRecord, 'id'>), id: directSnap.id }];
      }
    } catch {
      // Continue to field query
    }
  }

  // 2. Exact SL Code lookup (1 read per matching customer)
  const isSlCodeQuery = /^(SL[-_ ]?)?\d+$/i.test(cleanQ);
  if (isSlCodeQuery) {
    const numericPart = cleanQ.replace(/\D/g, '');
    const slCodesToTry = [cleanQ.toUpperCase(), `SL${numericPart}`, `SL-${numericPart}`];
    const snap = await getDocs(
      query(feedbackCol, where('slCode', 'in', slCodesToTry), limit(limitN))
    );
    let results = snap.docs.map(d => ({ ...(d.data() as Omit<MatchFeedbackRecord, 'id'>), id: d.id }));
    if (source !== 'all') results = results.filter(r => r.source === source);
    if (ruta !== 'all') results = results.filter(r => (ruta === 'none' ? !r.ruta : r.ruta === ruta));
    return results;
  }

  // 3. Exact & Prefix Name search
  if (cleanQ.length >= 2) {
    const norm = cleanQ
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      // Try exact normalizedName first
      const exactSnap = await getDocs(
        query(feedbackCol, where('normalizedName', '==', norm), limit(limitN))
      );
      if (!exactSnap.empty) {
        let results = exactSnap.docs.map(d => ({ ...(d.data() as Omit<MatchFeedbackRecord, 'id'>), id: d.id }));
        if (source !== 'all') results = results.filter(r => r.source === source);
        if (ruta !== 'all') results = results.filter(r => (ruta === 'none' ? !r.ruta : r.ruta === ruta));
        return results;
      }

      // Try prefix range
      const snap = await getDocs(
        query(
          feedbackCol,
          where('normalizedName', '>=', norm),
          where('normalizedName', '<=', norm + '\uf8ff'),
          limit(limitN)
        )
      );
      if (!snap.empty) {
        let results = snap.docs.map(d => ({ ...(d.data() as Omit<MatchFeedbackRecord, 'id'>), id: d.id }));
        if (source !== 'all') results = results.filter(r => r.source === source);
        if (ruta !== 'all') results = results.filter(r => (ruta === 'none' ? !r.ruta : r.ruta === ruta));
        return results;
      }
    } catch {
      // Fall through
    }
  }

  // 4. Fallback filter-only query if filters are active
  const constraints: any[] = [];
  if (source !== 'all') constraints.push(where('source', '==', source));
  if (ruta !== 'all' && ruta !== 'none') constraints.push(where('ruta', '==', ruta));
  if (consolidation !== 'all') constraints.push(where('consolidationEnabled', '==', consolidation === 'yes'));

  if (constraints.length === 0) return [];

  constraints.push(orderBy('hitCount', 'desc'));
  constraints.push(limit(limitN));

  const snap = await getDocs(query(feedbackCol, ...constraints));
  return snap.docs.map(d => ({ ...(d.data() as Omit<MatchFeedbackRecord, 'id'>), id: d.id }));
}

/**
 * Pure On-Demand Search on manifest_learning_patterns.
 * Returns [] with 0 Firestore reads if query is empty.
 */
export async function searchLearningPatternRecords(
  params: { query?: string; limitN?: number } = {}
): Promise<LearningPatternRecord[]> {
  const { query: rawQuery = '', limitN = 25 } = params;
  const cleanQ = rawQuery.trim().toLowerCase();

  // 🚨 CRITICAL RULE: If no search query is typed, DO NOT query Firestore (0 reads on page mount)
  if (!cleanQ) {
    return [];
  }

  const patternsCol = collection(db, LEARNING_PATTERNS_COL);

  // Exact SL Code query
  if (/^(SL[-_ ]?)?\d+$/i.test(cleanQ)) {
    const snap = await getDocs(
      query(patternsCol, where('slCode', '==', cleanQ.toUpperCase()), limit(limitN))
    );
    if (!snap.empty) {
      return snap.docs.map(d => ({ ...(d.data() as Omit<LearningPatternRecord, 'id'>), id: d.id }));
    }
  }

  // Exact rawName query
  const snap = await getDocs(
    query(patternsCol, where('rawName', '==', rawQuery.trim().toUpperCase()), limit(limitN))
  );
  if (!snap.empty) {
    return snap.docs.map(d => ({ ...(d.data() as Omit<LearningPatternRecord, 'id'>), id: d.id }));
  }

  return [];
}

// ── match_feedback ─────────────────────────────────────────────────────────────

/**
 * Bounded subscription or one-shot load for match_feedback.
 */
export function subscribeMatchFeedback(
  callback: (items: MatchFeedbackRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, MATCH_FEEDBACK_COL),
    orderBy('hitCount', 'desc'),
  );
  return onSnapshot(
    q,
    snap => {
      const items: MatchFeedbackRecord[] = snap.docs.map(d => ({
        ...(d.data() as Omit<MatchFeedbackRecord, 'id'>),
        id: d.id,
      }));
      callback(items);
    },
    err => {
      console.warn('[NovaLearning] match_feedback subscription error:', err);
      onError?.(err as Error);
    },
  );
}

/** One-shot load (bypasses cache). */
export async function listMatchFeedback(): Promise<MatchFeedbackRecord[]> {
  const snap = await getDocs(
    query(collection(db, MATCH_FEEDBACK_COL), orderBy('hitCount', 'desc')),
  );
  return snap.docs.map(d => ({
    ...(d.data() as Omit<MatchFeedbackRecord, 'id'>),
    id: d.id,
  }));
}

/** Partial update on a match_feedback doc. */
export async function updateMatchFeedback(
  id: string,
  patch: MatchFeedbackPatch,
): Promise<void> {
  const ref = doc(db, MATCH_FEEDBACK_COL, id);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  await reloadLearnedMatches().catch(err => console.warn('[NovaLearning] Failed to reload matches after update:', err));
}

/** Soft-delete: marks source as ai_superseded so it's excluded from the learned cache. */
export async function supersedeFeedback(id: string): Promise<void> {
  await updateMatchFeedback(id, { source: 'ai_superseded' });
}

/** Promote an ai_auto entry to admin_pick (human confirms it's correct). */
export async function promoteFeedbackToAdmin(id: string): Promise<void> {
  await updateMatchFeedback(id, { source: 'admin_pick' });
}

/** Hard delete — permanently removes from learning. */
export async function deleteMatchFeedback(id: string): Promise<void> {
  await deleteDoc(doc(db, MATCH_FEEDBACK_COL, id));
  await reloadLearnedMatches().catch(err => console.warn('[NovaLearning] Failed to reload matches after delete:', err));
}

// ── manifest_learning_patterns ─────────────────────────────────────────────────

/**
 * Real-time subscription to all manifest_learning_patterns entries,
 * ordered by approvalCount desc.
 */
export function subscribeLearningPatterns(
  callback: (items: LearningPatternRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, LEARNING_PATTERNS_COL),
    orderBy('approvalCount', 'desc'),
  );
  return onSnapshot(
    q,
    snap => {
      const items: LearningPatternRecord[] = snap.docs.map(d => ({
        ...(d.data() as Omit<LearningPatternRecord, 'id'>),
        id: d.id,
      }));
      callback(items);
    },
    err => {
      console.warn('[NovaLearning] learning_patterns subscription error:', err);
      onError?.(err as Error);
    },
  );
}

/** Hard delete a learning pattern. */
export async function deleteLearningPattern(id: string): Promise<void> {
  await deleteDoc(doc(db, LEARNING_PATTERNS_COL, id));
}

export async function deleteMatchFeedbackBulk(ids: string[]): Promise<void> {
  const { writeBatch } = await import('firebase/firestore');
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach(id => {
      batch.delete(doc(db, MATCH_FEEDBACK_COL, id));
    });
    await batch.commit();
  }
  await reloadLearnedMatches().catch(err => console.warn('[NovaLearning] Failed to reload matches after bulk delete:', err));
}

export async function deleteLearningPatternBulk(ids: string[]): Promise<void> {
  const { writeBatch } = await import('firebase/firestore');
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const batch = writeBatch(db);
    chunk.forEach(id => {
      batch.delete(doc(db, LEARNING_PATTERNS_COL, id));
    });
    await batch.commit();
  }
}

export async function checkOrphanLearningRecords(slCodes: string[]): Promise<Record<string, boolean>> {
  const { getDocs, query, collection, where } = await import('firebase/firestore');
  const result: Record<string, boolean> = {};
  for (const code of slCodes) {
    result[code] = true; // Assume orphan by default
  }
  if (slCodes.length === 0) return result;

  const uniqueCodes = [...new Set(slCodes)];
  
  for (let i = 0; i < uniqueCodes.length; i += 30) {
    const chunk = uniqueCodes.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, 'customers'), where('slCode', 'in', chunk)));
    snap.forEach(d => {
      const data = d.data();
      if (data.slCode) {
        result[data.slCode] = false; // Not an orphan
      }
    });
  }
  return result;
}

// ─── Routing / city prefix set ─────────────────────────────────────────────────
export const ROUTING_PREFIXES = new Set([
  'ALAJUELA', 'HEREDIA', 'CARTAGO', 'LIMON', 'PUNTARENAS',
  'GUANACASTE', 'LIBERIA', 'NICOYA', 'GRECIA', 'ATENAS',
  'DESAMPARADOS', 'BB', 'SAN JOSE', 'SANJOSE',
]);

/** Returns true when the manifest name starts with a known routing/city prefix. */
export function hasRoutingPrefix(manifestName: string): boolean {
  if (!manifestName) return false;
  const normalized = manifestName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstToken = normalized.split(' ')[0];
  return ROUTING_PREFIXES.has(firstToken);
}

/** Soft-deletes any match_feedback entries with routing prefixes. */
export async function cleanRoutingPrefixLearning(): Promise<number> {
  let cleaned = 0;
  try {
    const snap = await getDocs(collection(db, MATCH_FEEDBACK_COL));
    const batchList: Array<any> = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.source === 'ai_superseded') continue;
      if (hasRoutingPrefix(data.manifestName || '')) {
        batchList.push(d.ref);
      }
    }
    const { writeBatch } = await import('firebase/firestore');
    for (let i = 0; i < batchList.length; i += 500) {
      const chunk = batchList.slice(i, i + 500);
      const b = writeBatch(db);
      chunk.forEach(ref => {
        b.update(ref, { source: 'ai_superseded', updatedAt: serverTimestamp() });
        cleaned++;
      });
      await b.commit();
    }
    if (cleaned > 0) {
      console.log(`[NovaLearningService] 🧹 Cleaned ${cleaned} routing-prefix-poisoned entries`);
    }
  } catch (error) {
    console.warn('[NovaLearningService] cleanRoutingPrefixLearning failed:', error);
  }
  return cleaned;
}

/**
 * Creates a new manual match_feedback mapping.
 */
export async function createMatchFeedback(
  manifestName: string,
  slCode: string,
  fullName: string,
  ruta: string | null = null,
  consolidationEnabled: boolean = false,
  source: MatchFeedbackSource = 'admin_manual'
): Promise<string> {
  const normalized = manifestName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const ref = await addDoc(collection(db, MATCH_FEEDBACK_COL), {
    manifestName,
    normalizedName: normalized,
    slCode,
    fullName,
    ruta,
    consolidationEnabled,
    source,
    hitCount: 1,
    confirmedAt: serverTimestamp(),
    confirmedBy: 'Admin (Manual)',
    lastHitAt: serverTimestamp(),
  });
  await reloadLearnedMatches().catch(err => console.warn('[NovaLearning] Failed to reload matches after create:', err));
  return ref.id;
}

