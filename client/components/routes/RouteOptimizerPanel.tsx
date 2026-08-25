/**
 * RouteOptimizerPanel
 *
 * Self-contained UI panel for the driver route optimizer.
 * Drop this anywhere in the ActiveRouteView to give drivers a one-tap
 * "ordenar ruta" button that reorders the delivery list intelligently.
 *
 * Props:
 *  - stops: customers that have GPS coordinates (lat/lng from defaultAddress)
 *  - onApply: called with ordered stop IDs when the driver accepts the suggestion
 *  - onReset: called when the driver discards the optimized order
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Route, Clock, Ruler, ChevronDown, ChevronUp, RefreshCw, X, Loader2, Navigation, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useRouteOptimizer,
  type OptimizeStop,
} from '@/lib/hooks/useRouteOptimizer';

interface RouteOptimizerPanelProps {
  /** Customers that have a known GPS location */
  stops: OptimizeStop[];
  /** Number of customers WITHOUT a GPS location (shown as a warning) */
  stopsWithoutLocation: number;
  /** Driver's current origin (defaults to San José, CR if not available) */
  originLat?: number;
  originLng?: number;
  /** Called when driver taps "Aplicar" — passes back ordered stop IDs */
  onApply: (orderedIds: string[]) => void;
  /** Called when driver taps "Restablecer" */
  onReset: () => void;
  /** Whether the order has already been applied */
  isApplied: boolean;
}

// San José, Costa Rica as default origin (fallback if geolocation denied)
const DEFAULT_LAT = 9.9281;
const DEFAULT_LNG = -84.0907;

// Auto-reoptimize interval when route is applied and traffic may have changed
const REOPTIMIZE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function RouteOptimizerPanel({
  stops,
  stopsWithoutLocation,
  originLat = DEFAULT_LAT,
  originLng = DEFAULT_LNG,
  onApply,
  onReset,
  isApplied,
}: RouteOptimizerPanelProps) {
  const { status, result, optimize, reset } = useRouteOptimizer();
  const [expanded, setExpanded] = useState(false);

  // ── Driver GPS state ──────────────────────────────────────────────────────
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number; source: 'gps' | 'default' }>({
    lat: originLat, lng: originLng, source: 'default',
  });
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number | null>(null); // seconds
  const reoptimizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAppliedRef = useRef(isApplied);
  isAppliedRef.current = isApplied;

  // Acquire driver position (high-accuracy, force prompt)
  const acquirePosition = useCallback((): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,        // always fresh — no cached position
      })
    )
  , []);

  // Run full optimization with current driver position
  const runOptimize = useCallback(async (lat: number, lng: number) => {
    await optimize(stops, lat, lng);
  }, [optimize, stops]);

  // Schedule the next auto-reoptimize and start the countdown display
  const scheduleReoptimize = useCallback((lat: number, lng: number) => {
    if (reoptimizeTimerRef.current) clearTimeout(reoptimizeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    let remaining = REOPTIMIZE_INTERVAL_MS / 1000; // seconds
    setNextRefreshIn(remaining);

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setNextRefreshIn(remaining > 0 ? remaining : 0);
    }, 1_000);

    reoptimizeTimerRef.current = setTimeout(async () => {
      if (!isAppliedRef.current) return; // don't refresh if driver discarded order
      clearInterval(countdownRef.current!);
      setNextRefreshIn(null);
      try {
        const pos = await acquirePosition();
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setDriverPos({ lat: newLat, lng: newLng, source: 'gps' });
        await runOptimize(newLat, newLng);
        onApply([]); // signal wizard to re-read result — will be set by handleApply after
        scheduleReoptimize(newLat, newLng);
      } catch {
        await runOptimize(lat, lng); // fallback: use last known position
        scheduleReoptimize(lat, lng);
      }
    }, REOPTIMIZE_INTERVAL_MS);
  }, [acquirePosition, runOptimize, onApply]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (reoptimizeTimerRef.current) clearTimeout(reoptimizeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // Acquire GPS on first mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocalización no disponible en este dispositivo');
      return;
    }
    acquirePosition()
      .then(pos => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' });
        setGpsError(null);
      })
      .catch(err => {
        const msg = err.code === 1 ? 'Permiso GPS denegado' : 'No se pudo obtener ubicación';
        setGpsError(msg);
        // keep San José default
      });
  }, [acquirePosition]);

  const hasEnough = stops.length >= 2;
  const isLoading = status === 'computing';
  const isUpgrading = status === 'upgrading';
  const isDone = status === 'done' && !!result;

  const handleOptimize = async () => {
    await runOptimize(driverPos.lat, driverPos.lng);
    setExpanded(true);
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result.orderedIds);
    scheduleReoptimize(driverPos.lat, driverPos.lng);
  };

  const handleReset = () => {
    reset();
    onReset();
    setExpanded(false);
    if (reoptimizeTimerRef.current) clearTimeout(reoptimizeTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setNextRefreshIn(null);
  };

  const fmtCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      'mx-4 mb-3 rounded-xl border transition-all duration-200',
      isApplied
        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
        : 'border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30',
    )}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className={cn(
          'flex items-center justify-center w-6 h-6 rounded-lg shrink-0',
          isApplied ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-violet-100 dark:bg-violet-900/50'
        )}>
          {(isLoading || isUpgrading)
            ? <Loader2 className="w-3.5 h-3.5 text-violet-600 animate-spin" />
            : isApplied
              ? <Route className="w-3.5 h-3.5 text-emerald-600" />
              : <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          }
        </div>

        <div className="flex-1 min-w-0">
          {/* Title + GPS badge */}
          <div className="flex items-center gap-1.5">
            <p className={cn(
              'text-xs font-semibold leading-tight',
              isApplied ? 'text-emerald-700 dark:text-emerald-400' : 'text-violet-700 dark:text-violet-400'
            )}>
              {isApplied ? 'Ruta optimizada aplicada' : 'Optimizar orden de ruta'}
            </p>
            {/* GPS status indicator */}
            <span className={cn(
              'flex items-center gap-0.5 text-[9px] font-medium px-1 py-px rounded',
              driverPos.source === 'gps'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
            )} title={gpsError ?? 'GPS activo'}>
              <Navigation className="w-2.5 h-2.5" />
              {driverPos.source === 'gps' ? 'GPS' : 'SJO'}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight mt-px">
            {isLoading
              ? 'Calculando orden inicial…'
              : isUpgrading
                ? 'Obteniendo tráfico en tiempo real…'
                : isDone && result
                  ? result.matrix === 'google-routes'
                    ? `${result.totalDistanceKm} km · ~${result.estimatedMinutes} min · Tráfico real`
                    : `${result.totalDistanceKm} km · Tiempo+Combustible estimados`
                  : `${stops.length} parada${stops.length !== 1 ? 's' : ''} con GPS${stopsWithoutLocation > 0 ? ` · ${stopsWithoutLocation} sin ubicación` : ''}`
            }
          </p>
          {/* Auto-refresh countdown */}
          {isApplied && nextRefreshIn !== null && (
            <p className="flex items-center gap-1 text-[9px] text-violet-600 dark:text-violet-400 mt-0.5">
              <Wifi className="w-2.5 h-2.5" />
              Actualización con tráfico en {fmtCountdown(nextRefreshIn)}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {isApplied ? (
            <button
              onClick={handleReset}
              className="text-[10px] font-medium px-2 py-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Restablecer
            </button>
          ) : isDone ? (
            <>
              <button
                onClick={handleOptimize}
                title="Recalcular"
                className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <Button
                size="sm"
                onClick={handleApply}
                className="h-7 text-[11px] px-2.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                Aplicar
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!hasEnough || isLoading || isUpgrading}
              onClick={handleOptimize}
              className="h-7 text-[11px] px-2.5 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
            >
              {(isLoading || isUpgrading) ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ordenar'}
            </Button>
          )}

          {isDone && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: ordered stop list */}
      {expanded && isDone && result && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {result.estimatedMinutes !== null && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <Clock className="w-3 h-3" /> ~{result.estimatedMinutes} min
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-400">
              <Ruler className="w-3 h-3" /> {result.totalDistanceKm} km
            </span>
            <span className={cn(
              'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
              result.matrix === 'google-routes'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            )}>
              {result.matrix === 'google-routes' ? '🚦 Tráfico real' : '📐 Estimado'}
            </span>
            <span className="text-[9px] text-muted-foreground">
              Objetivo: 60% tiempo · 40% combustible
            </span>
          </div>

          {result.orderedIds.map((id, idx) => {
            const stop = stops.find(s => s.id === id);
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[9px] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="text-xs text-foreground truncate">{stop?.label ?? id}</span>
              </div>
            );
          })}

          {stopsWithoutLocation > 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
              ⚠ {stopsWithoutLocation} cliente{stopsWithoutLocation !== 1 ? 's' : ''} sin ubicación GPS — se muestran al final
            </p>
          )}
        </div>
      )}
    </div>
  );
}
