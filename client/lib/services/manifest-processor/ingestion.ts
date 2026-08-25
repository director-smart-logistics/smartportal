import { 
  collection, 
  doc, 
  writeBatch, 
  serverTimestamp, 
  setDoc, 
  getDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  arrayUnion, 
  deleteField, 
  deleteDoc,
  orderBy,
  limit,
  getCountFromServer,
  runTransaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { logAction, getManifestMoveHistory, type ManifestMoveEvent } from '../audit-service';
import {
  type IngestResult,
  type ManifestRow,
  type ManifestRecord,
  type EncomiendaManifestRow,
  type ConsolidationManifestRow,
  type TempCustomerRecord,
  type AjustePrecio
} from './types';
import { generateMultiMatchCSV } from './exporter';
import { buildTrackingVariants } from '@/lib/utils/tracking-variants';
import { calculatePrice } from '@/lib/utils/pricing';
import { resolveEffectiveCustomerName } from '@/lib/utils/customer-name';

/**
 * Canonical status labels — must match smart-portal-2 scanner-service.ts & shipment-sync.ts.
 */
export const STATUS_LABELS: Record<string, string> = {
  'pre-alerted': 'Pre-Alertado',
  'received': 'Recibido en Miami',
  'transit': 'En Tránsito a Costa Rica',
  'customs': 'En Aduanas',
  'held': 'Retenido en Aduana',
  'consolidated': 'Consolidado',
  'route': 'En Ruta de Entrega',
  'pickup': 'Retira en SmartLogistics',
  'delivered': 'Entregado',
  'returned': 'Devuelto',
};

export const STATUS_LOCATIONS: Record<string, string> = {
  'pre-alerted': 'Pendiente de recibir',
  'received': 'Miami, FL',
  'transit': 'En tránsito',
  'customs': 'Aduana CR',
  'held': 'Aduana CR',
  'consolidated': 'San José, Costa Rica',
  'route': 'En Ruta de Entrega',
  'pickup': 'SmartLogistics - Costa Rica',
  'delivered': 'Costa Rica',
  'returned': 'SmartLogistics - Costa Rica',
};

export async function saveManifestMLockerLink(
  mlockerIdRaw: string,
  totalPackages: number,
  manifestNumberRaw?: string,
): Promise<void> {
  const mlockerId = (mlockerIdRaw || '').trim();
  const manifestNumber = (manifestNumberRaw || '').trim();
  if (!mlockerId) return;
  try {
    const ref = doc(collection(db, 'manifests'), mlockerId);
    await setDoc(ref, {
      manifestId: mlockerId,
      totalPackages,
      processedAt: new Date().toISOString(),
      source: 'nova_mlocker',
      ...(manifestNumber ? { manifestNumber } : {}),
    }, { merge: true });
  } catch {
    // Non-fatal
  }
}

export async function saveManifestMergedLink(
  discardedIdRaw: string,
  mergedIntoRaw: string,
): Promise<void> {
  const discardedId = (discardedIdRaw || '').trim();
  const mergedInto = (mergedIntoRaw || '').trim();
  if (!discardedId || !mergedInto) return;
  try {
    const ref = doc(collection(db, 'manifests'), discardedId);
    await setDoc(ref, {
      manifestId: discardedId,
      mergedInto,
      mergedAt: new Date().toISOString(),
      source: 'nova_fusion',
    }, { merge: true });
  } catch {
    // Non-fatal
  }
}

/**
 * Recursively removes all `undefined` values from an object or array before
 * sending to Firestore. Firestore strictly rejects any document with `undefined` values.
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    // Preserve Firestore field values (serverTimestamp, FieldValue, Timestamp, etc.)
    const proto = Object.getPrototypeOf(data);
    if (proto && proto.constructor && proto.constructor.name !== 'Object') {
      return data;
    }
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

export async function saveManifestRecord(
  rows: ManifestRow[],
  manifestNumberRaw: string,
  options?: {
    manifestType?: string;
    priceAdjustments?: Record<string, any>;
    priceOverrides?: Record<string, { precio: number; pesoRedondeo: number }> | Record<number, { precio: number; pesoRedondeo: number }>;
    computedPrices?: number[];
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }>;
    customerContacts?: Map<string, { slCode: string; email: string; dni: string; fullName: string }>;
    exchangeRate?: number;
    totalPrice?: number;
  },
): Promise<void> {
  const manifestNumber = (manifestNumberRaw || '').trim();
  if (!manifestNumber || !rows.length) return;

  const manifestsRef = collection(db, 'manifests');
  const docRef = doc(manifestsRef, manifestNumber);
  const now = new Date().toISOString();
  const parts = (options?.manifestType ?? 'usa_air').split('_');
  const country = parts[0] ?? 'usa';
  const shippingType = parts[1] ?? 'air';

  // Build per-tracking package summaries.
  //
  // ─── ROUND-TRIP INTEGRITY ──────────────────────────────────────────────────
  // Historically the embedded array stored only the bare-minimum identity +
  // billing fields (tracking, slCode, weight, price, ...). Anything else —
  // matchSource, matchScore, precioSinPermiso, precioConPermiso, the
  // rounded-weight breakdown — was discarded on save and reconstructed on
  // load with `precioSinPermiso = precioConPermiso = price` and
  // `matchScore = slCode ? 1 : 0`.
  //
  // That broke `loadMegaManFromFirestore → ProcessedRow` round-trip fidelity:
  // a manifest saved as fresh-parse and reloaded later would lose the AI
  // confidence score, the manual/pre-alert match-source attribution, and
  // BOTH per-permit price columns required for the invoice + boleta
  // generation flows. Operators saw the cosmetic price collapse as "the
  // table is recalculating" and would rerun matching, regressing curated
  // assignments.
  //
  // We now persist EVERY field needed to reconstruct a `ManifestRow` exactly
  // as it was at save time. The hydrator in `loadMegaManFromFirestore`
  // mirrors this shape — see the matching `// ROUND-TRIP …` comment there.
  const packages: Array<{
    tracking: string;
    slCode: string;
    /** Original MLCargo manifest name — must NOT be conflated with customerName.
     *  See BUG-CHILD-NAME-OVERWRITE 2026-05-16 below. */
    nombre: string;
    customerName: string;
    customerEmail: string;
    ruta: string;
    weight: number;
    price: number;
    isConsolidated: boolean;
    requiresPermit: boolean;
    description: string;
    // ── Round-trip fidelity fields ─────────────────────────────────────────
    /** Original AI confidence score [0..1] — preserves "low_score" classification across reloads. */
    matchScore: number;
    /** How the slCode was assigned: 'pre_alert' (customer self-declared), 'name' (AI match), or '' (unmatched). */
    matchSource: 'pre_alert' | 'name' | '';
    /** Tiered price WITHOUT permit surcharge — must survive reload independent of `requiresPermit`. */
    precioSinPermiso: number;
    /** Tiered price WITH the $3 permit surcharge — needed for permit-toggle UI on Firestore-loaded data. */
    precioConPermiso: number;
    /** Math.ceil(weight) — pre-computed rounding column displayed in the table. */
    pesoRedondeo: number;
    /** pesoRedondeo - weight (rounded to 3 decimals) — diferential reported to the operator. */
    diferenciaRedondeo: number;
    /** pesoRedondeo when consolidacion is true, 0 otherwise — drives the consolidation total. */
    pesoConsolidacion: number;
  }> = [];

  // Collect unique customers for the manifest
  const customersMap = new Map<string, { slCode: string; fullName: string; email: string; ruta: string; packageCount: number }>();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!row.tracking) continue;

    const trackingId = row.tracking.toUpperCase();
    const priceOverride = (options?.priceOverrides as any)?.[trackingId] ?? options?.priceOverrides?.[idx];
    let effectivePrice = priceOverride?.precio
      ?? options?.computedPrices?.[idx]
      ?? (typeof row.precio === 'number' && row.precio > 0 ? row.precio : undefined);

    // INVARIANT: An item with weight > 0 must NEVER have price 0 saved.
    if ((effectivePrice == null || effectivePrice === 0) && (row.peso ?? 0) > 0) {
      const calc = calculatePrice(row.peso ?? 0, country as any, shippingType as any, 'regular', row.permisos || false);
      if (!calc.quoteRequired) {
        effectivePrice = Math.round(calc.price * 100) / 100;
      }
    }
    effectivePrice = effectivePrice ?? 0;

    const rawSlCode = options?.slCodeOverrides?.[idx]?.slCode
      ?? options?.matchOverrides?.[idx]?.slCode
      ?? (row.slCode || '');
    const effectiveSlCode = (rawSlCode && rawSlCode.toUpperCase().startsWith('SL')) ? rawSlCode : '';
    const contact = options?.customerContacts?.get(effectiveSlCode) || (effectiveSlCode ? options?.customerContacts?.get(effectiveSlCode.toUpperCase()) : undefined);
    const preAlertName = (row.preAlert as any)?.displayName || (row.preAlert as any)?.fullName || (row.preAlert as any)?.name || (row.preAlert as any)?.clientName;
    const effectiveCustomerName = resolveEffectiveCustomerName({
      overrideName: options?.matchOverrides?.[idx]?.fullName,
      contactName: contact?.fullName,
      preAlertName,
      manifestConsigneeName: row.nombre,
      savedCustomerName: row.nombreCliente,
      slCode: effectiveSlCode,
    });
    const effectiveRuta = options?.slCodeOverrides?.[idx]?.ruta
      ?? options?.matchOverrides?.[idx]?.ruta
      ?? (row.ruta || '');

    // ── Round-trip fields ─────────────────────────────────────────────────
    // Read the precomputed rounding columns from the row when present
    // (always set by `processManifestFile`), recompute defensively if the
    // row was constructed by an older code path that omitted them.
    const pesoRedondeo       = row.pesoRedondeo       ?? (row.peso ? Math.ceil(row.peso) : 0);
    const diferenciaRedondeo = row.diferenciaRedondeo ?? Math.max(0, Math.round((pesoRedondeo - row.peso) * 1000) / 1000);
    const pesoConsolidacion  = row.pesoConsolidacion  ?? (row.consolidacion ? pesoRedondeo : 0);
    // matchSource is 'pre_alert' | 'name' | undefined on the row; we
    // serialize undefined as '' so the Firestore type stays strict (the
    // hydrator branches on the empty string the same way).
    const matchSource: 'pre_alert' | 'name' | '' = row.matchSource ?? '';

    const precioSinPermiso = Number.isFinite(row.precioSinPermiso) && (row.precioSinPermiso ?? 0) > 0
      ? Number(row.precioSinPermiso)
      : (row.permisos ? Math.max(0, effectivePrice - 3) : effectivePrice);

    const precioConPermiso = Number.isFinite(row.precioConPermiso) && (row.precioConPermiso ?? 0) > 0
      ? Number(row.precioConPermiso)
      : effectivePrice;

    packages.push({
      tracking: trackingId,
      slCode: effectiveSlCode,
      // BUG-CHILD-NAME-OVERWRITE 2026-05-16: persist the original MLCargo
      // manifest name SEPARATELY from `customerName` (the resolved
      // customers/{slCode}.fullName). Without this field, the reload
      // hydrator was forced to fall back `p.nombre || p.customerName`,
      // permanently overwriting the row's manifest name with the matched
      // customer's name on every reload. Operators saw "JOSÉ PÉREZ" turn
      // into "ARIANNA GARNIER" once they reopened the table.
      nombre: row.nombre || '',
      customerName: effectiveCustomerName,
      customerEmail: contact?.email || '',
      ruta: effectiveRuta,
      weight: row.peso,
      price: effectivePrice,
      isConsolidated: row.consolidacion || false,
      requiresPermit: row.permisos || false,
      description: row.descripcion || '',
      // Round-trip fidelity (read by loadMegaManFromFirestore on reload)
      matchScore:        Number.isFinite(row.matchScore) ? row.matchScore : (effectiveSlCode ? 1 : 0),
      matchSource,
      precioSinPermiso,
      precioConPermiso,
      pesoRedondeo,
      diferenciaRedondeo,
      pesoConsolidacion,
      ...(row.preAlert ? { preAlert: row.preAlert } : {}),
      ...(row.hasPreAlert ? { hasPreAlert: row.hasPreAlert } : {}),
      ...(row.preAlertSlCode ? { preAlertSlCode: row.preAlertSlCode } : {}),
      ...(row.preAlertCreatedAt ? { preAlertCreatedAt: row.preAlertCreatedAt } : {}),
      ...(row.preAlertKey ? { preAlertKey: row.preAlertKey } : {}),
      ...(row.preAlertId ? { preAlertId: row.preAlertId } : {}),
      ...(row.ajustePrecio ? { ajustePrecio: row.ajustePrecio } : {}),
    });

    // Aggregate customers
    if (effectiveSlCode) {
      const existing = customersMap.get(effectiveSlCode);
      if (existing) {
        existing.packageCount++;
      } else {
        customersMap.set(effectiveSlCode, {
          slCode: effectiveSlCode,
          fullName: effectiveCustomerName,
          email: contact?.email || '',
          ruta: effectiveRuta,
          packageCount: 1,
        });
      }
    }
  }

  const totalWeight = packages.reduce((s, p) => s + p.weight, 0);
  const totalPrice = options?.totalPrice ?? packages.reduce((s, p) => s + p.price, 0);
  const routes = [...new Set(packages.map(p => p.ruta).filter(Boolean))];

  const isMegaMan = manifestNumber.toUpperCase().startsWith('MEGA-MAN-') || manifestNumber.toUpperCase().startsWith('SL-MEGA-MAN-') || manifestNumber.toUpperCase().startsWith('ENC-MEGA-MAN-');
  const isEncomienda = manifestNumber.toUpperCase().startsWith('ENC-');

  // Core payload — always written on every save/reprocess.
  // `createdAt` is intentionally excluded here; it is added only when the
  // document is being created for the first time (see below) so that a
  // re-process never stomps on the original creation timestamp.
  const manifestDoc = cleanForFirestore({
    manifestNumber,
    manifestType: options?.manifestType ?? 'usa_air',
    country,
    shippingType,
    totalPackages: packages.length,
    totalWeight: Math.round(totalWeight * 100) / 100,
    totalPrice: Math.round(totalPrice * 100) / 100,
    totalCustomers: customersMap.size,
    exchangeRate: options?.exchangeRate ?? 0,
    routes,
    packages,
    customers: Array.from(customersMap.values()),
    processedAt: now,
    updatedAt: serverTimestamp(),
    source: isMegaMan ? 'nova_mega_man' : 'nova_manifest',
    ...(isEncomienda ? { isEncomienda: true } : {}),
  });

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      // Re-process: full-overwrite of all mutable fields, preserve createdAt + source metadata.
      // Back-fill createdAt if missing — stub writes (e.g. fsSetDoc fusedFrom) can create the
      // doc without it, which causes Firestore orderBy('createdAt') queries to exclude the doc.
      const existingCreatedAt = existing.data()?.createdAt;
      await setDoc(docRef, cleanForFirestore({
        ...manifestDoc,
        ...(!existingCreatedAt ? { createdAt: serverTimestamp() } : {}),
      }), { merge: true });
    } else {
      // First save: include createdAt.
      await setDoc(docRef, cleanForFirestore({ ...manifestDoc, createdAt: serverTimestamp() }));
    }
    console.log(`[Nova] Manifest ${manifestNumber} saved to manifests collection (${packages.length} packages, ${customersMap.size} customers)`);
    // Audit — record original package count at the time of manifest save.
    // Queried later by getManifestMoveHistory to show "N originales" baseline.
    logAction({
      userId:     'nova',
      action:     'nova_manifest_processed',
      category:   'manifest',
      resource:   'manifests',
      resourceId: manifestNumber,
      result:     'success',
      metadata:   { totalPackages: packages.length, isMegaMan: !!isMegaMan },
    });
  } catch (error) {
    // BUG-AUTOSAVE-SILENT 2026-04-29: error must propagate so callers
    // (auto-save, manual buttons) can surface the failure. Previous behavior
    // swallowed every Firestore rejection, making the auto-save indicator
    // lie about success — operators saw "Guardado" while nothing reached
    // Firestore, and on refresh their manual moves vanished.
    console.error(`[Nova] Error saving manifest ${manifestNumber}:`, error);
    throw error;
  }
}

export interface IntegrityConflict {
  tracking: string;
  preAlertSlCode: string;
  preAlertEmail?: string;
  preAlertUserId?: string;
  targetSlCode: string;
  rowIndex: number;
}

export function checkPreAlertIntegrity(
  rows: ManifestRow[],
  preAlertsMap: Map<string, any>,
  options?: {
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }> | Record<string, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }> | Record<string, { slCode: string; fullName: string; ruta: string }>;
  }
): IntegrityConflict[] {
  const conflicts: IntegrityConflict[] = [];
  if (!rows || !preAlertsMap) return conflicts;

  const slCodeOverrides = options?.slCodeOverrides || {};
  const matchOverrides = options?.matchOverrides || {};

  rows.forEach((row, idx) => {
    const tracking = (row.tracking || '').toUpperCase().trim();
    if (!tracking) return;

    const preAlert = preAlertsMap.get(tracking);
    if (!preAlert || !preAlert.found || !preAlert.slCode) return;

    const status = String(preAlert.status || '').toLowerCase();
    const isCompleted = ['delivered', 'returned', 'cancelled', 'annulled', 'void'].includes(status);
    if (isCompleted) return;

    const origIdx = row.originalIndex !== undefined ? row.originalIndex : idx;
    let targetSlCode = row.slCode || '';
    const mOverride = matchOverrides[origIdx] || matchOverrides[String(origIdx)];
    const sOverride = slCodeOverrides[origIdx] || slCodeOverrides[String(origIdx)];
    if (mOverride?.slCode) {
      targetSlCode = mOverride.slCode;
    } else if (sOverride?.slCode) {
      targetSlCode = sOverride.slCode;
    }

    if (targetSlCode && targetSlCode.toUpperCase() !== preAlert.slCode.toUpperCase()) {
      conflicts.push({
        tracking: row.tracking || '',
        preAlertSlCode: preAlert.slCode,
        preAlertEmail: preAlert.email || '',
        preAlertUserId: preAlert.userId || '',
        targetSlCode,
        rowIndex: origIdx,
      });
    }
  });

  return conflicts;
}

export async function upsertManifestPackageOverrides(
  rows: ManifestRow[],
  manifestNumber: string,
  options?: {
    manifestType?: string;
    priceOverrides?: Record<string, { precio: number; pesoRedondeo: number }> | Record<number, { precio: number; pesoRedondeo: number }>;
    computedPrices?: number[];
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }> | Record<string, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }> | Record<string, { slCode: string; fullName: string; ruta: string }>;
    customerContacts?: Map<string, { slCode: string; email: string; dni: string; fullName: string }>;
    exchangeRate?: number;
    priceAdjustments?: Record<number, AjustePrecio> | Record<string, AjustePrecio>;
    rowManifestOverrides?: Record<string, string>;
    preAlertsMap?: Map<string, any>;
    dataOriginPolicy?: { origin: string; [key: string]: any };
    bypassIntegrity?: boolean;
  },
): Promise<{ updated: number; skippedNew: number; errors: number }> {
  const result = { updated: 0, skippedNew: 0, errors: 0 };
  if (!manifestNumber || !rows.length) return result;

  let conflictingTrackings = new Set<string>();
  if (!options?.bypassIntegrity && options?.dataOriginPolicy?.origin !== 'firestore' && options?.preAlertsMap) {
    const conflicts = checkPreAlertIntegrity(rows, options.preAlertsMap, {
      slCodeOverrides: options.slCodeOverrides,
      matchOverrides: options.matchOverrides,
    });
    conflicts.forEach(c => {
      if (c.tracking) {
        conflictingTrackings.add(c.tracking.toUpperCase().trim());
      }
    });
  }

  const packagesRef = collection(db, 'packages');
  const tc = options?.exchangeRate ?? 0;
  const BATCH_SIZE = 400;
  const indexed = rows
    .filter(r => !!r.tracking)
    .filter(r => !conflictingTrackings.has(r.tracking.toUpperCase().trim()))
    .map((row, idx) => ({ row, idx }));

  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    const chunk = indexed.slice(i, i + BATCH_SIZE);

    // Read existence — only pre-existing docs receive the merge. New docs
    // must go through ingestManifestToPackages (which stamps initial
    // status + statusHistory).
    const existenceMap = new Map<string, { exists: boolean; isTransitoria: boolean }>();
    await Promise.all(
      chunk.map(({ row }) => {
        const id = row.tracking.toUpperCase();
        return getDoc(doc(packagesRef, id))
          .then(s => {
            const data = s.data();
            const manifest = data?.manifestNumber || data?.manifestId || '';
            const updated = data?.updatedManifest || '';
            const isTrans = s.exists() && (
              manifest.toLowerCase() === 'consolidacion_transitoria' ||
              updated.toLowerCase() === 'consolidacion_transitoria'
            );
            existenceMap.set(id, { exists: s.exists(), isTransitoria: isTrans });
          })
          .catch(() => {
            existenceMap.set(id, { exists: false, isTransitoria: false });
          });
      }),
    );

    const batch = writeBatch(db);
    let batchUpdated = 0;
    let batchSkipped = 0;

    for (const { row, idx } of chunk) {
      const trackingId = row.tracking.toUpperCase();
      const pkgInfo = existenceMap.get(trackingId);
      if (!pkgInfo || !pkgInfo.exists) {
        batchSkipped += 1;
        continue;
      }

      const isTrans = pkgInfo.isTransitoria;

      const adjustment = options?.priceAdjustments?.[trackingId]
        ?? options?.priceAdjustments?.[idx]
        ?? row.ajustePrecio;

      const priceOverride = (options?.priceOverrides as any)?.[trackingId] ?? options?.priceOverrides?.[idx];
      const effectivePrice = priceOverride?.precio
        ?? options?.computedPrices?.[idx]
        ?? row.precio;
      const effectivePesoRedondeo = priceOverride?.pesoRedondeo
        ?? row.pesoRedondeo
        ?? Math.ceil(row.peso);
      const rawSlCode = options?.slCodeOverrides?.[idx]?.slCode
        ?? options?.matchOverrides?.[idx]?.slCode
        ?? (row.slCode || '');
      const effectiveSlCode = (rawSlCode && rawSlCode.toUpperCase().startsWith('SL')) ? rawSlCode : '';
      const effectiveCustomerName = options?.matchOverrides?.[idx]?.fullName
        ?? (row.nombreCliente || row.nombre);
      const effectiveRuta = options?.slCodeOverrides?.[idx]?.ruta
        ?? options?.matchOverrides?.[idx]?.ruta
        ?? (row.ruta || '');
      const contact = options?.customerContacts?.get(effectiveSlCode);

      const docRef = doc(packagesRef, trackingId);
      batch.set(
        docRef,
        {
          // Tracking variants — searchable index for the public scanner.
          // See `client/lib/utils/tracking-variants.ts` for format coverage.
          trackingVariants: buildTrackingVariants(trackingId),
          // Identity + billing + route (everything the operator can mutate in the table)
          slCode:         effectiveSlCode,
          userId:         effectiveSlCode,
          customerId:     effectiveSlCode,
          customerName:   effectiveCustomerName,
          customerEmail:  contact?.email || '',
          customerDni:    contact?.dni || '',
          ruta:           effectiveRuta,
          description:    row.descripcion || '',
          descripcion:    row.descripcion || '',
          weight:         row.peso,
          cost:           effectivePrice,
          price:          effectivePrice,
          ...(tc > 0 ? { costCRC: Math.round(effectivePrice * tc), exchangeRate: tc } : {}),
          // Consolidation + permit flags — operator-controlled
          isConsolidated: isTrans ? true : row.consolidacion || false,
          consolidacion:  isTrans ? true : row.consolidacion || false,
          requiresPermit: row.permisos || false,
          permisos:       row.permisos || false,
          // Manifest reassignment support
          manifestNumber: isTrans ? 'consolidacion_transitoria' : (options?.rowManifestOverrides?.[trackingId] ?? manifestNumber) || row.manifiesto,
          manifestId:     isTrans ? 'consolidacion_transitoria' : (options?.rowManifestOverrides?.[trackingId] ?? manifestNumber) || row.manifiesto,
          // Round-trip fidelity fields (so reloads see the full row shape)
          pesoRedondeo:       effectivePesoRedondeo ?? row.pesoRedondeo ?? null,
          matchSource:        row.matchSource ?? '',
          matchScore:         Number.isFinite(row.matchScore) ? row.matchScore : (effectiveSlCode ? 1 : 0),
          precioSinPermiso:   Number.isFinite(row.precioSinPermiso) ? row.precioSinPermiso : effectivePrice,
          precioConPermiso:   Number.isFinite(row.precioConPermiso) ? row.precioConPermiso : effectivePrice,
          diferenciaRedondeo: row.diferenciaRedondeo ?? Math.max(0, Math.round(((row.pesoRedondeo ?? Math.ceil(row.peso)) - row.peso) * 1000) / 1000),
          pesoConsolidacion:  row.pesoConsolidacion ?? (row.consolidacion ? (row.pesoRedondeo ?? Math.ceil(row.peso)) : 0),
          ...(adjustment ? { ajustePrecio: adjustment } : {}),
          // Metadata
          source:    'nova_autosave',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      batchUpdated += 1;
    }

    try {
      await batch.commit();
      result.updated += batchUpdated;
      result.skippedNew += batchSkipped;
    } catch (err) {
      result.errors += chunk.length;
      console.warn('[Nova][upsertManifestPackageOverrides] batch failed:', err);
    }
  }

  return result;
}

function statusRank(s: string): number {
  const ranks: Record<string, number> = {
    'pre-alerted': 0, 'pre_alerted': 0,
    'received': 1,
    'transit': 2, 'in_transit': 2,
    'customs': 3, 'retained': 3, 'held': 3,
    'consolidated': 4,
    'processed': 5,
    'route': 6, 'on_route': 6, 'pickup': 6,
    'delivered': 7, 'returned': 7,
  };
  return ranks[String(s || '').toLowerCase()] ?? -1;
}

export async function ingestManifestToPackages(
  rows: ManifestRow[],
  manifestNumberRaw: string,
  options?: {
    manifestType?: string;
    priceOverrides?: Record<string, { precio: number; pesoRedondeo: number }> | Record<number, { precio: number; pesoRedondeo: number }>;
    computedPrices?: number[];
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }> | Record<string, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }> | Record<string, { slCode: string; fullName: string; ruta: string }>;
    customerContacts?: Map<string, { slCode: string; email: string; dni: string; fullName: string }>;
    exchangeRate?: number;
    priceAdjustments?: Record<number, AjustePrecio> | Record<string, AjustePrecio>;
    /**
     * Per-tracking manifest override: trackingUpper → manifestNumber.
     * When set, the matching package doc will be stored under the override
     * manifest instead of the top-level manifestNumber argument.
     * Used by the Nova "Cambiar manifiesto" row action.
     */
    rowManifestOverrides?: Record<string, string>;
    updatedBy?: string;
    preAlertsMap?: Map<string, any>;
    dataOriginPolicy?: { origin: string; [key: string]: any };
    bypassIntegrity?: boolean;
  },
): Promise<IngestResult> {
  const manifestNumber = (manifestNumberRaw || '').trim();
  const result: IngestResult = { total: rows.length, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  if (!options?.bypassIntegrity && options?.dataOriginPolicy?.origin !== 'firestore' && options?.preAlertsMap) {
    const conflicts = checkPreAlertIntegrity(rows, options.preAlertsMap, {
      slCodeOverrides: options.slCodeOverrides,
      matchOverrides: options.matchOverrides,
    });
    if (conflicts.length > 0) {
      const error = new Error('IntegrityConflict');
      (error as any).conflicts = conflicts;
      throw error;
    }
  }

  const packagesRef = collection(db, 'packages');

  const parts = (options?.manifestType ?? 'usa_air').split('_');
  const shippingType = parts[1] ?? 'air';
  const originCountry = parts[0] === 'usa' ? 'Miami, FL' : parts[0] === 'colombia' ? 'Bogotá, Colombia' : parts[0] === 'china' ? 'Guangzhou, China' : 'Internacional';
  const tc = options?.exchangeRate ?? 0;
  const now = new Date().toISOString();

  const BATCH_SIZE = 400;
  const chunks: { row: ManifestRow; idx: number }[][] = [];
  const indexed = rows.map((row, idx) => ({ row, idx }));
  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    chunks.push(indexed.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    // Pre-check which trackingIds already exist so we can preserve their
    // status/statusHistory and protect manifestNumber updates (e.g. transitory consolidation).
    const existingPackagesMap = new Map<string, { manifestNumber?: string; status?: string }>();
    await Promise.all(
      chunk
        .filter(({ row }) => Boolean(row.tracking))
        .map(({ row }) => {
          const id = row.tracking.toUpperCase();
          return getDoc(doc(packagesRef, id))
            .then(s => {
              if (s.exists()) {
                const data = s.data();
                existingPackagesMap.set(id, {
                  manifestNumber: data?.manifestNumber || data?.manifestId || '',
                  status: data?.status || '',
                });
              }
            })
            .catch(() => { /* treat as non-existent — safe to create */ });
        })
    );

    const batch = writeBatch(db);
    let batchInserted = 0;
    let batchUpdated  = 0;

    for (const { row, idx } of chunk) {
      if (!row.tracking) { result.errors++; continue; }
      const trackingId  = row.tracking.toUpperCase();
      const docRef      = doc(packagesRef, trackingId);
      const existingPkg = existingPackagesMap.get(trackingId);
      const isExisting  = !!existingPkg;

      const adjustment = options?.priceAdjustments?.[trackingId]
        ?? options?.priceAdjustments?.[idx]
        ?? row.ajustePrecio;

      const priceOverride = (options?.priceOverrides as any)?.[trackingId] ?? options?.priceOverrides?.[idx];
      let effectivePrice: number = priceOverride?.precio
        ?? options?.computedPrices?.[idx]
        ?? (typeof row.precio === 'number' && row.precio > 0 ? row.precio : undefined)
        ?? 0;

      // INVARIANT: An item with weight > 0 must NEVER have price 0 saved to packages collection.
      if (effectivePrice <= 0 && (row.peso ?? 0) > 0) {
        const calc = calculatePrice(row.peso ?? 0, parts[0] as any, shippingType as any, 'regular', row.permisos || false);
        if (!calc.quoteRequired) {
          effectivePrice = Math.round(calc.price * 100) / 100;
        }
      }
      // Ceiling (Math.ceil) only for consolidacion/permisos rows or explicit user overrides.
      // Plain rows → null (no rounding applied). Stored as null in Firestore so the
      // Paquetes table shows "--" and invoices fall back to the raw peso.
      const effectivePesoRedondeo: number | null = priceOverride?.pesoRedondeo
        ?? ((row.consolidacion || row.permisos) ? (row.pesoRedondeo ?? null) : null);
      // BUG-DATA-INTEGRITY-UNMATCHED-SLCODE 2026-08-07: Filter out route-based pseudo-codes (like Heredia, Coronado, Desconocida)
      // from resolving as valid customer slCodes in the packages collection. A package should only have a real customer
      // slCode (starting with 'SL') or remain empty.
      const rawSlCode = options?.slCodeOverrides?.[idx]?.slCode
        ?? options?.matchOverrides?.[idx]?.slCode
        ?? (row.slCode || '');
      const effectiveSlCode = (rawSlCode && rawSlCode.toUpperCase().startsWith('SL')) ? rawSlCode : '';
      const effectiveCustomerName = options?.matchOverrides?.[idx]?.fullName
        ?? (row.nombreCliente || row.nombre);
      const effectiveRuta = options?.slCodeOverrides?.[idx]?.ruta
        ?? options?.matchOverrides?.[idx]?.ruta
        ?? (row.ruta || '');

      const contact = options?.customerContacts?.get(effectiveSlCode);

      // ── Round-trip fidelity fields ───────────────────────────────────────
      // Mirror the fields persisted by `saveManifestRecord` into the
      // `manifests/{mn}.packages[]` embedded array so a row's full identity
      // survives ACROSS manifests too. Without this, moving a row to another
      // manifest (rowManifestOverrides) drops matchScore/matchSource/permit
      // prices/consolidation rounding on the floor — the target manifest
      // loads via the packages collection (no embedded backstop) and the
      // hydrator ends up reconstructing them from defaults.
      const ripPesoRedondeo       = row.pesoRedondeo       ?? Math.ceil(row.peso);
      const ripDiferenciaRedondeo = row.diferenciaRedondeo ?? Math.max(0, Math.round((ripPesoRedondeo - row.peso) * 1000) / 1000);
      const ripPesoConsolidacion  = row.pesoConsolidacion  ?? (row.consolidacion ? ripPesoRedondeo : 0);
      const ripMatchSource: 'pre_alert' | 'name' | '' = row.matchSource ?? '';
      const ripMatchScore        = Number.isFinite(row.matchScore) ? row.matchScore : (effectiveSlCode ? 1 : 0);
      const ripPrecioSinPermiso  = Number.isFinite(row.precioSinPermiso) ? row.precioSinPermiso : effectivePrice;
      const ripPrecioConPermiso  = Number.isFinite(row.precioConPermiso) ? row.precioConPermiso : effectivePrice;

      const currentManifest = existingPkg?.manifestNumber || '';
      const isTransitoria = currentManifest.toLowerCase() === 'consolidacion_transitoria';
      const targetManifestNumberRaw = isTransitoria
        ? 'consolidacion_transitoria'
        : (options?.rowManifestOverrides?.[trackingId] ?? manifestNumber) || row.manifiesto;
      const targetManifestNumber = (targetManifestNumberRaw || '').trim();

      // 🚨 AUTOMATED PRICING GUARD: Detect if a package is being reassigned to a different real manifest.
      // If so, all manual price adjustments, stale cost/pricing overrides, and rounding weights
      // calculated in the source manifest's context are deleted, forcing the package to naturally
      // recalculate clean standard pricing/weights in the target manifest.
      const isManifestChanged = isExisting &&
        currentManifest &&
        currentManifest.toLowerCase() !== 'consolidacion_transitoria' &&
        targetManifestNumber.toLowerCase() !== 'consolidacion_transitoria' &&
        currentManifest.toLowerCase() !== targetManifestNumber.toLowerCase();

      // Core fields — always safe to overwrite (manifest data, weights, prices, route)
      const coreFields: any = {
        // === Identity (SP2 Shipment compatible) ===
        tracking:           trackingId,
        trackingNumber:     trackingId,
        // Searchable variants index for the public scanner (Cloud Function
        // slScannerLookup uses array-contains-any against this field).
        trackingVariants:   buildTrackingVariants(trackingId),
        originalTracking:   trackingId,
        userId:             effectiveSlCode,
        slCode:             effectiveSlCode,
        customerId:         effectiveSlCode,
        // === Customer Info ===
        customerName:       effectiveCustomerName,
        nombre:             row.nombre,
        customerEmail:      contact?.email || '',
        customerDni:        contact?.dni || '',
        // === Package Details ===
        description:        row.descripcion || '',
        descripcion:        row.descripcion || '',
        weight:             row.peso,
        carrier:            'Nova',
        // === Shipping Details ===
        type:               shippingType,
        origin:             originCountry,
        destination:        'Costa Rica',
        destinationCountry: 'Costa Rica',
        // === Manifest / Route ===
        // rowManifestOverrides allows individual rows to target a different manifest
        // (e.g. the Nova "Cambiar manifiesto" action). Falls back to the top-level
        // manifestNumber, which itself falls back to row.manifiesto for safety.
        manifestNumber:     targetManifestNumber,
        manifestId:         targetManifestNumber,
        guia:               row.guia,
        ruta:               effectiveRuta,
        currency:           'USD',
        isPaid:             false,
        paymentStatus:      'pending',
        invoiceReady:       false,
        // === Consolidation ===
        isConsolidated:     isTransitoria ? true : row.consolidacion || false,
        consolidacion:      isTransitoria ? true : row.consolidacion || false,
        // === Permits ===
        requiresPermit:     row.permisos || false,
        permisos:           row.permisos || false,
        // === Source / Metadata ===
        source:             'nova_manifest',
        updatedAt:          serverTimestamp(),
      };

      if (isExisting) {
        if (isManifestChanged) {
          coreFields.pesoRedondeo = deleteField();
          coreFields.cost = deleteField();
          coreFields.price = deleteField();
          coreFields.costCRC = deleteField();
          coreFields.exchangeRate = deleteField();
          coreFields.ajustePrecio = deleteField();
          coreFields.precioSinPermiso = deleteField();
          coreFields.precioConPermiso = deleteField();
          coreFields.diferenciaRedondeo = deleteField();
          coreFields.pesoConsolidacion = deleteField();
        } else {
          coreFields.pesoRedondeo = effectivePesoRedondeo;
          coreFields.cost = effectivePrice;
          coreFields.price = effectivePrice;
          if (tc > 0) {
            coreFields.costCRC = Math.round(effectivePrice * tc);
            coreFields.exchangeRate = tc;
          } else {
            coreFields.costCRC = deleteField();
            coreFields.exchangeRate = deleteField();
          }
          if (adjustment) {
            coreFields.ajustePrecio = adjustment;
          } else {
            coreFields.ajustePrecio = deleteField();
          }
          coreFields.precioSinPermiso = ripPrecioSinPermiso;
          coreFields.precioConPermiso = ripPrecioConPermiso;
          coreFields.diferenciaRedondeo = ripDiferenciaRedondeo;
          coreFields.pesoConsolidacion = ripPesoConsolidacion;
        }
        coreFields.matchSource = ripMatchSource;
        coreFields.matchScore = ripMatchScore;
      } else {
        // Brand new package: no deleteField() allowed!
        coreFields.pesoRedondeo = effectivePesoRedondeo;
        coreFields.cost = effectivePrice;
        coreFields.price = effectivePrice;
        if (tc > 0) {
          coreFields.costCRC = Math.round(effectivePrice * tc);
          coreFields.exchangeRate = tc;
        }
        if (adjustment) {
          coreFields.ajustePrecio = adjustment;
        }
        coreFields.precioSinPermiso = ripPrecioSinPermiso;
        coreFields.precioConPermiso = ripPrecioConPermiso;
        coreFields.diferenciaRedondeo = ripDiferenciaRedondeo;
        coreFields.pesoConsolidacion = ripPesoConsolidacion;
        coreFields.matchSource = ripMatchSource;
        coreFields.matchScore = ripMatchScore;
      }

      if (isExisting) {
        // UPDATE — merge core fields only; preserves status, statusHistory,
        // statusLockedAt, manuallyUpdated set by the scanner or admin.
        const userStamp = options?.updatedBy || 'nova_manifest';
        const updateNote = `Paquete procesado en Nova. Manifiesto: ${targetManifestNumber}, Cliente: ${effectiveSlCode || 'sin cliente'}, Ruta: ${effectiveRuta || 'sin ruta'}.`;
        
        const isEncomiendaMegaMan = targetManifestNumber.toUpperCase().startsWith('ENC-');
        const currentStatus = existingPkg.status || 'customs';
        const shouldPromote = isEncomiendaMegaMan && (
          statusRank(currentStatus) < statusRank('customs') || 
          currentStatus === 'consolidated'
        );
        const targetStatus = shouldPromote ? 'customs' : currentStatus;
        
        batch.set(docRef, {
          ...coreFields,
          ...(shouldPromote ? {
            status: 'customs',
            statusLabel: STATUS_LABELS['customs'],
            statusUpdatedAt: now,
          } : {}),
          statusHistory: arrayUnion({
            status: targetStatus,
            changedAt: now,
            changedBy: userStamp,
            note: updateNote,
            // legacy compatibility:
            timestamp: now,
            updatedBy: userStamp,
            notes: updateNote,
            location: STATUS_LOCATIONS[targetStatus] || 'Miami, FL',
          }),
        }, { merge: true });
        batchUpdated++;
      } else {
        // CREATE — full document with initial status
        const initialStatus = 'customs';
        const userStamp = options?.updatedBy || 'nova_manifest';
        batch.set(docRef, {
          ...coreFields,
          status:          initialStatus,
          statusLabel:     STATUS_LABELS[initialStatus],
          statusHistory:   [{
            status:    initialStatus,
            changedAt: now,
            changedBy: userStamp,
            note:      STATUS_LABELS[initialStatus],
            // legacy compatibility:
            timestamp: now,
            location:  STATUS_LOCATIONS[initialStatus],
            notes:     STATUS_LABELS[initialStatus],
            updatedBy: userStamp,
          }],
          statusUpdatedAt: now,
          createdAt:       serverTimestamp(),
        }, { merge: false });
        batchInserted++;
      }
    }

    try {
      await batch.commit();
      result.inserted += batchInserted;
      result.updated  += batchUpdated;
    } catch {
      result.errors += chunk.length;
    }
  }

  return result;
}

export async function saveEncomiendaManifestRows(
  rows: ManifestRow[],
  manifestNumberRaw: string,
  options?: {
    priceOverrides?: Record<number, { precio: number; pesoRedondeo: number }>;
    computedPrices?: number[];
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }>;
  },
): Promise<number> {
  const manifestNumber = (manifestNumberRaw || '').trim();
  const encomiendaRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row, idx }) => {
      const effRuta = options?.slCodeOverrides?.[idx]?.ruta
        ?? options?.matchOverrides?.[idx]?.ruta
        ?? (row.ruta || '');
      return effRuta === 'Encomiendas';
    });

  if (!encomiendaRows.length) return 0;

  const colRef = collection(db, 'manifest_encomiendas');
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;

  let saved = 0;
  for (let i = 0; i < encomiendaRows.length; i += BATCH_SIZE) {
    const chunk = encomiendaRows.slice(i, i + BATCH_SIZE);
    
    // Fetch packages from Firestore to check if they are in transitory consolidation
    const transitoriaTrackings = new Set<string>();
    await Promise.all(
      chunk
        .filter(({ row }) => Boolean(row.tracking))
        .map(({ row }) => {
          const id = row.tracking.toUpperCase();
          return getDoc(doc(db, 'packages', id))
            .then(s => {
              if (s.exists() && (s.data()?.manifestNumber === 'consolidacion_transitoria' || s.data()?.manifestId === 'consolidacion_transitoria')) {
                transitoriaTrackings.add(id);
              }
            })
            .catch(() => {});
        })
    );

    const batch = writeBatch(db);
    for (const { row, idx } of chunk) {
      if (!row.tracking) continue;
      const trackingId = row.tracking.toUpperCase();
      
      // Skip packages that are currently in transitory consolidation!
      if (transitoriaTrackings.has(trackingId)) {
        continue;
      }
      
      const docRef = doc(colRef, trackingId);
      const priceOverride = (options?.priceOverrides as any)?.[trackingId] ?? options?.priceOverrides?.[idx];
      const price = priceOverride?.precio
        ?? options?.computedPrices?.[idx]
        ?? row.precio;
      const slCode = options?.slCodeOverrides?.[idx]?.slCode
        ?? options?.matchOverrides?.[idx]?.slCode
        ?? (row.slCode || '');
      const customerName = options?.matchOverrides?.[idx]?.fullName
        ?? row.nombreCliente
        ?? row.nombre;
      const data: Omit<EncomiendaManifestRow, 'thirdPartyCost' | 'thirdPartyCostDescription' | 'thirdPartyCostSavedAt' | 'invoiceUpdated' | 'invoiceNumber'> = {
        tracking: trackingId,
        manifestNumber,
        slCode,
        customerName,
        ruta: 'Encomiendas',
        weight: row.peso,
        price,
        description: row.descripcion || '',
        permisos: row.permisos || false,
        consolidacion: row.consolidacion || false,
        savedAt: now,
        updatedAt: now,
      };
      batch.set(docRef, data, { merge: true });
      saved++;
    }
    await batch.commit();
  }
  return saved;
}

export async function updateEncomiendaThirdPartyCost(
  tracking: string,
  cost: number,
  description: string,
): Promise<void> {
  const id = tracking.toUpperCase();
  const now = new Date().toISOString();
  const payload = {
    thirdPartyCost: cost,
    thirdPartyCostDescription: description,
    thirdPartyCostSavedAt: now,
    updatedAt: now,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'manifest_encomiendas', id), payload, { merge: true });
  batch.set(doc(db, 'packages', id), payload, { merge: true });
  await batch.commit();
}

export async function markEncomiendaInvoiceUpdated(
  tracking: string,
  invoiceNumber: string,
  opts?: { invoiceTotal?: number; thirdPartyCost?: number; thirdPartyCostDescription?: string },
): Promise<void> {
  const id = tracking.toUpperCase();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    invoiceUpdated: true,
    invoiceNumber,
    updatedAt: now,
  };
  if (opts?.invoiceTotal !== undefined)          payload.invoiceTotal              = opts.invoiceTotal;
  if (opts?.thirdPartyCost !== undefined)        payload.thirdPartyCost             = opts.thirdPartyCost;
  if (opts?.thirdPartyCostDescription !== undefined) payload.thirdPartyCostDescription = opts.thirdPartyCostDescription;
  const batch = writeBatch(db);
  batch.set(doc(db, 'manifest_encomiendas', id), payload, { merge: true });
  batch.set(doc(db, 'packages', id), payload, { merge: true });
  await batch.commit();
}

export async function syncManifestEncomiendaFromPackages(
  manifestNumber: string,
): Promise<number> {
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  let synced = 0;

  // ── Step 1: read current manifest_encomiendas docs for this manifest ──
  const existingSnap = await getDocs(
    query(collection(db, 'manifest_encomiendas'), where('manifestNumber', '==', manifestNumber))
  );
  // ── Step 2: read only Encomiendas-route packages for this manifest ──
  // Only packages explicitly tagged ruta='Encomiendas' belong in this collection.
  // Non-encomienda packages in the same manifest must never appear here.
  const packagesRef = collection(db, 'packages');
  const pkgSnap = await getDocs(
    query(packagesRef,
      where('manifestNumber', '==', manifestNumber),
      where('ruta', '==', 'Encomiendas'),
    )
  );
  const encomiendas = pkgSnap.docs;
  const legitIds = new Set(encomiendas.map(d => (d.data().tracking || d.id).toUpperCase()));

  // ── Step 3: upsert all legitimate packages ────────────────────────────────
  for (let i = 0; i < encomiendas.length; i += BATCH_SIZE) {
    const chunk = encomiendas.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const pkgDoc of chunk) {
      const p = pkgDoc.data();
      const id = (p.tracking || pkgDoc.id).toUpperCase();
      batch.set(doc(db, 'manifest_encomiendas', id), {
        tracking:      id,
        manifestNumber,
        slCode:        p.slCode || p.userId || '',
        customerName:  p.customerName || p.nombre || '',
        ruta:          'Encomiendas',
        weight:        p.weight ?? p.peso ?? 0,
        price:         p.price ?? p.cost ?? p.precio ?? 0,
        description:   p.description || p.descripcion || '',
        permisos:      p.permisos ?? p.requiresPermit ?? false,
        consolidacion: p.consolidacion ?? p.isConsolidated ?? false,
        status:        p.status ?? '',
        statusLabel:   p.statusLabel ?? '',
        updatedAt:     now,
      }, { merge: true });
      synced++;
    }
    await batch.commit();
  }

  // ── Step 4: reconcile stale docs ─────────────────────────────────────────
  // Docs that exist in manifest_encomiendas for this manifest but are no longer
  // backed by an Encomiendas-route package with manifestNumber === this manifest.
  const staleDocs = existingSnap.docs.filter(d => !legitIds.has(d.id.toUpperCase()));
  if (staleDocs.length > 0) {
    // Fetch the real package doc for each stale tracking in parallel
    const pkgFetches = await Promise.all(
      staleDocs.map(d => getDoc(doc(db, 'packages', d.id.toUpperCase())))
    );

    for (let i = 0; i < staleDocs.length; i += BATCH_SIZE) {
      const chunk = staleDocs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (let j = 0; j < chunk.length; j++) {
        const staleDocRef = doc(db, 'manifest_encomiendas', chunk[j].id.toUpperCase());
        const pkgDoc = pkgFetches[i + j];
        if (pkgDoc.exists()) {
          const p = pkgDoc.data();
          const realManifest = p.manifestNumber || p.manifestId || '';
          const realRuta = (p.ruta as string) || '';
          if (realRuta !== 'Encomiendas') {
            // Package is no longer an encomienda route — remove it from the collection
            batch.delete(staleDocRef);
          } else if (realManifest && realManifest !== manifestNumber) {
            // Package moved to another manifest — update the mirror doc
            batch.update(staleDocRef, { manifestNumber: realManifest, updatedAt: now });
            synced++;
          }
          // If realManifest == manifestNumber AND ruta == Encomiendas — already handled above.
        } else {
          // Package no longer exists in the packages collection — remove orphan
          batch.delete(staleDocRef);
          synced++;
        }
      }
      await batch.commit();
    }
  }

  return synced;
}

export async function syncAllEncomiendaPackages(): Promise<{ synced: number; manifests: number; rutaMismatches: string[] }> {
  const packagesRef = collection(db, 'packages');
  const now = new Date().toISOString();
  const BATCH_SIZE = 400;
  let synced = 0;
  const manifestSet = new Set<string>();
  const rutaMismatches: string[] = [];

  // ── Pass 1: packages explicitly tagged ruta='Encomiendas' ──────────────────
  const snap = await getDocs(query(packagesRef, where('ruta', '==', 'Encomiendas')));
  const coveredTrackings = new Set<string>();

  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const pkgDoc of chunk) {
      const p = pkgDoc.data();
      const id = (p.tracking || pkgDoc.id).toUpperCase();
      const mNum = p.manifestNumber || p.manifestId || '';
      if (mNum) manifestSet.add(mNum);
      coveredTrackings.add(id);
      const mirrorFields: Record<string, unknown> = {
        tracking:      id,
        manifestNumber: mNum,
        slCode:        p.slCode || p.userId || '',
        customerName:  p.customerName || p.nombre || '',
        ruta:          'Encomiendas',
        weight:        p.weight ?? p.peso ?? 0,
        price:         p.price ?? p.cost ?? p.precio ?? 0,
        description:   p.description || p.descripcion || '',
        permisos:      p.permisos ?? p.requiresPermit ?? false,
        consolidacion: p.consolidacion ?? p.isConsolidated ?? false,
        status:        p.status ?? '',
        statusLabel:   p.statusLabel ?? '',
        updatedAt:     now,
      };
      batch.set(doc(db, 'manifest_encomiendas', id), mirrorFields, { merge: true });
      synced++;
    }
    await batch.commit();
  }

  // ── Pass 2: repair packages in manifest_encomiendas with wrong ruta ─────────
  // These are packages added to an encomienda manifest (via Nova or manual entry)
  // whose ruta field in the packages collection is not 'Encomiendas' (e.g. a
  // delivery-route value like 'San Jose Coronado'). We sync their status to
  // manifest_encomiendas and correct their ruta field so Pass 1 catches them next time.
  const existingMirrorSnap = await getDocs(collection(db, 'manifest_encomiendas'));
  const uncoveredMirrorDocs = existingMirrorSnap.docs.filter(
    d => !coveredTrackings.has(d.id.toUpperCase()),
  );

  if (uncoveredMirrorDocs.length > 0) {
    // Batch-fetch the corresponding packages docs
    const chunks: typeof uncoveredMirrorDocs[] = [];
    for (let i = 0; i < uncoveredMirrorDocs.length; i += 30) {
      chunks.push(uncoveredMirrorDocs.slice(i, i + 30));
    }

    for (const chunkDocs of chunks) {
      const trackingIds = chunkDocs.map(d => d.id.toUpperCase());
      // Query packages by tracking field
      const pkgSnap = await getDocs(
        query(packagesRef, where('tracking', 'in', trackingIds)),
      );
      const pkgByTracking = new Map<string, { data: Record<string, unknown>; docId: string }>();
      pkgSnap.docs.forEach(d => {
        const t = (d.data().tracking || d.id).toUpperCase();
        pkgByTracking.set(t, { data: d.data(), docId: d.id });
      });

      const batch = writeBatch(db);
      for (const mirrorDoc of chunkDocs) {
        const tracking = mirrorDoc.id.toUpperCase();
        const entry = pkgByTracking.get(tracking);
        if (!entry) continue;
        const { data: p } = entry;
        const mNum = (p.manifestNumber || p.manifestId || mirrorDoc.data().manifestNumber || '') as string;
        if (mNum) manifestSet.add(mNum);
        // Sync status to manifest_encomiendas — no ruta change on the package;
        // the ruta mismatch is reported as an anomaly for the user to act on.
        batch.set(doc(db, 'manifest_encomiendas', tracking), {
          status:      p.status ?? '',
          statusLabel: p.statusLabel ?? '',
          updatedAt:   now,
        }, { merge: true });
        rutaMismatches.push(tracking);
        synced++;
      }
      await batch.commit();
    }
  }

  return { synced, manifests: manifestSet.size, rutaMismatches };
}

let getPackagesCache: {
  timestamp: number;
  data: Map<string, EncomiendaManifestRow[]>;
} | null = null;

export async function getPackagesForEncomiendas(forceBypassCache = false): Promise<Map<string, EncomiendaManifestRow[]>> {
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  const now = Date.now();
  if (!forceBypassCache && getPackagesCache && (now - getPackagesCache.timestamp) < CACHE_TTL_MS) {
    console.log('[getPackagesForEncomiendas] Returning cached packages data');
    const copiedMap = new Map<string, EncomiendaManifestRow[]>();
    getPackagesCache.data.forEach((val, key) => {
      copiedMap.set(key, [...val]);
    });
    return copiedMap;
  }

  const colRef = collection(db, 'packages');
  const q = query(
    colRef,
    where('ruta', '==', 'Encomiendas'),
    where('status', 'not-in', [
      'delivered', 'processed', 'on_route', 'route', 'in_route',
      'on_rute', 'on-route', 'in-route', 'returned', 'pickup'
    ])
  );
  const snap = await getDocs(q);
  const map = new Map<string, EncomiendaManifestRow[]>();
  
  snap.docs.forEach(d => {
    const p = d.data();
    const manifestNumber = p.manifestNumber || '';
    if (!manifestNumber) return;
    
    const row: EncomiendaManifestRow = {
      tracking: (p.trackingNumber || p.tracking || d.id).toUpperCase(),
      manifestNumber: manifestNumber,
      slCode: p.slCode || p.userId || '',
      customerName: p.customerName || p.nombre || '',
      ruta: p.ruta || 'Encomiendas',
      weight: Number(p.weight ?? p.peso ?? 0),
      price: Number(p.price ?? p.cost ?? p.precio ?? 0),
      description: p.description || p.descripcion || '',
      permisos: p.permisos ?? p.requiresPermit ?? false,
      consolidacion: p.consolidacion ?? p.isConsolidated ?? false,
      savedAt: typeof p.createdAt === 'object' && p.createdAt?.seconds 
        ? new Date(p.createdAt.seconds * 1000).toISOString() 
        : (p.createdAt || new Date().toISOString()),
      updatedAt: typeof p.updatedAt === 'object' && p.updatedAt?.seconds 
        ? new Date(p.updatedAt.seconds * 1000).toISOString() 
        : (p.updatedAt || new Date().toISOString()),
      status: p.status,
      statusLabel: p.statusLabel,
      thirdPartyCost: p.thirdPartyCost ?? 0,
      thirdPartyCostDescription: p.thirdPartyCostDescription ?? '',
      invoiceNumber: p.invoiceNumber ?? '',
      invoiceUpdated: p.invoiceUpdated ?? false,
    };
    
    if (!map.has(manifestNumber)) map.set(manifestNumber, []);
    map.get(manifestNumber)!.push(row);
  });
  
  map.forEach(rows => rows.sort((a, b) => a.customerName.localeCompare(b.customerName)));

  getPackagesCache = {
    timestamp: Date.now(),
    data: map
  };

  const copiedMap = new Map<string, EncomiendaManifestRow[]>();
  map.forEach((val, key) => {
    copiedMap.set(key, [...val]);
  });
  return copiedMap;
}

export async function saveConsolidationManifestRows(
  rows: ManifestRow[],
  manifestNumber: string,
  options?: {
    priceOverrides?: Record<number, { precio: number; pesoRedondeo: number }>;
    computedPrices?: number[];
    slCodeOverrides?: Record<number, { slCode: string; ruta: string }>;
    matchOverrides?: Record<number, { slCode: string; fullName: string; ruta: string }>;
    manifestType?: string;
  },
): Promise<number> {
  const consolidationRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.consolidacion === true);

  if (!consolidationRows.length) return 0;

  const colRef = collection(db, 'manifest_consolidations');
  const now = new Date().toISOString();
  const parts = (options?.manifestType ?? 'usa_air').split('_');
  const origin = parts[0] === 'usa' ? 'Miami, FL' : parts[0] === 'colombia' ? 'Bogotá, Colombia' : parts[0] === 'china' ? 'Guangzhou, China' : 'Internacional';
  const BATCH_SIZE = 400;

  let saved = 0;
  for (let i = 0; i < consolidationRows.length; i += BATCH_SIZE) {
    const chunk = consolidationRows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const { row, idx } of chunk) {
      if (!row.tracking) continue;
      const trackingId = row.tracking.toUpperCase();
      const docRef = doc(colRef, trackingId);
      const priceOverride = (options?.priceOverrides as any)?.[trackingId] ?? options?.priceOverrides?.[idx];
      const price = priceOverride?.precio
        ?? options?.computedPrices?.[idx]
        ?? row.precio;
      const slCode = options?.slCodeOverrides?.[idx]?.slCode
        ?? options?.matchOverrides?.[idx]?.slCode
        ?? (row.slCode || '');
      const customerName = options?.matchOverrides?.[idx]?.fullName
        ?? row.nombreCliente
        ?? row.nombre;
      const data: Omit<ConsolidationManifestRow, 'updatedManifest' | 'manifestUpdatedAt' | 'status' | 'statusLabel' | 'invoiceNumber'> = {
        tracking: trackingId,
        manifestNumber,
        slCode,
        customerName,
        ruta: options?.slCodeOverrides?.[idx]?.ruta ?? options?.matchOverrides?.[idx]?.ruta ?? (row.ruta || ''),
        weight: row.peso,
        price,
        description: row.descripcion || '',
        permisos: row.permisos || false,
        consolidacion: true,
        origin,
        savedAt: now,
        updatedAt: now,
      };
      batch.set(docRef, data, { merge: true });
      saved++;
    }
    await batch.commit();
  }
  return saved;
}

export async function updateConsolidationManifest(
  tracking: string,
  newManifest: string,
): Promise<void> {
  const id = tracking.toUpperCase();
  const now = new Date().toISOString();
  const payload = {
    updatedManifest: newManifest,
    manifestUpdatedAt: now,
    updatedAt: now,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'manifest_consolidations', id), payload, { merge: true });
  batch.set(doc(db, 'packages', id), payload, { merge: true });
  await batch.commit();
}

export async function createOrGetTempCustomer(
  name: string,
  originalSlCode?: string,
  source = 'encomiendas_label',
  ruta?: string,
  email?: string,
  phone?: string,
  consolidationEnabled?: boolean,
): Promise<TempCustomerRecord> {
  const tempColRef = collection(db, 'temp_customers');
  const nameFolded = name.trim().toUpperCase();
  const now = new Date().toISOString();

  const applyUpdate = async (ref: ReturnType<typeof doc>, existing: TempCustomerRecord): Promise<TempCustomerRecord> => {
    const patch: Partial<TempCustomerRecord> & { updatedAt: string } = { updatedAt: now };
    if (ruta && ruta !== existing.ruta) patch.ruta = ruta;
    if (email && email !== existing.email) patch.email = email;
    if (phone && phone !== existing.phone) patch.phone = phone;
    if (consolidationEnabled !== undefined && consolidationEnabled !== existing.consolidationEnabled)
      patch.consolidationEnabled = consolidationEnabled;
    if (Object.keys(patch).length > 1) {
      await setDoc(ref, patch, { merge: true });
      return { ...existing, ...patch };
    }
    return existing;
  };

  // 1. Deduplicate by originalSlCode
  if (originalSlCode) {
    const q = query(tempColRef, where('originalSlCode', '==', originalSlCode));
    const snap = await getDocs(q);
    if (!snap.empty) return applyUpdate(snap.docs[0].ref, snap.docs[0].data() as TempCustomerRecord);
  }

  // 2. Deduplicate by normalised name
  const nameQ = query(tempColRef, where('nameFolded', '==', nameFolded));
  const nameSnap = await getDocs(nameQ);
  if (!nameSnap.empty) return applyUpdate(nameSnap.docs[0].ref, nameSnap.docs[0].data() as TempCustomerRecord);

  // 3. Atomically increment counter and write new record
  const metaRef = doc(db, 'temp_customers', '--meta--');
  let record!: TempCustomerRecord;

  await runTransaction(db, async (tx) => {
    const meta = await tx.get(metaRef);
    const lastNumber: number = meta.exists() ? (meta.data().lastNumber ?? 0) : 0;
    const nextNumber = lastNumber + 1;
    const slCode = `SL-NAN-${String(nextNumber).padStart(5, '0')}`;
    record = {
      slCode,
      name: name.trim(),
      nameFolded,
      originalSlCode: originalSlCode ?? '',
      createdAt: now,
      source,
      isTemp: true,
      ...(ruta ? { ruta } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(consolidationEnabled !== undefined ? { consolidationEnabled } : {}),
    };
    tx.set(metaRef, { lastNumber: nextNumber, updatedAt: now }, { merge: true });
    tx.set(doc(tempColRef, slCode), record);
  });

  return record;
}

export async function updateTempCustomerEncomienda(
  slCode: string,
  deliveryAddress: string,
  courierService: string,
): Promise<void> {
  const docRef = doc(db, 'temp_customers', slCode);
  await setDoc(docRef, {
    deliveryAddress: deliveryAddress.trim(),
    courierService:  courierService.trim(),
    encomienda: {
      id:   courierService.trim().toLowerCase().replace(/\s+/g, '-'),
      name: courierService.trim(),
    },
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

