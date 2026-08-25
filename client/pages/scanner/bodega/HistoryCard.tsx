import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, Weight, ShieldAlert, Layers } from 'lucide-react';
import { HistoryEntry, STATUS_LABEL } from './types';
import { getCustomerBySlCode } from '@/lib/services/matching';

interface HistoryCardProps {
  entry: HistoryEntry;
  highlight: boolean;
}

export function HistoryCard({ entry, highlight }: HistoryCardProps) {
  const [copied, setCopied] = useState(false);

  let displayName = entry.customerName || 'SIN ASIGNAR';
  if (displayName.toLowerCase().startsWith('cliente pre-alertado') && entry.slCode) {
    const cust = getCustomerBySlCode(entry.slCode);
    if (cust && cust.fullName && !cust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
      displayName = cust.fullName;
    }
  }

  const elapsed   = Math.round((Date.now() - entry.scannedAt) / 1000);
  const timeLabel = elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)}m`;
  const statusLabel = STATUS_LABEL[entry.status] ?? entry.status;
  const routeAbbr   = entry.routeAbbr || entry.ruta?.substring(0, 3).toUpperCase() || 'DES';
  const abbrFontSize = 
    routeAbbr.length <= 2 ? 'clamp(2rem, 3.5vw, 3.6rem)' :
                            'clamp(1.4rem, 2.5vw, 2.6rem)';

  const copyTracking = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.tracking).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [entry.tracking]);

  return (
    <motion.div
      initial={highlight ? { opacity: 0, y: -10, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, type: 'spring', stiffness: 380, damping: 22 }}
      whileHover={{ scale: 1.015, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'rounded-2xl overflow-hidden bg-gradient-to-br text-white cursor-pointer',
        'shadow-md hover:shadow-xl transition-shadow duration-200',
        highlight && 'ring-2 ring-offset-2 ring-white/70 shadow-lg',
        entry.routeGradient
      )}
    >
      {/* ── Main body (80/20 Split) ── */}
      <div className="flex items-stretch min-w-0">
        {/* Left Side (80%): Package details */}
        <div className="flex-1 min-w-0 px-6 pt-5 pb-4 space-y-3">
          {highlight && (
            <div className="inline-flex items-center px-3 py-1 bg-white text-black text-xs font-black tracking-widest uppercase rounded-full mb-1">
              Último Escaneado
            </div>
          )}

          {/* Row 1 — tracking number (click to copy) */}
          <button
            onClick={copyTracking}
            title="Click para copiar tracking"
            aria-label="Copiar número de tracking"
            className={cn(
              'w-full text-left font-mono break-all leading-tight transition-all duration-150',
              'rounded-lg px-3 py-2 -mx-3',
              copied
                ? 'bg-green-400/20 text-green-200'
                : 'text-white hover:bg-white/10 active:bg-white/20'
            )}
            style={{ fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', fontWeight: 900 }}
          >
            <span className="flex items-center gap-3">
              <span className="flex-1 tracking-wider">{entry.tracking}</span>
              {copied && <Check className="w-6 h-6 shrink-0 text-green-300" />}
            </span>
          </button>

          {/* Row 2 — Customer Name */}
          <div className="min-w-0">
            <p 
              className="font-black text-white leading-tight truncate uppercase tracking-wide"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)' }}
            >
              {displayName}
            </p>
          </div>

          {/* Row 3 — slCode (below customer name, more visible as a high-contrast pill) */}
          {entry.slCode && (
            <div className="pt-1">
              <span 
                className="inline-block font-mono font-black bg-white text-slate-900 px-3.5 py-1 rounded-full shadow-md tracking-wider"
                style={{ fontSize: 'clamp(1.4rem, 2.2vw, 1.8rem)' }}
              >
                {entry.slCode}
              </span>
            </div>
          )}
        </div>

        {/* Right Side (24%): Colossal Route Abbreviation Stamp */}
        <div className="w-[24%] min-w-[90px] shrink-0 border-l border-white/10 bg-black/10 flex flex-col items-center justify-center relative select-none py-2 text-center">
          {entry.isMasterPackage ? (
            <div className="flex flex-col items-center justify-center gap-1 px-1">
              {entry.status === 'held' || entry.status === 'returned' ? (
                <>
                  <span className="font-black text-white leading-none tracking-tighter drop-shadow-md text-2xl md:text-3xl flex items-center gap-1 whitespace-nowrap">
                    ✗ {routeAbbr}
                  </span>
                  <span className="font-extrabold text-[9px] md:text-[10px] text-red-300 tracking-wider uppercase leading-none drop-shadow">
                    RETENIDA
                  </span>
                </>
              ) : (
                <>
                  <span className="font-black text-white leading-none tracking-tighter drop-shadow-md text-2xl md:text-3xl flex items-center gap-1 whitespace-nowrap">
                    ✓ {routeAbbr}
                  </span>
                  <span className="font-extrabold text-[9px] md:text-[10px] text-green-300 tracking-wider uppercase leading-none drop-shadow">
                    AUTORIZADA
                  </span>
                </>
              )}
            </div>
          ) : (
            <span 
              className="font-black text-white leading-none tracking-tighter drop-shadow-md text-center block px-1 whitespace-nowrap"
              style={{ fontSize: abbrFontSize }}
            >
              {routeAbbr}
            </span>
          )}
          {/* Subtle top-right elapsed counter */}
          <span className="absolute top-3 right-3 text-white/50 text-xs font-bold tabular-nums">
            {timeLabel}
          </span>
        </div>
      </div>

      {/* ── Footer strip — status + weight + flags (80/20 Split) ── */}
      <div className="flex items-stretch border-t border-white/10 bg-black/25 min-h-[44px]">
        {/* Left Footer (80%): status + weight */}
        <div className="flex-1 flex items-center gap-3 px-6 py-2.5 flex-wrap min-w-0">
          <span 
            className="font-black text-white uppercase tracking-wider"
            style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)' }}
          >
            {entry.isMasterPackage && entry.packageCount ? (
              `${statusLabel} · ${entry.packageCount} PAQUETES`
            ) : (
              statusLabel
            )}
          </span>
          {entry.weight && (
            <>
              <span className="text-white/50 text-lg">·</span>
              <span 
                className="flex items-center gap-2 font-bold text-white"
                style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)' }}
              >
                <Weight className="w-5 h-5 shrink-0" />
                {entry.weight} kg
              </span>
            </>
          )}
        </div>

        {/* Right Footer (24%): Consolidation/Permit Badges */}
        <div className="w-[24%] min-w-[90px] shrink-0 border-l border-white/10 bg-black/15 flex flex-col gap-1 items-center justify-center p-1 select-none">
          {entry.requiresPermit && (
            <span 
              className="w-full text-center font-black bg-amber-500 text-white py-1 px-0.5 rounded border border-white/30 shadow-md tracking-normal uppercase animate-pulse"
              style={{ fontSize: 'clamp(0.75rem, 1vw, 0.9rem)' }}
            >
              PERMISO
            </span>
          )}
          {entry.consolidationEnabled && (
            <span 
              className="w-full text-center font-black bg-blue-600 text-white py-1 px-0.5 rounded border border-white/30 shadow-md tracking-normal uppercase animate-pulse"
              style={{ fontSize: 'clamp(0.75rem, 1vw, 0.9rem)' }}
            >
              CONSOLIDA
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
