/**
 * useDriverMetrics — real-time performance tracking for active route drivers.
 *
 * Responsibilities:
 * 1. Track every meaningful driver event (nav clicks, panel opens, confirmations)
 * 2. Compute running performance KPIs (stop duration, inter-delivery cadence)
 * 3. Fire real-time idle alerts if the driver hasn't confirmed a delivery in >10 min
 * 4. Expose a `trackEvent()` function to instrument any UI touch point
 *
 * GAP 3 fix: flushSnapshot is throttled to at most once every 15 s to prevent
 *            Firestore write storms during rapid panel open/close cycling.
 * GAP 4 fix: bulk_deliver_confirmed correctly accumulates `count` from extras.
 * GAP 7 fix: hook is instantiated ONCE in ActiveRouteView and props are passed
 *            down to PackageList — no double idle-detector registration.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  recordDriverEvent,
  updatePerformanceSnapshot,
  type DriverEvent,
  type DriverEventType,
  type PerformanceSnapshot,
} from '@/lib/services/driver-metrics-service';
import type { RouteSession } from '@/lib/services/route-session-service';

// ── Idle threshold ─────────────────────────────────────────────────────────────
const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const IDLE_CHECK_INTERVAL_MS = 30 * 1000; // check every 30s

// GAP 3: snapshot throttle — no more than 1 Firestore write per 15 s
const SNAPSHOT_THROTTLE_MS = 15 * 1000;

// ── Idle alert copy ────────────────────────────────────────────────────────────
const IDLE_MESSAGES = [
  {
    headline: '⏱ Llevas más de 10 minutos sin registrar una entrega',
    body: 'Sé que estás haciendo un gran esfuerzo. Si seguís con este ritmo es posible que no completes la ruta a tiempo. ¿Podés avanzar a la siguiente parada?',
  },
  {
    headline: '🚦 Atención: pausa prolongada detectada',
    body: 'Han pasado más de 10 minutos desde la última entrega. Agrupa las paradas cercanas para recuperar el tiempo y mantener la ruta al día.',
  },
  {
    headline: '📦 Ritmo por debajo del óptimo',
    body: 'Tu tiempo promedio entre entregas está por encima de lo recomendado. Recuerda: registra cada entrega al momento y avanza sin demora.',
  },
];

// ── Types exposed to consumers ─────────────────────────────────────────────────

export interface IdleAlert {
  headline: string;
  body: string;
  triggeredAt: string; // ISO
  idleMinutes: number;
}

/** Exported so DriverRouteWizard.tsx can use Pick<MetricsState, ...> for PackageList props */
export interface MetricsState {
  snapshot: Partial<PerformanceSnapshot>;
  idleAlert: IdleAlert | null;
  /** Call this from any UI touch point */
  trackEvent: (
    type: DriverEventType | 'session_close',
    extras?: Partial<Omit<DriverEvent, 'type' | 'ts' | 'sessionId' | 'driverId'>>
  ) => void;
  /** Call when driver opens a package panel (starts the stop timer) */
  startStopTimer: (packageId: string) => void;
  /** Call when delivery/return is confirmed — returns elapsed ms */
  endStopTimer: (packageId: string) => number | null;
  /** Dismiss the current idle alert */
  dismissIdleAlert: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useDriverMetrics(session: RouteSession): MetricsState {
  const sessionId = session.id!;
  const driverId = session.driverId;

  // Running KPI accumulators (refs — avoid re-render on every event)
  const sessionStartTs = useRef<number>(Date.now());
  const stopDurationsRef = useRef<number[]>([]);
  const interDeliveryMs = useRef<number[]>([]);
  const lastDeliveryTsRef = useRef<number | null>(null);
  const firstDeliveryTsRef = useRef<number | null>(null); // GAP 5: firstDeliveryMinutes
  const lastActivityTsRef = useRef<number>(Date.now());
  const deliveriesRef = useRef<number>(session.deliveredCount || 0);
  const returnsRef = useRef<number>(0);
  const wazeClicksRef = useRef<number>(0);
  const mapsClicksRef = useRef<number>(0);
  const idleAlertCountRef = useRef<number>(0);

  // GAP 3: throttle gate — tracks last Firestore write timestamp
  const lastSnapshotWriteRef = useRef<number>(0);

  // Per-package stop timers — packageId → start timestamp
  const stopTimers = useRef<Map<string, number>>(new Map());

  const [snapshot, setSnapshot] = useState<Partial<PerformanceSnapshot>>({});
  const [idleAlert, setIdleAlert] = useState<IdleAlert | null>(null);
  const idleAlertActive = useRef(false);

  // ── Snapshot flush (throttled) ─────────────────────────────────────────────
  const flushSnapshot = useCallback((force = false) => {
    const now = Date.now();
    // GAP 3: skip Firestore write if last write was less than 15s ago (unless forced)
    if (!force && now - lastSnapshotWriteRef.current < SNAPSHOT_THROTTLE_MS) {
      return;
    }
    lastSnapshotWriteRef.current = now;

    const durs = stopDurationsRef.current;
    const cadence = interDeliveryMs.current;
    const totalPkgs = session.packages.length;
    const sessionElapsedMs = now - sessionStartTs.current;

    const avgStop = durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const avgCadence = cadence.length > 0 ? Math.round(cadence.reduce((a, b) => a + b, 0) / cadence.length) : null;

    // GAP 5: compute extended operational KPIs
    const deliveredCount = deliveriesRef.current;
    const completionRate = totalPkgs > 0 ? Math.round((deliveredCount / totalPkgs) * 100) : 0;
    const returnRate = totalPkgs > 0 ? Math.round((returnsRef.current / totalPkgs) * 100) : 0;
    const totalSessionMinutes = Math.round(sessionElapsedMs / 60_000);
    const deliveriesPerHour = sessionElapsedMs > 0
      ? Math.round((deliveredCount / sessionElapsedMs) * 60 * 60 * 1000 * 10) / 10
      : 0;
    const firstDeliveryMinutes = firstDeliveryTsRef.current
      ? Math.round((firstDeliveryTsRef.current - sessionStartTs.current) / 60_000)
      : null;

    const snap: Partial<PerformanceSnapshot> = {
      lastActivityAt: new Date(lastActivityTsRef.current).toISOString(),
      deliveriesThisSession: deliveredCount,
      returnsThisSession: returnsRef.current,
      avgStopDurationMs: avgStop,
      avgTimeBetweenDeliveriesMs: avgCadence,
      navWazeClicks: wazeClicksRef.current,
      navGoogleMapsClicks: mapsClicksRef.current,
      idleAlertCount: idleAlertCountRef.current,
      // GAP 5 extended fields
      completionRate,
      returnRate,
      totalSessionMinutes,
      deliveriesPerHour,
      firstDeliveryMinutes,
    };

    setSnapshot(snap);
    void updatePerformanceSnapshot(sessionId, snap);
  }, [sessionId, session.packages.length]);

  // ── Core event recorder ────────────────────────────────────────────────────
  const trackEvent = useCallback(
    (
      type: DriverEventType | 'session_close',
      extras?: Partial<Omit<DriverEvent, 'type' | 'ts' | 'sessionId' | 'driverId'>>
    ) => {
      const now = Date.now();
      lastActivityTsRef.current = now;

      // When a confirmed delivery event arrives, compute cadence
      if (type === 'delivery_confirmed') {
        deliveriesRef.current += 1;
        if (!firstDeliveryTsRef.current) firstDeliveryTsRef.current = now;
        if (lastDeliveryTsRef.current) {
          interDeliveryMs.current.push(now - lastDeliveryTsRef.current);
        }
        lastDeliveryTsRef.current = now;
        if (idleAlertActive.current) { idleAlertActive.current = false; setIdleAlert(null); }
      }

      if (type === 'bulk_deliver_confirmed') {
        // GAP 4 fix: use explicit count passed via extras, otherwise default to 1
        const count = (extras as any)?.count ?? 1;
        deliveriesRef.current += count;
        if (!firstDeliveryTsRef.current) firstDeliveryTsRef.current = now;
        if (lastDeliveryTsRef.current) interDeliveryMs.current.push(now - lastDeliveryTsRef.current);
        lastDeliveryTsRef.current = now;
        if (idleAlertActive.current) { idleAlertActive.current = false; setIdleAlert(null); }
      }

      if (type === 'return_confirmed' || type === 'bulk_return_confirmed') {
        returnsRef.current += 1;
        lastDeliveryTsRef.current = now; // resets idle clock on returns too
        if (idleAlertActive.current) { idleAlertActive.current = false; setIdleAlert(null); }
      }

      if (type === 'nav_waze_click') wazeClicksRef.current += 1;
      if (type === 'nav_google_maps_click' || type === 'nav_next_stop_maps_click') mapsClicksRef.current += 1;

      // Build the event object
      const event: DriverEvent = {
        type: type as DriverEventType,
        ts: new Date(now).toISOString(),
        sessionId,
        driverId,
        ...extras,
      };

      // Fire & forget
      void recordDriverEvent(event);

      // Flush snapshot (throttled — writes at most every 15s)
      // Force flush on high-value events: confirmations + session close
      const forceFlush = [
        'delivery_confirmed',
        'bulk_deliver_confirmed',
        'return_confirmed',
        'bulk_return_confirmed',
        'session_close',
      ].includes(type);
      flushSnapshot(forceFlush);
    },
    [sessionId, driverId, flushSnapshot]
  );

  // ── Stop timer helpers ─────────────────────────────────────────────────────
  const startStopTimer = useCallback((packageId: string) => {
    stopTimers.current.set(packageId, Date.now());
  }, []);

  const endStopTimer = useCallback((packageId: string): number | null => {
    const start = stopTimers.current.get(packageId);
    if (!start) return null;
    const elapsed = Date.now() - start;
    stopTimers.current.delete(packageId);
    stopDurationsRef.current.push(elapsed);
    return elapsed;
  }, []);

  // ── Session open event (once) ─────────────────────────────────────────────
  useEffect(() => {
    trackEvent('session_app_open');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // fire once

  // ── Idle detector ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const idleMs = Date.now() - lastActivityTsRef.current;
      if (idleMs >= IDLE_THRESHOLD_MS && !idleAlertActive.current) {
        idleAlertActive.current = true;
        idleAlertCountRef.current += 1;

        const msgIdx = (idleAlertCountRef.current - 1) % IDLE_MESSAGES.length;
        const msg = IDLE_MESSAGES[msgIdx];
        const idleMinutes = Math.floor(idleMs / 60_000);

        const alert: IdleAlert = {
          headline: msg.headline,
          body: msg.body,
          triggeredAt: new Date().toISOString(),
          idleMinutes,
        };
        setIdleAlert(alert);

        void recordDriverEvent({
          type: 'session_idle_alert',
          ts: alert.triggeredAt,
          sessionId,
          driverId,
        });

        flushSnapshot(true); // force on idle alert
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [sessionId, driverId, flushSnapshot]);

  const dismissIdleAlert = useCallback(() => {
    idleAlertActive.current = false;
    setIdleAlert(null);
    lastActivityTsRef.current = Date.now(); // reset idle clock on dismiss
  }, []);

  return { snapshot, idleAlert, trackEvent, startStopTimer, endStopTimer, dismissIdleAlert };
}
