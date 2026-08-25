/**
 * AuditService
 *
 * Writes structured audit entries to the Firestore `audit_logs` collection.
 * Completely non-blocking — all writes are fire-and-forget with micro-batching.
 *
 * Collection: audit_logs
 * Recommended composite indexes: (userId, timestamp), (action, timestamp), (category, timestamp)
 *
 * Usage:
 *   logAction({ userId, userName, action: 'nova_query', category: 'nova', result: 'success' });
 *
 * For query / admin UI use getAuditLogs().
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Config ─────────────────────────────────────────────────────────────────────

const COLLECTION = 'audit_logs';
const APP_VERSION = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_VERSION) ? (import.meta.env.VITE_APP_VERSION as string) : 'dev';
const BATCH_MAX = 10;
const BATCH_INTERVAL_MS = 2_000;

// ── Action taxonomy ───────────────────────────────────────────────────────────

export type AuditCategory =
  | 'auth'
  | 'nova'
  | 'tracking'
  | 'manifest'
  | 'invoice'
  | 'quote'
  | 'customer'
  | 'package'
  | 'route'
  | 'delivery'
  | 'label'
  | 'shipping_label'
  | 'pre_alerts'
  | 'scanner'
  | 'payroll'
  | 'analytics'
  | 'navigation'
  | 'settings'
  | 'user_management'
  | 'system';

export type AuditAction =
  // Auth
  | 'login'
  | 'logout'
  | 'session_expired'
  | 'auth_error'
  // Nova
  | 'nova_query'
  | 'nova_tool_used'
  | 'nova_session_start'
  | 'nova_session_end'
  | 'nova_manifest_processed'
  // Tracking
  | 'tracking_search'
  | 'tracking_viewed'
  | 'tracking_status_updated'
  // Manifest
  | 'manifest_uploaded'
  | 'manifest_processed'
  | 'manifest_exported'
  | 'manifest_downloaded'
  | 'manifest_packages_moved'
  | 'manifest_ingested'
  | 'manifest_viewed'
  | 'manifest_closed'
  // Invoice
  | 'invoice_viewed'
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_sent'
  | 'invoice_deleted'
  | 'invoice_restored'
  | 'invoice_permanently_deleted'
  | 'invoice_reassigned'
  | 'invoice_regenerated_paid'
  // Customer
  | 'customer_searched'
  | 'customer_viewed'
  | 'customer_created'
  | 'customer_updated'
  | 'customer_ruta_changed'   // Explicit route reassignment — includes source, previousRuta, changedBy
  | 'customer_linked'
  // Package
  | 'package_viewed'
  | 'package_status_updated'
  | 'package_slcode_updated'
  | 'packages_bulk_updated'
  | 'package_deleted'
  // Quote
  | 'quote_created'
  | 'quote_updated'
  | 'quote_deleted'
  | 'quote_viewed'
  | 'quote_sent'
  | 'quote_converted'
  // Route
  | 'route_created'
  | 'route_updated'
  | 'route_viewed'
  | 'route_dispatched'
  | 'route_completed'
  // Delivery
  | 'delivery_created'
  | 'delivery_updated'
  | 'delivery_assigned'
  | 'delivery_completed'
  | 'delivery_failed'
  | 'delivery_photo_uploaded'
  // Shipping label
  | 'label_generated'
  | 'label_printed'
  | 'label_cancelled'
  | 'label_status_updated'
  // Pre-alerts
  | 'pre_alert_viewed'
  | 'pre_alert_searched'
  | 'pre_alert_bypass'
  // Scanner
  | 'scanner_scan'
  | 'scanner_confirmed'
  | 'scanner_batch_scan'
  // Payroll
  | 'payroll_report_generated'
  | 'payroll_employee_created'
  | 'payroll_employee_updated'
  | 'time_entry_created'
  | 'time_entry_updated'
  // Analytics
  | 'analytics_report_viewed'
  | 'analytics_export'
  // Navigation
  | 'page_view'
  // Settings / user mgmt
  | 'settings_updated'
  | 'user_created'
  | 'user_updated'
  | 'user_role_changed'
  | 'user_suspended'
  | 'user_deleted'
  // System
  | 'sync_triggered'
  | 'error'
  | 'system_event';

export type AuditResult = 'success' | 'error' | 'pending';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export type AuditSource = 'client' | 'server';

export interface AuditEntry {
  userId: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  category: AuditCategory;
  resource?: string;
  resourceId?: string;
  result: AuditResult;
  errorMessage?: string;
  source?: AuditSource;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  // auto-populated by logAction()
  page?: string;
  clientTimestamp?: string;
  userAgent?: string;
  platform?: string;
  language?: string;
  timezone?: string;
  screenSize?: string;
  appVersion?: string;
}

interface AuditDoc extends AuditEntry {
  timestamp: ReturnType<typeof serverTimestamp>;
}

export interface AuditLogDoc extends AuditEntry {
  id: string;
  timestamp: string;
}

// ── Device context helper ─────────────────────────────────────────────────────

function getDeviceContext(): Pick<
  AuditEntry,
  'page' | 'userAgent' | 'platform' | 'language' | 'timezone' | 'screenSize'
> {
  // Defensive guards on every browser global — audit logging must NEVER crash
  // the parent operation. Reading `screen.width` in jsdom / SSR / web-worker
  // environments throws `ReferenceError: screen is not defined`, which used to
  // bubble up through `logAction` → `saveManifestRecord` and abort the entire
  // save in test runs. Each global is checked independently so partial
  // environments still capture as much context as possible.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    page: typeof window !== 'undefined' ? window.location.pathname : '',
    userAgent: ua,
    platform: ua && /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Web',
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
    screenSize: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
  };
}

// ── Micro-batch queue ─────────────────────────────────────────────────────────

let _queue: AuditDoc[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  _flushTimer = null;
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  const ref = collection(db, COLLECTION);
  await Promise.allSettled(batch.map(entry => addDoc(ref, entry)));
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    flush().catch(() => {});
  }, BATCH_INTERVAL_MS);
}

// ── Public write API ──────────────────────────────────────────────────────────

/**
 * Queue a single audit entry for Firestore write.
 * Returns immediately — completely non-blocking.
 */
export function logAction(entry: AuditEntry): void {
  const doc: AuditDoc = {
    ...getDeviceContext(),
    clientTimestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    source: 'client',
    ...entry,
    timestamp: serverTimestamp(),
  };
  _queue.push(doc);
  if (_queue.length >= BATCH_MAX) {
    flush().catch(() => {});
  } else {
    scheduleFlush();
  }
}

/**
 * Force-flush pending entries. Call on logout or visibilitychange → hidden.
 */
export function flushAuditQueue(): Promise<void> {
  return flush().catch(() => {});
}

// ── Public query API ──────────────────────────────────────────────────────────

export interface AuditLogsFilter {
  userId?: string;
  action?: AuditAction;
  category?: AuditCategory;
  limitN?: number;
}

export async function getAuditLogs(filters: AuditLogsFilter = {}): Promise<AuditLogDoc[]> {
  const ref = collection(db, COLLECTION);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: any[] = [orderBy('timestamp', 'desc')];
  if (filters.userId) constraints.push(where('userId', '==', filters.userId));
  if (filters.action) constraints.push(where('action', '==', filters.action));
  if (filters.category) constraints.push(where('category', '==', filters.category));
  constraints.push(limit(filters.limitN ?? 100));

  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...(data as AuditEntry),
      timestamp: data['timestamp']?.toDate?.()?.toISOString() ?? data['clientTimestamp'] ?? '',
    } as AuditLogDoc;
  });
}

// ── Manifest move history ───────────────────────────────────────────────────────

export interface ManifestMoveEvent {
  fromManifest: string;
  count: number;
  timestamp: string;
  userName?: string;
}

/**
 * Query audit_logs for package-move events targeting `manifestId`.
 * Returns moves sorted newest-first. Uses resourceId (top-level field) so
 * no composite index is needed — single-field auto-index on resourceId suffices.
 */
export async function getManifestMoveHistory(manifestId: string): Promise<ManifestMoveEvent[]> {
  try {
    const ref = collection(db, 'audit_logs');
    const q = query(ref, where('resourceId', '==', manifestId), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .filter(d => d.data().action === 'manifest_packages_moved')
      .map(d => {
        const data = d.data();
        return {
          fromManifest: (data.metadata?.fromManifest as string) ?? '',
          count:        (data.metadata?.count        as number) ?? 0,
          timestamp:    data.clientTimestamp ?? data.timestamp?.toDate?.()?.toISOString?.() ?? '',
          userName:     (data.userName as string) || undefined,
        };
      })
      .filter(e => e.fromManifest)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

// ── Flush on tab close / hide ─────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAuditQueue().catch(() => {});
    }
  });
}
