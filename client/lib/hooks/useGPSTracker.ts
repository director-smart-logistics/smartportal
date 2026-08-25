/**
 * useGPSTracker — React hook for driver GPS tracking during route sessions.
 *
 * - Requests geolocation permission from the browser
 * - Tracks position every GPS_INTERVAL_MS (2 minutes)
 * - Saves waypoints to Firestore route_sessions/{sessionId}/waypoints
 * - Calculates speed between waypoints using Haversine formula
 * - Shows GPS status badge in UI
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { saveWaypoint } from '@/lib/services/fleet-ai-service';
import type { GPSWaypoint } from '@/lib/services/fleet-ai-service';

const GPS_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

export type GPSStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error' | 'unsupported';

export interface GPSTrackerState {
  status: GPSStatus;
  lastPoint: GPSWaypoint | null;
  waypointCount: number;
  errorMessage?: string;
}

// ── Haversine distance ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useGPSTracker(sessionId: string | null): GPSTrackerState {
  const [status, setStatus] = useState<GPSStatus>('idle');
  const [lastPoint, setLastPoint] = useState<GPSWaypoint | null>(null);
  const [waypointCount, setWaypointCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPointRef = useRef<GPSWaypoint | null>(null);

  const captureAndSave = useCallback(async () => {
    if (!sessionId) return;

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const now = new Date().toISOString();
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;

          // Calculate speed from previous point
          let speed: number | undefined;
          const prev = lastPointRef.current;
          if (prev) {
            const distKm = haversineKm(prev.lat, prev.lng, lat, lng);
            
            // Skip database writes if the vehicle has not moved significantly (less than 20 meters)
            // to optimize database operational costs, cellular bandwidth, and battery.
            if (distKm < 0.02) {
              setStatus('active');
              resolve();
              return;
            }

            const prevTs = new Date(prev.ts).getTime();
            const nowTs = new Date(now).getTime();
            const hours = (nowTs - prevTs) / 3_600_000;
            speed = hours > 0 ? Math.round(distKm / hours) : 0;
          }

          const waypoint: GPSWaypoint = { lat, lng, ts: now, speed, accuracy };

          try {
            await saveWaypoint(sessionId, waypoint);
            lastPointRef.current = waypoint;
            setLastPoint(waypoint);
            setWaypointCount(c => c + 1);
            setStatus('active');
          } catch (err) {
            console.error('[GPS] Failed to save waypoint:', err);
          }

          resolve();
        },
        (err) => {
          console.warn('[GPS] Position error:', err.message);
          if (err.code === 1) {
            setStatus('denied');
            setErrorMessage('GPS denegado por el usuario');
          } else {
            setStatus('error');
            setErrorMessage(err.message);
          }
          resolve();
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    setStatus('requesting');

    // Capture first point immediately
    captureAndSave();

    // Then every GPS_INTERVAL_MS
    intervalRef.current = setInterval(captureAndSave, GPS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, captureAndSave]);

  return { status, lastPoint, waypointCount, errorMessage };
}
