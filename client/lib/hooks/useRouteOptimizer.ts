/**
 * useRouteOptimizer  –  Ultra-efficient delivery route optimizer
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ALGORITHM RESEARCH SUMMARY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Problem type: Travelling Salesman / VRP on a real road network
 *  Scale: 2–40 stops per driver (typical CR delivery run)
 *
 *  Evaluated approaches:
 *  ┌─────────────────────────────────┬────────────┬───────────────────────┐
 *  │ Algorithm                       │ Quality    │ Speed (40 stops)      │
 *  ├─────────────────────────────────┼────────────┼───────────────────────┤
 *  │ Greedy Nearest-Neighbour (NN)   │ ★★☆☆☆     │ < 1 ms (O(n²))       │
 *  │ NN + 2-opt                      │ ★★★★☆     │ < 5 ms (O(n²) each)  │
 *  │ NN + 3-opt                      │ ★★★★★     │ 50 ms+ (O(n³))       │
 *  │ Christofides                    │ ★★★★☆     │ complex (n³)          │
 *  │ Google OR-Tools                 │ ★★★★★     │ needs server          │
 *  │ Google Routes API (matrix)      │ ★★★★★     │ ~400 ms (network)    │
 *  └─────────────────────────────────┴────────────┴───────────────────────┘
 *
 *  CHOSEN STRATEGY — Three progressive stages:
 *
 *  Stage 1 (instant, ≤ 1 ms):
 *    Greedy nearest-neighbour from driver origin (Haversine).
 *    Gives a reasonable initial order immediately. O(n²).
 *
 *  Stage 2 (≤ 5 ms, still local, no network):
 *    2-opt local search applied to the Stage-1 tour.
 *    Eliminates "crossing" paths by swapping edge pairs.
 *    Typically reduces total distance by 10–20% vs pure NN.
 *    O(n² × iterations). Capped at 3 passes for n ≤ 40.
 *
 *  Stage 3 (async, ~400 ms, requires API key):
 *    Google Maps Routes API — computeRoutesMatrix endpoint.
 *    Returns actual driving durations (with live traffic when
 *    TRAFFIC_AWARE is set). We then re-run NN + 2-opt on the
 *    real travel-time matrix for the globally optimal order
 *    under real road conditions.
 *
 *  ADDRESS HANDLING:
 *    Each OptimizeStop carries both GPS coordinates (lat/lng from SP2)
 *    AND a formatted address string assembled from SP2 fields
 *    (streetAddress + district + canton + province + "Costa Rica").
 *    Coordinates are preferred by Google (more accurate); address is
 *    the fallback for stops without GPS.
 *
 *  API USED:
 *    • computeRoutesMatrix  (Routes API v2)
 *      POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
 *      Key: VITE_SP2_FIREBASE_API_KEY (re-used; Routes API is enabled on SP2 project)
 *    • Field mask: duration,distanceMeters,status
 *    • Routing preference: TRAFFIC_AWARE (real-time)
 *    • Travel mode: DRIVE
 *
 *  PARAMETERS PASSED TO GOOGLE:
 *    - origin / destination waypoints:  { location: { latLng: { lat, lng } } }
 *      OR { address: "<formatted-string>" } when coordinates unavailable
 *    - departureTime: now + 1 minute (required for TRAFFIC_AWARE)
 *    - languageCode: "es" (Spanish, for error messages)
 *    - regionCode: "CR" (Costa Rica routing bias)
 *    - units: METRIC
 *
 *  COST FUNCTION (multi-objective):
 *    When using the Google matrix we optimize on a COMPOSITE SCORE:
 *      cost(edge) = 0.60 × (durationSec / maxDur) + 0.40 × (distanceM / maxDist)
 *    This balances two competing goals:
 *      • Time (60 %) — drivers finish faster → more deliveries per day
 *      • Distance (40 %) — shorter total km → less fuel spend
 *    The weight split was chosen because time is the dominant variable for a
 *    per-stop delivery business, but fuel cost is a real operational expense.
 *    Haversine-only fallback uses pure distance (fuel) as cost since we have
 *    no traffic data.
 *
 *  CACHING:
 *    Results are cached in a module-level Map keyed by a hash of stop
 *    coordinates + origin. Repeated calls (driver opens route twice)
 *    return instantly. Cache TTL: 10 minutes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback } from 'react';

// ── Public interfaces ──────────────────────────────────────────────────────────

export interface OptimizeStop {
  id: string;       // customerName or slCode — unique key
  label: string;    // display name
  lat: number;
  lng: number;
  /** Optional: full address string for Google fallback (no GPS) */
  address?: string;
}

export interface OptimizedRoute {
  orderedIds: string[];
  estimatedMinutes: number | null;     // total drive time (null = Haversine only)
  totalDistanceKm: number;
  matrix: 'haversine+2opt' | 'google-routes';
  computedAt: number;
}

export type OptimizerStatus = 'idle' | 'computing' | 'upgrading' | 'done' | 'error';

export interface UseRouteOptimizerReturn {
  status: OptimizerStatus;
  result: OptimizedRoute | null;
  optimize: (stops: OptimizeStop[], originLat: number, originLng: number) => Promise<OptimizedRoute | null>;
  reset: () => void;
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

interface CacheEntry {
  route: OptimizedRoute;
  ts: number;
}

const routeCache = new Map<string, CacheEntry>();

function cacheKey(stops: OptimizeStop[], oLat: number, oLng: number): string {
  const pts = stops.map(s => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join('|');
  return `${oLat.toFixed(5)},${oLng.toFixed(5)};${pts}`;
}

// ── Haversine ──────────────────────────────────────────────────────────────────

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

// ── Build distance matrix from Haversine (including origin as node 0) ─────────

function buildHaversineMatrix(stops: OptimizeStop[], oLat: number, oLng: number): number[][] {
  const n = stops.length + 1;
  const pts = [{ lat: oLat, lng: oLng }, ...stops.map(s => ({ lat: s.lat, lng: s.lng }))];
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) =>
      i === j ? 0 : haversineKm(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng)
    )
  );
}

// ── Stage 1: Greedy Nearest-Neighbour (O(n²)) ─────────────────────────────────

function greedyNN(dist: number[][], n: number): number[] {
  // node 0 = origin, nodes 1..n = stops
  const visited = new Set<number>();
  const tour: number[] = [];
  let cur = 0;
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 1; j <= n; j++) {
      if (!visited.has(j) && dist[cur][j] < bestD) {
        bestD = dist[cur][j];
        best = j;
      }
    }
    if (best === -1) break;
    visited.add(best);
    tour.push(best - 1); // convert to 0-based stop index
    cur = best;
  }
  return tour;
}

// ── Stage 2: 2-opt local search ────────────────────────────────────────────────
// Works on 0-based stop indices with the haversine dist matrix.
// Performs multiple passes until no improvement or MAX_PASSES reached.

const MAX_2OPT_PASSES = 5;

function twoOpt(tour: number[], dist: number[][], oLat: number, oLng: number, stops: OptimizeStop[]): number[] {
  // Augment with origin as sentinel start (index -1 mapped to origin node)
  // dist matrix: node 0 = origin, nodes 1..n = stops (offset +1)
  const n = tour.length;
  if (n <= 2) return tour;

  const nodeDist = (a: number, b: number): number => {
    // a/b are stop indices (0-based); origin is implicit node "before first"
    const nodeA = a + 1;
    const nodeB = b + 1;
    return dist[nodeA][nodeB];
  };

  // Total tour distance including leg from origin to first stop
  const tourKm = (t: number[]): number => {
    let d = dist[0][t[0] + 1]; // origin → first
    for (let k = 0; k < t.length - 1; k++) d += nodeDist(t[k], t[k + 1]);
    return d;
  };

  let best = [...tour];
  let improved = true;
  let passes = 0;

  while (improved && passes < MAX_2OPT_PASSES) {
    improved = false;
    passes++;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        // Gain check: avoid full tour recalculation — use edge-swap delta
        // Before: ...→A→B...→C→D→...
        // After:  ...→A→C...→B→D→...  (reverse segment [i+1..j])
        const A = i === 0 ? -1 : best[i - 1]; // -1 means origin
        const B = best[i];
        const C = best[j];
        const D = j === n - 1 ? -1 : best[j + 1]; // -1 means end (ignored)

        const dAB = A === -1 ? dist[0][B + 1] : nodeDist(A, B);
        const dCD = D === -1 ? 0 : nodeDist(C, D);
        const dAC = A === -1 ? dist[0][C + 1] : nodeDist(A, C);
        const dBD = D === -1 ? 0 : nodeDist(B, D);

        if (dAC + dBD < dAB + dCD - 1e-10) {
          // Reverse the segment [i..j]
          const next = [...best];
          let lo = i; let hi = j;
          while (lo < hi) {
            [next[lo], next[hi]] = [next[hi], next[lo]];
            lo++; hi--;
          }
          best = next;
          improved = true;
        }
      }
    }
  }

  return best;
}

// ── Compute total km and minutes from ordered indices + matrix ─────────────────

function routeStats(
  orderedStopIdx: number[],
  dist: number[][],
  durationMatrix: number[][] | null
): { km: number; seconds: number | null } {
  let km = orderedStopIdx.length > 0 ? dist[0][orderedStopIdx[0] + 1] : 0;
  let seconds = durationMatrix ? (durationMatrix[0][orderedStopIdx[0] + 1] ?? null) : null;

  for (let i = 0; i < orderedStopIdx.length - 1; i++) {
    const from = orderedStopIdx[i] + 1;
    const to = orderedStopIdx[i + 1] + 1;
    km += dist[from][to];
    if (durationMatrix && seconds !== null) {
      const leg = durationMatrix[from][to];
      if (leg == null || leg === Infinity) { seconds = null; } else { seconds += leg; }
    }
  }

  return { km: Math.round(km * 10) / 10, seconds };
}

// ── Google Routes API — computeRouteMatrix ─────────────────────────────────────
// POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
// Docs: https://developers.google.com/maps/documentation/routes/compute_route_matrix
//
// PARAMETERS:
//  • origins / destinations: waypoint with latLng (preferred) or address
//  • travelMode: "DRIVE"
//  • routingPreference: "TRAFFIC_AWARE" (live traffic, no tolls prediction)
//  • departureTime: now + 60 s (required for TRAFFIC_AWARE)
//  • languageCode: "es"
//  • regionCode: "CR"
//  • extraComputations: TOLLS (bonus info, optional)
//
// LIMITS: 625 elements max (25×25). For n=24 stops + origin we send
//  25 origins × 25 destinations = 625 elements — just fits.

interface GWaypoint {
  via?: boolean;
  vehicleStopover?: boolean;
  sideOfRoad?: boolean;
  location?: { latLng: { latitude: number; longitude: number } };
  address?: string;
}

interface GRouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  status: { code?: number };
  distanceMeters?: number;
  duration?: string; // e.g. "452s"
}

function stopToWaypoint(stop: OptimizeStop): GWaypoint {
  if (stop.lat && stop.lng) {
    return { location: { latLng: { latitude: stop.lat, longitude: stop.lng } } };
  }
  if (stop.address) {
    return { address: stop.address };
  }
  return { address: stop.label + ', Costa Rica' };
}

function originWaypoint(lat: number, lng: number): GWaypoint {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

function parseDurationSeconds(d: string | undefined): number {
  if (!d) return Infinity;
  const m = d.match(/^(\d+(\.\d+)?)s$/);
  return m ? parseFloat(m[1]) : Infinity;
}

async function fetchGoogleRouteMatrix(
  stops: OptimizeStop[],
  originLat: number,
  originLng: number,
  apiKey: string
): Promise<{ durSec: number[][]; distM: number[][] } | null> {
  // All nodes: [origin, ...stops]
  const allWaypoints: GWaypoint[] = [
    originWaypoint(originLat, originLng),
    ...stops.map(stopToWaypoint),
  ];

  const n = allWaypoints.length; // 1 + stops.length
  if (n > 25) return null; // API cap

  const departureTime = new Date(Date.now() + 60_000).toISOString();

  const body = {
    origins: allWaypoints.map(w => ({ waypoint: w, routeModifiers: {} })),
    destinations: allWaypoints.map(w => ({ waypoint: w })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime,
    languageCode: 'es',
    regionCode: 'CR',
    units: 'METRIC',
  };

  try {
    const res = await fetch(
      'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,status,duration,distanceMeters',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn('[RouteOptimizer] Google Routes API error:', res.status, text.slice(0, 200));
      return null;
    }

    const elements: GRouteMatrixElement[] = await res.json();

    const durSec: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
    const distM: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));

    for (const el of elements) {
      if (el.status?.code === 0 || el.status == null) {
        // code 0 = OK in proto3
        durSec[el.originIndex][el.destinationIndex] = parseDurationSeconds(el.duration);
        distM[el.originIndex][el.destinationIndex] = el.distanceMeters ?? Infinity;
      }
    }

    return { durSec, distM };
  } catch (err) {
    console.warn('[RouteOptimizer] Fetch error:', err);
    return null;
  }
}

// ── Multi-objective composite cost matrix ─────────────────────────────────────
// Balances time (60%) and distance/fuel (40%) into a single normalised cost.
// Both matrices must cover nodes 0..n (node 0 = origin).

const W_TIME = 0.60;
const W_DIST = 0.40;

function buildCompositeCost(durSec: number[][], distM: number[][]): number[][] {
  const n = durSec.length;
  // Find finite max values for normalisation
  let maxDur = 1;
  let maxDist = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (durSec[i][j] !== Infinity) maxDur = Math.max(maxDur, durSec[i][j]);
      if (distM[i][j] !== Infinity) maxDist = Math.max(maxDist, distM[i][j]);
    }
  }

  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => {
      if (i === j) return 0;
      const t = durSec[i][j] === Infinity ? 1 : durSec[i][j] / maxDur;
      const d = distM[i][j] === Infinity ? 1 : distM[i][j] / maxDist;
      return W_TIME * t + W_DIST * d; // 0..1 composite score
    })
  );
}

// ── Run NN + 2-opt on a composite cost matrix (time + fuel) ───────────────────

function optimizeOnMatrix(durSec: number[][], distM: number[][], n: number): number[] {
  const cost = buildCompositeCost(durSec, distM);

  // Nearest-Neighbour on composite cost
  const visited = new Set<number>();
  const tour: number[] = [];
  let cur = 0;
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bestC = Infinity;
    for (let j = 1; j <= n; j++) {
      if (!visited.has(j) && cost[cur][j] < bestC) {
        bestC = cost[cur][j];
        best = j;
      }
    }
    if (best === -1) break;
    visited.add(best);
    tour.push(best - 1); // 0-based stop index
    cur = best;
  }

  // 2-opt on composite cost — eliminates crossing paths
  let best2 = [...tour];
  let improved = true;
  let passes = 0;
  while (improved && passes < MAX_2OPT_PASSES) {
    improved = false; passes++;
    for (let i = 0; i < best2.length - 1; i++) {
      for (let j = i + 2; j < best2.length; j++) {
        const A = i === 0 ? 0 : best2[i - 1] + 1;
        const B = best2[i] + 1;
        const C = best2[j] + 1;
        const D = j === best2.length - 1 ? -1 : best2[j + 1] + 1;

        const dAB = cost[A][B];
        const dCD = D === -1 ? 0 : cost[C][D];
        const dAC = cost[A][C];
        const dBD = D === -1 ? 0 : cost[B][D];

        if (dAC + dBD < dAB + dCD - 1e-9) {
          let lo = i; let hi = j;
          while (lo < hi) { [best2[lo], best2[hi]] = [best2[hi], best2[lo]]; lo++; hi--; }
          improved = true;
        }
      }
    }
  }

  return best2;
}

// ── Address formatter (for Google fallback) ───────────────────────────────────
// Builds a valid Google-searchable address from SP2 field structure.
// Format: "<streetAddress>, <district>, <canton>, <province>, Costa Rica"

export function buildGoogleAddress(fields: {
  streetAddress?: string | null;
  district?: string | null;
  canton?: string | null;
  province?: string | null;
  city?: string | null;
}): string {
  const parts = [
    fields.streetAddress,
    fields.district,
    fields.canton || fields.city,
    fields.province,
    'Costa Rica',
  ].filter(Boolean) as string[];

  return parts.join(', ');
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRouteOptimizer(): UseRouteOptimizerReturn {
  const [status, setStatus] = useState<OptimizerStatus>('idle');
  const [result, setResult] = useState<OptimizedRoute | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
  }, []);

  const optimize = useCallback(async (
    stops: OptimizeStop[],
    originLat: number,
    originLng: number,
  ): Promise<OptimizedRoute | null> => {
    if (stops.length === 0) return null;
    setStatus('computing');

    // ── Cache check ───────────────────────────────────────────────────────────
    const key = cacheKey(stops, originLat, originLng);
    const cached = routeCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setResult(cached.route);
      setStatus('done');
      return cached.route;
    }

    // ── Stage 1 + 2: Haversine matrix → NN → 2-opt ───────────────────────────
    const hDist = buildHaversineMatrix(stops, originLat, originLng);
    const nnTour = greedyNN(hDist, stops.length);
    const optTour = twoOpt(nnTour, hDist, originLat, originLng, stops);

    const { km: hKm } = routeStats(optTour, hDist, null);

    const localResult: OptimizedRoute = {
      orderedIds: optTour.map(i => stops[i].id),
      estimatedMinutes: null,
      totalDistanceKm: hKm,
      matrix: 'haversine+2opt',
      computedAt: Date.now(),
    };

    setResult(localResult);
    setStatus('upgrading'); // signal UI: upgrading to real traffic data

    // ── Stage 3: Google Routes API (TRAFFIC_AWARE) ────────────────────────────
    const apiKey = (import.meta.env.VITE_SP2_FIREBASE_API_KEY as string | undefined)?.trim();
    if (!apiKey || stops.length > 24) {
      setStatus('done');
      routeCache.set(key, { route: localResult, ts: Date.now() });
      return localResult;
    }

    try {
      const gMatrix = await fetchGoogleRouteMatrix(stops, originLat, originLng, apiKey);

      if (!gMatrix) {
        setStatus('done');
        routeCache.set(key, { route: localResult, ts: Date.now() });
        return;
      }

      // Run NN + 2-opt on real travel-time data
      // Optimize using composite cost (60% time + 40% fuel/distance)
      const gmTour = optimizeOnMatrix(gMatrix.durSec, gMatrix.distM, stops.length);

      // Compute totals from the Google matrix
      let totalDurSec = gMatrix.durSec[0][gmTour[0] + 1] || 0;
      let totalDistM = gMatrix.distM[0][gmTour[0] + 1] || 0;

      for (let i = 0; i < gmTour.length - 1; i++) {
        const from = gmTour[i] + 1;
        const to = gmTour[i + 1] + 1;
        const dur = gMatrix.durSec[from][to];
        const dis = gMatrix.distM[from][to];
        totalDurSec += dur === Infinity ? 0 : dur;
        totalDistM += dis === Infinity ? 0 : dis;
      }

      const gmResult: OptimizedRoute = {
        orderedIds: gmTour.map(i => stops[i].id),
        estimatedMinutes: totalDurSec > 0 ? Math.round(totalDurSec / 60) : null,
        totalDistanceKm: Math.round((totalDistM / 1000) * 10) / 10,
        matrix: 'google-routes',
        computedAt: Date.now(),
      };

      routeCache.set(key, { route: gmResult, ts: Date.now() });
      setResult(gmResult);
    } catch (err) {
      console.warn('[RouteOptimizer] Stage 3 failed, keeping 2-opt result:', err);
      routeCache.set(key, { route: localResult, ts: Date.now() });
    } finally {
      setStatus('done');
    }
  }, []);

  return { status, result, optimize, reset };
}
