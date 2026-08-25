import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudit } from '@/hooks/use-audit';
import { AnimatePresence, motion } from 'framer-motion';
import { Package, Wifi, WifiOff, ScanLine, Clock, Warehouse, History, Search, X, LayoutDashboard, Trash2, Keyboard, Sliders, Volume2, Play, Plane, Ship, Loader2, Layers, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import useScannerInput from '@/hooks/useScannerInput';
import { 
  ScanResult, 
  HistoryEntry, 
  ScanState, 
  playBeep, 
  announceScanResult, 
  announceError,
  SpeechSettings,
  DEFAULT_SPEECH_SETTINGS,
  getSpeechSettings,
  saveSpeechSettings,
  speakAnnouncement,
  getAbbr,
  getGradient,
  getScanResultPhrase,
  isInternalTracking
} from './types';
import { searchPackage } from './search';
import { HistoryCard } from './HistoryCard';
import { IdleView, ScanningView, FoundView, NotFoundView, ErrorView } from './views';
import { collection, query, orderBy, limit, getDocs, getCountFromServer, where, onSnapshot, doc, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getCustomerBySlCode, findCustomerBySlCode, loadCustomers } from '@/lib/services/matching';

const HISTORY_KEY       = 'bodega-history';
const HISTORY_LIMIT     = 30;
const RESET_FOUND_MS    = 16000;
const RESET_MISS_MS     = 16000;
const MANUAL_DEBOUNCE_MS = 3000;

// Canon package status ranks to prevent accidental downgrades (regressions) during scans
const STATUS_RANK: Record<string, number> = {
  'pre-alerted': 0, 'pre_alerted': 0,
  'ready': 1,
  'received': 1,
  'transit': 2, 'in_transit': 2,
  'customs': 3,
  'held': 3, 'retained': 3,
  'consolidated': 4,
  'processed': 5,
  'route': 6, 'on_route': 6, 'pickup': 6,
  'delivered': 7, 'returned': 7,
};

function isToday(timestamp: number): boolean {
  const d1 = new Date(timestamp);
  const d2 = new Date();
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

const getManifestTypeStyles = (type: string) => {
  const t = (type || '').toLowerCase();
  if (t === 'usa_air') {
    return {
      label: 'USA AÉREO',
      icon: <Plane className="w-4 h-4" />,
      colorClass: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      gradientClass: 'from-blue-600/10 to-indigo-600/5 hover:border-blue-500/50',
      selectedBg: 'bg-blue-950/30 border-blue-500'
    };
  } else if (t === 'usa_sea') {
    return {
      label: 'USA MARÍTIMO',
      icon: <Ship className="w-4 h-4" />,
      colorClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
      gradientClass: 'from-emerald-600/10 to-teal-600/5 hover:border-emerald-500/50',
      selectedBg: 'bg-emerald-950/30 border-emerald-500'
    };
  } else if (t === 'col_air') {
    return {
      label: 'COLOMBIA AÉREO',
      icon: <Plane className="w-4 h-4" />,
      colorClass: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
      gradientClass: 'from-purple-600/10 to-fuchsia-600/5 hover:border-purple-500/50',
      selectedBg: 'bg-purple-950/30 border-purple-500'
    };
  } else {
    return {
      label: type.toUpperCase().replace('_', ' '),
      icon: <Package className="w-4 h-4" />,
      colorClass: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
      gradientClass: 'from-slate-600/10 to-slate-700/5 hover:border-slate-500/50',
      selectedBg: 'bg-slate-900/40 border-slate-500'
    };
  }
};

export function ScannerBodegaPage() {
  const navigate = useNavigate();
  const { log: auditLog } = useAudit();
  const [scanState,      setScanState]      = useState<ScanState>('idle');
  const [currentResult,  setCurrentResult]  = useState<ScanResult | null>(null);
  const [lastTracking,   setLastTracking]   = useState('');
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const [scanCount,      setScanCount]      = useState(0);
  const [lastScanMs,     setLastScanMs]     = useState<number | null>(null);
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [newKey,         setNewKey]         = useState<string | null>(null);
  const [manualInput,    setManualInput]    = useState('');
  const [manualKeyboard, setManualKeyboard] = useState(false);
  const [showSidebar,    setShowSidebar]    = useState(true);
  const [recentDaysOnly, setRecentDaysOnly] = useState(false);

  // Voice synthesis settings states
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(() => getSpeechSettings());

  // Manifest Pre-selection Screen states
  const [activeManifest, setActiveManifest] = useState<{ id: string; totalPackages: number; manifestType: string } | null>(null);
  const [manifestsList, setManifestsList] = useState<Array<{ id: string; totalPackages: number; manifestType: string; processedAt: string }>>([]);
  const [loadingManifests, setLoadingManifests] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [preloadLoading, setPreloadLoading] = useState(false);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [preloadedPackages, setPreloadedPackages] = useState<Map<string, ScanResult>>(new Map());
  const [scannedManifestTrackings, setScannedManifestTrackings] = useState<Set<string>>(new Set());

  // Detect touch/TV/Android environment — suppress soft keyboard by default.
  // Covers: iPad, Android tablet, Android TV, Google TV, Smart TV browsers.
  // Google/Android TV may have maxTouchPoints=0 but uses coarse pointer (remote).
  const isTouchDevice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const hasTouch  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const coarse    = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const ua        = navigator.userAgent.toLowerCase();
    const isTV      = /android tv|google tv|crkey|smart tv|smarttv|tv safari|tizen|webos|hbbtv/.test(ua);
    const isAndroid = /android/.test(ua);
    return hasTouch || coarse || isTV || isAndroid;
  }, []);

  // Track viewport width for responsive sidebar
  const [vw, setVw] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setVw(w);
      // Auto-collapse sidebar on small screens, auto-show on large
      if (w < 768) setShowSidebar(false);
      else setShowSidebar(true);
    };
    window.addEventListener('resize', onResize);
    // Set initial state
    if (window.innerWidth < 768) setShowSidebar(false);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Compute sidebar width — always 30% of viewport (70/30 split)
  const sidebarWidth = useMemo(() => {
    if (vw < 768) return '100%';  // Mobile: full-width overlay (not shown by default)
    return '30vw';
  }, [vw]);

  // Pre-warm customer cache in memory on mount for instant zero-overcost lookups
  useEffect(() => {
    loadCustomers().catch((err) => {
      console.warn('[ScannerBodega] Failed to pre-warm customer cache:', err);
    });
  }, []);

  const resetTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualDebounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchRef       = useRef<(t: string) => void>(() => {});

  // Dynamic voice loading reactively with async polling support
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const updateVoices = () => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return false;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return false;

      const es = voices.filter(
        v => v.lang.startsWith('es-') || v.lang.startsWith('es_') || v.lang.toLowerCase().includes('spanish')
      );
      setAvailableVoices(es.length > 0 ? es : voices);
      return true;
    };

    updateVoices();

    // Standard voices changed listener
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        updateVoices();
      };
    }

    // Polling interval to guarantee loading on Chrome/Safari/Android/SmartTV
    const intervalId = setInterval(() => {
      const loaded = updateVoices();
      if (loaded) {
        clearInterval(intervalId);
      }
    }, 250);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleVoiceChange = useCallback((voiceName: string) => {
    const next = { ...speechSettings, voiceName };
    setSpeechSettings(next);
    saveSpeechSettings(next);
  }, [speechSettings]);

  const handleRateChange = useCallback((rate: number) => {
    const next = { ...speechSettings, rate };
    setSpeechSettings(next);
    saveSpeechSettings(next);
  }, [speechSettings]);

  const handlePitchChange = useCallback((pitch: number) => {
    const next = { ...speechSettings, pitch };
    setSpeechSettings(next);
    saveSpeechSettings(next);
  }, [speechSettings]);

  const handleRepeatToggle = useCallback((repeatRoute: boolean) => {
    const next = { ...speechSettings, repeatRoute };
    setSpeechSettings(next);
    saveSpeechSettings(next);
  }, [speechSettings]);

  const testSpeech = useCallback(() => {
    const testPhrase = speechSettings.repeatRoute 
      ? 'Ce, Uno. ... Ce, Uno. Escaneo exitoso.' 
      : 'Ce, Uno. Escaneo exitoso.';
    speakAnnouncement(testPhrase, speechSettings);
  }, [speechSettings]);

  // Scanner hook — document-level listener captures HID keystrokes regardless of focus.
  // inputRef is only used when a real <input> is rendered (desktop / manual mode).
  const { inputRef, isScanning: isScannerActive, scanBuffer } = useScannerInput({
    onScan: (v) => {
      // Scanner completed: clear manual debounce, clear input, search immediately
      if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);
      setManualInput('');
      handleSearchRef.current(v);
    },
    minLength:         6,
    maxKeystrokeDelay: 30,
    debounceMs:        150,
    autoClear:         true,
    autoClearDelay:    4000,
  });

  // ── Online / offline ──────────────────────────────────────────────────────
  useEffect(() => {
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', dn);
    return () => {
      window.removeEventListener('online',  up);
      window.removeEventListener('offline', dn);
    };
  }, []);

  // ── Auto-focus — skip on touch devices to prevent soft keyboard on TV/tablet
  useEffect(() => {
    if (!isTouchDevice) inputRef.current?.focus();
  }, [inputRef, isTouchDevice]);

  // Refocus when manual keyboard mode is enabled
  useEffect(() => {
    if (manualKeyboard) setTimeout(() => inputRef.current?.focus(), 80);
  }, [manualKeyboard]);

  // ── Restore session history ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed: HistoryEntry[] = JSON.parse(raw);
        const todayOnly = parsed.filter(e => isToday(e.scannedAt));
        setHistory(todayOnly);
        setScanCount(todayOnly.length);
        if (todayOnly.length !== parsed.length) {
          try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(todayOnly)); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }, []);

  // ── Fetch recent manifests ───────────────────────────────────────────────
  useEffect(() => {
    if (activeManifest) return;

    const fetchRecentManifests = async () => {
      setLoadingManifests(true);
      try {
        const ref = collection(db, 'manifests');
        const q = query(ref, orderBy('processedAt', 'desc'), limit(30));
        const snap = await getDocs(q);
        const seen = new Set<string>();
        const results: Array<{ id: string; totalPackages: number; manifestType: string; processedAt: string }> = [];

        for (const d of snap.docs) {
          if (results.length >= 6) break;
          if (seen.has(d.id)) continue;

          const data = d.data();
          const src = data.source as string | undefined;

          // Skip link-only stubs (using the same criteria as getRecentManifests)
          const isLinkOnlyStub = (src === 'nova_mlocker') ||
            (src === 'nova_fusion' && (
              !Array.isArray(data.packages) || (data.packages as any[]).length === 0
            ));
          if (isLinkOnlyStub) continue;
          seen.add(d.id);

          results.push({
            id: d.id,
            totalPackages: (data.totalPackages as number) ?? 0,
            manifestType: (data.manifestType as string) ?? 'usa_air',
            processedAt: (data.processedAt as string) ?? '',
          });
        }

        // Fetch accurate live package counts in parallel
        const withRealCounts = await Promise.all(
          results.map(async (r) => {
            try {
              const countSnap = await getCountFromServer(
                query(collection(db, 'packages'), where('manifestNumber', '==', r.id))
              );
              return { ...r, totalPackages: countSnap.data().count };
            } catch {
              return r;
            }
          })
        );

        setManifestsList(withRealCounts);
      } catch (err) {
        console.error('[ScannerBodega] Error fetching manifests:', err);
      } finally {
        setLoadingManifests(false);
      }
    };

    fetchRecentManifests();
  }, [activeManifest]);

  // Helper to clean input identical to what searchPackage expects
  const cleanInputHelper = useCallback((raw: string): string => {
    let cleaned = raw.replace(/[^\x20-\x7E]/g, '').trim();
    if (cleaned.startsWith(']') && cleaned.length > 3) {
      cleaned = cleaned.substring(3);
    }
    cleaned = cleaned.replace(/[\s\-_]+/g, '');
    return cleaned;
  }, []);

  // ── Suscripción reactiva a paquetes en tiempo real ──────────────────────────
  useEffect(() => {
    if (!activeManifest?.id) {
      setPreloadedPackages(new Map());
      setScannedManifestTrackings(new Set());
      return;
    }

    const q = query(collection(db, 'packages'), where('manifestNumber', '==', activeManifest.id));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const preloaded = new Map<string, ScanResult>();
      const alreadyScanned = new Set<string>();

      snap.docs.forEach((doc) => {
        const d = doc.data();
        const tracking = (d.trackingNumber || d.tracking || doc.id || '').toUpperCase().trim();
        const ruta = d.ruta || '';
        let customerName = d.customerName || d.nombreCliente || '';
        const slCode = d.slCode || '';

        // Auto-heal 'Cliente Pre-alertado' if customer profile is now available
        if (customerName.toLowerCase().startsWith('cliente pre-alertado') && slCode) {
          const cachedCust = getCustomerBySlCode(slCode);
          if (cachedCust && cachedCust.fullName && !cachedCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
            customerName = cachedCust.fullName;
            updateDoc(doc.ref, { customerName: cachedCust.fullName, nombreCliente: cachedCust.fullName }).catch(() => {});
          } else {
            findCustomerBySlCode(slCode).then(resolvedCust => {
              if (resolvedCust && resolvedCust.fullName && !resolvedCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
                updateDoc(doc.ref, { customerName: resolvedCust.fullName, nombreCliente: resolvedCust.fullName }).catch(() => {});
                setPreloadedPackages(prev => {
                  const next = new Map(prev);
                  const existing = next.get(tracking);
                  if (existing) {
                    const updated = { ...existing, customerName: resolvedCust.fullName };
                    next.set(tracking, updated);
                    const cleanKey = cleanInputHelper(tracking);
                    if (cleanKey) next.set(cleanKey, updated);
                  }
                  return next;
                });
                setCurrentResult(curr => {
                  if (curr && (curr.tracking === tracking || curr.slCode === slCode)) {
                    return { ...curr, customerName: resolvedCust.fullName };
                  }
                  return curr;
                });
              }
            }).catch(() => {});
          }
        }

        const res: ScanResult = {
          id: doc.id,
          tracking,
          ruta,
          routeAbbr: ruta ? getAbbr(ruta) : '?',
          routeGradient: getGradient(ruta),
          customerName,
          slCode,
          status: d.status || 'received',
          requiresPermit: !!d.requiresPermit || !!d.permisos,
          consolidationEnabled: !!d.consolidationEnabled || !!d.consolidacion,
          pendingUserAssignment: !!d.pendingUserAssignment,
          weight: d.weight,
          manifestNumber: d.manifestNumber || activeManifest.id,
          isMasterPackage: !!d.isMasterPackage,
          groupedTrackings: d.groupedTrackings || [],
          packageCount: d.packageCount,
          totalAmount: d.totalAmount,
          encomiendaServiceName: d.encomiendaServiceName,
        };

        // 1. Direct tracking key
        preloaded.set(tracking, res);

        // 2. Cleaned key (no whitespace / dashes)
        const cleanedKey = cleanInputHelper(tracking);
        if (cleanedKey && cleanedKey !== tracking) {
          preloaded.set(cleanedKey, res);
        }

        // 3. GS1-128 barcode prefix stripping (e.g. 420 + 5/9 digit postal code)
        if (cleanedKey.startsWith('420') && cleanedKey.length > 8) {
          const stripped5 = cleanedKey.substring(8);
          preloaded.set(stripped5, res);
          if (cleanedKey.length > 12) {
            const stripped9 = cleanedKey.substring(12);
            preloaded.set(stripped9, res);
          }
        }

        // 4. O(1) Suffix Indexing for trailing 6, 7, 8, 9, 10, 12 digits
        for (const len of [6, 7, 8, 9, 10, 12]) {
          if (cleanedKey.length >= len) {
            const suf = cleanedKey.substring(cleanedKey.length - len);
            preloaded.set(`_SUF_${suf}`, res);
          }
        }

        const lowerStatus = (d.status || '').toLowerCase();
        if (lowerStatus === 'received' || lowerStatus === 'delivered' || lowerStatus === 'processed' || d.scannedAt) {
          alreadyScanned.add(tracking);
        }
      });

      setPreloadedPackages(preloaded);
      setScannedManifestTrackings(alreadyScanned);
      
      // Sincronizar dinámicamente el total de paquetes
      setActiveManifest(prev => {
        if (!prev) return null;
        if (prev.totalPackages !== snap.size) {
          return { ...prev, totalPackages: snap.size };
        }
        return prev;
      });

      setPreloadLoading(false);
      setIsBackgroundLoading(false);
    }, (err) => {
      console.error('[ScannerBodega] Error en la suscripción de paquetes:', err);
      setPreloadLoading(false);
      setIsBackgroundLoading(false);
    });

    return () => unsubscribe();
  }, [activeManifest?.id, cleanInputHelper]);

  // ── Package preloading logic ──────────────────────────────────────────────
  const handleSelectManifest = useCallback(async (manifest: { id: string; totalPackages: number; manifestType: string }) => {
    setPreloadLoading(true);
    setActiveManifest(manifest);
    const cleanManifestId = manifest.id.replace(/[A-Za-z]+$/, '');
    speakAnnouncement(`Cambio de manifiesto ${cleanManifestId}`, speechSettings);
  }, [speechSettings]);

  const autoDetectAndLoadManifest = useCallback(async (manifestId: string, triggerPackage?: ScanResult) => {
    setIsBackgroundLoading(true);
    try {
      const { doc: fsDoc, getDoc: fsGetDoc } = await import('firebase/firestore');
      const manifestSnap = await fsGetDoc(fsDoc(db, 'manifests', manifestId));
      let totalPackages = 0;
      let manifestType = 'usa_air';
      if (manifestSnap.exists()) {
        const data = manifestSnap.data();
        totalPackages = data.totalPackages ?? 0;
        manifestType = data.manifestType ?? 'usa_air';
      }

      const countSnap = await getCountFromServer(
        query(collection(db, 'packages'), where('manifestNumber', '==', manifestId))
      );
      totalPackages = countSnap.data().count;

      setActiveManifest({ id: manifestId, totalPackages, manifestType });
      
      const cleanManifestId = manifestId.replace(/[A-Za-z]+$/, '');
      let announcement = `Cambio de manifiesto ${cleanManifestId}`;
      if (triggerPackage) {
        announcement += `. ${getScanResultPhrase(triggerPackage)}`;
      }
      speakAnnouncement(announcement, speechSettings);

    } catch (err) {
      console.error('[ScannerBodega] Error auto-detecting manifest:', err);
      setIsBackgroundLoading(false);
    }
  }, [speechSettings]);

  // ── Keyboard navigation for manifest picker ───────────────────────────────
  useEffect(() => {
    if (activeManifest || manifestsList.length === 0 || preloadLoading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % manifestsList.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + manifestsList.length) % manifestsList.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = manifestsList[focusedIndex];
        if (selected) {
          handleSelectManifest(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeManifest, manifestsList, focusedIndex, handleSelectManifest, preloadLoading]);

  // ── Schedule idle reset ───────────────────────────────────────────────────
  const scheduleReset = useCallback((ms: number) => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setScanState('idle');
      setCurrentResult(null);
      setLastTracking('');
      // Re-focus the visible input after reset
      setTimeout(() => inputRef.current?.focus(), 50);
    }, ms);
  }, [inputRef]);

  /**
   * Processes a master package and updates all of its grouped sub-packages.
   *
   * ARCHITECTURAL SAFEGUARDS:
   * 1. Chunked Querying: Grouped trackings are split into chunks of $\le 30$ elements
   *    to comply with Firestore's `in` query constraint.
   * 2. Atomic Batch Writes: Sub-packages are updated using `writeBatch(db)`.
   * 3. State Invariance: Records physical scan timestamp (`scannedAt`) without mutating status.
   *
   * @param pkg - Master package ScanResult containing groupedTrackings array
   */
  const processMasterPackage = useCallback(async (pkg: ScanResult) => {
    if (!pkg.isMasterPackage) return;
    const trackings = pkg.groupedTrackings || [];
    if (trackings.length === 0) return;

    try {
      const chunks: string[][] = [];
      for (let i = 0; i < trackings.length; i += 30) {
        chunks.push(trackings.slice(i, i + 30));
      }

      const matchedTrackings: string[] = [];
      const updatePromises: Promise<void>[] = [];

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'packages'),
          where('trackingNumber', 'in', chunk)
        );
        updatePromises.push(
          getDocs(q).then((snap) => {
            const batch = writeBatch(db);
            const now = new Date().toISOString();
            const scannedTimestamp = Date.now();

            snap.docs.forEach((docSnap) => {
              const data = docSnap.data();

              const updateData: any = {
                scannedAt: scannedTimestamp,
                updatedAt: now,
              };

              batch.update(docSnap.ref, updateData);
              matchedTrackings.push((data.trackingNumber || '').toUpperCase());
            });
            return batch.commit();
          })
        );
      }

      await Promise.all(updatePromises);

      setScannedManifestTrackings(prev => {
        const next = new Set(prev);
        matchedTrackings.forEach(t => next.add(t));
        return next;
      });

      if (import.meta.env.DEV) {
        console.info('[ScannerBodega] Master package processed successfully:', matchedTrackings);
      }
    } catch (err) {
      console.error('[ScannerBodega] Error processing master package sub-packages:', err);
    }
  }, []);

  /**
   * Main barcode search and physical receipt processing handler.
   *
   * LOW-LATENCY ARCHITECTURE:
   * 1. Instant Memory Match: Performs $O(1)$ lookup against `preloadedPackages` Map.
   * 2. Suffix Matching: If exact match fails, checks trailing 6-8 digits of courier barcodes.
   * 3. Non-Regressive Physical Scan: Saves `scannedAt` timestamp to document without
   *    reverting existing delivery statuses or triggering feedback loops.
   *
   * @param raw - Raw scanned barcode string from hardware scanner or manual input
   */
  const handleSearch = useCallback(async (raw: string) => {
    if (!raw || raw.length < 6) return;

    if (!isOnline) {
      setScanState('error');
      playBeep('error');
      announceError('error', speechSettings);
      scheduleReset(RESET_MISS_MS);
      return;
    }

    // 0. Cancel any ongoing speech announcement immediately to prevent audio backlog on TV hardware
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setScanState('scanning');
    setCurrentResult(null);

    const cleaned = cleanInputHelper(raw);
    const cleanUpper = cleaned.toUpperCase();
    
    // 1. Direct O(1) multi-index lookup against preloaded in-memory Map
    let cachedPkg = preloadedPackages.get(cleaned) || 
                    preloadedPackages.get(cleanUpper) || 
                    preloadedPackages.get(`_SUF_${cleanUpper}`);

    // 2. GS1-128 barcode prefix stripping if scanned raw has 420 prefix (USPS / Courier barcodes)
    if (!cachedPkg && cleanUpper.startsWith('420') && cleanUpper.length > 8) {
      const stripped5 = cleanUpper.substring(8);
      cachedPkg = preloadedPackages.get(stripped5) || preloadedPackages.get(`_SUF_${stripped5}`);
      if (!cachedPkg && cleanUpper.length > 12) {
        const stripped9 = cleanUpper.substring(12);
        cachedPkg = preloadedPackages.get(stripped9) || preloadedPackages.get(`_SUF_${stripped9}`);
      }
    }

    // 3. Fallback: check suffix match on preloaded packages for last 6-8 digits
    if (!cachedPkg && cleanUpper.length >= 6) {
      const matches = Array.from(preloadedPackages.values()).filter(pkg => {
        const tr = (pkg.tracking || '').toUpperCase();
        const trClean = cleanInputHelper(tr);
        return tr.endsWith(cleanUpper) || trClean.endsWith(cleanUpper);
      });
      if (matches.length > 0) {
        matches.sort((a, b) => {
          const tA = new Date((a as any).scannedAt || (a as any).updatedAt || (a as any).createdAt || 0).getTime();
          const tB = new Date((b as any).scannedAt || (b as any).updatedAt || (b as any).createdAt || 0).getTime();
          return tB - tA;
        });
        cachedPkg = matches[0];
      }
    }

    // 4. Auto-heal 'Cliente Pre-alertado' on the fly if real customer profile is available
    if (cachedPkg && cachedPkg.customerName.toLowerCase().startsWith('cliente pre-alertado') && cachedPkg.slCode) {
      const realCust = getCustomerBySlCode(cachedPkg.slCode);
      if (realCust && realCust.fullName && !realCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
        cachedPkg = { ...cachedPkg, customerName: realCust.fullName };
      } else {
        const fetchedCust = await findCustomerBySlCode(cachedPkg.slCode);
        if (fetchedCust && fetchedCust.fullName && !fetchedCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
          cachedPkg = { ...cachedPkg, customerName: fetchedCust.fullName };
          if (cachedPkg.id) {
            updateDoc(doc(db, 'packages', cachedPkg.id), { customerName: fetchedCust.fullName, nombreCliente: fetchedCust.fullName }).catch(() => {});
          }
        }
      }
    }

    if (cachedPkg) {
      // LOW LATENCY RESOLUTION (INSTANT SUCCESS FEEDBACK)
      setLastScanMs(0);
      setCurrentResult(cachedPkg);
      setScanState('found');
      setLastTracking(cachedPkg.tracking);
      setScanCount(n => {
        auditLog({
          action: 'scanner_batch_scan',
          category: 'scanner',
          result: 'success',
          resource: cachedPkg.tracking,
          metadata: { scanCount: n + 1, ruta: cachedPkg.ruta, slCode: cachedPkg.slCode }
        });
        return n + 1;
      });
      playBeep('success');
      announceScanResult(cachedPkg, speechSettings);
      auditLog({
        action: 'scanner_scan',
        category: 'scanner',
        result: 'success',
        resource: cachedPkg.tracking,
        metadata: { ruta: cachedPkg.ruta, status: cachedPkg.status, slCode: cachedPkg.slCode }
      });

      // Add to scanned manifest trackings for regression counter
      setScannedManifestTrackings(prev => {
        const next = new Set(prev);
        next.add(cachedPkg.tracking);
        return next;
      });

      const entry: HistoryEntry = { ...cachedPkg, scannedAt: Date.now() };
      const key = `${entry.tracking}-${entry.scannedAt}`;
      setNewKey(key);
      setHistory(prev => {
        const todayOnly = prev.filter(e => isToday(e.scannedAt));
        const next = [entry, ...todayOnly].slice(0, HISTORY_LIMIT);
        try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
        return next;
      });

      scheduleReset(RESET_FOUND_MS);

      // Update package scannedAt in Firestore in real-time (but never change status or history)
      if (cachedPkg.id) {
        const now = new Date().toISOString();

        const updateData: any = {
          scannedAt: Date.now(),
          updatedAt: now,
        };

        updateDoc(doc(db, 'packages', cachedPkg.id), updateData).catch(err => {
          console.warn('[ScannerBodega] Failed to update package scannedAt in Firestore:', err);
        });
      }

      if (cachedPkg.isMasterPackage) {
        processMasterPackage(cachedPkg);
      }
      return;
    }

    // FALLBACK TO CLOUD FUNCTION / FIRESTORE LOOKUP (SYNCHRONOUS)
    const t0 = performance.now();
    try {
      const result = await searchPackage(raw, { recentDaysOnly });
      setLastScanMs(Math.round(performance.now() - t0));

      if (result) {
        if (result.customerName.toLowerCase().startsWith('cliente pre-alertado') && result.slCode) {
          const realCust = getCustomerBySlCode(result.slCode);
          if (realCust && realCust.fullName && !realCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
            result.customerName = realCust.fullName;
          } else {
            const fetchedCust = await findCustomerBySlCode(result.slCode);
            if (fetchedCust && fetchedCust.fullName && !fetchedCust.fullName.toLowerCase().startsWith('cliente pre-alertado')) {
              result.customerName = fetchedCust.fullName;
              if (result.id) {
                updateDoc(doc(db, 'packages', result.id), { customerName: fetchedCust.fullName, nombreCliente: fetchedCust.fullName }).catch(() => {});
              }
            }
          }
        }
        setCurrentResult(result);
        setScanState('found');
        setLastTracking(result.tracking);
        setScanCount(n => {
          auditLog({ action: 'scanner_batch_scan', category: 'scanner', result: 'success', resource: result.tracking, metadata: { scanCount: n + 1, ruta: result.ruta, slCode: result.slCode } });
          return n + 1;
        });
        playBeep('success');
        auditLog({ action: 'scanner_scan', category: 'scanner', result: 'success', resource: result.tracking, metadata: { ruta: result.ruta, status: result.status, slCode: result.slCode } });

        // Auto-detect or dynamically switch manifest instantly on scan if manifest changes
        if (result.manifestNumber && (!activeManifest || activeManifest.id !== result.manifestNumber)) {
          autoDetectAndLoadManifest(result.manifestNumber, result);
        } else {
          announceScanResult(result, speechSettings);
        }

        // Check if this package belongs to the current preloaded manifest
        const trackingUpper = result.tracking.toUpperCase();
        const cleanedResult = cleanInputHelper(trackingUpper);
        if (preloadedPackages.has(trackingUpper) || preloadedPackages.has(cleanedResult)) {
          setScannedManifestTrackings(prev => {
            const next = new Set(prev);
            next.add(result.tracking);
            return next;
          });
        }

        const entry: HistoryEntry = { ...result, scannedAt: Date.now() };
        const key = `${entry.tracking}-${entry.scannedAt}`;
        setNewKey(key);
        setHistory(prev => {
          const todayOnly = prev.filter(e => isToday(e.scannedAt));
          const next = [entry, ...todayOnly].slice(0, HISTORY_LIMIT);
          try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
          return next;
        });

        scheduleReset(RESET_FOUND_MS);

        // Update package scannedAt in Firestore in real-time (but never change status or history)
        if (result.id) {
          const now = new Date().toISOString();

          const updateData: any = {
            scannedAt: Date.now(),
            updatedAt: now,
          };

          updateDoc(doc(db, 'packages', result.id), updateData).catch(err => {
            console.warn('[ScannerBodega] Failed to update package scannedAt in Firestore:', err);
          });
        }

        if (result.isMasterPackage) {
          processMasterPackage(result);
        }
      } else {
        setScanState('not-found');
        setLastTracking(raw.trim().toUpperCase());
        playBeep('error');
        announceError('not-found', speechSettings, raw);
        auditLog({ action: 'scanner_scan', category: 'scanner', result: 'error', resource: raw.trim().toUpperCase(), errorMessage: 'Package not found' });
        scheduleReset(RESET_MISS_MS);
      }
    } catch (err) {
      setScanState('not-found');
      setLastTracking(raw.trim().toUpperCase());
      playBeep('error');
      announceError('not-found', speechSettings, raw);
      auditLog({ action: 'scanner_scan', category: 'scanner', result: 'error', resource: raw.trim().toUpperCase(), errorMessage: err instanceof Error ? err.message : 'Search error' });
      scheduleReset(RESET_MISS_MS);
    }
  }, [isOnline, scheduleReset, auditLog, speechSettings, preloadedPackages, cleanInputHelper, processMasterPackage]);

  handleSearchRef.current = handleSearch;

  // ── Derived values ────────────────────────────────────────────────────────
  const isInternalTrackingManifest = useMemo(() => {
    if (!activeManifest) return false;
    if (isInternalTracking(activeManifest.id)) return true;
    if ((activeManifest.manifestType || '').toLowerCase() === 'internal') return true;
    if (activeManifest.id.toLowerCase().includes('interno')) return true;

    for (const pkg of preloadedPackages.values()) {
      if (pkg.isMasterPackage) return true;
    }
    return false;
  }, [activeManifest, preloadedPackages]);

  const manifestStyle = useMemo(() => {
    if (!activeManifest) return null;
    return getManifestTypeStyles(activeManifest.manifestType);
  }, [activeManifest]);

  const mainGradient =
    scanState === 'found' && currentResult
      ? `bg-gradient-to-br ${currentResult.routeGradient}`
      : scanState === 'not-found' || scanState === 'error'
        ? 'bg-gradient-to-br from-red-500 to-red-700'
        : 'bg-white border border-slate-200';

  const statusBarColor =
    scanState === 'found'    ? 'bg-emerald-400' :
    scanState === 'scanning' ? 'bg-yellow-400 animate-pulse' :
    scanState === 'not-found' || scanState === 'error' ? 'bg-red-400' :
    'bg-slate-300';

  // Manual input handler — updates state + 3s auto-search debounce
  const handleManualChange = useCallback((raw: string) => {
    const val = raw.toUpperCase();
    setManualInput(val);
    if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);
    if (val.trim().length >= 6) {
      manualDebounceRef.current = setTimeout(() => {
        handleSearchRef.current(val.trim());
        setManualInput('');
      }, MANUAL_DEBOUNCE_MS);
    }
  }, []);

  const handleManualSearch = useCallback(() => {
    if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current);
    // CRITICAL: Rapid scanner input followed by Enter causes stale closure for manualInput state.
    // Always read directly from the DOM node to guarantee the full scanned string is captured.
    const val = (inputRef.current?.value || manualInput).trim();
    if (val.length < 6) return;
    handleSearchRef.current(val);
    setManualInput('');
    if (inputRef.current) inputRef.current.value = '';
  }, [manualInput, inputRef]);

  const goHome = useCallback(() => navigate('/'), [navigate]);


  const clearHistory = useCallback(() => {
    setHistory([]);
    setScanCount(0);
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  }, []);

  // ── Global Ctrl+Delete shortcut to clear history ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') {
        e.preventDefault();
        clearHistory();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clearHistory]);

  if (preloadLoading) {
    return (
      <div className="flex flex-col h-screen w-screen bg-slate-950 text-white items-center justify-center p-6">
        <div className="relative flex items-center justify-center w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Package className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-black mb-2 tracking-tight">Cargando Manifiesto</h2>
        <p className="text-slate-400 font-medium text-center max-w-md">
          Precargando paquetes en memoria local para escaneo de ultra-baja latencia...
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden relative"
      style={{ height: '100dvh', maxHeight: '100dvh' }}
      onClick={() => { if (!isTouchDevice || manualKeyboard) inputRef.current?.focus(); }}
    >

      {/* ── Main panel — fills available space ─────────────────── */}
      <div className="flex flex-col min-h-0 p-3 gap-2" style={{ flex: '1 1 0', minWidth: 0 }}>
        {/* Regression Counter Header */}
        <div className={cn(
          "relative overflow-hidden rounded-2xl py-2 px-6 flex items-center justify-between shadow-sm select-none shrink-0 transition-all duration-300",
          isInternalTrackingManifest
            ? "bg-[#e6f4f1] border border-[#b2dfdb]/80 shadow-[0_4px_12px_rgba(0,150,136,0.05)]"
            : "bg-white border border-slate-200"
        )}>
          {/* Battery-like progress fill */}
          <div 
            className={cn(
              "absolute inset-y-0 left-0 transition-all duration-500 ease-out",
              isInternalTrackingManifest
                ? "bg-gradient-to-r from-teal-500/15 to-emerald-500/25"
                : "bg-gradient-to-r from-emerald-500/10 to-teal-500/15"
            )} 
            style={{ width: `${activeManifest ? Math.min(100, Math.round((scannedManifestTrackings.size / (activeManifest.totalPackages || 1)) * 100)) : 0}%` }} 
          />

          {/* Left: Manifest Name */}
          <div className="relative z-10 flex items-center gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-3xl font-black tracking-tight block",
                  isInternalTrackingManifest ? "text-[#004d40]" : "text-slate-900"
                )}>
                  {activeManifest ? activeManifest.id : "Detectando Manifiesto..."}
                </span>
                {activeManifest && (
                  isInternalTrackingManifest ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-teal-700/15 text-teal-800 border border-teal-700/25">
                      <Layers className="w-3.5 h-3.5" /> Internos
                    </span>
                  ) : (
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border",
                      activeManifest.manifestType === 'usa_air' ? 'bg-blue-500/10 border-blue-500/20 text-blue-600' :
                      activeManifest.manifestType === 'usa_sea' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' :
                      activeManifest.manifestType === 'col_air' ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' :
                      'bg-slate-500/10 border-slate-500/20 text-slate-600'
                    )}>
                      {activeManifest.manifestType === 'usa_air' && <Plane className="w-3.5 h-3.5" />}
                      {activeManifest.manifestType === 'usa_sea' && <Ship className="w-3.5 h-3.5" />}
                      {activeManifest.manifestType === 'col_air' && <Plane className="w-3.5 h-3.5" />}
                      <span>
                        {activeManifest.manifestType === 'usa_air' ? 'USA AÉREO' :
                         activeManifest.manifestType === 'usa_sea' ? 'USA MARÍTIMO' :
                         activeManifest.manifestType === 'col_air' ? 'COLOMBIA AÉREO' :
                         'MANIFIESTO'}
                      </span>
                    </span>
                  )
                )}
              </div>
              {!activeManifest && (
                <span className="text-xs font-semibold text-slate-500 mt-1 block">
                  Escanea un paquete para identificar el manifiesto automáticamente
                </span>
              )}
            </div>
            {isBackgroundLoading && (
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
            )}
          </div>

          {/* Right: Countdown & Change Button */}
          <div className="relative z-10 flex items-center gap-6">
            {activeManifest ? (
              <div className="flex flex-col items-end justify-center">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest leading-none mb-1.5",
                  isInternalTrackingManifest ? "text-teal-700/80" : "text-slate-500"
                )}>
                  {isInternalTrackingManifest ? "TRACKINGS INTERNOS" : "PAQUETES RESTANTES"}
                </span>
                <div className="flex items-baseline justify-end gap-1">
                  <span className={cn(
                    "text-5xl font-black tracking-tight leading-none",
                    isInternalTrackingManifest ? "text-[#004d40]" : "text-slate-900"
                  )}>
                    {Math.max(0, activeManifest.totalPackages - scannedManifestTrackings.size)}
                  </span>
                  <span className={cn(
                    "font-extrabold text-2xl leading-none",
                    isInternalTrackingManifest ? "text-teal-600/60" : "text-slate-400"
                  )}>/ {activeManifest.totalPackages}</span>
                </div>
              </div>
            ) : (
              <span className="text-sm font-extrabold text-indigo-500 animate-pulse bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                Esperando escaneos...
              </span>
            )}

          </div>
        </div>

        {/* Main result card — fills all remaining height */}
        <div
          role="status"
          aria-live="assertive"
          aria-label="Resultado del escaneo"
          className={cn(
            'flex-1 min-h-0 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 flex flex-col',
            mainGradient
          )}
        >
          <div className="flex-1 relative overflow-hidden flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {scanState === 'idle' && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full flex flex-col justify-center items-center">
                  <IdleView scanCount={scanCount}>
                    {/* Unified scanner + manual input — Inatek Bluetooth HID + keyboard */}
                    <div className="flex flex-col gap-3 shrink-0 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-2 w-full">
                        <div className="relative flex-1">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />

                          {/* TV / tablet / touch without manual keyboard: visual display only — zero focusable input → keyboard never appears */}
                          {isTouchDevice && !manualKeyboard ? (
                            <div
                              className="w-full h-14 pl-10 pr-4 rounded-xl border-2 border-transparent bg-slate-50 flex items-center select-none shadow-inner"
                              aria-label="Scanner activo — escanea el código de barras"
                              role="status"
                            >
                              {scanBuffer
                                ? <span className="text-lg font-bold text-slate-900 tracking-wider">{scanBuffer}</span>
                                : <span className="text-base text-slate-500 font-medium">Escanea los últimos 6-8 dígitos o código completo…</span>
                              }
                            </div>
                          ) : (
                            /* Desktop / manual keyboard mode: real input, font-size 16px prevents iOS/Android zoom */
                            <input
                              ref={inputRef}
                              type="text"
                              value={manualInput}
                              onChange={e => handleManualChange(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleManualSearch();
                                if (e.key === 'Escape') goHome();
                              }}
                              onBlur={() => { if (!isTouchDevice) setTimeout(() => inputRef.current?.focus(), 120); }}
                              placeholder="Escanea o ingresa tracking (completo o últimos 6-8 dígitos)..."
                              aria-label="Scanner / tracking input"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="characters"
                              spellCheck={false}
                              className="w-full h-14 pl-10 pr-4 rounded-xl border-2 border-slate-200 bg-white text-slate-900 text-lg font-bold placeholder:font-normal placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 focus:outline-none transition-all shadow-inner"
                            />
                          )}

                          {manualInput && !isTouchDevice && (
                            <button
                              onClick={() => { setManualInput(''); if (manualDebounceRef.current) clearTimeout(manualDebounceRef.current); }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-slate-200 transition-colors"
                              aria-label="Limpiar"
                            >
                              <X className="w-5 h-5 text-slate-500" />
                            </button>
                          )}
                        </div>
                        {isTouchDevice && (
                          <button
                            onClick={() => setManualKeyboard(v => !v)}
                            title={manualKeyboard ? 'Desactivar teclado manual' : 'Activar teclado manual'}
                            className={cn(
                              'h-14 px-4 rounded-xl border-2 transition-colors shrink-0 shadow-sm',
                              manualKeyboard
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            )}
                            aria-pressed={manualKeyboard}
                            aria-label={manualKeyboard ? 'Desactivar teclado' : 'Activar teclado para escritura manual'}
                          >
                            <Keyboard className="w-6 h-6" />
                          </button>
                        )}
                        <button
                          onClick={handleManualSearch}
                          disabled={manualInput.trim().length < 6}
                          className="h-14 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-base transition-colors shrink-0 shadow-sm"
                        >
                          Buscar
                        </button>
                      </div>

                      {/* Date Scope Filter & Clear Visual Status Indicator */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100 px-1">
                        <label
                          className="flex items-center gap-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer select-none"
                          title="Restringe la búsqueda a manifiestos procesados en los últimos 5 días para reducir lecturas en Firestore"
                        >
                          <Checkbox
                            id="scanner-recent-days-only"
                            checked={recentDaysOnly}
                            onCheckedChange={(v) => setRecentDaysOnly(!!v)}
                            className="border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            data-testid="recent-days-checkbox"
                          />
                          <span>Buscar solo en manifiestos recientes (últimos 5 días)</span>
                        </label>

                        {recentDaysOnly ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-black tracking-wide shadow-sm">
                            <Zap className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" />
                            <span>⚡ Búsqueda Rápida Activa: Últimos 5 Días</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold">
                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Búsqueda Global (Todas las fechas)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </IdleView>
                </motion.div>
              )}
              {scanState === 'scanning' && (
                <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} className="w-full h-full flex flex-col justify-center items-center">
                  <ScanningView />
                </motion.div>
              )}
              {scanState === 'found' && currentResult && (
                <motion.div key={currentResult.tracking} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full flex flex-col justify-center items-center">
                  <FoundView result={currentResult} />
                </motion.div>
              )}
              {scanState === 'not-found' && (
                <motion.div key="notfound" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full flex flex-col justify-center items-center">
                  <NotFoundView tracking={lastTracking} />
                </motion.div>
              )}
              {scanState === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="w-full h-full flex flex-col justify-center items-center">
                  <ErrorView />
                </motion.div>
              )}
            </AnimatePresence>
          </div>


        </div>
      </div>

      {/* ── History sidebar — responsive width, collapsible ──── */}
      <AnimatePresence initial={false}>
        {showSidebar && (
          <motion.div
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="flex flex-col min-h-0 bg-white border-l border-slate-200 overflow-hidden"
            style={{ flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0 bg-slate-50/50">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 select-none">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Historial de hoy
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVoiceSettings(true)}
                  title="Configurar Voz y Sonido"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 bg-white transition-colors text-xs font-black shadow-sm"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                  <span>Voz</span>
                </button>
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    title="Borrar historial (Ctrl+Delete)"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Borrar</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-slate-400 p-8 select-none">
                  <img src="/logo.svg" alt="" className="w-24 h-24 opacity-10 grayscale" />
                  <p className="text-lg md:text-xl font-medium text-center text-slate-400">
                    Esperando escaneos...
                  </p>
                </div>
              ) : (
                history.map((entry, idx) => {
                  const key = `${entry.tracking}-${entry.scannedAt}`;
                  return (
                    <HistoryCard
                      key={key}
                      entry={entry}
                      highlight={idx === 0 && key === newKey}
                    />
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Voice & Audio Settings Drawer Overlay ── */}
      <AnimatePresence>
        {showVoiceSettings && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setShowVoiceSettings(false)}>
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col border-l border-slate-200"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600 animate-pulse" />
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Configuración de Voz</h3>
                </div>
                <button
                  onClick={() => setShowVoiceSettings(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Voice Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">
                    Voz en Español
                  </label>
                  {availableVoices.length === 0 ? (
                    <div className="text-sm text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
                      Cargando voces del sistema...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1.5 custom-scrollbar">
                      {/* Default Voice Option Card */}
                      <button
                        type="button"
                        onClick={() => handleVoiceChange('')}
                        className={cn(
                          "w-full p-4.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between shadow-sm outline-none",
                          speechSettings.voiceName === ''
                            ? "border-indigo-600 bg-indigo-50/40 ring-4 ring-indigo-500/10"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        )}
                      >
                        <div className="space-y-0.5">
                          <span className="text-base font-black text-slate-800 block">
                            (Recomendada por Defecto)
                          </span>
                          <span className="text-xs text-slate-400 font-semibold block">
                            Voz optimizada del sistema operativo
                          </span>
                        </div>
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                          speechSettings.voiceName === ''
                            ? "border-indigo-600 bg-indigo-600"
                            : "border-slate-300"
                        )}>
                          {speechSettings.voiceName === '' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white animate-scaleIn" />
                          )}
                        </div>
                      </button>

                      {/* Map through all other Spanish voices */}
                      {availableVoices.map(voice => {
                        const isSelected = speechSettings.voiceName === voice.name;
                        return (
                          <button
                            key={voice.name}
                            type="button"
                            onClick={() => handleVoiceChange(voice.name)}
                            className={cn(
                              "w-full p-4.5 rounded-2xl border-2 text-left transition-all flex items-center justify-between shadow-sm outline-none",
                              isSelected
                                ? "border-indigo-600 bg-indigo-50/40 ring-4 ring-indigo-500/10"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                            )}
                          >
                            <div className="space-y-0.5">
                              <span className="text-base font-black text-slate-800 block">
                                {voice.name}
                              </span>
                              <span className="text-xs text-slate-400 font-semibold block">
                                {voice.lang} {voice.localService ? '• Voz Local' : '• Red'}
                              </span>
                            </div>
                            <div className={cn(
                              "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                              isSelected
                                ? "border-indigo-600 bg-indigo-600"
                                : "border-slate-300"
                            )}>
                              {isSelected && (
                                <div className="w-2.5 h-2.5 rounded-full bg-white animate-scaleIn" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    Las voces con prefijo "Siri" o "Google" son altamente recomendadas por su naturalidad.
                  </p>
                </div>

                {/* Rate Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Velocidad (Rate)
                    </label>
                    <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                      {speechSettings.rate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={speechSettings.rate}
                    onChange={e => handleRateChange(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>Lento (Bodega con eco)</span>
                    <span>Normal</span>
                    <span>Rápido</span>
                  </div>
                </div>

                {/* Pitch Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Tono (Pitch)
                    </label>
                    <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                      {speechSettings.pitch.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={speechSettings.pitch}
                    onChange={e => handlePitchChange(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>Grave (Más resonancia)</span>
                    <span>Normal</span>
                    <span>Agudo</span>
                  </div>
                </div>

                {/* Repeat Route Code Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-sm font-black text-slate-800 block">
                      Repetir código de ruta
                    </span>
                    <span className="text-xs text-slate-400 block">
                      Pronuncia dos veces la inicial de la ruta
                    </span>
                  </div>
                  <button
                    onClick={() => handleRepeatToggle(!speechSettings.repeatRoute)}
                    className={cn(
                      "w-12 h-6.5 rounded-full p-1 transition-colors duration-200 focus:outline-none shrink-0",
                      speechSettings.repeatRoute ? "bg-indigo-600" : "bg-slate-300"
                    )}
                  >
                    <div
                      className={cn(
                        "bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200",
                        speechSettings.repeatRoute ? "translate-x-5.5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>

                {/* Test Sound */}
                <button
                  onClick={testSpeech}
                  className="w-full h-14 flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-base rounded-2xl transition-colors shadow-lg"
                >
                  <Play className="w-5 h-5 fill-white text-white" />
                  <span>Probar Configuración de Voz</span>
                </button>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0 text-center text-xs text-slate-400">
                Ajustes guardados automáticamente para esta terminal.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
