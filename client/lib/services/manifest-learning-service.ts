/**
 * Manifest Learning Service
 *
 * Every time a manifest is processed this service:
 * 1. Analyses the result and detects bugs / improvement opportunities
 * 2. Persists a LearningRecord to Firestore (manifest_learning collection)
 * 3. Calls the slManifestReport Cloud Function which sends an email report
 *    to director@smartlogisticscr.com via Resend
 *
 * Firestore structure:
 *   manifest_learning/{recordId}   — one document per processed manifest
 *   manifest_learning_patterns/{patternId} — aggregated patterns over time
 */

import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { normalize as normalizeName } from '@/lib/services/matching/normalize';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ProcessingResult } from './manifest-processor';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEARNING_COL    = 'manifest_learning';
const PATTERNS_COL    = 'manifest_learning_patterns';
const DIRECTOR_EMAIL  = 'director@smartlogisticscr.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BugSeverity = 'critical' | 'warning' | 'info';

export interface BugReport {
  id: string;
  severity: BugSeverity;
  category: 'matching' | 'pricing' | 'weight' | 'duplicates' | 'data_quality' | 'routing';
  title: string;
  description: string;
  affectedRows: number;
  examples: string[];
}

export interface ImprovementSuggestion {
  id: string;
  category: 'matching' | 'pricing' | 'weight' | 'routing' | 'ui' | 'process';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
}

export interface LearningRecord {
  manifestNumber: string;
  manifestType: string;
  processedAt: string;
  userId: string;

  // Stats
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  pendingReviewRows: number;
  matchRate: number;            // 0–100 %
  totalPrice: number;
  avgPricePerRow: number;

  // Quality signals
  duplicateNames: string[];     // names appearing >1 time
  unmatchedNames: string[];
  multiMatchNames: string[];    // required user intervention
  lowScoreNames: string[];      // matched but with low confidence
  rowsWithoutRoute: string[];   // por_definir

  // Bug reports generated for this manifest
  bugs: BugReport[];

  // Improvement suggestions
  improvements: ImprovementSuggestion[];

  // Raw for AI re-training
  corrections: Array<{ field: string; original: string; corrected: string; reason: string }>;
}

// ── Analysis engine ───────────────────────────────────────────────────────────

function analyseBugs(result: ProcessingResult): BugReport[] {
  const bugs: BugReport[] = [];
  const rows = result.rows;

  // B1 — Unmatched customers
  const unmatched = rows.filter(r => !r.slCode || r.slCode === '' || r.slCode === 'N/A');
  if (unmatched.length > 0) {
    const severity: BugSeverity = unmatched.length > rows.length * 0.3 ? 'critical' : 'warning';
    bugs.push({
      id: 'B001',
      severity,
      category: 'matching',
      title: `${unmatched.length} clientes sin match`,
      description: `El ${Math.round((unmatched.length / rows.length) * 100)}% de las filas no encontró correspondencia en la base de datos de clientes.`,
      affectedRows: unmatched.length,
      examples: unmatched.slice(0, 5).map(r => r.nombre),
    });
  }

  // B2 — Rows pending review (user_choice / low_score / por_definir)
  const pending = result.multiMatchRows ?? [];
  if (pending.length > 0) {
    bugs.push({
      id: 'B002',
      severity: 'warning',
      category: 'matching',
      title: `${pending.length} filas requieren revisión manual`,
      description: 'Match ambiguo o confianza baja detectado. El operador debe seleccionar el cliente correcto.',
      affectedRows: pending.length,
      examples: pending.slice(0, 5).map(r => r.nombre),
    });
  }

  // B3 — Zero-price rows (quoteRequired or missing pricing config)
  const zeroPrice = rows.filter(r => r.precio === 0 && r.peso > 0);
  if (zeroPrice.length > 0) {
    bugs.push({
      id: 'B003',
      severity: 'critical',
      category: 'pricing',
      title: `${zeroPrice.length} filas con precio $0`,
      description: 'Filas con peso > 0 pero precio calculado = $0. Posible configuración de precios faltante en Firebase.',
      affectedRows: zeroPrice.length,
      examples: zeroPrice.slice(0, 5).map(r => `${r.nombre} (${r.peso} kg)`),
    });
  }

  // B4 — Duplicate names (same person, multiple packages — could be consolidation candidate)
  const nameCount = new Map<string, number>();
  rows.forEach(r => nameCount.set(r.nombre, (nameCount.get(r.nombre) ?? 0) + 1));
  const duplicates = [...nameCount.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    bugs.push({
      id: 'B004',
      severity: 'info',
      category: 'duplicates',
      title: `${duplicates.length} nombres duplicados`,
      description: 'El mismo nombre aparece más de una vez. Verificar si el cliente tiene consolidación habilitada.',
      affectedRows: duplicates.reduce((s, [, c]) => s + c, 0),
      examples: duplicates.slice(0, 5).map(([n, c]) => `${n} (×${c})`),
    });
  }

  // B5 — Rows without route (por_definir)
  const noRoute = rows.filter(r => r.slCode && (!r.ruta || r.ruta.toLowerCase() === 'por definir'));
  if (noRoute.length > 0) {
    bugs.push({
      id: 'B005',
      severity: 'warning',
      category: 'routing',
      title: `${noRoute.length} clientes sin ruta asignada`,
      description: 'Clientes emparejados pero sin ruta de entrega definida en el sistema.',
      affectedRows: noRoute.length,
      examples: noRoute.slice(0, 5).map(r => `${r.slCode} — ${r.nombre}`),
    });
  }

  // B6 — AI name corrections (data quality indicator)
  const nameCorrections = (result.corrections ?? []).filter(c => c.field === 'nombre');
  if (nameCorrections.length > 3) {
    bugs.push({
      id: 'B006',
      severity: 'info',
      category: 'data_quality',
      title: `${nameCorrections.length} correcciones de nombres`,
      description: 'Muchos nombres en el manifiesto requirieron corrección. El proveedor del manifiesto podría mejorar la calidad de datos.',
      affectedRows: nameCorrections.length,
      examples: nameCorrections.slice(0, 5).map(c => `"${c.original}" → "${c.corrected}"`),
    });
  }

  return bugs;
}

function analyseImprovements(result: ProcessingResult, bugs: BugReport[]): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];
  const rows = result.rows;

  const unmatchedBug = bugs.find(b => b.id === 'B001');
  if (unmatchedBug && unmatchedBug.affectedRows > 0) {
    suggestions.push({
      id: 'I001',
      category: 'matching',
      title: 'Agregar clientes no encontrados a la base de datos',
      description: `${unmatchedBug.affectedRows} nombres no tienen registro: ${unmatchedBug.examples.join(', ')}. Crear clientes o mejorar alias.`,
      impact: 'high',
      effort: 'low',
    });
  }

  const consolidationCandidates = rows.filter(r => r.slCode && !r.consolidacion);
  const dupBug = bugs.find(b => b.id === 'B004');
  if (dupBug && consolidationCandidates.length > 0) {
    suggestions.push({
      id: 'I002',
      category: 'routing',
      title: 'Habilitar consolidación para clientes con múltiples paquetes',
      description: `${dupBug.examples.length} clientes tienen múltiples bultos sin consolidación activa.`,
      impact: 'medium',
      effort: 'low',
    });
  }

  const routeBug = bugs.find(b => b.id === 'B005');
  if (routeBug) {
    suggestions.push({
      id: 'I003',
      category: 'routing',
      title: 'Completar rutas de clientes',
      description: `${routeBug.affectedRows} clientes tienen slCode pero sin ruta: ${routeBug.examples.slice(0, 3).join(', ')}.`,
      impact: 'high',
      effort: 'low',
    });
  }

  const priceBug = bugs.find(b => b.id === 'B003');
  if (priceBug) {
    suggestions.push({
      id: 'I004',
      category: 'pricing',
      title: 'Verificar configuración de precios en Firebase',
      description: `${priceBug.affectedRows} paquetes con peso > 0 tienen precio $0. Revisar la colección PRICING en Firestore.`,
      impact: 'high',
      effort: 'medium',
    });
  }

  const matchRate = rows.length > 0
    ? (rows.filter(r => r.slCode && r.slCode !== '' && r.slCode !== 'N/A').length / rows.length) * 100
    : 0;
  if (matchRate < 80) {
    suggestions.push({
      id: 'I005',
      category: 'matching',
      title: 'Mejorar motor de matching de nombres',
      description: `Tasa de match actual: ${matchRate.toFixed(1)}%. Objetivo: >90%. Considerar sinónimos, alias y variantes ortográficas.`,
      impact: 'high',
      effort: 'high',
    });
  }

  return suggestions;
}

function buildLearningRecord(
  result: ProcessingResult,
  userId: string,
): Omit<LearningRecord, 'processedAt'> {
  const rows = result.rows;
  const matched   = rows.filter(r => r.slCode && r.slCode !== '' && r.slCode !== 'N/A');
  const unmatched = rows.filter(r => !r.slCode || r.slCode === '' || r.slCode === 'N/A');
  const pending   = result.multiMatchRows ?? [];

  const nameCount = new Map<string, number>();
  rows.forEach(r => nameCount.set(r.nombre, (nameCount.get(r.nombre) ?? 0) + 1));

  const bugs        = analyseBugs(result);
  const improvements = analyseImprovements(result, bugs);

  return {
    manifestNumber:    result.manifestNumber,
    manifestType:      result.manifestType,
    userId,

    totalRows:         rows.length,
    matchedRows:       matched.length,
    unmatchedRows:     unmatched.length,
    pendingReviewRows: pending.length,
    matchRate:         rows.length > 0 ? Math.round((matched.length / rows.length) * 100) : 0,
    totalPrice:        result.summary.totalPrice,
    avgPricePerRow:    rows.length > 0 ? Math.round((result.summary.totalPrice / rows.length) * 100) / 100 : 0,

    duplicateNames:    [...nameCount.entries()].filter(([, c]) => c > 1).map(([n]) => n),
    unmatchedNames:    unmatched.map(r => r.nombre),
    multiMatchNames:   pending.filter(r => r.needsReview === 'user_choice').map(r => r.nombre),
    lowScoreNames:     pending.filter(r => r.needsReview === 'low_score').map(r => r.nombre),
    rowsWithoutRoute:  rows.filter(r => r.slCode && (!r.ruta || r.ruta.toLowerCase() === 'por definir')).map(r => r.slCode),

    bugs,
    improvements,
    corrections: (result.corrections ?? []).map(c => ({
      field:     c.field,
      original:  c.original,
      corrected: c.corrected,
      reason:    '',
    })),
  };
}

// ── Firestore persistence ─────────────────────────────────────────────────────

async function persistLearningRecord(record: Omit<LearningRecord, 'processedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, LEARNING_COL), {
    ...record,
    processedAt: serverTimestamp(),
  });

  // Update aggregated patterns document
  const patternRef = doc(db, PATTERNS_COL, record.manifestType);
  const snap = await getDoc(patternRef);
  if (snap.exists()) {
    await setDoc(patternRef, {
      totalManifests:  increment(1),
      totalRows:       increment(record.totalRows),
      totalUnmatched:  increment(record.unmatchedRows),
      totalBugs:       increment(record.bugs.length),
      updatedAt:       serverTimestamp(),
    }, { merge: true });
  } else {
    await setDoc(patternRef, {
      manifestType:   record.manifestType,
      totalManifests: 1,
      totalRows:      record.totalRows,
      totalUnmatched: record.unmatchedRows,
      totalBugs:      record.bugs.length,
      createdAt:      serverTimestamp(),
      updatedAt:      serverTimestamp(),
    });
  }

  return ref.id;
}

// ── Cloud Function call ───────────────────────────────────────────────────────

async function sendManifestReportEmail(record: Omit<LearningRecord, 'processedAt'>, recordId: string): Promise<void> {
  try {
    const functions = getFunctions();
    const callFn    = httpsCallable(functions, 'slManifestReport');
    await callFn({ record, recordId, to: DIRECTOR_EMAIL });
  } catch (err) {
    // Non-critical — log but don't break the UI flow
    console.warn('[manifest-learning] Could not send report email:', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called after every successful manifest processing.
 * Runs fully async — does NOT block the UI.
 */
export async function recordManifestLearning(
  result: ProcessingResult,
  userId: string,
): Promise<void> {
  try {
    const record   = buildLearningRecord(result, userId);
    const recordId = await persistLearningRecord(record);
    await sendManifestReportEmail(record, recordId);
  } catch (err) {
    console.warn('[manifest-learning] Learning record failed (non-critical):', err);
  }
}

// In-memory cache for learning associations to achieve 0ms lookups and 0 repeat Firestore reads
const learningAssociationsCache = new Map<string, Array<{
  slCode: string;
  matchedName: string;
  matchScore: number;
  approvalCount: number;
}>>();

/**
 * Look up previously-approved name associations from Nova Learning.
 * Returns results sorted by approvalCount desc so the most-confirmed match comes first.
 * Cached in memory for 0ms lookups and zero repeated Firestore reads.
 */
export async function getLearningAssociations(rawName: string): Promise<Array<{
  slCode: string;
  matchedName: string;
  matchScore: number;
  approvalCount: number;
}>> {
  const cleanName = (rawName || '').trim();
  if (!cleanName) return [];

  const cached = learningAssociationsCache.get(cleanName);
  if (cached) return cached;

  try {
    const q = query(
      collection(db, PATTERNS_COL),
      where('type', '==', 'name_association'),
      where('rawName', '==', cleanName),
      orderBy('approvalCount', 'desc'),
      limit(5),
    );
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({
      slCode: d.data().slCode as string,
      matchedName: d.data().matchedName as string,
      matchScore: d.data().matchScore as number,
      approvalCount: (d.data().approvalCount as number) ?? 1,
    }));
    learningAssociationsCache.set(cleanName, results);
    return results;
  } catch {
    return [];
  }
}

/**
 * Quick-approve a fuzzy name association from the Nova table.
 * Writes a pattern to `manifest_learning_patterns` so Nova can use it
 * to improve future automatic matches.
 */
export async function approveNameAssociation({
  rawName,
  matchedName,
  slCode,
  matchScore,
  approvedBy,
}: {
  rawName: string;
  matchedName: string;
  slCode: string;
  matchScore: number;
  approvedBy: string;
}): Promise<void> {
  try {
    const sanitized = (rawName || '').trim();
    const normalizedName = normalizeName(sanitized);
    const patternId = `assoc_${slCode}_${rawName.toLowerCase().replace(/\s+/g, '_').substring(0, 40)}`;
    await setDoc(
      doc(db, PATTERNS_COL, patternId),
      {
        type: 'name_association',
        rawName,
        normalizedName,
        matchedName,
        slCode,
        matchScore,
        approvedBy,
        approvedAt: serverTimestamp(),
        approvalCount: increment(1),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[manifest-learning] approveNameAssociation failed (non-critical):', err);
  }
}
