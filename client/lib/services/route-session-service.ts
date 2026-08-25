/**
 * Route Session Service
 *
 * Manages delivery route sessions: check-in (start) and check-out (close).
 * Each session captures odometer, vehicle plate, dashboard photos (AI-verified),
 * fuel level, package list, cash to collect, and timing data.
 *
 * Firestore collection: route_sessions
 */

import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase/config';

function ensureStableNetwork(): void {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    if (!navigator.onLine) {
      throw new Error('No tienes conexión a internet o tu señal es muy inestable. Por favor, conéctate a una red estable e inténtalo de nuevo.');
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PackageDeliveryStatus = 'pending' | 'delivered' | 'returned' | 'attempted' | 'consolidado' | 'consolidated' | 'pickup' | 'retira_oficina' | 'en_ruta';

export interface RouteSessionPackage {
  packageId: string;
  tracking: string;
  customerName?: string;
  slCode?: string;
  weight?: number;
  ruta?: string;
  cashAmount?: number;
  currency?: string;
  costCRC?: number;
  /** Payment method the customer chose (from their profile) */
  paymentMethod?: string;
  isConsolidation?: boolean;
  isPermiso?: boolean;
  invoiceStatus?: string;
  manifestNumber?: string;
  deliveryAddress?: string;
  // ── Audit fields (updated during the session) ──────────────────────────────
  deliveryStatus?: PackageDeliveryStatus;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: string;
  attemptNote?: string;
  signatureUrl?: string;
  /** Amount actually paid in cash by the recipient during delivery */
  cashPaid?: number;
  /** Currency of the cash actually paid (CRC or USD) */
  cashPaidCurrency?: string;
}

// ── Audit event log ───────────────────────────────────────────────────────────

export type AuditEventType =
  | 'session_start'
  | 'delivery'
  | 'return'
  | 'attempted'
  | 'session_close'
  | 'fuel_refill'
  | 'parking_payment'
  | 'toll_payment'
  | 'note';

export interface RouteAuditEvent {
  type: AuditEventType;
  timestamp: string;
  packageId?: string;
  tracking?: string;
  customerName?: string;
  reason?: string;
  note?: string;
  hasSignature?: boolean;
  // Fuel refill fields
  fuelAmountPaid?: number;
  fuelCurrency?: 'CRC' | 'USD';
  fuelKmAtRefill?: number;
  fuelPhotoUrl?: string;
  fuelPhotoPath?: string;
  // Parking fields
  parkingAmountPaid?: number;
  parkingCurrency?: 'CRC' | 'USD';
  parkingNote?: string;
  // Toll fields
  tollAmountPaid?: number;
  tollCurrency?: 'CRC' | 'USD';
  tollNote?: string;
}

// ── Fuel, Parking & Toll event data ───────────────────────────────────────────

export interface FuelRefillEvent {
  kmAtRefill: number;
  amountPaid: number;
  currency: 'CRC' | 'USD';
  dashPhotoUrl?: string;
  dashPhotoPath?: string;
  note?: string;
  recordedAt: string;
}

export interface ParkingPaymentEvent {
  amountPaid: number;
  currency: 'CRC' | 'USD';
  note?: string;
  recordedAt: string;
}

export interface TollPaymentEvent {
  amountPaid: number;
  currency: 'CRC' | 'USD';
  note?: string;
  recordedAt: string;
}

export interface UndeliveredJustification {
  packageId: string;
  tracking: string;
  customerName?: string;
  reason: string;
  /** Optional driver note for this specific non-delivery */
  note?: string;
}

/**
 * Rich faltante resolution — captures WHY the package wasn't delivered
 * and what the NEXT ACTION should be (so admin can process it correctly).
 */
export type FaltanteCategory =
  // Returns to warehouse to be consolidated with future manifests
  | 'consolidacion'
  // Operational return reasons
  | 'cliente_ausente'       // person wasn't home
  | 'no_pago'               // client refused / didn't pay
  | 'direccion_incorrecta'  // wrong address / can't find location
  | 'paquete_danado'        // package damaged during transit
  | 'rechazado_cliente'     // client rejected the package
  | 'otro';                 // other reason (requires note)

export interface FaltanteResolution {
  packageId: string;
  tracking: string;
  customerName?: string;
  slCode?: string;
  /** High-level categorization driving admin action */
  category: FaltanteCategory;
  /** Free-text note (required when category === 'otro') */
  note?: string;
  /** ISO timestamp when this resolution was recorded */
  resolvedAt: string;
  /** Session ID this came from */
  sessionId?: string;
  /** Manifest / route name for admin cross-referencing */
  routeName?: string;
}


export interface DashboardAIResult {
  kmReading?: number;
  fuelLevel?: string;
  fuelLevelPercent?: number;
  confidence: number;
  rawText?: string;
  discrepancy?: number;
  notes?: string;
}

// ── Session Report (generated at session close) ────────────────────────────────

export interface SessionReport {
  totalPackages: number;
  deliveredCount: number;
  returnedCount: number;
  faltanteCount: number;
  deliveryRate: number;
  kmDriven: number;
  durationMinutes: number;
  cashCollectedCRC: number;
  cashCollectedUSD: number;
  sinpeCollectedCRC?: number;
  sinpeCollectedUSD?: number;
  transferCollectedCRC?: number;
  transferCollectedUSD?: number;
  totalClients?: number;
  deliveredClients?: number;
  faltanteDetail: Array<{
    packageId: string;
    tracking: string;
    customerName?: string;
    category: string;
    note?: string;
  }>;
  generatedAt: string;
}

// ── Admin Notification ─────────────────────────────────────────────────────────

export interface AdminNotification {
  id?: string;
  sessionId: string;
  driverId: string;
  message: string;
  sentAt: string;
  sentBy: string;
  readAt?: string;
}



export interface RouteSession {
  id?: string;
  routeId: string;
  routeName: string;
  driverId: string;
  driverName: string;

  vehiclePlate: string;

  // ── Start (check-in) ───────────────────────────────────────────────────────
  startKm: number;
  startKmAI?: number;
  startFuelLevel?: string;
  startFuelLevelPercent?: number;
  startPhotoUrl?: string;
  startPhotoStoragePath?: string;
  startAIResult?: DashboardAIResult;
  startAt?: string;

  // ── Packages ──────────────────────────────────────────────────────────────
  packages: RouteSessionPackage[];
  totalPackages: number;
  totalWeight: number;
  cashToCollect: number;
  cashCurrency: string;

  // ── End (check-out) ───────────────────────────────────────────────────────
  endKm?: number;
  endKmAI?: number;
  endFuelLevel?: string;
  endFuelLevelPercent?: number;
  endPhotoUrl?: string;
  endPhotoStoragePath?: string;
  endAIResult?: DashboardAIResult;
  endAt?: string;
  kmDriven?: number;

  undelivered?: UndeliveredJustification[];
  /** Rich per-package faltante resolutions — the source of truth for admin reasignacion */
  undeliveredResolutions?: FaltanteResolution[];
  deliveredCount?: number;
  undeliveredCount?: number;

  /** Immutable session summary generated at close time */
  report?: SessionReport;

  // ── Audit trail ───────────────────────────────────────────────────────────
  events?: RouteAuditEvent[];

  // ── Fuel level at start ───────────────────────────────────────────────────
  startFuelPercent?: number;          // 0-100 set by driver
  startFuelPhotoUrl?: string;         // optional dashboard photo
  startFuelPhotoPath?: string;

  // ── In-route events ───────────────────────────────────────────────────────
  fuelRefills?: FuelRefillEvent[];    // all fuel top-ups during this session
  parkingPayments?: ParkingPaymentEvent[]; // all parking paid during session
  tollPayments?: TollPaymentEvent[];       // all toll payments during session

  // ── Meta ──────────────────────────────────────────────────────────────────
  status: 'open' | 'closed';
  skippedCheckIn?: boolean;
  skippedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

const COLLECTION = 'route_sessions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowISO(): string {
  return new Date().toISOString();
}

function tsToISO(ts: any): string | undefined {
  if (!ts) return undefined;
  if (typeof ts === 'string') return ts;
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  return undefined;
}

export function docToSession(id: string, data: any): RouteSession {
  return {
    ...data,
    id,
    startAt:   tsToISO(data.startAt)   ?? data.startAt,
    endAt:     tsToISO(data.endAt)     ?? data.endAt,
    createdAt: tsToISO(data.createdAt) ?? data.createdAt,
    updatedAt: tsToISO(data.updatedAt) ?? data.updatedAt,
  } as RouteSession;
}

// ── Photo upload ──────────────────────────────────────────────────────────────

export async function uploadDashboardPhoto(
  sessionId: string,
  base64Data: string,
  phase: 'start' | 'end',
): Promise<{ url: string; path: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const path = `route_sessions/${date}/${sessionId}/${phase}_dashboard.jpg`;
  const sRef = storageRef(storage, path);

  const dataUrl = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/jpeg;base64,${base64Data}`;

  await uploadString(sRef, dataUrl, 'data_url');
  const url = await getDownloadURL(sRef);
  return { url, path };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createRouteSession(
  data: Omit<RouteSession, 'id' | 'createdAt' | 'updatedAt'> & { startPhotoBase64?: string },
): Promise<string> {
  ensureStableNetwork();
  const { startPhotoBase64, ...rest } = data;
  const docRef = doc(collection(db, COLLECTION));
  const sessionId = docRef.id;

  let startPhotoUrl: string | undefined;
  let startPhotoStoragePath: string | undefined;

  if (startPhotoBase64) {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = `route_sessions/${date}/${sessionId}/start_dashboard.jpg`;
      const { ref, uploadString, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('@/lib/firebase/config');
      const storageRef = ref(storage, path);
      const rawBase64 = startPhotoBase64.includes(',')
        ? startPhotoBase64.split(',')[1]
        : startPhotoBase64;
      await uploadString(storageRef, rawBase64, 'base64', {
        contentType: 'image/jpeg',
      });
      startPhotoUrl = await getDownloadURL(storageRef);
      startPhotoStoragePath = path;
    } catch (err) {
      console.error('[route-session] Failed to upload start photo:', err);
    }
  }

  await setDoc(docRef, {
    ...rest,
    ...(startPhotoUrl ? { startPhotoUrl, startPhotoStoragePath } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return sessionId;
}

export async function updateRouteSession(
  sessionId: string,
  data: Partial<RouteSession>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, sessionId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Anula las facturas asociadas a un tracking en un manifiesto específico
 */
async function annulAssociatedInvoices(tracking: string, manifestNumber: string): Promise<{
  invoicedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
} | null> {
  const trk = tracking.toUpperCase().trim();
  const mn = manifestNumber.trim();
  if (!trk || !mn) return null;
  let firstInvoicedAt: string | null = null;
  let invoiceId: string | null = null;
  let invoiceNumber: string | null = null;
  try {
    console.info(`[RouteSessionService] Anulando factura vinculada a tracking ${trk} en manifiesto ${mn} por consolidación.`);
    const q = query(
      collection(db, 'invoices'),
      where('trackingNumbers', 'array-contains', trk),
      where('manifestNumber', '==', mn)
    );
    const snap = await getDocs(q);
    for (const invDoc of snap.docs) {
      const data = invDoc.data();
      invoiceId = invDoc.id;
      invoiceNumber = data.invoiceNumber || null;
      if (data.createdAt) {
        firstInvoicedAt = typeof data.createdAt.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : String(data.createdAt);
      }
      if (data.status !== 'annulled' && data.status !== 'cancelled' && data.status !== 'void') {
        await updateDoc(invDoc.ref, {
          status: 'annulled',
          annulledAt: nowISO(),
          annulledBy: 'driver_consolidation',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err: any) {
    console.warn(`[RouteSessionService] Error annulling invoices for tracking ${trk}:`, err.message);
  }
  return { invoicedAt: firstInvoicedAt, invoiceId, invoiceNumber };
}

/**
 * Inserta un registro espejo en la colección manifest_consolidation
 */
async function mirrorToManifestConsolidation(
  tracking: string,
  pkg: any,
  manifestNumber: string,
  now: string
): Promise<void> {
  const id = tracking.toUpperCase();
  try {
    console.info(`[RouteSessionService] Insertando registro en manifest_consolidation para tracking ${id} (Origen: ${manifestNumber}).`);
    const cItem = {
      tracking: id,
      slCode: pkg.slCode || '',
      customerName: pkg.customerName || '',
      ruta: pkg.ruta || '',
      weight: Number(pkg.weight ?? pkg.peso ?? 0),
      price: Number(pkg.cashAmount ?? pkg.precio ?? pkg.price ?? 0),
      currency: pkg.currency || 'USD',
      description: pkg.description || pkg.descripcion || '',
      permisos: !!(pkg.isPermiso || pkg.permisos || pkg.requiresPermit),
      origin: 'Miami, FL',
      manifestNumber: manifestNumber,
      status: 'consolidated',
      movedAt: now,
      ...(pkg.invoicedAt ? { invoicedAt: pkg.invoicedAt } : {}),
    };
    await setDoc(doc(db, 'manifest_consolidation', id), cItem, { merge: true });
  } catch (err: any) {
    console.warn(`[RouteSessionService] Error writing manifest_consolidation for ${id}:`, err.message);
  }
}

export async function closeRouteSession(
  sessionId: string,
  data: {
    endKm: number;
    endKmAI?: number;
    endFuelLevel?: string;
    endFuelLevelPercent?: number;
    endPhotoUrl?: string;
    endPhotoStoragePath?: string;
    endAIResult?: DashboardAIResult;
    undelivered: UndeliveredJustification[];
    /** Rich resolutions for reasignacion by admin */
    undeliveredResolutions?: FaltanteResolution[];
    deliveredCount: number;
    undeliveredCount: number;
  },
): Promise<void> {
  ensureStableNetwork();
  const session = await getRouteSession(sessionId);
  const kmDriven = session ? Math.max(0, data.endKm - session.startKm) : undefined;
  const now = nowISO();

  // Mark pending packages as 'returned' in the packages array so status is never stale
  const updatedPackages = session?.packages.map(p => {
    if (!p.deliveryStatus || p.deliveryStatus === 'pending') {
      const resolution = data.undeliveredResolutions?.find(r => r.packageId === p.packageId)
        ?? data.undelivered?.find(r => r.packageId === p.packageId);
      return {
        ...p,
        deliveryStatus: 'returned',
        returnedAt: now,
        returnReason: (resolution as any)?.category ?? (resolution as any)?.reason ?? 'session_closed_pending',
        attemptNote: (resolution as any)?.note,
      } as RouteSessionPackage;
    }
    return p;
  }) ?? session?.packages ?? [];

  // ── Build session report ──────────────────────────────────────────────────
  const allPkgs = updatedPackages;
  const delivered = allPkgs.filter(p => p.deliveryStatus === 'delivered');
  const returned  = allPkgs.filter(p => p.deliveryStatus === 'returned');
  const faltante  = data.undelivered ?? [];

  const cashCRC = delivered.reduce((sum, p) =>
    sum + (p.cashPaidCurrency === 'CRC' || !p.cashPaidCurrency ? (p.cashPaid ?? 0) : 0), 0);
  const cashUSD = delivered.reduce((sum, p) =>
    sum + (p.cashPaidCurrency === 'USD' ? (p.cashPaid ?? 0) : 0), 0);

  let durationMinutes = 0;
  if (session?.startAt) {
    durationMinutes = Math.round((Date.now() - new Date(session.startAt).getTime()) / 60000);
  }

  const report: SessionReport = {
    totalPackages:    allPkgs.length,
    deliveredCount:   delivered.length,
    returnedCount:    returned.length,
    faltanteCount:    faltante.length,
    deliveryRate:     allPkgs.length > 0 ? Math.round((delivered.length / allPkgs.length) * 100) : 0,
    kmDriven:         kmDriven ?? 0,
    durationMinutes,
    cashCollectedCRC: cashCRC,
    cashCollectedUSD: cashUSD,
    faltanteDetail:   faltante.map(f => ({
      packageId:    f.packageId,
      tracking:     f.tracking,
      customerName: f.customerName,
      category:     f.reason,
      note:         (f as any).note,
    })),
    generatedAt: now,
  };

  const rawPayload = {
    ...data,
    packages: updatedPackages,
    kmDriven: kmDriven ?? 0,
    report,
    endAt: now,
    status: 'closed',
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, COLLECTION, sessionId), sanitizeFirestoreData(rawPayload));

  // Also update each faltante package doc so admins can query across packages collection safely
  const resolutionsToApply = (data.undeliveredResolutions && data.undeliveredResolutions.length > 0)
    ? data.undeliveredResolutions.map(r => ({
        packageId: r.packageId,
        status: r.category === 'consolidacion' ? 'consolidacion' : 'returned',
        returnReason: r.category,
        returnNote: r.note ?? null,
        lastSessionId: sessionId,
        returnedAt: r.resolvedAt ?? now,
        pendingReasignacion: r.category !== 'consolidacion',
      }))
    : (data.undelivered ?? []).map(u => ({
        packageId: u.packageId,
        status: u.reason === 'consolidacion' ? 'consolidacion' : 'returned',
        returnReason: u.reason,
        returnNote: u.note ?? null,
        lastSessionId: sessionId,
        returnedAt: now,
        pendingReasignacion: u.reason !== 'consolidacion',
      }));

  for (const item of resolutionsToApply) {
    if (!item.packageId) continue;
    try {
      const isConsol = item.status === 'consolidacion';
      const updatePayload: Record<string, any> = {
        status: item.status,
        returnReason: item.returnReason,
        returnNote: item.returnNote,
        lastSessionId: sessionId,
        returnedAt: item.returnedAt,
        pendingReasignacion: item.pendingReasignacion,
        updatedAt: serverTimestamp(),
      };

      let annulRes: any = null;
      if (isConsol) {
        updatePayload.consolidacion = true;
        updatePayload.manifestNumber = 'consolidacion_transitoria';
        updatePayload.manifestId = 'consolidacion_transitoria';
        updatePayload.smartwebSyncSource = 'transitoria';
        updatePayload.smartwebSynced = false;
        updatePayload.invoiceId = deleteField();
        updatePayload.invoiceNumber = deleteField();
        updatePayload.invoiceStatus = deleteField();

        const originalPkg = session?.packages.find(p => isPackageMatch(p, { packageId: item.packageId } as any));
        const trackingNum = (originalPkg?.tracking || item.packageId || '').toUpperCase().trim();
        const manifestNumber = originalPkg?.manifestNumber || '';
        annulRes = await annulAssociatedInvoices(trackingNum, manifestNumber);
        if (annulRes?.invoicedAt) {
          updatePayload.invoicedAt = annulRes.invoicedAt;
        }
        if (annulRes?.invoiceId) {
          updatePayload.annulledInvoiceId = annulRes.invoiceId;
        }
        if (annulRes?.invoiceNumber) {
          updatePayload.annulledInvoiceNumber = annulRes.invoiceNumber;
        }
        if (annulRes?.invoiceId || annulRes?.invoiceNumber) {
          updatePayload.annulledAt = now;
        }
      }

      await setDoc(
        doc(db, 'packages', item.packageId),
        sanitizeFirestoreData(updatePayload),
        { merge: true },
      );

      if (isConsol) {
        const originalPkg = session?.packages.find(p => isPackageMatch(p, { packageId: item.packageId } as any));
        const trackingNum = (originalPkg?.tracking || item.packageId || '').toUpperCase().trim();
        const manifestNumber = originalPkg?.manifestNumber || '';
        const mergedPkg = { ...(originalPkg || {}), ...(annulRes?.invoicedAt ? { invoicedAt: annulRes.invoicedAt } : {}) };
        await mirrorToManifestConsolidation(trackingNum, mergedPkg, manifestNumber, now);
      }
    } catch (err) {
      console.warn(`[closeRouteSession] Could not update package doc ${item.packageId}:`, err);
    }
  }
}

// ── Admin → Driver notifications ──────────────────────────────────────────────

/**
 * Admin sends a real-time notification to a driver mid-session.
 * Stored in route_sessions/{sessionId}/notifications/{notifId}
 */
export async function sendAdminNotification(
  sessionId: string,
  message: string,
  sentBy: string,
  driverId: string,
): Promise<string> {
  const notifRef = doc(collection(db, COLLECTION, sessionId, 'notifications'));
  const payload: AdminNotification = {
    id: notifRef.id,
    sessionId,
    driverId,
    message,
    sentAt: nowISO(),
    sentBy,
  };
  await setDoc(notifRef, payload);
  return notifRef.id;
}

/**
 * Subscribe to real-time notifications for a session (driver side).
 * Returns the unsubscribe function.
 */
export function subscribeToAdminNotifications(
  sessionId: string,
  callback: (notifications: AdminNotification[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION, sessionId, 'notifications'),
    orderBy('sentAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, snap => {
    const notifs: AdminNotification[] = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as AdminNotification));
    callback(notifs);
  });
}

/**
 * Mark a notification as read by the driver.
 */
export async function markNotificationRead(
  sessionId: string,
  notificationId: string,
): Promise<void> {
  await updateDoc(
    doc(db, COLLECTION, sessionId, 'notifications', notificationId),
    { readAt: nowISO() },
  );
}

/**
 * Subscribe to ALL open sessions (admin side — for the Entregas spreadsheet view).
 */
export function subscribeToAllOpenSessions(
  callback: (sessions: RouteSession[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => docToSession(d.id, d.data())));
  });
}

/**
 * Subscribe to recent closed sessions (admin Entregas view — last N days).
 */
export function subscribeToRecentSessions(
  callback: (sessions: RouteSession[]) => void,
  limitCount = 100,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => docToSession(d.id, d.data())));
  });
}


// ── Delivery event helpers ────────────────────────────────────────────────────

type ReturnType = 'returned' | 'consolidacion' | 'retira_oficina';
type DeliveryAction = 'delivery' | 'return' | 'attempted';

interface DeliveryOpts {
  reason?: string;
  note?: string;
  signatureUrl?: string;
  returnType?: ReturnType;
  /** Amount collected in cash / transfer / sinpe from the recipient */
  cashPaid?: number;
  /** Currency of cash received (CRC or USD) */
  cashPaidCurrency?: string;
  /** Payment method chosen during delivery (efectivo, transferencia, sinpe) */
  paymentMethod?: string;
}


/** Strip undefined values — Firestore arrayUnion rejects undefined fields. */
function buildEvent(
  pkg: RouteSessionPackage,
  action: DeliveryAction,
  opts: DeliveryOpts,
  now: string,
): Record<string, any> {
  const ev: Record<string, any> = {
    type: action,
    timestamp: now,
    packageId: pkg.packageId,
    tracking: pkg.tracking,
    hasSignature: !!opts.signatureUrl,
  };
  if (pkg.customerName)    ev.customerName    = pkg.customerName;
  if (opts.reason)         ev.reason          = opts.reason;
  if (opts.note)           ev.note            = opts.note;
  if (opts.cashPaid != null && opts.cashPaid > 0) {
    ev.cashPaid         = opts.cashPaid;
    ev.cashPaidCurrency = opts.cashPaidCurrency ?? 'CRC';
  }
  if (opts.paymentMethod) {
    ev.paymentMethod = opts.paymentMethod;
  }
  return ev;
}


function buildPkgUpdate(
  action: DeliveryAction,
  opts: DeliveryOpts,
  now: string,
): Record<string, any> {
  const statusMap: Record<DeliveryAction, string> = {
    delivery:  'delivered',
    return:    opts.returnType === 'consolidacion'
                 ? 'consolidated'
                 : opts.returnType === 'retira_oficina'
                   ? 'pickup'
                   : 'returned',
    attempted: 'in_transit',
  };
  const update: Record<string, any> = {
    status:    statusMap[action],
    updatedAt: serverTimestamp(),
  };
  if (action === 'delivery') {
    update.deliveredAt = now;
    if (opts.signatureUrl) update.signatureUrl = opts.signatureUrl;
    if (opts.cashPaid != null && opts.cashPaid > 0) {
      update.cashPaid         = opts.cashPaid;
      update.cashPaidCurrency = opts.cashPaidCurrency ?? 'CRC';
    }
    if (opts.paymentMethod) {
      update.paymentMethod = opts.paymentMethod;
    }
  } else if (action === 'return') {
    update.returnedAt   = now;
    update.returnReason = opts.reason || '';
    if (opts.returnType) {
      update.returnType = opts.returnType;
      if (opts.returnType === 'consolidacion') {
        update.consolidacion = true;
        update.manifestNumber = 'consolidacion_transitoria';
        update.manifestId = 'consolidacion_transitoria';
        update.smartwebSyncSource = 'transitoria';
        update.smartwebSynced = false;
        update.invoiceId = deleteField();
        update.invoiceNumber = deleteField();
        update.invoiceStatus = deleteField();
      }
    }
  } else {
    update.lastAttemptAt   = now;
    update.lastAttemptNote = opts.note || opts.reason || '';
  }
  return update;
}


function applyStatusToSessionPkg(
  p: RouteSessionPackage,
  action: DeliveryAction,
  opts: DeliveryOpts,
  now: string,
): RouteSessionPackage {
  const base = { ...p };
  if (action === 'delivery') {
    base.deliveryStatus = 'delivered';
    base.deliveredAt    = now;
    if (opts.signatureUrl) base.signatureUrl = opts.signatureUrl;
    if (opts.cashPaid != null && opts.cashPaid > 0) {
      base.cashPaid         = opts.cashPaid;
      base.cashPaidCurrency = opts.cashPaidCurrency ?? 'CRC';
    }
    if (opts.paymentMethod) {
      base.paymentMethod = opts.paymentMethod;
    }
  } else if (action === 'return') {
    base.deliveryStatus = opts.returnType === 'consolidacion'
      ? 'consolidado'
      : opts.returnType === 'retira_oficina'
        ? 'pickup'
        : 'returned';
    base.returnedAt     = now;
    base.returnReason   = opts.reason || '';
  } else {
    base.deliveryStatus = 'attempted';
    base.attemptNote    = opts.note || opts.reason || '';
  }
  return base;
}


// ── Single package delivery event ─────────────────────────────────────────────

/**
 * Record a delivery / return / attempted event on the session.
 * Atomically updates both the session doc and the canonical package doc.
 */
function isPackageMatch(p: RouteSessionPackage, pkg: RouteSessionPackage): boolean {
  if (pkg.packageId && (p.packageId === pkg.packageId || (p as any).id === pkg.packageId || p.tracking === pkg.packageId)) return true;
  if (pkg.tracking && (p.tracking === pkg.tracking || (p as any).trackingNumber === pkg.tracking || p.packageId === pkg.tracking)) return true;
  if ((pkg as any).id && (p.packageId === (pkg as any).id || (p as any).id === (pkg as any).id || p.tracking === (pkg as any).id)) return true;
  return false;
}

export async function recordDeliveryEvent(
  sessionId: string,
  pkg: RouteSessionPackage,
  action: DeliveryAction,
  opts: DeliveryOpts = {},
): Promise<void> {
  ensureStableNetwork();
  const session = await getRouteSession(sessionId);
  if (!session) throw new Error('Session not found');

  const now = nowISO();

  const updatedPackages = session.packages.map((p) =>
    isPackageMatch(p, pkg) ? applyStatusToSessionPkg(p, action, opts, now) : p,
  );

  const deliveredCount = updatedPackages.filter(p => p.deliveryStatus === 'delivered').length;
  const undeliveredCount = updatedPackages.filter(
    p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted' || p.deliveryStatus === 'consolidado' || p.deliveryStatus === 'consolidated' || p.deliveryStatus === 'pickup' || p.deliveryStatus === 'retira_oficina',
  ).length;

  const sessionRef = doc(db, COLLECTION, sessionId);

  // 1. Update route session doc first
  await updateDoc(sessionRef, {
    packages: updatedPackages,
    deliveredCount,
    undeliveredCount,
    events: arrayUnion(buildEvent(pkg, action, opts, now)),
    updatedAt: serverTimestamp(),
  });

  // 2. Annul invoice and get annulResult first (if consolidation)
  let annulResult: { invoicedAt: string | null; invoiceId: string | null; invoiceNumber: string | null } | null = null;
  const originalPkg = session.packages?.find(p => isPackageMatch(p, pkg));
  const trackingNum = (originalPkg?.tracking || pkg.tracking || '').toUpperCase().trim();
  const manifestNum = originalPkg?.manifestNumber || pkg.manifestNumber || '';
  if (action === 'return' && opts.returnType === 'consolidacion' && trackingNum && manifestNum) {
    annulResult = await annulAssociatedInvoices(trackingNum, manifestNum);
  }

  // 3. Update canonical package doc safely (merge: true prevents NOT_FOUND error from failing session update)
  const pkgUpdate = buildPkgUpdate(action, opts, now);
  if (annulResult?.invoicedAt) {
    pkgUpdate.invoicedAt = annulResult.invoicedAt;
  }
  if (annulResult?.invoiceId) {
    pkgUpdate.annulledInvoiceId = annulResult.invoiceId;
  }
  if (annulResult?.invoiceNumber) {
    pkgUpdate.annulledInvoiceNumber = annulResult.invoiceNumber;
  }
  if (annulResult?.invoiceId || annulResult?.invoiceNumber) {
    pkgUpdate.annulledAt = now;
  }
  const targetDocIds = Array.from(new Set([pkg.packageId, (pkg as any).id, pkg.tracking].filter(Boolean) as string[]));
  for (const docId of targetDocIds) {
    try {
      const pRef = doc(db, 'packages', docId);
      await setDoc(pRef, pkgUpdate, { merge: true });
    } catch (err) {
      console.warn(`[RouteSessionService] Could not update package doc ${docId}:`, err);
    }
  }

  // 4. Apply mirror consolidation once per scan using rich session metadata
  if (action === 'return' && opts.returnType === 'consolidacion' && trackingNum && manifestNum) {
    const mergedPkg = { ...(originalPkg || pkg), ...(annulResult?.invoicedAt ? { invoicedAt: annulResult.invoicedAt } : {}) };
    await mirrorToManifestConsolidation(trackingNum, mergedPkg, manifestNum, now);
  }
}

// ── Bulk delivery event ───────────────────────────────────────────────────────

/**
 * Write ALL packages in a single atomic batch.
 * Use for "Entregar todos" and bulk-return flows.
 */
export async function recordBulkDeliveryEvent(
  sessionId: string,
  pkgs: RouteSessionPackage[],
  action: DeliveryAction,
  opts: DeliveryOpts = {},
): Promise<void> {
  ensureStableNetwork();
  if (pkgs.length === 0) return;

  const session = await getRouteSession(sessionId);
  if (!session) throw new Error('Session not found');

  const now = nowISO();

  const updatedPackages = session.packages.map((p) => {
    const matched = pkgs.some(pkg => isPackageMatch(p, pkg));
    return matched ? applyStatusToSessionPkg(p, action, opts, now) : p;
  });

  const deliveredCount = updatedPackages.filter(p => p.deliveryStatus === 'delivered').length;
  const undeliveredCount = updatedPackages.filter(
    p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted' || p.deliveryStatus === 'consolidado' || p.deliveryStatus === 'consolidated' || p.deliveryStatus === 'pickup' || p.deliveryStatus === 'retira_oficina',
  ).length;

  const events = pkgs.map(pkg => buildEvent(pkg, action, opts, now));
  const sessionRef = doc(db, COLLECTION, sessionId);

  // 1. Update route session doc first
  await updateDoc(sessionRef, {
    packages: updatedPackages,
    deliveredCount,
    undeliveredCount,
    events: arrayUnion(...events),
    updatedAt: serverTimestamp(),
  });

  // 2. Annul invoice and collect annulResult per package first (if consolidation)
  const annulResultsMap = new Map<string, { invoicedAt: string | null; invoiceId: string | null; invoiceNumber: string | null }>();
  if (action === 'return' && opts.returnType === 'consolidacion') {
    for (const pkg of pkgs) {
      const originalPkg = session.packages?.find(p => isPackageMatch(p, pkg));
      const trackingNum = (originalPkg?.tracking || pkg.tracking || '').toUpperCase().trim();
      const manifestNum = originalPkg?.manifestNumber || pkg.manifestNumber || '';
      if (trackingNum && manifestNum) {
        const res = await annulAssociatedInvoices(trackingNum, manifestNum);
        if (res) {
          annulResultsMap.set(trackingNum, res);
        }
      }
    }
  }

  // 3. Update canonical package docs safely
  for (const pkg of pkgs) {
    const targetDocIds = Array.from(new Set([pkg.packageId, (pkg as any).id, pkg.tracking].filter(Boolean) as string[]));
    const originalPkg = session.packages?.find(p => isPackageMatch(p, pkg));
    const trackingNum = (originalPkg?.tracking || pkg.tracking || '').toUpperCase().trim();
    
    const pkgUpdate = buildPkgUpdate(action, opts, now);
    const res = annulResultsMap.get(trackingNum);
    if (res?.invoicedAt) {
      pkgUpdate.invoicedAt = res.invoicedAt;
    }
    if (res?.invoiceId) {
      pkgUpdate.annulledInvoiceId = res.invoiceId;
    }
    if (res?.invoiceNumber) {
      pkgUpdate.annulledInvoiceNumber = res.invoiceNumber;
    }
    if (res?.invoiceId || res?.invoiceNumber) {
      pkgUpdate.annulledAt = now;
    }
    
    for (const docId of targetDocIds) {
      try {
        const pRef = doc(db, 'packages', docId);
        await setDoc(pRef, pkgUpdate, { merge: true });
      } catch (err) {
        console.warn(`[RouteSessionService] Could not update package doc ${docId}:`, err);
      }
    }
  }

  // 4. Apply mirror consolidation once per package in bulk using rich session metadata
  if (action === 'return' && opts.returnType === 'consolidacion') {
    for (const pkg of pkgs) {
      const originalPkg = session.packages?.find(p => isPackageMatch(p, pkg));
      const trackingNum = (originalPkg?.tracking || pkg.tracking || '').toUpperCase().trim();
      const manifestNum = originalPkg?.manifestNumber || pkg.manifestNumber || '';
      if (trackingNum && manifestNum) {
        const res = annulResultsMap.get(trackingNum);
        const invoicedAt = res?.invoicedAt || null;
        const mergedPkg = { ...(originalPkg || pkg), ...(invoicedAt ? { invoicedAt } : {}) };
        await mirrorToManifestConsolidation(trackingNum, mergedPkg, manifestNum, now);
      }
    }
  }
}

// ── Revert Package Consolidation to En Ruta ───────────────────────────────────

/**
 * Reverts a consolidated, pickup, or returned package back to 'pending' (En Ruta) status.
 * Restores its original manifest number, de-annuls any associated invoice if annulled,
 * clears return metadata, and updates both the session doc and the canonical package doc.
 */
export async function revertPackageToRoute(
  sessionId: string,
  pkg: RouteSessionPackage,
  adminName?: string,
): Promise<void> {
  const session = await getRouteSession(sessionId);
  if (!session) throw new Error('Session not found');

  const now = nowISO();

  // Determine original manifest
  const targetManifest =
    (pkg as any).originalManifestNumber ||
    (pkg as any).originalManifestID ||
    (pkg as any).originalManifest ||
    (session.packages?.find(p => isPackageMatch(p, pkg)) as any)?.originalManifestNumber ||
    (session as any).manifestNumbers?.[0] ||
    (pkg.manifestNumber && pkg.manifestNumber !== 'consolidacion_transitoria' ? pkg.manifestNumber : undefined) ||
    '';

  const updatedPackages = session.packages.map((p) => {
    if (!isPackageMatch(p, pkg)) return p;
    const base = { ...p };
    base.deliveryStatus = 'pending';
    delete base.returnedAt;
    delete base.returnReason;
    delete (base as any).returnType;
    delete base.attemptNote;
    delete base.signatureUrl;
    delete (base as any).cashPaid;
    delete (base as any).cashPaidCurrency;
    delete (base as any).paymentMethod;
    base.isConsolidation = false;
    if (targetManifest && targetManifest !== 'consolidacion_transitoria') {
      base.manifestNumber = targetManifest;
    }
    return base;
  });

  const deliveredCount = updatedPackages.filter(p => p.deliveryStatus === 'delivered').length;
  const undeliveredCount = updatedPackages.filter(
    p => p.deliveryStatus === 'returned' || p.deliveryStatus === 'attempted' || p.deliveryStatus === 'consolidado' || p.deliveryStatus === 'consolidated' || p.deliveryStatus === 'pickup' || p.deliveryStatus === 'retira_oficina',
  ).length;

  const eventNote = `Revertida consolidación/retira a En Ruta por ${adminName || 'Admin'}${targetManifest ? `. Manifiesto: ${targetManifest}` : ''}`;
  const auditEv = {
    type: 'note',
    timestamp: now,
    packageId: pkg.packageId,
    tracking: pkg.tracking,
    customerName: pkg.customerName,
    note: eventNote,
  };

  const sessionRef = doc(db, COLLECTION, sessionId);

  // 1. Update session doc
  await updateDoc(sessionRef, {
    packages: updatedPackages,
    deliveredCount,
    undeliveredCount,
    events: arrayUnion(auditEv),
    updatedAt: serverTimestamp(),
  });

  // 2. De-annul associated invoice if annulled
  const trk = pkg.tracking?.toUpperCase()?.trim();
  if (trk) {
    try {
      const invSnap = await getDocs(query(collection(db, 'invoices'), where('trackingNumber', '==', trk)));
      for (const invDoc of invSnap.docs) {
        const invData = invDoc.data();
        if (invData.status === 'annulled') {
          await updateDoc(invDoc.ref, {
            status: 'issued',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      console.warn(`[RouteSessionService] Error de-annulling invoice for tracking ${trk}:`, err);
    }
  }

  // 3. Update canonical package doc safely
  const pkgUpdate: Record<string, any> = {
    status: 'in_transit',
    consolidacion: false,
    isConsolidated: false,
    returnedAt: deleteField(),
    returnReason: deleteField(),
    returnType: deleteField(),
    attemptNote: deleteField(),
    smartwebSynced: false,
    updatedAt: serverTimestamp(),
  };

  if (targetManifest && targetManifest !== 'consolidacion_transitoria') {
    pkgUpdate.manifestNumber = targetManifest;
    pkgUpdate.manifestId = targetManifest;
  }

  const targetDocIds = Array.from(new Set([pkg.packageId, (pkg as any).id, pkg.tracking].filter(Boolean) as string[]));
  for (const docId of targetDocIds) {
    try {
      const pRef = doc(db, 'packages', docId);
      await setDoc(pRef, pkgUpdate, { merge: true });
    } catch (err) {
      console.warn(`[RouteSessionService] Could not update package doc ${docId}:`, err);
    }
  }
}


// ── Queries ───────────────────────────────────────────────────────────────────

export async function getRouteSession(sessionId: string): Promise<RouteSession | null> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, COLLECTION, sessionId));
  if (!snap.exists()) return null;
  return docToSession(snap.id, snap.data());
}

export async function getActiveSession(
  routeId: string,
  driverId: string,
): Promise<RouteSession | null> {
  const q = query(
    collection(db, COLLECTION),
    where('routeId',  '==', routeId),
    where('driverId', '==', driverId),
    where('status',   '==', 'open'),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return docToSession(d.id, d.data());
}

export async function getSessionsForRoute(
  routeId: string,
  limitCount = 20,
): Promise<RouteSession[]> {
  const q = query(
    collection(db, COLLECTION),
    where('routeId', '==', routeId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToSession(d.id, d.data()));
}

export async function getSessionsForDriver(
  driverId: string,
  limitCount = 50,
): Promise<RouteSession[]> {
  const q = query(
    collection(db, COLLECTION),
    where('driverId', '==', driverId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToSession(d.id, d.data()));
}

export function subscribeToSession(
  sessionId: string,
  callback: (session: RouteSession | null) => void,
): () => void {
  return onSnapshot(doc(db, COLLECTION, sessionId), (snap) => {
    if (!snap.exists()) { callback(null); return; }
    callback(docToSession(snap.id, snap.data()));
  });
}

// ── Admin management helpers ──────────────────────────────────────────────────

/**
 * Force-close an open session from the admin dashboard.
 * Marks it closed with an admin note; does NOT generate a full report
 * (that requires driver end-odometer/photos). Sets a flag so the driver
 * knows it was closed externally.
 */
export async function forceCloseSession(
  sessionId: string,
  adminName: string,
  note?: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, sessionId);
  await updateDoc(ref, {
    status: 'closed',
    endAt: nowISO(),
    adminForceClosed: true,
    adminForceClosedBy: adminName,
    adminForceClosedNote: note ?? '',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reassign a session to a different driver.
 * Updates driverId + driverName fields in real-time.
 */
export async function reassignSessionDriver(
  sessionId: string,
  newDriverId: string,
  newDriverName: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, sessionId);
  await updateDoc(ref, {
    driverId: newDriverId,
    driverName: newDriverName,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to all packages inside a specific session (live).
 * Returns the packages array from the session document.
 */
export function subscribeToSessionPackages(
  sessionId: string,
  callback: (packages: RouteSessionPackage[]) => void,
): () => void {
  return onSnapshot(doc(db, COLLECTION, sessionId), (snap) => {
    if (!snap.exists()) { callback([]); return; }
    callback((snap.data()?.packages ?? []) as RouteSessionPackage[]);
  });
}

/**
 * Permanently deletes a route session document.
 * Only allowed for sessions with status === 'closed'.
 */
export async function deleteRouteSession(sessionId: string): Promise<void> {
  const sessionRef = doc(db, COLLECTION, sessionId);
  const snap = await import('firebase/firestore').then(({ getDoc }) => getDoc(sessionRef));
  if (!snap.exists()) throw new Error('Sesión no encontrada');
  if (snap.data()?.status === 'open') throw new Error('No se puede eliminar una sesión activa');
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(sessionRef);
}

/**
 * Removes a package/item from a route session by admin request.
 *
 * 1. Reads current route_session document from Firestore.
 * 2. Filters out the package from session.packages array (matching packageId or tracking).
 * 3. Appends an audit note event.
 * 4. Updates session document in Firestore (new packages array, updated totalPackages count).
 * 5. Resets package document state in `packages` collection if matching document exists.
 */
export async function removePackageFromRouteSession(
  sessionId: string,
  targetPackage: RouteSessionPackage,
  removedBy: string = 'Admin',
): Promise<void> {
  if (!sessionId || !targetPackage) return;

  const sessionRef = doc(db, COLLECTION, sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('Sesión no encontrada');

  const data = snap.data() as RouteSession;
  const currentPkgs = data.packages || [];

  const targetId = (targetPackage.packageId || '').trim();
  const targetTracking = (targetPackage.tracking || '').trim().toUpperCase();

  // Filter out matching package
  const updatedPkgs = currentPkgs.filter(p => {
    const pId = (p.packageId || '').trim();
    const pTrk = (p.tracking || '').trim().toUpperCase();
    if (targetId && pId && pId === targetId) return false;
    if (targetTracking && pTrk && pTrk === targetTracking) return false;
    return true;
  });

  const auditEvent = sanitizeFirestoreData({
    type: 'note' as AuditEventType,
    timestamp: new Date().toISOString(),
    packageId: targetPackage.packageId,
    tracking: targetPackage.tracking,
    customerName: targetPackage.customerName,
    note: `Paquete ${targetPackage.tracking} (${targetPackage.customerName || 'Cliente'}) fue eliminado de la sesión por ${removedBy}`,
  });

  const newTotal = updatedPkgs.length;

  await updateDoc(sessionRef, {
    packages: updatedPkgs,
    totalPackages: newTotal,
    updatedAt: serverTimestamp(),
    events: arrayUnion(auditEvent),
  });

  // Also clean up package doc in `packages` collection if present
  try {
    if (targetTracking) {
      const pkgsQ = query(collection(db, 'packages'), where('trackingNumber', '==', targetTracking));
      const pkgSnap = await getDocs(pkgsQ);
      if (!pkgSnap.empty) {
        const batch = writeBatch(db);
        pkgSnap.docs.forEach(docSnap => {
          batch.update(docSnap.ref, {
            routeSessionId: deleteField(),
            activeRouteSessionId: deleteField(),
            status: 'received',
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.warn('[removePackageFromRouteSession] Non-fatal package reset error:', err);
  }
}

// ── Fuel refill recording ─────────────────────────────────────────────────────

/**
 * Appends a fuel refill event to the session.
 * Also uploads dashboard photo to Storage if base64Data is provided.
 */
export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date || (obj as any)?._methodName || (obj as any)?.toMillis) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeFirestoreData(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value !== undefined) {
      result[key] = sanitizeFirestoreData(value);
    }
  }
  return result as T;
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  return sanitizeFirestoreData(obj);
}

/**
 * Appends a fuel refill event to the session.
 * Also uploads dashboard photo to Storage if base64Data is provided.
 */
export async function recordFuelRefill(
  sessionId: string,
  data: Omit<FuelRefillEvent, 'recordedAt'>,
  base64Photo?: string,
): Promise<void> {
  let dashPhotoUrl: string | undefined;
  let dashPhotoPath: string | undefined;

  if (base64Photo) {
    const date = new Date().toISOString().slice(0, 10);
    const path = `route_sessions/${date}/${sessionId}/fuel_${Date.now()}.jpg`;
    const { ref, uploadString, getDownloadURL } = await import('firebase/storage');
    const { storage } = await import('@/lib/firebase/config');
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64Photo.split(',')[1] ?? base64Photo, 'base64', {
      contentType: 'image/jpeg',
    });
    dashPhotoUrl  = await getDownloadURL(storageRef);
    dashPhotoPath = path;
  }

  const event = cleanUndefined<FuelRefillEvent>({
    ...data,
    dashPhotoUrl,
    dashPhotoPath,
    recordedAt: new Date().toISOString(),
  });

  const auditEvent = cleanUndefined({
    type:           'fuel_refill' as AuditEventType,
    timestamp:      event.recordedAt,
    fuelAmountPaid: event.amountPaid,
    fuelCurrency:   event.currency,
    fuelKmAtRefill: event.kmAtRefill,
    fuelPhotoUrl:   dashPhotoUrl,
    fuelPhotoPath:  dashPhotoPath,
    note:           event.note,
  });

  const { arrayUnion } = await import('firebase/firestore');
  const sessionRef = doc(db, COLLECTION, sessionId);
  await updateDoc(sessionRef, {
    fuelRefills: arrayUnion(event),
    updatedAt:   serverTimestamp(),
    events:      arrayUnion(auditEvent),
  });
}

// ── Parking payment recording ─────────────────────────────────────────────────

/**
 * Appends a parking payment event to the session.
 */
export async function recordParkingPayment(
  sessionId: string,
  data: Omit<ParkingPaymentEvent, 'recordedAt'>,
): Promise<void> {
  const event = cleanUndefined<ParkingPaymentEvent>({
    ...data,
    recordedAt: new Date().toISOString(),
  });

  const auditEvent = cleanUndefined({
    type:               'parking_payment' as AuditEventType,
    timestamp:          event.recordedAt,
    parkingAmountPaid:  event.amountPaid,
    parkingCurrency:    event.currency,
    parkingNote:        event.note,
  });

  const { arrayUnion } = await import('firebase/firestore');
  const sessionRef = doc(db, COLLECTION, sessionId);
  await updateDoc(sessionRef, {
    parkingPayments: arrayUnion(event),
    updatedAt:       serverTimestamp(),
    events:          arrayUnion(auditEvent),
  });
}

/**
 * Updates the start fuel percent (and optional photo) on an existing session.
 * Called right after createRouteSession when the driver provides fuel level.
 */
export async function updateSessionStartFuel(
  sessionId: string,
  fuelPercent: number,
  photoUrl?: string,
  photoPath?: string,
): Promise<void> {
  const sessionRef = doc(db, COLLECTION, sessionId);
  await updateDoc(sessionRef, {
    startFuelPercent:   fuelPercent,
    ...(photoUrl  && { startFuelPhotoUrl:  photoUrl }),
    ...(photoPath && { startFuelPhotoPath: photoPath }),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Appends a toll payment event to the session.
 */
export async function recordTollPayment(
  sessionId: string,
  data: Omit<TollPaymentEvent, 'recordedAt'>,
): Promise<void> {
  const event = cleanUndefined<TollPaymentEvent>({
    ...data,
    recordedAt: new Date().toISOString(),
  });

  const auditEvent = cleanUndefined({
    type:            'toll_payment' as AuditEventType,
    timestamp:       event.recordedAt,
    tollAmountPaid:  event.amountPaid,
    tollCurrency:    event.currency,
    tollNote:        event.note,
  });

  const { arrayUnion } = await import('firebase/firestore');
  const sessionRef = doc(db, COLLECTION, sessionId);
  await updateDoc(sessionRef, {
    tollPayments: arrayUnion(event),
    updatedAt:    serverTimestamp(),
    events:       arrayUnion(auditEvent),
  });
}

