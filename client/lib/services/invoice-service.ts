/**
 * Invoice Service
 *
 * Creates invoices in SP1's `invoices` Firestore collection using the same
 * schema that InvoiceGeneration.tsx reads (totalAmount, invoiceItems, customerId…).
 *
 * This makes Nova-created invoices immediately visible in the /invoices page
 * without any additional sync. Email sending uses SP1's sendInvoiceEmailFunction.
 *
 * Consolidation logic mirrors BulkCreateInvoice.tsx from smart-portal-2.
 *
 * ─── PERSISTENCE CONTRACT (AI GUARD — DO NOT VIOLATE) ──────────────────────────
 *
 *  Rule 1 – INVOICES: Automatic processes MAY only delete/replace `draft` invoices.
 *           Invoices in `sent`, `paid`, `overdue`, `cancelled`, `annulled` MUST
 *           NEVER be deleted by any automated flow. Only an explicit admin UI action
 *           (e.g. the merge button in InvoiceGeneration.tsx) may delete non-draft
 *           invoices, and only after user confirmation.
 *
 *  Rule 2 – PACKAGES: Automatic processes (sync, invoice generation) MUST NEVER
 *           delete package documents. Deletion is reserved for the admin Nova UI
 *           row-removal action. Even then, packages in PROTECTED_PKG_STATUSES
 *           ('delivered', 'processed', 'returned', 'pickup') MUST be skipped —
 *           they represent completed or terminal states.
 *
 *  Rule 3 – NO GHOST DATA: UI components must ONLY display Firestore-persisted data.
 *           Local state may be used for optimistic updates but must always be
 *           reconciled with a real-time Firestore query (onSnapshot / refetch).
 *           Never filter real documents out of UI based on local state alone.
 *
 *  Rule 4 – UPDATE OVER CREATE: When a record for the same entity already exists,
 *           use updateDoc() not addDoc(). The createInvoicesFromRows() non-draft
 *           guard enforces this for invoices. processPackage() in SP2 enforces
 *           this for shipments (skip-create-if-not-found).
 *
 * ─── Quick-fix map ─────────────────────────────────────────────────────────────
 *
 *  Issue                           │ Location
 * ─────────────────────────────────┼──────────────────────────────────────────────
 *  Wrong invoice number format      │ generateInvoiceNumber()
 *  Consolidation grouping broken    │ groupRowsForInvoicing() — check key logic
 *  IVA rounding gap (subtotal+iva≠total) │ buildInvoiceData() — ivaUSD formula
 *  amountCRC is NaN / 0 unexpectedly │ buildInvoiceData() — exchangeRate guard
 *  Invoice saved with wrong price   │ buildInvoiceData() — totalUSD = sum of r.precio
 *  Email not sent                   │ sendInvoiceEmails() — clientEmail guard
 *  Duplicate invoices on re-run     │ createInvoicesFromRows() non-draft guard
 *  Customer data missing in invoice │ getCustomersBySlCodes() — chunk size 30
 *  Wrong weight on receipt/email    │ See WEIGHT_DISPLAY_RULE below
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ─── WEIGHT_DISPLAY_RULE (7 regressions — DO NOT CHANGE) ──────────────────────
 *
 *  InvoiceItem.weight must ALWAYS store the REAL peso (r.peso), never pesoRedondeo.
 *  pesoRedondeo = Math.ceil(r.peso); showing it on a receipt displays a rounded-up
 *  weight (e.g. 0.36 → 1.00, 1.2 → 2.00) that does NOT match the actual shipment.
 *
 *  Display rules by invoice type:
 *    ① Price override    → use priceOverride.pesoRedondeo (user explicitly set it)
 *    ② Consolidation     → proportional share of Math.ceil(totalPeso)
 *    ③ Permiso           → pesoRedondeo (permits ARE billed per whole kg)
 *    ④ Regular individual→ r.peso ONLY (real weight)
 *
 *  Enforcement:
 *    • createInvoicesFromRows()   line ~524 → `weight: r.permisos ? pesoRedondeo : r.peso` ✅
 *    • NovaTableModal getItemBilling()      → rule ①–④ enforced with guard   ✅
 *    • buildInvoiceEmailPayload()           → reads item.weight as-stored     ✅
 *    • NovaInvoicePreview normalise()       → reads item.weight as-stored     ✅
 *
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Regression tests: client/lib/services/invoice-service.spec.ts
 */

import { collection, addDoc, deleteDoc, serverTimestamp, getDocs, getDoc, query, where, getCountFromServer, onSnapshot, doc, updateDoc, writeBatch, arrayUnion, deleteField } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import type { ProcessedRow } from '@/hooks/use-nova-chat';
import { deleteInvoiceFromSp2, syncInvoicesToSp2 } from './sync-invoices-service';
import { syncPackagesToSmartWeb } from './sync-smartweb-service';
import { generateInvoiceSearchTokens } from '@/lib/firebase/firestore-client';
import { calculatePrice } from '@/lib/utils/pricing';
import { resolveEffectiveCustomerName } from '@/lib/utils/customer-name';
import {
  getCostaRicaDateParts,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  COSTA_RICA_TIMEZONE,
  parseDateSafe,
} from '@/lib/utils/date-utils';
export {
  getCostaRicaDateParts,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  COSTA_RICA_TIMEZONE,
  parseDateSafe,
};
export type { ProcessedRow };

// ── Customer lookup ────────────────────────────────────────────────────────────

export interface CustomerContactInfo {
  slCode: string;
  email: string;
  phone: string;
  dni: string;
  fullName: string;
  ruta: string;
  consolidationEnabled: boolean;
  electronicInvoiceRequired: boolean;
  encomiendaServiceName: string;
  consolidationEnabledAt?: string | null;
  rutaSetByAdminAt?: string | null;
  routeHistory?: Array<{
    previousRuta: string | null;
    newRuta: string;
    changedAt: string;
    changedBy?: string;
  }> | null;
  defaultAddress?: {
    streetAddress?: string | null;
    details?: string | null;
    district?: string | null;
    canton?: string | null;
    province?: string | null;
    alias?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  } | null;
  consolidationActivatedAt?: string | null;
  consolidationStartedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  lastSyncAt?: string | null;
  modifiedAt?: string | null;
  profileLastUpdatedAt?: string | null;
  addresses?: any[] | null;
}

/**
 * Batch-fetch email + dni for a list of slCodes from SP1 `customers` collection.
 * Returns a map slCode → { email, dni, fullName }.
 *
 * GUARD: Returns empty Map immediately for empty input — avoids a Firestore
 * `in` query with an empty array which throws a Firebase error.
 *
 * GUARD: Firestore `in` is capped at 30 items. Input is chunked automatically.
 * To increase the chunk size, change the constant `30` inside this function.
 */
export async function getCustomersBySlCodes(
  slCodes: string[]
): Promise<Map<string, CustomerContactInfo>> {
  const result = new Map<string, CustomerContactInfo>();
  if (!slCodes.length) return result;

  // Firestore `in` queries are limited to 30 items per call
  const chunks: string[][] = [];
  for (let i = 0; i < slCodes.length; i += 30) chunks.push(slCodes.slice(i, i + 30));

  const customersRef = collection(db, 'customers');
  for (const chunk of chunks) {
    const q = query(customersRef, where('slCode', 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const d = docSnap.data() as {
        slCode?: string;
        email?: string;
        phone?: string;
        phoneNumber?: string;
        dni?: string;
        verifiedDni?: string;
        fullName?: string;
        firstName?: string;
        lastName?: string;
        ruta?: string;
        consolidationEnabled?: boolean;
        electronicInvoiceRequired?: boolean;
        encomienda?: { name?: string } | null;
        courierService?: string;
        encomiendaServiceName?: string;
        encomiendaProvider?: string;
        defaultAddress?: { encomienda?: { name?: string } | null } | null;
        addresses?: Array<{ encomienda?: { name?: string } | null }> | null;
      };
      const code = d.slCode || '';
      if (code) {
        const addresses = d.addresses || [];
        const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
        const enc = d.encomienda || encAddr.encomienda || d.defaultAddress?.encomienda || null;
        // Prefer the top-level mirror (`encomiendaServiceName`) written by
        // `handleAssignEncomienda` — it's atomic and survives even when the
        // scheduled sync transiently rebuilds the `addresses[]` array.
        const encomiendaServiceName = d.encomiendaServiceName || enc?.name || d.courierService || '';
        const info: CustomerContactInfo = {
          slCode: code,
          email: d.email || '',
          phone: d.phone || d.phoneNumber || '',
          dni: d.verifiedDni || d.dni || '',
          fullName: resolveEffectiveCustomerName({
            contactName: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
            slCode: code,
          }),
          ruta: d.ruta || '',
          consolidationEnabled: d.consolidationEnabled === true,
          electronicInvoiceRequired: d.electronicInvoiceRequired === true,
          encomiendaServiceName,
        };
        result.set(code.toUpperCase(), info);
        result.set(code, info);
      }
    });
  }

  return result;
}

/**
 * Real-time variant of getCustomersBySlCodes.
 *
 * Sets up one Firestore onSnapshot listener per 30-item chunk and merges
 * all partial results into a single Map on every change. Fires immediately
 * with the current data, then again on every subsequent Firestore change.
 *
 * Returns an unsubscribe function — pass it as the useEffect cleanup value:
 *   useEffect(() => subscribeCustomersBySlCodes(slCodes, cb), [slCodes]);
 *
 * GAP-FIX: Replaces the one-time getDocs fetch so the Nova table contact map
 * (email, phone, DNI, ruta) stays live while the table is open.
 */
export function subscribeCustomersBySlCodes(
  slCodes: string[],
  callback: (map: Map<string, CustomerContactInfo>) => void,
): () => void {
  if (typeof window !== 'undefined' && (window as any).__playwright_mock_auth__) {
    console.log('[MOCK AUTH] subscribeCustomersBySlCodes called with:', slCodes);
    const mockMap = new Map<string, CustomerContactInfo>();
    slCodes.forEach(code => {
      if (code === 'SL-4859') {
        mockMap.set(code, {
          slCode: 'SL-4859',
          fullName: 'DANIEL ALONSO ARCE BARBOZA',
          email: 'daniel@example.com',
          phone: '8888-8888',
          dni: '1-2345-6789',
          ruta: 'San José',
          consolidationEnabled: true,
          consolidationEnabledAt: '2026-07-29T10:00:00Z',
          routeHistory: [
            {
              previousRuta: 'Desconocida',
              newRuta: 'San José',
              changedAt: '2026-07-29T10:00:00Z',
              adminEmail: 'admin@smartlogisticscr.com'
            }
          ],
          defaultAddress: {
            alias: 'Principal',
            streetAddress: 'De la iglesia 300 metros oeste',
            canton: 'San José',
            province: 'San José'
          }
        } as any);
      }
    });
    setTimeout(() => callback(mockMap), 0);
    return () => {};
  }

  if (!slCodes.length) {
    callback(new Map());
    return () => {};
  }

  const chunks: string[][] = [];
  for (let i = 0; i < slCodes.length; i += 30) chunks.push(slCodes.slice(i, i + 30));

  const partialMaps: Array<Map<string, CustomerContactInfo>> = chunks.map(() => new Map());

  const merge = () => {
    const merged = new Map<string, CustomerContactInfo>();
    partialMaps.forEach(m => m.forEach((v, k) => merged.set(k, v)));
    return merged;
  };

  const customersRef = collection(db, 'customers');
  const unsubscribers = chunks.map((chunk, chunkIdx) => {
    const q = query(customersRef, where('slCode', 'in', chunk));
    return onSnapshot(q, snap => {
      const partial = new Map<string, CustomerContactInfo>();
      snap.forEach(docSnap => {
        const d = docSnap.data() as {
          slCode?: string;
          email?: string;
          phone?: string;
          phoneNumber?: string;
          dni?: string;
          verifiedDni?: string;
          fullName?: string;
          firstName?: string;
          lastName?: string;
          ruta?: string;
          consolidationEnabled?: boolean;
          electronicInvoiceRequired?: boolean;
          encomienda?: { name?: string } | null;
          courierService?: string;
          encomiendaServiceName?: string;
          encomiendaProvider?: string;
          defaultAddress?: any;
          addresses?: Array<{ encomienda?: { name?: string } | null }> | null;
          consolidationEnabledAt?: string | null;
          consolidationActivatedAt?: string | null;
          consolidationStartedAt?: string | null;
          updatedAt?: string | null;
          createdAt?: string | null;
          lastSyncAt?: string | null;
          modifiedAt?: string | null;
          profileLastUpdatedAt?: string | null;
          rutaSetByAdminAt?: string | null;
          routeHistory?: Array<{
            previousRuta: string | null;
            newRuta: string;
            changedAt: string;
            changedBy?: string;
          }> | null;
        };
        const code = d.slCode || '';
        if (code) {
          const addresses = d.addresses || [];
          const encAddr = addresses.find((a: any) => a.encomienda?.name) || addresses[0] || {};
          const enc = d.encomienda || encAddr.encomienda || d.defaultAddress?.encomienda || null;
          // Prefer the top-level mirror written atomically by the
          // EncomiendaManifests assignment flow (survives sync reshuffles).
          const encomiendaServiceName = d.encomiendaServiceName || enc?.name || d.courierService || '';
          partial.set(code, {
            slCode: code,
            email: d.email || '',
            phone: d.phone || d.phoneNumber || '',
            dni: d.verifiedDni || d.dni || '',
            fullName: d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim(),
            ruta: d.ruta || '',
            consolidationEnabled: d.consolidationEnabled === true,
            electronicInvoiceRequired: d.electronicInvoiceRequired === true,
            encomiendaServiceName,
            consolidationEnabledAt: d.consolidationEnabledAt || null,
            consolidationActivatedAt: d.consolidationActivatedAt || null,
            consolidationStartedAt: d.consolidationStartedAt || null,
            updatedAt: d.updatedAt || null,
            createdAt: d.createdAt || null,
            lastSyncAt: d.lastSyncAt || null,
            modifiedAt: d.modifiedAt || null,
            profileLastUpdatedAt: d.profileLastUpdatedAt || null,
            rutaSetByAdminAt: d.rutaSetByAdminAt || null,
            routeHistory: d.routeHistory || null,
            defaultAddress: d.defaultAddress || null,
            addresses: d.addresses || null,
          });
        }
      });
      partialMaps[chunkIdx] = partial;
      callback(merge());
    }, () => { /* non-fatal — network errors handled by Firestore SDK retries */ });
  });

  return () => unsubscribers.forEach(u => u());
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  tracking: string;
  description: string;
  weight: number;
  /** Real shipment peso (r.peso). Always stored so preview + email show actual weight even for consolidation items. */
  realWeight?: number;
  subtotal: number;
  iva: number;
  amount: number;
  currency: string;
  /** True when this item is a permit package (permisos). Preview & email use Math.ceil(weight). */
  isPermiso?: boolean;
  /** True when this item is a manual third-party service charge. */
  isManual?: boolean;
  /** True when this item is generated by the system (Nova suggestions/recalculations) */
  isSystem?: boolean;
  /** The category of system charge, used to prevent collisions during recalculate/save */
  systemType?: 'terceros' | 'bodegaje' | 'permisos';
}

export interface InvoiceRecord {
  id?: string;

  // ── Nova / SP2-style fields ──────────────────────────────────────────────────
  userId: string;
  clientId: string;
  clientName: string;
  clientDni: string;
  clientEmail: string;
  clientRoute: string;
  slCode: string;
  invoiceNumber: string;
  isConsolidation: boolean;
  /** True when created via "Factura única" (individual per-row pricing, merged into one invoice) */
  isMergedSingle?: boolean;
  trackingNumbers?: string[];
  trackingNumber?: string;
  ivaEnabled: boolean;
  subtotal: number;
  subtotalCRC: number;
  iva: number;
  ivaCRC: number;
  ivaRate: number;
  amount: number;
  currency: string;
  amountCRC: number;
  exchangeRate: number;
  items: InvoiceItem[];
  packageCount: number;
  totalWeight: number;
  notes: string;
  createdAt: string;
  updatedAt: string;

  // ── SP1 InvoiceGeneration.tsx-aligned fields (optional for inline previews) ───
  /** Mirrors `totalAmount` used by InvoiceGeneration.tsx */
  totalAmount?: number;
  /** Mirrors `subtotalAmount` used by InvoiceGeneration.tsx */
  subtotalAmount?: number;
  /** Mirrors `taxAmount` (IVA) used by InvoiceGeneration.tsx */
  taxAmount?: number;
  /** Discount percentage (0–100) applied at invoice edit time */
  discountPercentage?: number;
  /** Computed discount amount = subtotalAmount × discountPercentage / 100 */
  discountAmount?: number;
  /** Mirrors `customerId` (= slCode) */
  customerId?: string;
  /** SP1-compatible alias for slCode — queried by searchInvoices() */
  clientSlCode?: string;
  /** ISO invoice date (today) */
  invoiceDate?: string;
  /** ISO due date (+3 days) */
  dueDate?: string;
  /** Mirrors `invoiceItems` array used by InvoiceGeneration.tsx */
  invoiceItems?: Array<{
    description: string;
    trackingNumber: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    weight: number;
    realWeight?: number;
    isManual: boolean;
    isSystem?: boolean;
    systemType?: 'terceros' | 'bodegaje' | 'permisos';
  }>;
  /** Status aligned with SP1 InvoiceStatus enum */
  status?: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'pending';
  /** Origin marker so InvoiceGeneration knows this came from Nova or Maritime */
  source?: 'nova' | 'manual' | 'maritime';
  /** True once the invoice has been successfully synced to SmartWeb (SP2) */
  smartwebSynced?: boolean;
  /** ISO timestamp of last successful SmartWeb sync */
  smartwebSyncedAt?: string | null;
  /** Manifest number(s) derived from the package trackings */
  manifestNumber?: string;
  manifestNumbers?: string[];
  /** Search tokens for name/slCode/invoiceNumber lookup */
  searchTokens?: string[];
  /** Ministerio de Hacienda Costa Rica tax codes */
  medioPago?: string; // '01' (Efectivo) | '02' (Tarjeta) | '03' (Transferencia) | '06' (SINPE) | '99'
  condicionVenta?: string; // '01' (Contado) | '02' (Crédito)
  tipoDocumento?: string; // '01' (Factura electrónica) | '04' (Tiquete electrónico)
  metodoPago?: string; // 'efectivo' | 'transferencia' | 'sinpe' | 'tarjeta'
  /** Nested customer object for InvoiceGeneration.tsx compatibility */
  customer?: {
    id?: string;
    fullName: string;
    email: string;
    phone?: string;
    slCode?: string;
    ruta?: string | null;
  };
}

export interface InvoicePaymentDetails {
  metodoPago?: 'efectivo' | 'transferencia' | 'sinpe' | 'tarjeta' | string;
  medioPagoCode?: '01' | '02' | '03' | '04' | '05' | '06' | '99' | string;
  condicionVentaCode?: '01' | '02' | string;
  tipoDocumentoCode?: '01' | '04' | string;
}

export interface InvoiceGroup {
  slCode: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  clientDni: string;
  clientRoute: string;
  rows: ProcessedRow[];
  /** True when the group was merged via "Factura única" (individual pricing, single invoice) */
  isMergedSingle?: boolean;
}

export interface CreateInvoicesResult {
  created: InvoiceRecord[];
  errors: Array<{ slCode: string; error: string }>;
  /**
   * Groups that were silently skipped (NOT created, NOT errored).
   * Currently the only reason is `protected`: a non-draft invoice already
   * exists for the same (clientSlCode, manifestNumber) pair and the AI GUARD
   * (RECREATE_PROTECTED_STATUSES) prevents overwrite. Callers (e.g. NOVA's
   * "Re-generar factura" UX) use this to render an explicit toast instead of
   * leaving the user staring at a button that did nothing.
   */
  skipped?: Array<{
    slCode: string;
    reason: 'protected';
    statuses: string[];
    invoiceNumbers: string[];
    trackings?: string[];
  }>;
}

export interface SendEmailsResult {
  sent: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

// ── Route-code helper for unmatched rows ─────────────────────────────────────

/**
 * Canonical route → abbreviation map.
 * Mirrors bodega/types.ts getAbbr() and ScannerAdmin ROUTE_ABBREVIATIONS.
 * Used for invoice number prefixes on unmatched rows (no slCode).
 */
const ROUTE_ABBR_MAP: Record<string, string> = {
  'San Jose Centro':   'SJOC',
  'San Jose Escazu':   'SJOE',
  'San Jose Coronado': 'SJOCO',
  'Cartago 1':         'C1',
  'Cartago 2':         'C2',
  'Heredia':           'H',
  'Alajuela':          'A',
  'Occidente':         'OCC',
  'Encomiendas':       'ENC',
  'Retira':            'RET',
  'Desconocida':       'DES',
};

/**
 * Derives a short invoice-number prefix for rows without a linked customer.
 * Uses the same abbreviations as the scanner system (bodega/types.ts).
 * Examples: '' → 'SR', 'Cartago 1' → 'C1', 'San Jose Escazu' → 'SJOE'
 */
function deriveRouteCode(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return 'SR';
  // Exact map lookup (case-insensitive)
  const exact = ROUTE_ABBR_MAP[raw] ?? ROUTE_ABBR_MAP[raw.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())];
  if (exact) return exact;
  // Fuzzy fallback — mirrors getAbbr() in bodega/types.ts
  const lower = raw.toLowerCase();
  if (lower.includes('san jose') || lower.includes('sj')) {
    if (lower.includes('escazu') || lower.includes('escazú')) return 'SJOE';
    if (lower.includes('coronado'))                           return 'SJOCO';
    if (lower.includes('centro'))                             return 'SJOC';
    return 'SJ';
  }
  if (lower.includes('cartago')) return raw.includes('2') ? 'C2' : 'C1';
  if (lower.includes('heredia'))   return 'H';
  if (lower.includes('alajuela'))  return 'A';
  if (lower.includes('occidente')) return 'OCC';
  if (lower.includes('encomienda')) return 'ENC';
  if (lower.includes('mayorist'))  return 'M';
  // Short names pass through; long names are truncated to 4 chars
  const upper = raw.toUpperCase().replace(/\s+/g, '');
  return upper.length <= 5 ? upper : upper.slice(0, 4);
}

// ── Persistence guards ────────────────────────────────────────────────────────

/**
 * Package statuses that represent completed or terminal states.
 *
 * AI GUARD — DO NOT REMOVE OR EXPAND THIS LIST CASUALLY:
 * Packages in these statuses MUST NEVER be auto-deleted by any background
 * process or sync. They represent real-world events (delivery, return, pickup)
 * that have already occurred. Deleting them would create ghost data in the UI
 * — rows that appear to exist in local state but have no Firestore backing.
 *
 * Only an explicit admin action with user confirmation may remove these.
 */
const PROTECTED_PKG_STATUSES = new Set([
  'delivered',
  'processed',
  'returned',
  'pickup',
]);

// ── Duplicate guard / update helpers ──────────────────────────────────────────

/**
 * Hard-delete a single invoice by its Firestore document ID.
 *
 * ─── When to use ──────────────────────────────────────────────────────────
 *
 * This is the explicit "operator presses the X next to a corrupted invoice"
 * path. It is intended for invoices that:
 *   • Were created with the wrong customer (data corruption from older
 *     paths) and need to be re-generated against the corrected manifest.
 *   • Are duplicates produced by a regression that double-billed.
 *   • Reference a tracking that has since been moved to another manifest.
 *
 * For paid invoices (real money received), prefer `annulInvoiceById`
 * which preserves the audit trail. Hard-delete is a destructive admin
 * action and should ALWAYS be gated behind a confirmation modal that
 * surfaces the invoice number, customer and total.
 *
 * Returns true on success, false on failure (Firestore error). Caller is
 * expected to surface an error toast on false.
 */
export async function deleteInvoiceById(invoiceId: string): Promise<boolean> {
  if (!invoiceId) return false;
  try {
    const d = await getDocs(query(collection(db, 'invoices'), where('__name__', '==', invoiceId)));
    const invNum = d.empty ? invoiceId : (d.docs[0].data().invoiceNumber || invoiceId);
    await deleteDoc(doc(db, 'invoices', invoiceId));
    await deleteInvoiceFromSp2(invoiceId, invNum);
    return true;
  } catch (err) {
    console.warn('[deleteInvoiceById] Firestore delete failed:', err);
    return false;
  }
}

/**
 * Delete ONLY `draft` invoices for a given manifest number.
 *
 * Used by handleIngestAndInvoice to clear stale drafts before re-generating
 * invoices from updated manifest rows.
 *
 * AI GUARD — DO NOT REMOVE THE `draftOnly` FILTER:
 * The filter `!s || s === 'draft'` is a hard safety boundary. Invoices in
 * `sent`, `paid`, `overdue`, `cancelled`, `annulled` MUST survive a manifest
 * re-process. Removing this filter would silently delete invoices that have
 * already been sent to customers or marked as paid in the system.
 */
export async function deleteInvoicesByManifest(manifestNumber: string): Promise<void> {
  if (!manifestNumber) return;
  try {
    const q = query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber));
    const snap = await getDocs(q);
    const draftOnly = snap.docs.filter(d => {
      const s = d.data().status;
      return !s || s === 'draft';
    });
    await Promise.all(draftOnly.map(async d => {
      await deleteDoc(d.ref);
      await deleteInvoiceFromSp2(d.id, d.data().invoiceNumber || d.id);
    }));
  } catch {
    // Non-fatal
  }
}

/**
 * Delete packages and their draft invoice associations for a set of tracking numbers.
 *
 * CALLER CONTEXT: This function is ONLY called from the Nova admin UI when an
 * operator explicitly removes rows from a manifest-in-progress. It is NOT called
 * by any background sync or automated process.
 *
 * Deletion strategy:
 *  1. Delete `packages` docs whose `trackingNumber` is in the set,
 *     SKIPPING any package whose status is in PROTECTED_PKG_STATUSES
 *     ('delivered', 'processed', 'returned', 'pickup').
 *  2. Delete `invoices` that reference those trackings, but ONLY if the
 *     invoice has status `draft` or no status.
 *
 * AI GUARD — TWO NON-NEGOTIABLE RULES:
 *  a) NEVER remove the PROTECTED_PKG_STATUSES check. Packages in terminal states
 *     represent real-world completed events. Deleting them silently destroys the
 *     audit trail and causes ghost rows in the UI.
 *  b) NEVER remove the `status !== 'draft'` guard on invoice deletion. Sent or
 *     paid invoices MUST survive even if the underlying packages are removed.
 *
 * Returns the counts of deleted documents.
 */
export async function deletePackagesByTrackings(
  trackings: string[],
  manifestNumber: string,
  updatedBy: string = 'nova-system'
): Promise<{ packagesDeleted: number; invoicesDeleted: number }> {
  if (!trackings.length) return { packagesDeleted: 0, invoicesDeleted: 0 };

  const trackingSet = new Set(trackings.map(t => t.toUpperCase()));
  const CHUNK = 30; // Firestore `in` limit
  let packagesDeleted = 0;
  let invoicesDeleted = 0;

  // ── 1. Delete package docs — skip protected statuses or restore original manifests ──
  const chunks = [];
  for (let i = 0; i < trackings.length; i += CHUNK) {
    chunks.push(trackings.slice(i, i + CHUNK));
  }

  await Promise.all(chunks.map(async chunk => {
    const q = query(collection(db, 'packages'), where('trackingNumber', 'in', chunk.map(t => t.toUpperCase())));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      const pkgData = d.data();
      const pkgStatus = (pkgData.status as string | undefined) ?? '';
      const origManifest = (pkgData.originalManifestID as string | undefined) ||
                           (pkgData.originalManifestId as string | undefined) ||
                           (pkgData.originalManifest as string | undefined) ||
                           '';
      const isProtected = PROTECTED_PKG_STATUSES.has(pkgStatus);

      // Safe disassociation and restoration (logical rollback) without physical deletion from packages collection
      let targetManifest = origManifest || (isProtected ? 'consolidacion_transitoria' : 'none');
      if (targetManifest === manifestNumber) {
        targetManifest = isProtected ? 'consolidacion_transitoria' : 'none';
      }
      batch.update(d.ref, {
        manifestId: targetManifest,
        manifestNumber: targetManifest,
        ...(pkgData.encomiendaManifestNumber === manifestNumber ? { encomiendaManifestNumber: 'none' } : {}),
        statusHistory: arrayUnion({
          status: pkgStatus,
          changedAt: new Date().toISOString(),
          changedBy: updatedBy,
          note: `Desasociado del manifiesto ${manifestNumber} por eliminación manual. Reasociado a ${targetManifest}.`,
          // Legacy compatibility fields
          timestamp: new Date().toISOString(),
          location: 'Nova Table',
          notes: `Desasociado del manifiesto ${manifestNumber} por eliminación manual. Reasociado a ${targetManifest}.`,
          updatedBy: updatedBy
        })
      });
      packagesDeleted++;
    });
    if (snap.docs.length > 0) await batch.commit();
  }));

  // ── 2. Delete ONLY draft invoices that reference any of the deleted trackings
  if (manifestNumber) {
    const invQ = query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber));
    const invSnap = await getDocs(invQ);
    const toDelete: { id: string; num: string }[] = [];
    invSnap.docs.forEach(d => {
      const data = d.data();
      const status = data.status as string | undefined;
      if (status && status !== 'draft') return; // AI GUARD: never delete non-draft invoices
      const single: string = (data.trackingNumber as string) ?? '';
      const multi: string[] = Array.isArray(data.trackingNumbers) ? data.trackingNumbers : [];
      const allTrackings = [single, ...multi].map(t => t.toUpperCase()).filter(Boolean);
      if (allTrackings.some(t => trackingSet.has(t))) {
        toDelete.push({ id: d.id, num: data.invoiceNumber || d.id });
      }
    });
    await Promise.all(
      toDelete.map(async item => {
        await deleteDoc(doc(db, 'invoices', item.id));
        await deleteInvoiceFromSp2(item.id, item.num);
      })
    );
    invoicesDeleted = toDelete.length;
  }

  return { packagesDeleted, invoicesDeleted };
}

/**
 * Delete ONLY draft invoices that reference specific tracking numbers within a manifest.
 *
 * Unlike deleteInvoicesByManifest (which wipes every draft for the whole manifest),
 * this is scoped to invoices that overlap with the given trackings. Safe for partial
 * re-invoice workflows where previous sessions' invoices must remain untouched.
 *
 * AI GUARD — DO NOT REMOVE THE `status !== 'draft'` GUARD:
 * This function is called before re-generating invoices for updated rows. If the
 * guard is removed, invoices in `sent`, `paid`, `overdue`, etc. will be silently
 * deleted and re-created as drafts — losing payment history and customer records.
 *
 * Returns the number of invoices deleted.
 */
export async function deleteInvoicesForTrackings(
  trackings: string[],
  manifestNumber: string,
): Promise<number> {
  if (!trackings.length || !manifestNumber) return 0;
  const trackingSet = new Set(trackings.map(t => t.toUpperCase()));
  try {
    const invQ = query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber));
    const invSnap = await getDocs(invQ);
    const toDelete: { id: string; num: string }[] = [];
    invSnap.docs.forEach(d => {
      const data = d.data();
      const status = data.status as string | undefined;
      if (status && status !== 'draft') return; // AI GUARD: never delete non-draft invoices
      const single: string = (data.trackingNumber as string) ?? '';
      const multi: string[] = Array.isArray(data.trackingNumbers) ? data.trackingNumbers : [];
      const all = [single, ...multi].map(t => t.toUpperCase()).filter(Boolean);
      if (all.some(t => trackingSet.has(t))) {
        toDelete.push({ id: d.id, num: data.invoiceNumber || d.id });
      }
    });
    await Promise.all(toDelete.map(async item => {
      await deleteDoc(doc(db, 'invoices', item.id));
      await deleteInvoiceFromSp2(item.id, item.num);
    }));
    return toDelete.length;
  } catch {
    return 0;
  }
}

/**
 * Mark all invoices that reference the given tracking numbers as paid.
 *
 * Covers two invoice shapes:
 *   - Individual  → `trackingNumber` (scalar) field
 *   - Consolidated → `trackingNumbers` (array) field
 *
 * Already-paid invoices are silently skipped.
 * Returns { count, updatedInvoices } — callers use updatedInvoices to push
 * the `paid` status to SP2 so the customer portal reflects the payment.
 */
/**
 * Generic version of markInvoicesAsPaidForTrackings.
 * Updates invoices linked to any of the given tracking numbers to `newStatus`.
 * Skips invoices already at that status.
 * Returns { count, updatedInvoices } for downstream SP2 sync.
 */
export async function updateInvoiceStatusForTrackings(
  trackings: string[],
  newStatus: string,
): Promise<{ count: number; updatedInvoices: Array<{ id: string; invoiceNumber?: string }> }> {
  if (!trackings.length) return { count: 0, updatedInvoices: [] };

  const upper = [...new Set(trackings.map(t => t.toUpperCase()))];
  const colRef = collection(db, 'invoices');
  const found = new Map<string, Record<string, unknown>>();

  const IN_CHUNK = 30;
  const CONTAINS_CHUNK = 10;

  for (let i = 0; i < upper.length; i += IN_CHUNK) {
    const chunk = upper.slice(i, i + IN_CHUNK);
    try {
      const snap = await getDocs(query(colRef, where('trackingNumber', 'in', chunk)));
      snap.docs.forEach(d => found.set(d.id, d.data() as Record<string, unknown>));
    } catch { /* non-fatal */ }
  }

  for (let i = 0; i < upper.length; i += CONTAINS_CHUNK) {
    const chunk = upper.slice(i, i + CONTAINS_CHUNK);
    try {
      const snap = await getDocs(query(colRef, where('trackingNumbers', 'array-contains-any', chunk)));
      snap.docs.forEach(d => found.set(d.id, d.data() as Record<string, unknown>));
    } catch { /* non-fatal */ }
  }

  const toUpdate = [...found.entries()].filter(([, data]) => data['status'] !== newStatus);
  if (!toUpdate.length) return { count: 0, updatedInvoices: [] };

  const changedAt = new Date().toISOString();
  const statusEntry = { status: newStatus, changedAt, changedBy: 'system' };
  const BATCH_LIMIT = 500;
  for (let i = 0; i < toUpdate.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    toUpdate.slice(i, i + BATCH_LIMIT).forEach(([id]) => {
      batch.update(doc(colRef, id), {
        status: newStatus,
        ...(newStatus === 'paid' ? { paidAt: changedAt } : {}),
        statusHistory: arrayUnion(statusEntry),
      });
    });
    await batch.commit();
  }

  return {
    count: toUpdate.length,
    updatedInvoices: toUpdate.map(([id, data]) => ({
      id,
      invoiceNumber: data['invoiceNumber'] as string | undefined,
    })),
  };
}

export async function markInvoicesAsPaidForTrackings(
  trackings: string[],
  paymentDetails?: InvoicePaymentDetails
): Promise<{ count: number; updatedInvoices: Array<{ id: string; invoiceNumber?: string }> }> {
  if (!trackings.length) return { count: 0, updatedInvoices: [] };

  const upper = [...new Set(trackings.map(t => t.toUpperCase()))];
  const colRef = collection(db, 'invoices');
  // id → data snapshot (Map deduplicates across both query passes)
  const found = new Map<string, Record<string, unknown>>();

  const IN_CHUNK = 30;        // Firestore `in` limit
  const CONTAINS_CHUNK = 10;  // Firestore `array-contains-any` limit

  // Pass 1 — scalar trackingNumber field (individual invoices)
  for (let i = 0; i < upper.length; i += IN_CHUNK) {
    const chunk = upper.slice(i, i + IN_CHUNK);
    try {
      const snap = await getDocs(query(colRef, where('trackingNumber', 'in', chunk)));
      snap.docs.forEach(d => found.set(d.id, d.data() as Record<string, unknown>));
    } catch { /* non-fatal */ }
  }

  // Pass 2 — trackingNumbers array field (consolidation invoices)
  for (let i = 0; i < upper.length; i += CONTAINS_CHUNK) {
    const chunk = upper.slice(i, i + CONTAINS_CHUNK);
    try {
      const snap = await getDocs(query(colRef, where('trackingNumbers', 'array-contains-any', chunk)));
      snap.docs.forEach(d => found.set(d.id, d.data() as Record<string, unknown>));
    } catch { /* non-fatal */ }
  }

  // Only update invoices that are not already paid
  const toUpdate = [...found.entries()].filter(([, data]) => data['status'] !== 'paid');
  if (!toUpdate.length) return { count: 0, updatedInvoices: [] };

  const paidAt = new Date().toISOString();
  const statusEntry = { status: 'paid', changedAt: paidAt, changedBy: 'system' };
  const BATCH_LIMIT = 500;
  for (let i = 0; i < toUpdate.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    toUpdate.slice(i, i + BATCH_LIMIT).forEach(([id]) => {
      const updatePayload: Record<string, unknown> = {
        status: 'paid',
        paidAt,
        statusHistory: arrayUnion(statusEntry),
      };
      if (paymentDetails?.medioPagoCode) {
        updatePayload.medioPago = paymentDetails.medioPagoCode;
      }
      if (paymentDetails?.condicionVentaCode) {
        updatePayload.condicionVenta = paymentDetails.condicionVentaCode;
      }
      if (paymentDetails?.tipoDocumentoCode) {
        updatePayload.tipoDocumento = paymentDetails.tipoDocumentoCode;
      }
      if (paymentDetails?.metodoPago) {
        updatePayload.metodoPago = paymentDetails.metodoPago;
      }
      batch.update(doc(colRef, id), updatePayload);
    });
    await batch.commit();
  }

  return {
    count: toUpdate.length,
    updatedInvoices: toUpdate.map(([id, data]) => ({
      id,
      invoiceNumber: data['invoiceNumber'] as string | undefined,
    })),
  };
}

/**
 * Bulk update payment details & Hacienda tax codes for an array of invoice IDs.
 * Used by admin in Invoices management view.
 */
export async function updateInvoicesPaymentDetails(
  invoiceIds: string[],
  paymentDetails: InvoicePaymentDetails
): Promise<{ count: number }> {
  if (!invoiceIds.length) return { count: 0 };
  const colRef = collection(db, 'invoices');
  const BATCH_LIMIT = 500;
  const updatedAt = new Date().toISOString();

  for (let i = 0; i < invoiceIds.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = invoiceIds.slice(i, i + BATCH_LIMIT);
    for (const id of chunk) {
      const docRef = doc(colRef, id);
      const updateData: Record<string, unknown> = { updatedAt };
      if (paymentDetails.medioPagoCode) updateData.medioPago = paymentDetails.medioPagoCode;
      if (paymentDetails.condicionVentaCode) updateData.condicionVenta = paymentDetails.condicionVentaCode;
      if (paymentDetails.tipoDocumentoCode) updateData.tipoDocumento = paymentDetails.tipoDocumentoCode;
      if (paymentDetails.metodoPago) updateData.metodoPago = paymentDetails.metodoPago;
      batch.update(docRef, updateData);
    }
    await batch.commit();
  }
  return { count: invoiceIds.length };
}

/**
 * Fetch all invoice documents for a manifest number directly from Firestore.
 * Used as a fallback in InvoiceGeneration when the local 1000-invoice cursor
 * window does not contain older manifests (bypasses the cursor limit).
 */
/**
 * Real-time variant of getInvoicesByManifest.
 * Fires immediately with current data and again on every subsequent change.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeInvoicesByManifest(
  manifestNumber: string,
  callback: (invoices: InvoiceRecord[]) => void,
): () => void {
  if (!manifestNumber) { callback([]); return () => {}; }

  let q1Docs: any[] = [];
  let q2Docs: any[] = [];

  const merge = () => {
    const map = new Map<string, InvoiceRecord>();
    [...q1Docs, ...q2Docs].forEach(d => {
      map.set(d.id, { id: d.id, ...d.data() } as InvoiceRecord);
    });
    callback(Array.from(map.values()));
  };

  const q1 = query(collection(db, 'invoices'), where('manifestNumber', '==', manifestNumber));
  const q2 = query(collection(db, 'invoices'), where('manifestNumbers', 'array-contains', manifestNumber));

  const unsub1 = onSnapshot(q1, snap => {
    q1Docs = snap.docs;
    merge();
  }, () => callback([]));

  const unsub2 = onSnapshot(q2, snap => {
    q2Docs = snap.docs;
    merge();
  }, () => {});

  return () => {
    unsub1();
    unsub2();
  };
}

export async function getInvoicesByManifest(manifestNumber: string): Promise<InvoiceRecord[]> {
  if (!manifestNumber) return [];
  try {
    const q1 = query(
      collection(db, 'invoices'),
      where('manifestNumber', '==', manifestNumber),
    );
    const q2 = query(
      collection(db, 'invoices'),
      where('manifestNumbers', 'array-contains', manifestNumber),
    );
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const map = new Map<string, InvoiceRecord>();
    [...snap1.docs, ...snap2.docs].forEach(d => {
      map.set(d.id, { id: d.id, ...d.data() } as InvoiceRecord);
    });
    return Array.from(map.values());
  } catch {
    return [];
  }
}

export async function getExistingInvoicesByManifest(manifestNumber: string): Promise<number> {
  if (!manifestNumber) return 0;
  try {
    const q = query(
      collection(db, 'invoices'),
      where('manifestNumber', '==', manifestNumber),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}

/**
 * Statuses that BLOCK silent re-creation of an invoice for the same
 * (clientSlCode, manifestNumber) pair. Annulled / cancelled / void docs are
 * tombstones — they no longer represent an active billing claim — so they
 * MUST NOT count as "existing" for the purposes of the AI GUARD or the
 * smart-diff. Treating them as protected was the historical bug that made
 * "Re-crear facturas" silently no-op after an operator anuló an invoice.
 */
export const RECREATE_PROTECTED_STATUSES = new Set([
  'sent',
  'paid',
  'overdue',
  'pending',
  'pending_payment',
]);

/**
 * Status breakdown for every invoice doc tied to a given manifestNumber.
 * Powers the NovaTable confirmation dialog so the operator sees, before
 * confirming, exactly how many invoices are currently in each state and
 * which subset will be touched by "Re-crear facturas". Annulled / cancelled
 * docs are tracked separately because they are invisible to the recreate
 * pipeline (RECREATE_PROTECTED_STATUSES excludes them).
 */
export interface InvoiceManifestBreakdown {
  total:     number;
  drafts:    number; // status === 'draft' or absent — safe to delete + recreate
  sent:      number; // protected — needs explicit annul before recreate
  paid:      number; // protected — must NEVER be touched
  overdue:   number; // protected — needs explicit annul before recreate
  pending:   number; // protected — needs explicit annul before recreate
  annulled:  number; // tombstones — invisible to recreate pipeline
  /** IDs of every protected invoice (sent/overdue/pending) for UI annul. Excludes paid & annulled. */
  protectedIds: string[];
}

export async function getInvoiceBreakdownByManifest(
  manifestNumber: string,
): Promise<InvoiceManifestBreakdown> {
  const empty: InvoiceManifestBreakdown = {
    total: 0, drafts: 0, sent: 0, paid: 0, overdue: 0, pending: 0, annulled: 0,
    protectedIds: [],
  };
  if (!manifestNumber) return empty;
  try {
    const snap = await getDocs(query(
      collection(db, 'invoices'),
      where('manifestNumber', '==', manifestNumber),
    ));
    const out: InvoiceManifestBreakdown = { ...empty };
    snap.docs.forEach(d => {
      const data = d.data();
      const status = ((data.status as string | undefined) || 'draft').toLowerCase();
      out.total++;
      if (status === 'draft') out.drafts++;
      else if (status === 'sent') { out.sent++; out.protectedIds.push(d.id); }
      else if (status === 'paid') out.paid++;
      else if (status === 'overdue') { out.overdue++; out.protectedIds.push(d.id); }
      else if (status === 'pending' || status === 'pending_payment') {
        out.pending++; out.protectedIds.push(d.id);
      }
      else if (status === 'annulled' || status === 'cancelled' || status === 'void') {
        out.annulled++;
      }
      else out.drafts++; // unknown status → safest bucket (treat as draft)
    });
    return out;
  } catch {
    return empty;
  }
}

/**
 * Annul every non-paid, non-annulled invoice doc whose tracking set overlaps
 * the given trackings AND whose manifestNumber matches. Used by the explicit
 * "Anular y re-crear" flow in NovaTable: when the operator wants to recreate
 * invoices that are currently in `sent` / `overdue` / `pending` state, we
 * annul (status='annulled') instead of delete so the audit trail (sent
 * timestamp, recipient email, statusHistory) is preserved as a tombstone.
 *
 * Once annulled, RECREATE_PROTECTED_STATUSES no longer matches them, so
 * createInvoicesFromRows is free to create fresh invoices for the same
 * (slCode, manifestNumber) pair without tripping the AI GUARD.
 *
 * NEVER touches `paid` invoices — real money was received and the doc must
 * stay intact. Returns the IDs that were annulled so the caller can audit.
 */
export async function annulInvoicesByTrackingsAndManifest(
  trackings: string[],
  manifestNumber: string,
  options: { reason?: string; annulledBy?: string; excludeInvoiceIds?: string[]; forceAnnulPaid?: boolean } = {},
): Promise<{ annulledIds: string[]; skippedPaid: number }> {
  if (!trackings.length || !manifestNumber) {
    return { annulledIds: [], skippedPaid: 0 };
  }
  const trackingSet = new Set(trackings.map(t => t.toUpperCase()));
  const now = new Date().toISOString();
  const reason = options.reason ?? 'Anulada antes de re-crear desde Nova';
  const annulledBy = options.annulledBy ?? 'nova';
  const excludeInvoiceIds = options.excludeInvoiceIds || [];

  try {
    const snap = await getDocs(query(
      collection(db, 'invoices'),
      where('manifestNumber', '==', manifestNumber),
    ));
    const annulledIds: string[] = [];
    let skippedPaid = 0;

    await Promise.all(snap.docs.map(async (d) => {
      if (excludeInvoiceIds.includes(d.id)) return;
      const data = d.data();
      const status = ((data.status as string | undefined) || 'draft').toLowerCase();
      // Already annulled / cancelled / void: nothing to do.
      if (status === 'annulled' || status === 'cancelled' || status === 'void') return;
      // Paid invoices are never touched. Real money was received.
      if (status === 'paid') {
        if (!options.forceAnnulPaid) {
          skippedPaid++;
          return;
        }
      }
      // Draft invoices are not annulled here — the regular delete+recreate
      // pipeline handles them downstream (no audit trail to preserve).
      if (status === 'draft') return;
      // Tracking overlap check: annul only if this invoice references at
      // least one of the trackings we're about to recreate.
      const single = (data.trackingNumber as string | undefined) ?? '';
      const multi: string[] = Array.isArray(data.trackingNumbers) ? data.trackingNumbers : [];
      const all = [single, ...multi].map(t => (t || '').toUpperCase()).filter(Boolean);
      if (!all.some(t => trackingSet.has(t))) return;

      try {
        await updateDoc(doc(db, 'invoices', d.id), {
          status: 'annulled',
          annulledAt: now,
          annulledBy,
          annulledReason: reason,
          updatedAt: now,
          // statusHistory append via arrayUnion preserves any prior history.
          statusHistory: arrayUnion({
            status: 'annulled',
            changedAt: now,
            changedBy: annulledBy,
            reason,
          }),
        });
        
        // Also ensure it is physically deleted from the client portal in SP2
        await deleteInvoiceFromSp2(d.id, (data.invoiceNumber as string) || d.id);

        // Unlink packages associated with this invoice to prevent phantom/ghost packages
        const [snapId, snapNum] = await Promise.all([
          getDocs(query(collection(db, 'packages'), where('invoiceId', '==', d.id))),
          data.invoiceNumber
            ? getDocs(query(collection(db, 'packages'), where('invoiceNumber', '==', data.invoiceNumber)))
            : Promise.resolve({ empty: true, docs: [] } as any),
        ]);
        
        const seenPkgIds = new Set<string>();
        const validPkgDocs: any[] = [];
        snapId.forEach((doc: any) => { seenPkgIds.add(doc.id); validPkgDocs.push(doc); });
        snapNum.forEach((doc: any) => {
          if (!seenPkgIds.has(doc.id)) {
            seenPkgIds.add(doc.id);
            validPkgDocs.push(doc);
          }
        });

        if (validPkgDocs.length > 0) {
          const pkgBatch = writeBatch(db);
          const pkgsToSync: any[] = [];
          const consolidationItems: any[] = [];
          
          validPkgDocs.forEach(pkgDoc => {
            const pData = pkgDoc.data();
            const tr = (pData.trackingNumber || pData.tracking || pkgDoc.id || '').toString();
            pkgBatch.update(doc(db, 'packages', pkgDoc.id), {
              invoiceId: deleteField(),
              invoiceNumber: deleteField(),
              invoiceStatus: deleteField(),
              annulledInvoiceId: d.id,
              annulledInvoiceNumber: data.invoiceNumber || d.id,
              annulledAt: now,
              ...(!pData.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
              status: 'consolidated',
              consolidacion: true,
              manifestId: 'consolidacion_transitoria',
              manifestNumber: 'consolidacion_transitoria',
              encomiendaManifestNumber: 'none',
              smartwebSynced: false,
              smartwebSyncSource: 'transitoria',
              statusHistory: arrayUnion({
                status: 'consolidated',
                changedAt: now,
                changedBy: annulledBy,
                note: `Factura ${data.invoiceNumber || d.id} anulada antes de re-crear — paquete desvinculado.`,
              }),
            });
            
            pkgsToSync.push({
              id: pkgDoc.id,
              trackingNumber: tr,
              slCode: pData.slCode || data.slCode || '',
              customerName: pData.customerName || data.clientName || '',
              status: 'consolidated',
              manifestNumber: 'consolidacion_transitoria',
              forceSync: true,
            });

            if (tr) {
              consolidationItems.push({
                tracking: tr.toUpperCase(),
                slCode: pData.slCode || data.slCode || data.clientSlCode || '',
                customerName: pData.customerName || data.clientName || '',
                ruta: pData.ruta || data.ruta || '',
                weight: pData.weight || pData.peso || 0,
                price: pData.price || pData.precio || 0,
                currency: pData.currency || 'USD',
                description: pData.description || pData.descripcion || '',
                permisos: !!(pData.requiresPermit || pData.permisos),
                origin: pData.origin || 'Miami, FL',
                manifestNumber: manifestNumber || pData.manifestNumber || '',
                invoiceId: d.id,
                invoiceNumber: data.invoiceNumber,
                invoiceStatus: 'annulled',
                status: 'consolidated',
                movedAt: now,
              });
            }
          });
          
          await pkgBatch.commit();
          
          if (consolidationItems.length > 0) {
            try {
              const { addItemsToConsolidation } = await import('./manifest-consolidation-service');
              await addItemsToConsolidation(consolidationItems);
            } catch (mcErr) {
              console.warn('[annulInvoicesByTrackingsAndManifest] Failed to add items to manifest_consolidation:', mcErr);
            }
          }

          if (pkgsToSync.length > 0) {
            syncPackagesToSmartWeb(pkgsToSync).catch(err =>
              console.warn('[annulInvoicesByTrackingsAndManifest] SP2 packages sync failed:', err)
            );
          }
        }
        
        annulledIds.push(d.id);
      } catch (err) {
        console.warn('[annulInvoicesByTrackingsAndManifest] Skipped doc', d.id, err);
      }
    }));

    return { annulledIds, skippedPaid };
  } catch (err) {
    console.warn('[annulInvoicesByTrackingsAndManifest] Query failed', err);
    return { annulledIds: [], skippedPaid: 0 };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function generateInvoiceNumber(
  slCode: string,
  isConsolidated: boolean,
  refDate: Date | string | number = new Date()
): string {
  // CR-TZ GUARANTEE: Invoices generated by operators anywhere in the world
  // (e.g. Japan UTC+9, Europe, USA) always embed Costa Rica local time (America/Costa_Rica, UTC-6).
  const parts = getCostaRicaDateParts(refDate);
  const code = slCode || 'INV';
  const base = `${code}-${parts.yearStr}${parts.monthStr}${parts.dayStr}${parts.hourStr}${parts.minuteStr}${parts.secondStr}${parts.millisecondStr}`;
  return isConsolidated ? `${base}-C` : base;
}

/**
 * Single source of truth for consolidation detection.
 *
 * Handles all three historical signals:
 *  1. boolean field  `isConsolidation === true`         (all new invoices)
 *  2. number suffix  invoiceNumber ends with `-C`        (invoice-service.ts)
 *  3. legacy suffix  invoiceNumber contains `-CONSOLIDACION` (NovaTableModal pre-fix)
 *
 * NEVER duplicate this logic outside this file.
 */
export function isConsolidatedInvoice(invoice: { isConsolidation?: any; invoiceNumber?: string }): boolean {
  if (invoice.isConsolidation === true) return true;
  const n = invoice.invoiceNumber ?? '';
  return n.endsWith('-C') || n.includes('-CONSOLIDACION');
}

/**
 * Group manifest rows for invoicing.
 *
 * - consolidacion === true  → group all rows for the same slCode into one invoice.
 * - consolidacion === false → each row gets its own individual invoice regardless
 *                             of whether multiple rows share the same slCode.
 * - No slCode               → always treated as individual invoice per tracking.
 *
 * KEY INVARIANT: the grouping key for non-consolidated rows is
 * `__individual__{tracking}` — never just `slCode`. This prevents two rows for
 * the same customer from accidentally merging when consolidacion=false.
 *
 * Quick-fix: if customers are being consolidated when they shouldn't be,
 * check that `row.consolidacion` is correctly mapped from the manifest column.
 */
export function groupRowsForInvoicing(rows: ProcessedRow[], mergedSlCodes?: Set<string>): InvoiceGroup[] {
  const groupMap = new Map<string, InvoiceGroup>();

  for (const row of rows) {
    const rowSlCode = row.slCode ? String(row.slCode) : '';
    // Merged single ("Factura única"): group by slCode with individual pricing.
    const isMerged = !!mergedSlCodes?.has(rowSlCode);
    // Only consolidate rows when the customer flag is explicitly enabled.
    // Non-consolidated rows use a unique per-tracking key so they never merge.
    const key = (row.consolidacion && rowSlCode)
      ? rowSlCode
      : (isMerged && rowSlCode)
        ? `__merged__${rowSlCode}`
        : `__individual__${row.tracking}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        slCode: rowSlCode,
        userId: rowSlCode,
        clientName: resolveEffectiveCustomerName({
          savedCustomerName: row.nombreCliente,
          manifestConsigneeName: row.nombre,
          slCode: rowSlCode,
        }),
        clientEmail: '',
        clientDni: '',
        clientRoute: row.ruta || '',
        rows: [],
        isMergedSingle: isMerged,
      });
    }
    groupMap.get(key)!.rows.push(row);
  }

  return Array.from(groupMap.values());
}

// ── Core invoice builder ───────────────────────────────────────────────────────

/**
 * Build the full InvoiceRecord payload for a group of rows.
 *
 * IVA MATH INVARIANT (BUG-I03):
 *   subtotalUSD = round(total / 1.13 * 100) / 100
 *   ivaUSD      = round((total - subtotalUSD) * 100) / 100   ← NOT total * 0.13
 * This guarantees subtotal + iva === total (no IEEE-754 gap).
 *
 * CRC INVARIANT (BUG-I05):
 *   amountCRC = exchangeRate > 0 ? round(total * rate) : 0
 * Never produces NaN or Infinity for any finite exchangeRate.
 *
 * CONSOLIDATION INVARIANT (BUG-I07):
 *   isConsolidation = !group.isMergedSingle && group.rows.length > 1
 * isMergedSingle groups ("Factura única") are never consolidated even with >1 row.
 *
 * TRACKING FIELD INVARIANT (BUG-I12):
 *   isConsolidation=true              → `trackingNumbers` (array only).
 *   isMergedSingle=true (Factura única) → BOTH `trackingNumber` (first) AND `trackingNumbers` (all).
 *   regular individual                → `trackingNumber` (scalar only).
 */
export function buildInvoiceData(
  group: InvoiceGroup,
  ivaEnabled: boolean,
  exchangeRate: number,
  manifestNumber?: string,
  extraItems?: Array<{ description: string; amount: number; systemType?: 'terceros' | 'bodegaje' | 'permisos' }>,
  source?: 'nova' | 'manual' | 'maritime'
): Omit<InvoiceRecord, 'id'> {
  // isMergedSingle groups are NEVER consolidation — they are Factura única (one invoice
  // per customer with individual per-row pricing, no proportional peso distribution).
  const isConsolidation = !group.isMergedSingle && group.rows.length > 1;
  const invoiceNumber = generateInvoiceNumber(group.slCode, isConsolidation);

  // WEIGHT_DISPLAY_RULE — permiso OR consolidacion → rounded/ceiled peso; regular → real peso.
  // Pre-compute consolidated group peso sum for proportional distribution.
  const nonPermisoRows = group.rows.filter(r => !r.permisos);
  const consolidationSumPeso = isConsolidation
    ? nonPermisoRows.reduce((s, r) => s + (r.peso ?? 0), 0)
    : 0;
  const consolidationCeiledPeso = Math.ceil(consolidationSumPeso);

  const now = new Date().toISOString();

  // BUG-I-AUDIT-01/05 FIX: Trust pesoRedondeo from buildResolvedRows for consolidated items.
  // buildResolvedRows already applies the remainder-correction distributor pattern, so we trust
  // its output rather than recalculating proportional weights here.
  // For safety, we also apply a remainder-correction fallback when pesoRedondeo is not pre-computed.
  const consolidationIdxMap = new Map<number, number>(); // row-position → running peso accumulator (for remainder)
  let consolidationRunningPeso = 0;
  const items: InvoiceItem[] = group.rows.map((r, rowIdx) => {
    let cost = r.precio;
    // INVARIANT: An item with weight > 0 must NEVER have a price of 0 across any manifest type.
    if ((cost == null || cost <= 0) && (r.peso ?? 0) > 0) {
      const mn = (manifestNumber || r.manifiesto || '').toUpperCase();
      const isSea = source === 'maritime' || mn.includes('MARITIMO') || mn.includes('SEA') || mn.includes('MAR');
      const isChina = mn.includes('CHINA') || mn.includes('CHN');
      const isColombia = mn.includes('COL') || mn.includes('COLOMBIA');
      const isMexico = mn.includes('MEX') || mn.includes('MEXICO');
      const country = isChina ? 'china' : isColombia ? 'colombia' : isMexico ? 'mexico' : 'usa';
      const shippingType = isSea ? 'sea' : 'air';
      const calcRes = calculatePrice(r.peso ?? 0, country, shippingType, 'regular', r.permisos ?? false);
      if (!calcRes.quoteRequired) {
        cost = Math.round(calcRes.price * 100) / 100;
      }
    }
    cost = cost ?? 0;

    const itemSubtotal = ivaEnabled ? Math.round(cost / 1.13 * 100) / 100 : cost;
    const itemIva = ivaEnabled ? Math.round((cost - itemSubtotal) * 100) / 100 : 0;
    let itemWeight: number;
    if (r.permisos) {
      // Permit: billed per whole kg → show rounded peso
      itemWeight = r.pesoRedondeo ?? r.peso ?? 0;
    } else if (isConsolidation && !group.isMergedSingle && consolidationSumPeso > 0) {
      // Consolidation: trust pre-computed pesoRedondeo from buildResolvedRows when available
      // (already includes remainder-correction). Otherwise, compute with remainder pattern.
      //
      // REGRESSION GUARD: Only trust pesoRedondeo when it genuinely differs from raw peso
      // (meaning buildResolvedRows pre-computed a proportional share). When pesoRedondeo === peso
      // (e.g. CreateInvoice.tsx sets pesoRedondeo = realPeso for non-permiso rows), it means
      // the caller did NOT compute consolidated weights, so we must fall through to the
      // proportional+remainder calculation below.
      const preComputedProportional = r.pesoRedondeo != null
        && r.pesoRedondeo > 0
        && r.pesoRedondeo !== r.peso;    // ← key guard: differs from raw → pre-computed
      if (preComputedProportional) {
        itemWeight = r.pesoRedondeo!;
      } else {
        // Fallback: proportional share with remainder correction for last non-permiso row
        const isLastNonPermiso = rowIdx === group.rows.length - 1 ||
          group.rows.slice(rowIdx + 1).every(rr => rr.permisos);
        if (isLastNonPermiso) {
          // Last row gets exact remainder — prevents rounding drift (BUG-I-AUDIT-05)
          itemWeight = Math.round((consolidationCeiledPeso - consolidationRunningPeso) * 100) / 100;
        } else {
          itemWeight = Math.round(consolidationCeiledPeso * ((r.peso ?? 0) / consolidationSumPeso) * 100) / 100;
          consolidationRunningPeso += itemWeight;
        }
      }
    } else {
      // Regular individual OR Factura única merged: always real peso, never pesoRedondeo
      itemWeight = r.peso || 0;
    }
    return {
      tracking: r.tracking,
      description: r.descripcion || r.tracking || '',
      weight: itemWeight,
      realWeight: r.peso || 0,
      subtotal: itemSubtotal,
      iva: itemIva,
      amount: cost,
      currency: 'USD',
      isPermiso: r.permisos ?? false,
    };
  });

  const rowsTotalUSD = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  const extraTotal = extraItems ? extraItems.reduce((s, i) => s + i.amount, 0) : 0;
  const totalUSD = Math.round((rowsTotalUSD + extraTotal) * 100) / 100;

  const subtotalUSD = ivaEnabled ? Math.round(totalUSD / 1.13 * 100) / 100 : totalUSD;
  const ivaUSD = ivaEnabled ? Math.round((totalUSD - subtotalUSD) * 100) / 100 : 0;
  const totalCRC = exchangeRate > 0 ? Math.round(totalUSD * exchangeRate) : 0;
  const subtotalCRC = ivaEnabled ? Math.round(totalCRC / 1.13) : totalCRC;
  const ivaCRC = ivaEnabled ? Math.round(totalCRC - subtotalCRC) : 0;

  const today = new Date();
  const due = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const extraInvoiceItems: InvoiceItem[] = (extraItems ?? []).map(ei => {
    const eiSubtotal = ivaEnabled ? Math.round(ei.amount / 1.13 * 100) / 100 : ei.amount;
    const eiIva = ivaEnabled ? Math.round((ei.amount - eiSubtotal) * 100) / 100 : 0;
    return {
      tracking: '',
      description: ei.description || 'Servicio de Terceros',
      weight: 0,
      realWeight: 0,
      subtotal: eiSubtotal,
      iva: eiIva,
      amount: ei.amount,
      currency: 'USD',
      isPermiso: false,
      isManual: true,
      isSystem: true,
      systemType: ei.systemType || 'terceros',
    };
  });

  const invoiceItems = [
    ...items.map(i => ({
      description: i.description,
      trackingNumber: i.tracking,
      quantity: 1,
      unitPrice: i.amount,
      totalPrice: i.amount,
      weight: i.weight,
      realWeight: i.realWeight,
      isManual: false,
      isPermiso: i.isPermiso ?? false,
    })),
    ...extraInvoiceItems.map(ei => ({
      description: ei.description,
      trackingNumber: '',
      quantity: 1,
      unitPrice: ei.amount,
      totalPrice: ei.amount,
      weight: 0,
      realWeight: 0,
      isManual: true,
      isSystem: true,
      systemType: ei.systemType || 'terceros',
      isPermiso: false,
    })),
  ];

  const allItems: InvoiceItem[] = [...items, ...extraInvoiceItems];

  // BUG-I-AUDIT-02 FIX: Compute totalWeight from actual item weights AFTER items are built.
  // This guarantees sum(items[].weight) === totalWeight — no mismatch possible.
  const totalWeight = allItems.reduce((s, i) => s + (i.weight ?? 0), 0);

  const base: Omit<InvoiceRecord, 'id'> = {
    // ── Nova / SP2 fields ──────────────────────────────────────────────────────
    userId: group.userId,
    clientId: group.userId,
    clientName: group.clientName,
    clientDni: group.clientDni,
    clientEmail: group.clientEmail,
    clientRoute: group.clientRoute,
    slCode: group.slCode || 'SIN-CODIGO',
    invoiceNumber,
    searchTokens: generateInvoiceSearchTokens(group.clientName || '', group.slCode || '', invoiceNumber),
    isConsolidation,
    ivaEnabled,
    subtotal: subtotalUSD,
    subtotalCRC,
    iva: ivaUSD,
    ivaCRC,
    ivaRate: ivaEnabled ? 0.13 : 0,
    amount: totalUSD,
    currency: 'USD',
    amountCRC: totalCRC,
    exchangeRate,
    items: allItems,
    packageCount: group.rows.length,
    totalWeight,
    notes: group.isMergedSingle
      ? `Factura única — ${group.rows.length} paquetes`
      : isConsolidation
        ? `Factura consolidada — ${group.rows.length} paquetes`
        : `Paquete ${group.rows[0].tracking}`,
    ...(group.isMergedSingle ? { isMergedSingle: true } : {}),
    createdAt: now,
    updatedAt: now,

    // ── SP1 InvoiceGeneration.tsx aligned fields ───────────────────────────────
    totalAmount: totalUSD,
    subtotalAmount: subtotalUSD,
    taxAmount: ivaUSD,
    customerId: group.slCode || group.userId,
    clientSlCode: group.slCode || group.userId,
    invoiceDate: today.toISOString(),
    dueDate: due.toISOString(),
    invoiceItems,
    status: 'draft',
    source: source || 'nova',
    smartwebSynced: false,
    ...(manifestNumber ? { manifestNumber, manifestNumbers: [manifestNumber] } : {}),
    customer: {
      id: group.slCode || group.userId,
      fullName: group.clientName,
      email: group.clientEmail,
      slCode: group.slCode,
      ruta: group.clientRoute || null,
    },
  };

  if (isConsolidation) {
    base.trackingNumbers = group.rows.map(r => r.tracking);
  } else if (group.isMergedSingle && group.rows.length > 1) {
    // Factura única: store all trackings for payment/delete lookups AND first tracking
    // as scalar for backward compatibility with single-tracking lookups.
    base.trackingNumber  = group.rows[0].tracking;
    base.trackingNumbers = group.rows.map(r => r.tracking);
  } else {
    base.trackingNumber = group.rows[0].tracking;
  }

  return base;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Batch-query invoice statuses for a list of manifest numbers.
 *
 * Returns a Map<TRACKING_UPPER, invoiceStatus> used to colour the invoice
 * icon in the routes table without triggering individual per-package queries.
 *
 * Covers both invoice shapes:
 *  - Individual  → `trackingNumber` (scalar)
 *  - Consolidated → `trackingNumbers` (array)
 *
 * Non-fatal: any query error is swallowed; the partial map is returned.
 */
export async function getInvoiceStatusesByManifests(
  manifestNumbers: string[],
): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  if (!manifestNumbers.length) return statusMap;

  const CHUNK = 30; // Firestore `in` limit
  for (let i = 0; i < manifestNumbers.length; i += CHUNK) {
    const chunk = manifestNumbers.slice(i, i + CHUNK);
    try {
      const snap = await getDocs(
        query(collection(db, 'invoices'), where('manifestNumber', 'in', chunk)),
      );
      snap.docs.forEach(d => {
        const data = d.data();
        const status = (data.status as string) || 'draft';
        const single = (data.trackingNumber as string | undefined) ?? '';
        const multi: string[] = Array.isArray(data.trackingNumbers) ? data.trackingNumbers : [];
        [single, ...multi].filter(Boolean).forEach(t => {
          statusMap.set(t.toUpperCase(), status);
        });
      });
    } catch { /* non-fatal — partial map returned */ }
  }
  return statusMap;
}

/**
 * Create invoices in Firestore `invoices` collection for the given manifest rows.
 *
 * Flow:
 *   1. groupRowsForInvoicing() splits rows into per-customer groups.
 *   2. getCustomersBySlCodes() enriches each group with email + dni.
 *   3. Non-draft guard: if a non-draft invoice already exists for this customer +
 *      manifest, the group is SKIPPED — the existing invoice is preserved as-is.
 *   4. buildInvoiceData() produces the full InvoiceRecord payload.
 *   5. addDoc() persists each invoice to `invoices/{auto-id}`.
 *
 * AI GUARD — NON-DRAFT SKIP GUARD (lines ~903-920):
 * When a manifest is re-processed, `createInvoicesFromRows` must NOT overwrite or
 * duplicate invoices that are already in `sent`, `paid`, `overdue`, or other
 * non-draft states. The guard queries Firestore for each (clientSlCode, manifestNumber)
 * pair and skips creation if any non-draft exists. NEVER remove this guard — doing
 * so would create phantom draft invoices alongside already-sent ones, causing
 * duplicate entries in the /invoices page (ghost data).
 *
 * UNMATCHED ROWS: Groups with no customer slCode are NOT skipped. A route-based
 * code is derived via deriveRouteCode().
 * These invoices land in /invoices as drafts and can be edited to add contact details.
 *
 * @returns { created, errors } — errors are per-slCode; a partial failure does not abort.
 */
/**
 * Checks if an existing manual item in a draft or protected invoice is a duplicate
 * of an incoming system/operator item, signaling that the old item should be discarded
 * to let the fresh calculation (with the new amount/description) take its place.
 *
 * Data Flow & Logic:
 *   1. Normalizes the item description (removes currency symbols, spaces, numbers, and TC references).
 *   2. Identifies if the item is a default system-managed item (like "Servicio de Terceros"
 *      or "Servicio Adicional"). If so, it returns `true` (always duplicate) because these
 *      are automatically recalculated and recreated in every run.
 *   3. If it's a custom-described manual item (e.g. "Flete especial", "Seguro de envio"), it checks
 *      if its normalized description matches any description in `extraItems` (the new third-party
 *      service details passed for this invoicing run).
 *   4. If there's a description match, it returns `true` (duplicate) REGARDLESS of amount changes.
 *      This allows the system to overwrite the old amount with the new amount specified in Nova,
 *      preventing cost duplication (where both the old and new amounts would remain on the invoice).
 *
 * @param itemDesc - Description of the manual item currently stored in the database invoice.
 * @param itemAmount - Amount of the manual item currently stored in the database invoice.
 * @param extraItems - The incoming third-party service items being generated in the current run.
 */
export function isDuplicateManualItem(
  itemDesc: string,
  itemAmount: number,
  extraItems?: Array<{ description: string; amount: number; systemType?: 'terceros' | 'bodegaje' | 'permisos' }>
): boolean {
  // Clean helper: removes format/currency characters and the abbreviation 'tc' to compare descriptions reliably
  const clean = (s: string) => s.toLowerCase()
    .replace(/[\s\(\)₡\d\.,:]+/g, '')
    .replace(/tc/g, '');
    
  const normDesc = clean(itemDesc);
  
  // Classify standard system-generated invoice line items (Terceros / Adicionales)
  const isSystemType = 
    normDesc.includes("tercer") || 
    normDesc.startsWith("servicioadicional") || 
    normDesc.startsWith("serviciosadicional") ||
    normDesc.includes("encomienda");

  // System items are always replaced to ensure they capture the fresh manifest calculation
  if (isSystemType) {
    return true;
  }

  // If there are no incoming extra items (no third-party services configured for this group),
  // custom manual items are preserved (not considered duplicates)
  if (!extraItems || extraItems.length === 0) return false;
  
  return extraItems.some(ei => {
    const normEiDesc = clean(ei.description);
    const descMatch = normDesc.includes(normEiDesc) || normEiDesc.includes(normDesc);
    // Ignore amountMatch so that description matches are treated as duplicates,
    // ensuring the old custom amount gets overwritten by the new amount.
    return descMatch;
  });
}

// ============================================================================
// CRITICAL SAFEGUARD - PREVENT REGRESSIONS FOR MANUAL & BODEGAJE ITEMS:
//
// 1. DO NOT call deleteInvoicesForTrackings() preventively in NovaTableModal.tsx
//    or any other caller before calling createInvoicesFromRows.
//    Doing so deletes draft invoices from Firestore, which makes mergeExistingDrafts
//    unable to read existing drafts. This causes operator manual items (e.g. seguros)
//    and other system type items (e.g. bodegaje) to be lost.
//
// 2. SYSTEM vs MANUAL items:
//    - System items have `isSystem === true` and a specific `systemType`
//      (e.g., 'terceros' for ST or 'bodegaje' for CB).
//    - Manual items have `isManual === true` but do NOT have `isSystem === true`
//      (or they have no systemType).
//    - To deduplicate system items, only delete/update items that match the
//      systemType being regenerated (e.g., 'terceros'). Do NOT touch system items
//      of other systemTypes (e.g., when updating 'terceros', leave 'bodegaje' intact).
//
// 3. FUSION RULE: When mergeExistingDrafts is enabled, always read the draft first,
//    extract non-duplicate/manual/other system items, and then delete the draft
//    atomically before writing the new consolidated invoice.
// ============================================================================
export async function createInvoicesFromRows(
  rows: ProcessedRow[],
  options: {
    ivaEnabled?: boolean;
    exchangeRate?: number;
    /** Optional customer email map: slCode → email */
    emailMap?: Record<string, string>;
    /** Manifest number to stamp on every created invoice */
    manifestNumber?: string;
    /** slCodes whose rows must be merged into one invoice ("Factura única" mode) */
    mergedSlCodes?: Set<string>;
    /** Extra line items (e.g. Servicio de Terceros) keyed by slCode (uppercase) */
    terceroItems?: Map<string, { amount: number; description: string }>;
    /**
     * When true, existing DRAFT invoices for the same (clientSlCode, manifestNumber) are
     * read, their items carried forward, and then the draft is deleted before a new
     * merged invoice is created. Used for manifest reassignment flows where packages
     * are moved to a target manifest that already has a draft invoice.
     * Non-draft invoices are NEVER touched — the AI GUARD applies regardless of this flag.
     */
    mergeExistingDrafts?: boolean;
    /** Source of the invoice, e.g. maritime or nova */
    source?: 'nova' | 'manual' | 'maritime';
    /** Granular actions for protected invoices: SL_CODE -> action */
    protectedActions?: Record<string, 'items_only' | 'overwrite' | 'skip'>;
  } = {}
): Promise<CreateInvoicesResult> {
  const { ivaEnabled = false, exchangeRate = 0, emailMap = {}, manifestNumber, mergedSlCodes, terceroItems, mergeExistingDrafts, source, protectedActions } = options;
  const groups = groupRowsForInvoicing(rows, mergedSlCodes);
  const created: InvoiceRecord[] = [];
  const errors: Array<{ slCode: string; error: string }> = [];
  const skipped: NonNullable<CreateInvoicesResult['skipped']> = [];

  const invoicesRef = collection(db, 'invoices');

  // Batch-fetch customer contact info (email + dni) for all slCodes
  const slCodes = groups.map(g => g.slCode).filter(Boolean);
  const customerMap = await getCustomersBySlCodes(slCodes);

  for (const group of groups) {
    // For unmatched rows (no customer slCode), derive a route-based code
    if (!group.slCode) {
      const code = deriveRouteCode(group.clientRoute);
      group.slCode = code;
      group.userId = code;
    }
    try {
      // Enrich group with customer contact data from Firestore (no-op for route-only codes)
      const contact = customerMap.get(group.slCode.toUpperCase()) || customerMap.get(group.slCode);
      if (contact) {
        if (!group.clientEmail) group.clientEmail = contact.email;
        if (!group.clientDni)   group.clientDni   = contact.dni;
      }
      group.clientName = resolveEffectiveCustomerName({
        overrideName: group.clientName,
        contactName: contact?.fullName,
        manifestConsigneeName: group.rows[0]?.nombre,
        savedCustomerName: group.rows[0]?.nombreCliente,
        slCode: group.slCode,
      });
      // emailMap override takes precedence
      if (emailMap[group.slCode]) {
        group.clientEmail = emailMap[group.slCode];
      }

      // Guard: skip creation when a non-draft invoice already exists for this
      // customer + manifest. Prevents phantom drafts from appearing after
      // a manifest is re-processed while some invoices are already sent/paid.
      // When mergeExistingDrafts=true, existing drafts have their items carried
      // forward into the new invoice, then the stale draft is deleted.
      const groupTercero = terceroItems?.get(String(group.slCode ?? '').toUpperCase());
      const extraItems = groupTercero && groupTercero.amount > 0
        ? [{ description: groupTercero.description || 'Servicio de Terceros', amount: groupTercero.amount, systemType: 'terceros' as const }]
        : undefined;

      let carryItems: InvoiceItem[] = [];
      let carryInvoiceItems: Array<{ description: string; trackingNumber: string; quantity: number; unitPrice: number; totalPrice: number; weight: number; realWeight?: number; isManual: boolean; isPermiso?: boolean }> = [];
      if (manifestNumber && group.slCode) {
        try {
          const existSnap = await getDocs(query(
            invoicesRef,
            where('clientSlCode', '==', group.slCode),
            where('manifestNumber', '==', manifestNumber),
          ));
          // AI GUARD — only ACTIVE protected statuses (sent/paid/overdue/pending)
          // block re-creation. Annulled/cancelled/void docs are tombstones that
          // no longer represent a live billing claim, so the same (slCode,
          // manifestNumber) pair MAY be re-invoiced after the operator anula
          // the previous one (or after annulInvoicesByTrackingsAndManifest does
          // it programmatically via the "Anular y re-crear" flow in NovaTable).
          const protectedDocs = existSnap.docs.filter(d => {
            const s = ((d.data().status as string | undefined) || '').toLowerCase();
            return RECREATE_PROTECTED_STATUSES.has(s);
          });
          if (protectedDocs.length > 0) {
            const mode = protectedActions?.[String(group.slCode ?? '').toUpperCase()] || 'skip';
            if (mode === 'skip') {
              // Record the skip so callers can surface a precise UX message
              // (replaces the previous silent `continue` that left users
              // wondering why "Re-generar factura" did nothing).
              const docTrackings = protectedDocs.flatMap(d => {
                const data = d.data();
                const single = data.trackingNumber ? [String(data.trackingNumber)] : [];
                const multi = Array.isArray(data.trackingNumbers) ? data.trackingNumbers.map(String) : [];
                return [...single, ...multi].map(t => t.toUpperCase()).filter(Boolean);
              });
              skipped.push({
                slCode: group.slCode,
                reason: 'protected',
                statuses: protectedDocs.map(d => ((d.data().status as string | undefined) || '').toLowerCase()),
                invoiceNumbers: protectedDocs
                  .map(d => (d.data().invoiceNumber as string | undefined) || d.id),
                trackings: [...new Set(docTrackings)],
              });
              continue; // never touch sent/paid/overdue/pending invoices
            } else if (mode === 'overwrite') {
              // Mark these existing protected invoices to be deleted/overwritten in SP1 and SP2
              await Promise.all(protectedDocs.map(async (d) => {
                const data = d.data();
                await deleteDoc(d.ref);
                try {
                  await deleteInvoiceFromSp2(d.id, (data.invoiceNumber as string) || d.id);
                } catch (syncErr) {
                  console.warn(`[invoice-service] Failed to delete protected invoice ${d.id} from SP2 on overwrite:`, syncErr);
                }
              }));
            } else if (mode === 'items_only') {
              // Update ONLY the content/items of the first protected invoice in-place
              const firstProtectedDoc = protectedDocs[0];
              const existingInvoice = firstProtectedDoc.data() as InvoiceRecord;

              const groupTercero = terceroItems?.get((group.slCode ?? '').toUpperCase());
              const extraItems = groupTercero && groupTercero.amount > 0
                ? [{ description: groupTercero.description || 'Servicio de Terceros', amount: groupTercero.amount, systemType: 'terceros' as const }]
                : undefined;
              
              // Generate fresh invoice data using the standard builder
              let newData = buildInvoiceData(group, ivaEnabled, exchangeRate, manifestNumber, extraItems, source);

              const newTrackingSet = new Set(
                group.rows.map(r => (r.tracking ?? '').toUpperCase()).filter(Boolean)
              );
              const existII = Array.isArray(existingInvoice.invoiceItems) ? existingInvoice.invoiceItems : [];
              const existIt = Array.isArray(existingInvoice.items) ? existingInvoice.items : [];

              // GAP FIX (mirror of 73a24d1db applied to items_only path):
              // The mergeExistingDrafts path (L1688-1699) already uses isDuplicateManualItem
              // to block stale system items (Servicio de Terceros, Servicio Adicional) from
              // being carried forward. The items_only path (introduced in 657b533ef) never
              // received the same treatment — preservedItems blindly carried the old tercero
              // amount from Firestore, discarding the fresh one from buildInvoiceData.
              //
              // Fix: filter existing items using isDuplicateManualItem (same as mergeExistingDrafts),
              // then explicitly pull fresh system items from newData (tercero_NUEVO).
              // Non-system manual items (operator custom items like "Seguro especial") are
              // preserved because isDuplicateManualItem returns false for them.
              const currentSystemTypes = new Set(extraItems && extraItems.length > 0 ? extraItems.map(ei => ei.systemType || 'terceros') : ['terceros']);
              const preservedInvoiceItems = existII.filter((ii: any) => {
                if (ii.trackingNumber) return false; // tracking items handled via trackingInvoiceItems below
                const isSystemDuplicate = ii.isSystem === true && currentSystemTypes.has(ii.systemType || 'terceros');
                const isLegacyDuplicate = !ii.isSystem && isDuplicateManualItem(ii.description || '', ii.unitPrice ?? ii.totalPrice ?? 0, extraItems);
                return !(isSystemDuplicate || isLegacyDuplicate);
              });
              const preservedItems = existIt.filter((it: any) => {
                if (it.tracking) return false; // tracking items handled via trackingItems below
                const isSystemDuplicate = it.isSystem === true && currentSystemTypes.has(it.systemType || 'terceros');
                const isLegacyDuplicate = !it.isSystem && isDuplicateManualItem(it.description || '', it.amount ?? 0, extraItems);
                return !(isSystemDuplicate || isLegacyDuplicate);
              });

              // Extracting new tracking items from buildInvoiceData
              const trackingInvoiceItems = (newData.invoiceItems ?? []).filter((ii: any) => !ii.isManual && ii.trackingNumber && newTrackingSet.has((ii.trackingNumber ?? '').toUpperCase()));
              const trackingItems = (newData.items ?? []).filter((it: any) => it.tracking && newTrackingSet.has((it.tracking ?? '').toUpperCase()));

              // Fresh system items (Servicio de Terceros) from buildInvoiceData — correct current amount
              const newManualInvoiceItems = (newData.invoiceItems ?? []).filter((ii: any) => ii.isManual);
              const newManualItems = (newData.items ?? []).filter((it: any) => !it.tracking);

              const mergedInvoiceItems = [...preservedInvoiceItems, ...trackingInvoiceItems, ...newManualInvoiceItems];
              const mergedItems = [...preservedItems, ...trackingItems, ...newManualItems];

              // Re-calculate totals
              const mergedTotal = mergedItems.reduce((s, i) => s + (i.amount ?? 0), 0);
              const mergedSub = ivaEnabled ? Math.round(mergedTotal / 1.13 * 100) / 100 : mergedTotal;
              const mergedIva = ivaEnabled ? Math.round((mergedTotal - mergedSub) * 100) / 100 : 0;
              const mergedCRC = exchangeRate > 0 ? Math.round(mergedTotal * exchangeRate) : 0;
              const mergedSubCRC = ivaEnabled ? Math.round(mergedCRC / 1.13) : mergedCRC;
              const mergedIvaCRC = ivaEnabled ? Math.round(mergedCRC - mergedSubCRC) : 0;
              const totalPkgCount = mergedItems.filter(i => !!i.tracking).length;
              const totalWeight = mergedItems.reduce((s, i) => s + (i.weight ?? 0), 0);
              const allTrackings = mergedItems.map(i => i.tracking).filter(Boolean);

              const updatedData: Partial<InvoiceRecord> = {
                items: mergedItems,
                invoiceItems: mergedInvoiceItems,
                totalAmount: mergedTotal,
                subtotalAmount: mergedSub,
                taxAmount: mergedIva,
                amount: mergedTotal,
                subtotal: mergedSub,
                iva: mergedIva,
                amountCRC: mergedCRC,
                subtotalCRC: mergedSubCRC,
                ivaCRC: mergedIvaCRC,
                packageCount: totalPkgCount,
                totalWeight: totalWeight,
                updatedAt: serverTimestamp() as any,
              };

              if (allTrackings.length > 1) {
                updatedData.trackingNumbers = allTrackings;
                updatedData.trackingNumber = allTrackings[0];
              } else if (allTrackings.length === 1) {
                updatedData.trackingNumber = allTrackings[0];
                updatedData.trackingNumbers = deleteField() as any;
              } else {
                updatedData.trackingNumber = deleteField() as any;
                updatedData.trackingNumbers = deleteField() as any;
              }

              // Update the document in Firestore preserving all metadata fields
              await updateDoc(firstProtectedDoc.ref, updatedData);

              const fullUpdatedRecord = { ...existingInvoice, ...updatedData, id: firstProtectedDoc.id };

              // Sync the updated protected invoice to SP2 immediately to guarantee parity!
              try {
                await syncInvoicesToSp2([fullUpdatedRecord as InvoiceRecord]);
              } catch (syncErr) {
                console.warn(`[invoice-service] Failed to sync updated protected invoice ${firstProtectedDoc.id} to SP2:`, syncErr);
              }

              // Add to created list to signal it has been updated
              created.push(fullUpdatedRecord as any);
              continue; // finished handling this protected invoice
            }
          }
          const draftDocs = existSnap.docs.filter(d => {
            const s = d.data().status as string | undefined;
            return !s || s === 'draft';
          });
          if (draftDocs.length > 0) {
            if (mergeExistingDrafts) {
              // Carry forward items from the existing draft(s) into the merged invoice.
              // Items whose trackingNumber is already in the current group are skipped
              // so the new rows always take precedence (deduplication).
              const newTrackingSet = new Set(
                group.rows.map(r => (r.tracking ?? '').toUpperCase()).filter(Boolean)
              );
              for (const d of draftDocs) {
                const existing = d.data();
                const existII: Array<any> = Array.isArray(existing.invoiceItems) ? existing.invoiceItems : [];
                const existIt: Array<any> = Array.isArray(existing.items) ? existing.items : [];
                const currentSystemTypes = new Set(extraItems && extraItems.length > 0 ? extraItems.map(ei => ei.systemType || 'terceros') : ['terceros']);
                carryInvoiceItems.push(
                  ...existII.filter((ii: any) => {
                    const isPkg = !!ii.trackingNumber;
                    if (isPkg) {
                      return !newTrackingSet.has((ii.trackingNumber ?? '').toUpperCase());
                    }
                    const isSystemDuplicate = ii.isSystem === true && currentSystemTypes.has(ii.systemType || 'terceros');
                    const isLegacyDuplicate = !ii.isSystem && isDuplicateManualItem(ii.description || '', ii.unitPrice ?? ii.totalPrice ?? 0, extraItems);
                    return !(isSystemDuplicate || isLegacyDuplicate);
                  })
                );
                carryItems.push(
                  ...existIt.filter((it: any) => {
                    const isPkg = !!it.tracking;
                    if (isPkg) {
                      return !newTrackingSet.has((it.tracking ?? '').toUpperCase());
                    }
                    const isSystemDuplicate = it.isSystem === true && currentSystemTypes.has(it.systemType || 'terceros');
                    const isLegacyDuplicate = !it.isSystem && isDuplicateManualItem(it.description || '', it.amount ?? 0, extraItems);
                    return !(isSystemDuplicate || isLegacyDuplicate);
                  })
                );
              }
            }
            // Delete stale drafts — replaced by the freshly built (merged) invoice
            await Promise.all(draftDocs.map(d => deleteDoc(d.ref)));
          }
        } catch {
          // If the guard query fails, fall through and allow creation
        }
      }

      let data = buildInvoiceData(group, ivaEnabled, exchangeRate, manifestNumber, extraItems, source);

      // Merge carry-forward items from the deleted draft into the new invoice
      if (carryItems.length > 0) {
        const carryTotal    = carryItems.reduce((s, i) => s + (i.amount ?? 0), 0);
        const mergedTotal   = (data.totalAmount ?? 0) + carryTotal;
        const mergedSub     = ivaEnabled ? Math.round(mergedTotal / 1.13 * 100) / 100 : mergedTotal;
        const mergedIva     = ivaEnabled ? Math.round((mergedTotal - mergedSub) * 100) / 100 : 0;
        const mergedCRC     = exchangeRate > 0 ? Math.round(mergedTotal * exchangeRate) : 0;
        const mergedSubCRC  = ivaEnabled ? Math.round(mergedCRC / 1.13) : mergedCRC;
        const mergedIvaCRC  = ivaEnabled ? Math.round(mergedCRC - mergedSubCRC) : 0;
        const allTrackings  = [
          ...(data.trackingNumbers ?? (data.trackingNumber ? [data.trackingNumber] : [])),
          ...carryItems.map(i => i.tracking).filter(Boolean),
        ];
        const totalPkgCount = (data.packageCount ?? 0) + carryItems.filter(i => !!i.tracking).length;
        data = {
          ...data,
          items:           [...(data.items ?? []), ...carryItems],
          invoiceItems:    [...(data.invoiceItems ?? []), ...carryInvoiceItems],
          totalAmount:     mergedTotal,
          subtotalAmount:  mergedSub,
          taxAmount:       mergedIva,
          amount:          mergedTotal,
          subtotal:        mergedSub,
          iva:             mergedIva,
          amountCRC:       mergedCRC,
          subtotalCRC:     mergedSubCRC,
          ivaCRC:          mergedIvaCRC,
          packageCount:    totalPkgCount,
          totalWeight:     (data.totalWeight ?? 0) + carryItems.reduce((s, i) => s + (i.weight ?? 0), 0),
          ...(allTrackings.length > 1 ? { trackingNumbers: allTrackings, trackingNumber: allTrackings[0] } : {}),
          notes: `Factura con reasignación — ${totalPkgCount} paquetes`,
        };
      }

      // ── PRE-FLIGHT INTEGRITY GUARD (BUG-I-AUDIT-04) ────────────────────────
      // Validates data consistency before writing to Firestore. Auto-corrects
      // minor rounding discrepancies; logs errors for major mismatches so
      // corrupted invoices never reach customers silently.
      {
        const pfItems = data.items ?? [];
        const pfItemsTotal = pfItems.reduce((s, i) => s + (i.amount ?? 0), 0);
        // Since data.items already contains extraItems (Servicio de Terceros) via buildInvoiceData,
        // pfItemsTotal is the complete expected sum of the invoice items.
        const pfExpectedTotal = pfItemsTotal;
        const pfStoredTotal = data.totalAmount ?? data.amount ?? 0;
        const pfWeightSum = pfItems.reduce((s, i) => s + (i.weight ?? 0), 0);
        const pfStoredWeight = data.totalWeight ?? 0;

        // Amount integrity: items sum must match totalAmount within tolerance
        if (Math.abs(pfExpectedTotal - pfStoredTotal) > 0.02) {
          console.error(
            `[invoice-service] PRE-FLIGHT AMOUNT MISMATCH: items=$${pfExpectedTotal.toFixed(2)} vs total=$${pfStoredTotal.toFixed(2)} for ${group.slCode}. Auto-correcting.`
          );
          // Auto-correct: recompute totals from items (source of truth)
          const correctedTotal = pfExpectedTotal;
          const correctedSub = ivaEnabled ? Math.round(correctedTotal / 1.13 * 100) / 100 : correctedTotal;
          const correctedIva = ivaEnabled ? Math.round((correctedTotal - correctedSub) * 100) / 100 : 0;
          const correctedCRC = exchangeRate > 0 ? Math.round(correctedTotal * exchangeRate) : 0;
          const correctedSubCRC = ivaEnabled ? Math.round(correctedCRC / 1.13) : correctedCRC;
          const correctedIvaCRC = ivaEnabled ? Math.round(correctedCRC - correctedSubCRC) : 0;
          data = {
            ...data,
            totalAmount: correctedTotal, amount: correctedTotal,
            subtotalAmount: correctedSub, subtotal: correctedSub,
            taxAmount: correctedIva, iva: correctedIva,
            amountCRC: correctedCRC, subtotalCRC: correctedSubCRC, ivaCRC: correctedIvaCRC,
          };
        }

        // Weight integrity: items weight sum must match totalWeight
        if (Math.abs(pfWeightSum - pfStoredWeight) > 0.1) {
          console.warn(
            `[invoice-service] PRE-FLIGHT WEIGHT MISMATCH: items=${pfWeightSum.toFixed(2)} vs totalWeight=${pfStoredWeight.toFixed(2)} for ${group.slCode}. Auto-correcting.`
          );
          data = { ...data, totalWeight: pfWeightSum };
        }

        // Sanity: non-empty, non-zero invoice
        if (!pfItems.length || pfStoredTotal <= 0) {
          console.error(
            `[invoice-service] PRE-FLIGHT EMPTY INVOICE: ${pfItems.length} items, $${pfStoredTotal.toFixed(2)} for ${group.slCode}. Skipping.`
          );
          continue; // skip writing a broken invoice
        }

        // IVA reconciliation: subtotal + iva must equal totalAmount
        const reconTotal = (data.subtotalAmount ?? data.subtotal ?? 0) + (data.taxAmount ?? data.iva ?? 0);
        if (Math.abs(reconTotal - (data.totalAmount ?? 0)) > 0.01) {
          console.warn(
            `[invoice-service] PRE-FLIGHT IVA DRIFT: sub+iva=$${reconTotal.toFixed(2)} vs total=$${(data.totalAmount ?? 0).toFixed(2)} for ${group.slCode}. Rebalancing.`
          );
          const rebalancedIva = Math.round(((data.totalAmount ?? 0) - (data.subtotalAmount ?? data.subtotal ?? 0)) * 100) / 100;
          data = { ...data, taxAmount: rebalancedIva, iva: rebalancedIva };
        }
      }

      const docRef = await addDoc(invoicesRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      created.push({ ...data, id: docRef.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[invoice-service] Error creating invoice for ${group.slCode}:`, msg);
      errors.push({ slCode: group.slCode, error: msg });
    }
  }

  return { created, errors, skipped };
}

// ─── Business rule: every package must be invoiced ───────────────────────────

export interface PackageInvoiceEntry {
  tracking:     string;
  description?: string;
  price?:       number;
  weight?:      number;
  permisos?:    boolean;
}

/**
 * Helper to identify if an invoice or manifest represents a Permits/Restricted category.
 */
export function isInvoiceForPermits(inv: any): boolean {
  if (!inv) return false;
  if (inv.requiresPermit === true) return true;
  const mn = String(inv.manifestNumber || inv.manifestId || '').toUpperCase().trim();
  if (mn.endsWith('DANP') || mn.includes('PERMISO') || mn.includes('PERMIT')) return true;
  return false;
}

/**
 * Customer-invoice selection invariant — used by both the one-shot fetcher and
 * the realtime subscription so they always agree on which invoice is "active".
 *
 * Pick rule (matches `appendPackagesToCustomerInvoice` semantics):
 *  1. Sort by createdAt desc (handles both Timestamp and ISO string).
 *  2. Skip invoices in a PROTECTED terminal state: annulled / void / cancelled / paid.
 *  3. Enforce category compatibility: regular items MUST NOT attach to a permit invoice,
 *     and permit items MUST NOT attach to a regular invoice.
 *  4. Return the first survivor — the package will be appended to this one.
 */
const PROTECTED_INVOICE_STATUSES = new Set(['annulled', 'void', 'cancelled', 'paid']);

export function pickActiveInvoice(
  records: InvoiceRecord[],
  options?: { isPermiso?: boolean; targetManifest?: string }
): InvoiceRecord | null {
  const sorted = [...records].sort((a, b) => {
    const ts = (r: InvoiceRecord) => {
      const v = (r as any).createdAt;
      if (!v) return 0;
      return typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime();
    };
    return ts(b) - ts(a);
  });

  return sorted.find(r => {
    if (PROTECTED_INVOICE_STATUSES.has((r.status || '').toLowerCase())) return false;

    // Strict category separation
    if (options?.isPermiso !== undefined) {
      const invIsPermiso = isInvoiceForPermits(r);
      if (options.isPermiso !== invIsPermiso) return false;
    }

    if (options?.targetManifest) {
      const targetIsPermiso = isInvoiceForPermits({ manifestNumber: options.targetManifest });
      const invIsPermiso = isInvoiceForPermits(r);
      if (targetIsPermiso !== invIsPermiso) return false;
    }

    return true;
  }) ?? null;
}

/**
 * Finds the most recent NON-PROTECTED active invoice for a customer slCode
 * across ALL manifests — exactly the invoice that `appendPackagesToCustomerInvoice`
 * would target on write. Used by the package-manifest inline editor to preview
 * the target invoice BEFORE confirming a move so operators can verify which
 * invoice will receive the package as a new line item.
 *
 * Returns null when no append-eligible invoice exists (operator will then know
 * a new draft is created on next billing pass).
 *
 * @param slCode  Customer SL code (clientSlCode / slCode / customerId variants
 *                are all queried — historical invoices use any of the three).
 */
export async function findActiveInvoiceForCustomer(
  slCode: string,
  options?: { isPermiso?: boolean; targetManifest?: string }
): Promise<InvoiceRecord | null> {
  if (!slCode) return null;
  try {
    const [s1, s2, s3] = await Promise.all([
      getDocs(query(collection(db, 'invoices'), where('clientSlCode', '==', slCode))),
      getDocs(query(collection(db, 'invoices'), where('slCode',       '==', slCode))),
      getDocs(query(collection(db, 'invoices'), where('customerId',   '==', slCode))),
    ]);
    const merged: InvoiceRecord[] = [...s1.docs, ...s2.docs, ...s3.docs]
      .filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i)
      .map(d => ({ id: d.id, ...d.data() } as InvoiceRecord));
    return pickActiveInvoice(merged, options);
  } catch {
    return null;
  }
}

/**
 * Realtime variant of findActiveInvoiceForCustomer. Subscribes to all three
 * historical slCode field variants (clientSlCode, slCode, customerId) so that
 * when ANY downstream mutation lands — payment marks, item appends, status
 * changes, manual edits in /invoices, even cross-tab edits — the consumer
 * receives a fresh "active" invoice within milliseconds.
 */
export function subscribeActiveInvoiceForCustomer(
  slCode: string,
  callback: (invoice: InvoiceRecord | null) => void,
  options?: { isPermiso?: boolean; targetManifest?: string }
): () => void {
  if (!slCode) { callback(null); return () => {}; }

  const byClientSlCode = new Map<string, InvoiceRecord>();
  const bySlCode       = new Map<string, InvoiceRecord>();
  const byCustomerId   = new Map<string, InvoiceRecord>();

  const emit = () => {
    const merged = new Map<string, InvoiceRecord>();
    byClientSlCode.forEach((v, k) => merged.set(k, v));
    bySlCode.forEach((v, k) => merged.set(k, v));
    byCustomerId.forEach((v, k) => merged.set(k, v));
    callback(pickActiveInvoice(Array.from(merged.values()), options));
  };

  const subscribe = (
    field: 'clientSlCode' | 'slCode' | 'customerId',
    target: Map<string, InvoiceRecord>,
  ) => onSnapshot(
    query(collection(db, 'invoices'), where(field, '==', slCode)),
    (snap) => {
      target.clear();
      snap.docs.forEach(d => target.set(d.id, { id: d.id, ...d.data() } as InvoiceRecord));
      emit();
    },
    () => { target.clear(); emit(); },
  );

  const unsub1 = subscribe('clientSlCode', byClientSlCode);
  const unsub2 = subscribe('slCode',       bySlCode);
  const unsub3 = subscribe('customerId',   byCustomerId);

  return () => { unsub1(); unsub2(); unsub3(); };
}

/**
 * Enforces the "every package must be invoiced" rule after a manifest move.
 *
 * Finds the customer's most recent NON-PROTECTED active invoice matching the
 * package's category (regular vs permit) and appends any missing packages as canonical invoiceItems.
 * NEVER mixes regular packages into a permit invoice (or vice versa).
 * NEVER creates a new invoice — only updates an existing compatible one.
 *
 * @param slCode         Customer SL code (clientSlCode / slCode / customerId).
 * @param packages       Packages to ensure are in the invoice.
 * @param now            ISO timestamp for updatedAt (defaults to current time).
 * @param targetManifest Optional target manifest to enforce manifest-level category matching.
 * @returns              The invoice ID that was updated, or null if none found.
 */
export async function appendPackagesToCustomerInvoice(
  slCode:   string,
  packages: PackageInvoiceEntry[],
  now = new Date().toISOString(),
  targetManifest?: string,
): Promise<string | null> {
  if (!slCode || !packages.length) return null;

  const trackings = [...new Set(packages.map(p => p.tracking.toUpperCase()).filter(Boolean))];
  if (!trackings.length) return null;

  // Determine if incoming packages are permits
  const isPermiso = packages.some(p => p.permisos === true);

  // Query all three customer-id field variants used across invoice generations
  const [s1, s2, s3] = await Promise.all([
    getDocs(query(collection(db, 'invoices'), where('clientSlCode', '==', slCode))),
    getDocs(query(collection(db, 'invoices'), where('slCode',       '==', slCode))),
    getDocs(query(collection(db, 'invoices'), where('customerId',   '==', slCode))),
  ]);

  const allDocs = [...s1.docs, ...s2.docs, ...s3.docs]
    .filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i)
    .sort((a, b) => {
      // Sort most-recent-first — handle both Firestore Timestamp and ISO string
      const ts = (snap: typeof a) => {
        const v = snap.data().createdAt;
        if (!v) return 0;
        return typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime();
      };
      return ts(b) - ts(a);
    });

  // Pick the most recent invoice that is not in a protected terminal state AND matches category
  const PROTECTED = new Set(['annulled', 'void', 'cancelled', 'paid']);
  const activeInv = allDocs.find(d => {
    const data = d.data();
    if (PROTECTED.has((data.status || '').toLowerCase())) return false;

    // Strict category guard: never mix regular packages into a permit invoice (DANP) or vice-versa
    const invIsPermiso = isInvoiceForPermits(data);
    if (isPermiso !== invIsPermiso) return false;

    if (targetManifest) {
      const targetIsPermiso = isInvoiceForPermits({ manifestNumber: targetManifest });
      if (targetIsPermiso !== invIsPermiso) return false;
    }

    return true;
  });

  if (!activeInv) return null;

  const invData = activeInv.data();

  // Determine which trackings are genuinely missing from the invoice
  const existingTrackSet = new Set<string>(
    ((invData.trackingNumbers || []) as string[]).map((t: string) => t.toUpperCase())
  );
  const toAdd = trackings.filter(t => !existingTrackSet.has(t));
  if (!toAdd.length) return activeInv.id; // already up to date — nothing to write

  const newTrackings = [...(invData.trackingNumbers || []), ...toAdd];

  // Build canonical invoiceItems matching buildInvoiceData() / InvoiceGeneration.tsx
  const existingItems: any[] = invData.invoiceItems || invData.items || [];
  const existingItemSet = new Set(
    existingItems.map((i: any) => (i.trackingNumber || i.tracking || '').toUpperCase())
  );
  const newItems = [...existingItems];

  for (const tracking of toAdd) {
    if (existingItemSet.has(tracking)) continue;
    const pkg = packages.find(p => p.tracking.toUpperCase() === tracking);
    const unitPrice = pkg?.price ?? 0;
    newItems.push({
      trackingNumber: tracking,
      description:    pkg?.description || 'Paquete reasignado',
      quantity:       1,
      unitPrice,
      totalPrice:     unitPrice,
      weight:         pkg?.weight  ?? 0,
      isManual:       false,
      isPermiso:      pkg?.permisos ?? false,
    });
  }

  const totalAmount = newItems.reduce(
    (s: number, i: any) => s + (Number(i.totalPrice ?? i.unitPrice ?? i.amount) || 0), 0
  );

  await updateDoc(doc(db, 'invoices', activeInv.id), {
    trackingNumbers: newTrackings,
    invoiceItems:    newItems,
    totalAmount,
    amount:          totalAmount,
    subtotal:        totalAmount,
    packageCount:    newTrackings.length,
    updatedAt:       now,
  });

  return activeInv.id;
}

/**
 * Canonical invoice → email payload builder.
 *
 * SINGLE SOURCE OF TRUTH — every email sender in the app must call this
 * function. Do NOT inline field mapping anywhere else.
 *
 * Field mapping rules (must match NovaInvoicePreview exactly):
 *  customerDni     → slCode        (label "SmartId:" in preview + email)
 *  customerAddress → clientRoute   (label "Ruta:"    in preview + email)
 *  items           → invoiceItems preferred over items (manual additions)
 *  total           → always recomputed from items amounts
 *  totalCRC        → computed live: Math.round(total × exchangeRate)
 *  description     → item.description || `Paquete ${item.tracking}`
 *  weight          → Math.ceil(weight) when item.isPermiso=true; otherwise raw Number(item.weight)
 */
export function buildInvoiceEmailPayload(invoice: any, customerConsolidationEnabled?: boolean): Record<string, any> {
  const customer  = invoice.customer || {};

  // Items: invoiceItems contains manual additions; fall back to items
  const rawItems      = invoice.invoiceItems || invoice.items || [];
  const isPermitManifest = ((invoice.manifestNumber || '').toUpperCase().includes('DANP'));
  const itemsForEmail = rawItems.map((item: any) => ({
    tracking:       item.trackingNumber || item.tracking || '',
    description:    item.description || '',
    weight:         item.realWeight != null ? Number(item.realWeight) : (item.weight ? Number(item.weight) : undefined),
    amount:         Number(item.totalPrice || item.unitPrice || item.amount || 0),
    requiresPermit: !!(item.requiresPermit || item.isPermiso || isPermitManifest),
    // BUG-INV-CAPTION 2026-05-05: server-side template branches on isManual to
    // decide whether to render description (manual line items) or tracking
    // (regular packaged items). Must travel with the payload.
    isManual:       !!item.isManual,
  }));

  // Total: storedTotal is authoritative (includes discount, always set on save).
  // Item-sum is a last-resort fallback for very old legacy records only.
  const storedTotal  = Number(invoice.totalAmount || invoice.amount || 0);
  const computedTotal = itemsForEmail.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const total = storedTotal > 0 ? storedTotal : computedTotal;

  // IVA — only derive sub via 1.13 when IVA applies; otherwise sub = total (no rounding)
  const tax  = Number(invoice.taxAmount || invoice.iva || 0);
  const ivaOn = tax > 0;
  const sub   = ivaOn ? Math.round(total / 1.13 * 100) / 100 : total;

  // TC: top-level → item-level → derive from stored amountCRC / amount
  const itemTcSource = rawItems.find((i: any) => (i.exchangeRate ?? 0) > 0);
  const storedAmtCRC = Number(invoice.amountCRC ?? 0);
  const storedAmt    = Number(invoice.amount ?? 0);
  const derivedTc    = storedAmtCRC > 0 && storedAmt > 0 ? Math.round(storedAmtCRC / storedAmt * 100) / 100 : 0;
  const tc = Number(invoice.exchangeRate || 0) > 0
    ? Number(invoice.exchangeRate)
    : Number(itemTcSource?.exchangeRate || 0) > 0
      ? Number(itemTcSource.exchangeRate)
      : derivedTc;

  // SmartId = slCode; Ruta = clientRoute — must match preview field labels
  const clientSlCode = invoice.slCode || customer.slCode || invoice.customerId || '';
  const clientRoute  = invoice.clientRoute || invoice.ruta || customer.ruta || '—';

  // Discount
  const discountAmt = Number(invoice.discountAmount ?? 0);
  const discountPct = Number(invoice.discountPercentage ?? 0);

  // Sub/tax: when a discount exists, use stored values directly so the email
  // shows the correct pre-discount subtotal (not a re-derived one).
  const storedSubAmt = Number(invoice.subtotalAmount ?? 0);
  const storedTaxAmt = Number(invoice.taxAmount ?? invoice.iva ?? 0);
  const finalSub = storedSubAmt > 0 ? storedSubAmt : sub;
  const finalTax = storedTaxAmt > 0 ? storedTaxAmt : tax;

  // Payment status
  const payStatus: 'pending' | 'paid' | 'overdue' =
    invoice.status === 'paid' ? 'paid' : invoice.status === 'overdue' ? 'overdue' : 'pending';

  return {
    source:          invoice.source || '',
    customerEmail:   invoice.clientEmail || customer.email || '',
    customerName:    invoice.clientName || customer.fullName || '',
    customerDni:     clientSlCode || invoice.clientDni || '—',
    customerAddress: clientRoute,
    invoiceNumber:   invoice.invoiceNumber || '',
    invoiceDate:     safeFormatDate(invoice.invoiceDate || invoice.createdAt || invoice.date || new Date().toISOString()),
    dueDate:         safeFormatDate(invoice.dueDate || (invoice.invoiceDate && typeof invoice.invoiceDate === 'string' && !invoice.invoiceDate.includes('/') ? new Date(new Date(invoice.invoiceDate).getTime() + 3 * 86400000).toISOString() : new Date(Date.now() + 3 * 86400000).toISOString())),
    paymentStatus:   payStatus,
    items:           itemsForEmail,
    subtotal:        finalSub,
    discountAmount:  discountAmt > 0 ? discountAmt : undefined,
    discountPercentage: discountPct > 0 ? discountPct : undefined,
    tax:             finalTax,
    total,
    currencySymbol:  '$',
    ivaEnabled:      ivaOn,
    exchangeRate:    tc > 0 ? tc : undefined,
    totalCRC:        tc > 0 ? Math.round(total * tc) : undefined,
    notes:           invoice.notes,
    isConsolidation: customerConsolidationEnabled === false ? false : isConsolidatedInvoice(invoice),
    hasPermitItems:  !!(invoice.hasPermitItems || isPermitManifest || itemsForEmail.some((i: any) => i.requiresPermit)),
  };
}

/**
 * Send invoice emails via SP1's `sendInvoiceEmailFunction` Cloud Function.
 *
 * GUARD (BUG-I04): Invoices without a `clientEmail` are silently skipped.
 * They are NOT counted in `sent` or `failed` — they are simply omitted.
 * This matches the expectation from `sendInvoiceEmails` regression tests.
 *
 * ERROR HANDLING: A Cloud Function rejection for one invoice does NOT abort
 * the remaining sends. Each invoice is processed independently.
 * Failures accumulate in `errors[]` with `{ email, error }` entries.
 *
 * @returns { sent, failed, errors } — totals only count invoices with an email.
 */
export async function sendInvoiceEmails(
  invoices: InvoiceRecord[],
  opts?: { sentBy?: string; source?: string },
): Promise<SendEmailsResult> {
  const functions = getFunctions(app);
  const sendEmailFn = httpsCallable(functions, 'sendInvoiceEmailFunction');

  let sent = 0;
  let failed = 0;
  const errors: Array<{ email: string; error: string }> = [];
  const sentBy = opts?.sentBy || opts?.source || 'system';

  for (const inv of invoices) {
    if (!inv.clientEmail) continue;

    // DRAFT-GUARD (BUG-EMAIL-DRAFT): never send email for draft invoices.
    // Drafts are unconfirmed — the operator has not explicitly sent them.
    // Status defaults to 'draft' if missing (matches createInvoicesFromRows).
    const invStatus = String((inv as any).status ?? 'draft').toLowerCase();
    if (invStatus === 'draft') continue;

    // Fetch customer profile to check consolidation flag
    let customerConsolidationEnabled: boolean | undefined = undefined;
    const invSlCode = inv.slCode || inv.clientSlCode || inv.customerId || inv.userId;
    if (invSlCode) {
      try {
        const custRef = doc(db, 'customers', String(invSlCode).toUpperCase().trim());
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          customerConsolidationEnabled = custSnap.data().consolidationEnabled === true;
        }
      } catch (err) {
        console.warn(`[sendInvoiceEmails] Failed to fetch customer consolidation flag for ${invSlCode}:`, err);
      }
    }

    const payload = buildInvoiceEmailPayload(inv, customerConsolidationEnabled);
    if (!payload.customerEmail) continue;

    try {
      const result: any = await sendEmailFn(payload);
      sent++;
      // Always persist the send log — this is the canonical "history" entry
      // surfaced in the invoice panel. Extracting a Resend messageId when
      // the Cloud Function returns one keeps parity with the Facturas UI.
      if (inv.id) {
        const resendMessageId =
          result?.data?.messageId ?? result?.messageId ?? null;
        await recordInvoiceEmailSent(inv.id, {
          sentTo: payload.customerEmail,
          sentBy,
          invoiceNumber: inv.invoiceNumber || '',
          resendMessageId,
          currentStatus: (inv as any).status ?? null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[invoice-service] Email failed for ${inv.clientEmail}:`, msg);
      errors.push({ email: inv.clientEmail, error: msg });
      failed++;
    }
  }

  return { sent, failed, errors };
}

/**
 * Persist a send-log entry on an invoice document after a successful email
 * delivery. This is the canonical shape used by the Facturas UI
 * (`InvoiceGeneration.tsx`) and by the Nova resend action — keeping the
 * schema identical guarantees that the email history panel stays consistent
 * regardless of which flow actually triggered the send.
 *
 * The write is best-effort and idempotent for `status`: it only promotes a
 * `draft` invoice to `sent`. Protected statuses (`paid`, `overdue`,
 * `cancelled`, `annulled`) are never overwritten.
 *
 * Uses `arrayUnion` for `emailSendLogs` and `emailResendIds` so concurrent
 * resends from different operators don't clobber each other.
 */
export async function recordInvoiceEmailSent(
  invoiceId: string,
  entry: {
    sentTo: string;
    sentBy: string;
    invoiceNumber: string;
    resendMessageId?: string | null;
    currentStatus?: string | null;
  },
): Promise<void> {
  if (!invoiceId) return;
  // IMPORTANT: the whole body is wrapped in a single try so that *any*
  // failure (missing Firestore in tests, serialisation issues, SDK import
  // glitches) is caught and logged. The email already went out — we must
  // never throw into the calling flow and poison its success count.
  try {
    const nowIso = new Date().toISOString();
    const resendMessageId = entry.resendMessageId ?? null;
    const log = {
      resendMessageId,
      sentTo: entry.sentTo,
      sentAt: nowIso,
      sentBy: entry.sentBy || 'system',
      invoiceNumber: entry.invoiceNumber || '',
    };
    // STATUS-PROMOTE: only promote draft → sent on first email send.
    // Previous logic used !protectedStatuses.has(currentStatus) which would
    // regress 'pending_payment' and 'pending' back to 'sent' on resend.
    // Correct intent: only a draft invoice needs the status promotion;
    // all other non-draft statuses (sent, pending, pending_payment) are preserved.
    const willPromoteStatus =
      !entry.currentStatus || entry.currentStatus === 'draft';
    const data: Record<string, any> = {
      emailSent: true,
      emailSentAt: nowIso,
      emailStatus: 'sent',
      emailSendLogs: arrayUnion(log),
      updatedAt: nowIso,
      ...(resendMessageId ? { lastResendMessageId: resendMessageId, emailResendIds: arrayUnion(resendMessageId) } : {}),
      ...(willPromoteStatus ? { status: 'sent' } : {}),
    };
    await updateDoc(doc(db, 'invoices', invoiceId), data);
  } catch (err) {
    console.warn(`[invoice-service] Failed to record email send log for ${invoiceId}:`, err);
  }
}

/**
 * Send a TEST copy of an invoice to any email address.
 * NEVER sends to the real client — overrides customerEmail with testEmail.
 * Use this for QA / preview purposes only.
 */
export async function sendTestInvoiceEmail(
  invoice: InvoiceRecord | Record<string, any>,
  testEmail: string
): Promise<void> {
  const functions = getFunctions(app);
  const sendEmailFn = httpsCallable(functions, 'sendInvoiceEmailFunction');
  const payload = buildInvoiceEmailPayload(invoice);
  payload.customerEmail = testEmail;
  await sendEmailFn(payload);
}

/**
 * Safe formatter for invoice date/due date in Costa Rica timezone.
 * If already formatted in DD/MM/YYYY, returns it directly.
 * Handles Firestore Timestamps, ISO strings, Date objects, and fallbacks to prevent "Invalid Date".
 */
export function safeFormatDate(dateVal: any, options?: Intl.DateTimeFormatOptions): string {
  return formatCostaRicaDate(dateVal, options);
}

/**
 * Safe formatter for date and time in Costa Rica timezone.
 */
export function safeFormatDateTime(dateVal: any, options?: Intl.DateTimeFormatOptions): string {
  return formatCostaRicaDateTime(dateVal, options);
}
