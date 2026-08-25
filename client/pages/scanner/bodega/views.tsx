import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, ScanLine, XCircle, AlertTriangle, Zap, Trophy, Crown, Flame, Star, ShieldAlert, Layers, Weight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScanResult, STATUS_LABEL, isInternalTracking } from './types';
import { getCustomerBySlCode } from '@/lib/services/matching';

// ─── Motivational message engine (behavioral psychology) ─────────────────────
type MotivationLevel = 'ready' | 'starting' | 'milestone' | 'flow' | 'elite' | 'legend';
interface Motivation {
  headline: string;
  sub: string;
  level: MotivationLevel;
}

export function getMotivation(count: number): Motivation {
  if (count === 0) return { headline: 'Listo para Escanear', sub: 'Apunta el escáner al código de barras del paquete', level: 'ready' };
  if (count < 5) return { headline: '¡Arrancando fuerte!', sub: `${count} paquete${count > 1 ? 's' : ''} en la sesión — ¡buen inicio!`, level: 'starting' };
  if (count === 5) return { headline: '¡5 paquetes!', sub: '¡Excelente comienzo, sigue así!', level: 'milestone' };
  if (count < 10) return { headline: '¡Ganando velocidad!', sub: `${count} paquetes y contando — ¡imparable!`, level: 'flow' };
  if (count === 10) return { headline: '¡10 paquetes!', sub: 'Diez de una — ¡eso es dedicación!', level: 'milestone' };
  if (count < 25) return { headline: '¡A toda máquina!', sub: `${count} paquetes — a velocidad de crucero`, level: 'flow' };
  if (count === 25) return { headline: '¡25 paquetes!', sub: '¡Un cuarto del camino a los 100!', level: 'milestone' };
  if (count < 50) return { headline: '¡Alto rendimiento!', sub: `${count} paquetes — nivel élite en acción`, level: 'elite' };
  if (count === 50) return { headline: '¡50 paquetes!', sub: '¡La mitad del camino a la leyenda!', level: 'elite' };
  if (count < 100) return { headline: '¡Modo imparable!', sub: `${count} paquetes — el récord está en la mira`, level: 'elite' };
  if (count === 100) return { headline: '¡100 paquetes!', sub: '¡Leyenda viva de la bodega! 🏆', level: 'legend' };
  return { headline: `¡${count} paquetes!`, sub: 'Nadie puede seguirte el ritmo 👑', level: 'legend' };
}

const MOTIVATION_COLORS: Record<MotivationLevel, string> = {
  ready: 'text-slate-500',
  starting: 'text-red-500',
  milestone: 'text-orange-500',
  flow: 'text-red-600',
  elite: 'text-purple-600',
  legend: 'text-amber-500',
};



const MOTIVATION_ICONS: Record<MotivationLevel, React.ReactNode> = {
  ready: null,
  starting: <Zap className="w-5 h-5" />,
  milestone: <Star className="w-5 h-5" />,
  flow: <Flame className="w-5 h-5" />,
  elite: <Trophy className="w-5 h-5" />,
  legend: <Crown className="w-5 h-5" />,
};

// ─── Idle ─────────────────────────────────────────────────────────────────────
export function IdleView({ scanCount, children }: { scanCount: number, children?: React.ReactNode }) {
  const motivation = getMotivation(scanCount);
  const color = MOTIVATION_COLORS[motivation.level];
  const icon = MOTIVATION_ICONS[motivation.level];

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-[clamp(1rem,3vh,2.5rem)] select-none overflow-hidden">

      {/* Floating background logo, barely visible */}
      <motion.div
        className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] z-0"
        animate={{
          x: [0, 60, -40, 50, -60, 0],
          y: [0, -50, 60, -40, 50, 0],
          rotate: [0, 5, -5, 3, -3, 0],
          scale: [1, 1.05, 0.95, 1.05, 0.95, 1]
        }}
        transition={{
          duration: 45,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        <img
          src="/logo.svg"
          alt=""
          className="w-[50vw] max-w-[600px] object-contain"
        />
      </motion.div>



      {/* Input container passed as children */}
      {children && (
        <div className="w-full max-w-2xl mt-4 relative z-10">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Scanning ─────────────────────────────────────────────────────────────────
export function ScanningView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-[clamp(1rem,3vh,2.5rem)] select-none">
      <div className="relative flex items-center justify-center" style={{ width: 'clamp(100px,16vw,176px)', height: 'clamp(100px,16vw,176px)' }}>
        {/* Outer pulse ring — very soft and slow */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-slate-300"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Second ring offset */}
        <motion.div
          className="absolute inset-3 rounded-full border border-slate-200"
          animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />
        {/* Spinner — calm gray */}
        <div className="absolute inset-6 rounded-full border-[3px] border-slate-100 border-t-slate-400 animate-spin" style={{ animationDuration: '1.5s' }} />
        {/* Icon */}
        <ScanLine className="w-12 h-12 text-slate-500" strokeWidth={1.5} />
      </div>
      <div className="text-center mt-4">
        <h2 className="font-bold text-slate-800 text-2xl md:text-3xl tracking-tight">Buscando...</h2>
      </div>
    </div>
  );
}

const ROUTE_TEXT_COLORS: Record<string, string> = {
  OCC: 'text-orange-600',
  A: 'text-red-600',
  H: 'text-amber-600',
  C1: 'text-cyan-600',
  C2: 'text-blue-600',
  SJ: 'text-purple-600',
  'SJ-E': 'text-fuchsia-600',
  ESC: 'text-fuchsia-600',
  'SJ-C': 'text-pink-600',
  ENC: 'text-emerald-600',
  RET: 'text-stone-600',
  DES: 'text-zinc-600',
};

// ─── Found ────────────────────────────────────────────────────────────────────
export function FoundView({ result }: { result: ScanResult }) {
  const routeAbbr = result.routeAbbr || result.ruta?.substring(0, 3).toUpperCase() || 'DES';
  const trackingColorClass = ROUTE_TEXT_COLORS[routeAbbr] || 'text-slate-800';

  let displayName = result.customerName || (result.isMasterPackage ? 'SIN CLIENTE' : 'SIN ASIGNAR');
  if (displayName.toLowerCase().startsWith('cliente pre-alertado') && result.slCode) {
    const cust = getCustomerBySlCode(result.slCode);
    if (cust && cust.fullName && !cust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
      displayName = cust.fullName;
    }
  }

  if (result.isMasterPackage) {
    const nameLength = displayName.length + (result.slCode ? 8 : 0);
    const nameFontSize =
      nameLength > 30 ? 'clamp(2.5rem, 5vh, 6rem)' :
        nameLength > 24 ? 'clamp(3.0rem, 6vh, 7.5rem)' :
          'clamp(3.8rem, 8vh, 10rem)';

    // Extract the last 5 digits of each sub-package (from groupedTrackings)
    const subPackageDigits = (result.groupedTrackings || [])
      .map(t => {
        const cleaned = t.replace(/[\s\-_]+/g, '').toUpperCase();
        return cleaned.slice(-5);
      })
      .filter(Boolean);

    const displayDigits = subPackageDigits.length > 0
      ? subPackageDigits.join('  ')
      : result.tracking.slice(-5).toUpperCase();

    const digitsFontSize =
      displayDigits.length > 30 ? 'text-3xl md:text-4xl' :
      displayDigits.length > 20 ? 'text-4xl md:text-5xl' :
      displayDigits.length > 15 ? 'text-5xl md:text-6xl' :
      displayDigits.length > 10 ? 'text-6xl md:text-7xl' :
      'text-7xl md:text-8xl';

    return (
      <motion.div
        key={result.tracking}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, type: 'spring', stiffness: 220, damping: 22 }}
        className="flex flex-col justify-center items-center h-full w-full px-8 py-4 select-none overflow-hidden relative"
      >
        <div className="w-full max-w-6xl flex flex-col items-center justify-center gap-4 z-10">
          
          {/* Authorization Status Banner */}
          {(result.status === 'held' || result.status === 'returned') && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="px-8 py-3 rounded-3xl bg-rose-500/30 border-4 border-white text-white font-black flex items-center justify-center gap-3 shadow-[0_15px_35px_rgba(244,63,94,0.3)] uppercase tracking-widest text-xl md:text-2xl shrink-0 my-1 animate-pulse"
            >
              <span className="text-3xl text-white">✗</span>
              <span className="text-white">Retenida - No Autorizada para Ruta</span>
            </motion.div>
          )}

          {/* Customer & SL Code */}
          <div className="w-full flex flex-col items-center justify-center text-center -mb-2">
            <h1
              className="font-black text-white leading-[1.1] tracking-wide drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] px-4 flex items-center justify-center flex-wrap gap-x-4 gap-y-2"
              style={{ fontSize: nameFontSize }}
            >
              {result.slCode && (
                <span
                  className="font-mono font-black bg-white px-4 py-1.5 rounded-[1.2rem] shadow-md tracking-wider inline-flex items-center justify-center shrink-0 border-2 border-white/20 select-all leading-none text-amber-600"
                  style={{ fontSize: '0.6em' }}
                >
                  {result.slCode}
                </span>
              )}
              <span className="text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
                {displayName}
              </span>
            </h1>
          </div>

          {/* Consolidated details card */}
          <div className="w-full max-w-3xl bg-white rounded-[2.5rem] p-6 shadow-2xl grid grid-cols-2 gap-6 text-center text-emerald-600 my-2">
            <div className="flex flex-col items-center justify-center border-r border-emerald-100 px-2 min-h-[80px]">
              <span className="font-mono font-black text-5xl md:text-7xl">
                {result.packageCount || 0}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-2 min-h-[80px]">
              <span className="font-black text-2xl md:text-4xl tracking-wide truncate max-w-full block">
                {result.encomiendaServiceName || 'Sin servicio'}
              </span>
            </div>
          </div>

          {/* Tracking Number */}
          <div className="w-full flex flex-col items-center shrink-0 mt-2">
            <div className="bg-white px-8 py-3.5 md:py-4 rounded-[2rem] text-center shadow-[0_15px_40px_rgba(0,0,0,0.25)] w-full max-w-[95%] mx-auto flex flex-col items-center justify-center border-4 border-white/40 gap-1.5">
              <span
                className={cn(
                  "font-mono font-black tracking-widest block leading-none text-amber-600 shrink-0",
                  digitsFontSize
                )}
              >
                {displayDigits}
              </span>
              <span className="font-mono font-black text-2xl md:text-4xl text-slate-600 select-all block break-all mt-3 tracking-wide leading-tight">
                {result.tracking}
              </span>
            </div>
          </div>

        </div>
      </motion.div>
    );
  }

  let routeName = result.ruta || 'Ruta Desconocida';
  if (routeName.toLowerCase().includes('occidente')) {
    routeName = 'Occidente';
  }

  // Choose the optimal scaling text size depending on abbreviation length to prevent overflow
  const abbrClass =
    routeAbbr.length <= 2 ? 'text-[clamp(135px,27vh,350px)]' :
      routeAbbr.length <= 4 ? 'text-[clamp(105px,21vh,270px)]' :
        'text-[clamp(85px,17vh,210px)]';

  // Dynamically calculate tracking font size to prevent layout breakage on colossal tracking numbers
  const trackingFontSize =
    result.tracking.length > 25 ? 'clamp(2.3rem, 4.5vh, 3.6rem)' :
      result.tracking.length > 18 ? 'clamp(2.9rem, 5.5vh, 4.4rem)' :
        'clamp(3.4rem, 7vh, 5.8rem)';

  // Scale customer name font size based on length (including nominal space for slCode badge)
  const nameLength = displayName.length + (result.slCode ? 8 : 0);
  const nameFontSize =
    nameLength > 30 ? 'clamp(3.2rem, 6.2vh, 7.2rem)' :
      nameLength > 24 ? 'clamp(4.0rem, 7.4vh, 8.8rem)' :
        nameLength > 18 ? 'clamp(5.0rem, 9vh, 10.8rem)' :
          nameLength > 12 ? 'clamp(5.8rem, 10.8vh, 12.8rem)' :
            'clamp(6.8rem, 13vh, 15.8rem)';

  return (
    <motion.div
      key={result.tracking}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, type: 'spring', stiffness: 220, damping: 22 }}
      className="flex flex-col justify-center items-center h-full w-full px-8 py-1 select-none overflow-hidden relative"
    >
      <div className="w-full max-w-6xl flex flex-col items-center justify-center gap-0.5 md:gap-1 lg:gap-1 z-10">
        {/* ── 1. Top Section: Customer Name & SL Code prefix as inline badge ── */}
        <div className="w-full flex flex-col items-center justify-center pt-0 shrink-0 -mb-1.5 md:-mb-3 lg:-mb-4">
          <h1
            className="font-black text-white text-center leading-[1.1] tracking-wide drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] px-4 flex items-center justify-center flex-wrap gap-x-4 gap-y-2"
            style={{ fontSize: nameFontSize }}
          >
            {result.slCode && (
              <span
                className={cn(
                  "font-mono font-black bg-white px-4 py-1.5 rounded-[1.2rem] shadow-md tracking-wider inline-flex items-center justify-center shrink-0 border-2 border-white/20 select-all leading-none",
                  trackingColorClass
                )}
                style={{ fontSize: '0.6em' }}
              >
                {result.slCode}
              </span>
            )}
            <span className="text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
              {displayName}
            </span>
          </h1>
        </div>

        {/* ── 2. Center Section: Colossal Route Abbreviation & Highly Visible Route Name ── */}
        <div className="w-full flex flex-col items-center justify-center text-center shrink-0 -mt-1.5 md:-mt-3 lg:-mt-4">
          <div className="relative flex flex-col items-center justify-center">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 180 }}
              className={cn(
                'font-black text-white leading-[0.8] tracking-normal drop-shadow-[0_25px_50px_rgba(0,0,0,0.7)]',
                abbrClass
              )}
            >
              {routeAbbr}
            </motion.div>

            {/* Large, high-visibility route description below the initials with status badges */}
            <div
              className="flex items-center justify-center gap-4 flex-wrap -mt-[clamp(1.5rem,3.8vh,4.8rem)] px-4"
            >
              <span
                className="text-white font-black uppercase tracking-[0.25em] drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]"
                style={{ fontSize: 'clamp(2.1rem, 4.5vh, 3.6rem)' }}
              >
                {routeName}
              </span>

              {result.requiresPermit && (
                <motion.span
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="px-6 py-2 rounded-2xl bg-amber-500 border-4 border-white text-white font-black flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(245,158,11,0.3)] uppercase tracking-wider shrink-0"
                  style={{ fontSize: 'clamp(1.2rem, 2.5vh, 2rem)' }}
                >
                  <ShieldAlert className="w-5 h-5 text-white animate-bounce" /> PERMISO
                </motion.span>
              )}
              {result.consolidationEnabled && (
                <motion.span
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                  className="px-6 py-2 rounded-2xl bg-blue-600 border-4 border-white text-white font-black flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(37,99,235,0.3)] uppercase tracking-wider shrink-0"
                  style={{ fontSize: 'clamp(1.2rem, 2.5vh, 2rem)' }}
                >
                  <Layers className="w-5 h-5 text-white animate-pulse" /> CONSOLIDA
                </motion.span>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. Bottom Section: Tracking Number in Large Monospace Premium White Box ── */}
        <div className="w-full flex flex-col items-center pb-1 shrink-0 -mt-1 md:-mt-2 lg:-mt-3">
          {/* Large Monospace Tracking Number in a Premium High-Contrast White Box */}
          <div className="bg-white px-8 py-3.5 md:py-4 rounded-[2rem] text-center shadow-[0_15px_40px_rgba(0,0,0,0.25)] w-full max-w-[95%] mx-auto flex items-center justify-center border-4 border-white/40">
            <span
              className={cn(
                "font-mono font-black tracking-widest block leading-none break-all w-full",
                trackingColorClass
              )}
              style={{ fontSize: trackingFontSize }}
            >
              {result.tracking}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Not found ────────────────────────────────────────────────────────────────
export function NotFoundView({ tracking }: { tracking: string }) {
  const isInternal = isInternalTracking(tracking);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none px-8 relative overflow-hidden bg-red-900/40">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className="flex flex-col items-center gap-4 relative z-10"
      >
        <div className="p-6 rounded-[2rem] bg-white shadow-[0_0_80px_rgba(255,255,255,0.25)]">
          <XCircle className="w-20 h-20 text-red-600" strokeWidth={2.5} />
        </div>
        <h1 className="font-black text-white uppercase tracking-tight leading-none text-center drop-shadow-2xl" style={{ fontSize: 'clamp(2.2rem, 5.5vw, 4.5rem)' }}>
          {isInternal ? 'TRACKING INTERNO NO AUTORIZADO' : '¡NO ENCONTRADO!'}
        </h1>
        {isInternal && (
          <p className="text-white/90 font-extrabold text-center text-sm md:text-base max-w-md drop-shadow-md">
            No autorizado para la salida de encomiendas
          </p>
        )}
      </motion.div>

      {tracking && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring' }}
          className="bg-white py-4 px-8 rounded-[1.5rem] border-2 border-white shadow-2xl relative z-10 w-full max-w-[90%]"
        >
          <p className="font-mono text-red-600 font-black tracking-widest text-center break-all uppercase drop-shadow-sm" style={{ fontSize: 'clamp(1.8rem, 4.5vw, 3.8rem)' }}>
            {tracking}
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────
export function ErrorView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none bg-amber-950/40 p-8">
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="p-6 rounded-[2rem] bg-amber-500/20 border-4 border-amber-500 shadow-2xl"
      >
        <AlertTriangle className="w-20 h-20 text-amber-400" strokeWidth={2} />
      </motion.div>
      <div className="text-center space-y-2">
        <h2 className="font-black text-white text-3xl md:text-4xl uppercase tracking-wider drop-shadow-md">Sin Conexión</h2>
        <p className="font-bold text-amber-200 text-base md:text-lg">Revisa la señal wifi o el cable de red de la bodega</p>
      </div>
    </div>
  );
}
