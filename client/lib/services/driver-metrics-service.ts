/**
 * Driver Metrics Service
 *
 * Records every meaningful driver interaction (nav app clicks, panel opens,
 * delivery confirmations) to a Firestore subcollection `route_sessions/{id}/driver_metrics`.
 *
 * Also writes a running `performance_snapshot` object to the parent session doc
 * so supervisors can see live KPIs without reading the full subcollection.
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Event types ────────────────────────────────────────────────────────────────

export type DriverEventType =
  // Navigation
  | 'nav_waze_click'
  | 'nav_google_maps_click'
  | 'nav_next_stop_maps_click'
  // Package interaction
  | 'pkg_panel_open'
  | 'pkg_panel_close'
  | 'group_expanded'
  | 'group_actions_opened'
  // Delivery flow
  | 'delivery_started'     // opened signature modal
  | 'delivery_confirmed'   // signature submitted & saved
  | 'return_started'       // opened return reason modal
  | 'return_confirmed'     // return reason submitted & saved
  | 'bulk_deliver_started'
  | 'bulk_deliver_confirmed'
  | 'bulk_return_confirmed'
  // Session
  | 'session_app_open'     // first render of ActiveRouteView
  | 'session_idle_alert'   // system fired idle warning to driver
  | 'session_close';       // GAP 2/8: driver closes the route session

export interface DriverEvent {
  type: DriverEventType;
  ts: string; // ISO timestamp
  sessionId: string;
  driverId: string;
  // optional enrichment
  packageId?: string;
  tracking?: string;
  customerName?: string;
  // computed durations (ms) — set on confirmation events
  stopDurationMs?: number;    // time from pkg_panel_open → delivery_confirmed
  timeSinceLastDeliveryMs?: number; // ms since previous delivery_confirmed
  // navigation
  app?: 'waze' | 'google_maps';
  coords?: { lat: number; lng: number };
}

// ── Performance snapshot written to session doc ────────────────────────────────
// GAP 5: expanded with 6 additional operational KPIs needed by supervisor dashboards

export interface PerformanceSnapshot {
  // ── Activity ────────────────────────────────────────────────────────────────
  lastActivityAt: string;       // ISO — last meaningful driver action

  // ── Delivery counts ─────────────────────────────────────────────────────────
  deliveriesThisSession: number;
  returnsThisSession: number;

  // ── Efficiency KPIs ─────────────────────────────────────────────────────────
  avgStopDurationMs: number | null; // avg time panel-open → confirmed, in ms
  avgTimeBetweenDeliveriesMs: number | null; // avg cadence between delivery events
  completionRate: number;       // % of packages delivered (0–100)
  returnRate: number;           // % of packages returned (0–100)
  deliveriesPerHour: number;    // packages delivered per hour of session elapsed
  firstDeliveryMinutes: number | null; // minutes from session start to first delivery
  totalSessionMinutes: number;  // total elapsed minutes since session start

  // ── Navigation ──────────────────────────────────────────────────────────────
  navWazeClicks: number;
  navGoogleMapsClicks: number;

  // ── Alerts ──────────────────────────────────────────────────────────────────
  idleAlertCount: number;
}

const SUBCOLLECTION = 'driver_metrics';

// ── Record a single event ──────────────────────────────────────────────────────

export async function recordDriverEvent(event: DriverEvent): Promise<void> {
  try {
    // 1. Write to subcollection
    await addDoc(
      collection(db, 'route_sessions', event.sessionId, SUBCOLLECTION),
      { ...event, _serverTs: serverTimestamp() }
    );
  } catch (err) {
    // Non-fatal — never block the delivery flow
    console.warn('[DriverMetrics] Failed to record event:', err);
  }
}

// ── Update the running performance snapshot on the session doc ─────────────────

export async function updatePerformanceSnapshot(
  sessionId: string,
  snapshot: Partial<PerformanceSnapshot>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'route_sessions', sessionId), {
      performance: snapshot,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[DriverMetrics] Failed to update snapshot:', err);
  }
}
