/**
 * Scanner Admin - HIGH PERFORMANCE Warehouse Package Scanning
 *
 * OPTIMIZED FOR WAREHOUSE OPERATORS:
 * 🎯 Large touch targets for gloved hands
 * 📱 Mobile-first responsive design
 * ⚡ Instant feedback with animations
 * 🎨 High contrast colors for warehouse lighting
 *
 * Features:
 * - Auto-execute search when scanner input is filled
 * - Associate unassociated packages with customers via SMARTID
 * - Update package status (En Ruta, Entregado, Held, Returned, Consolidated, Pickup)
 * - Route assignment
 * - "Ingresar Sin Usuario" flow
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Search,
  Package,
  AlertCircle,
  CheckCircle2,
  Truck,
  Loader2,
  X,
  AlertTriangle,
  RotateCcw,
  Clock,
  Wifi,
  WifiOff,
  Undo2,
  Pencil,
  Copy,
  Check,
  UserPlus,
  PackageCheck,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import useScannerInput from '@/hooks/useScannerInput';
import { cn } from '@/lib/utils';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { COLLECTIONS, firestoreApi } from '@/lib/firebase/firestore-client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerProfile {
  id?: string;
  uid?: string;
  slCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dni?: string;
  ruta?: string;
  consolidationEnabled?: boolean;
}

interface PackageDoc {
  id?: string;
  tracking?: string;
  trackingId?: string;
  carrier?: string;
  description?: string;
  status?: string;
  slCode?: string;
  userId?: string;
  pendingUserAssignment?: boolean;
  pendingCustomerName?: string;
  pendingRoute?: string;
  pendingZona?: string;
  pendingSlCode?: string;
  pendingDni?: string;
  requiresPermit?: boolean;
  weight?: number;
  pieces?: number;
  [key: string]: unknown;
}

interface SearchResult {
  found: boolean;
  source?: 'packages';
  package?: PackageDoc;
  customer?: CustomerProfile;
  isPendingUser?: boolean;
  pendingCustomerName?: string;
  pendingRoute?: string;
  pendingZona?: string;
  pendingSlCode?: string;
  pendingDni?: string;
  needsCreation?: boolean;
}

type StatusAction = 'route' | 'delivered' | 'held' | 'returned' | 'consolidated' | 'pickup';

// ─── Barcode Prefix Stripping (identical to WarehouseView) ───────────────────
function stripCarrierPrefix(tracking: string): {
  original: string;
  stripped: string;
  wasStripped: boolean;
  variants: string[];
} {
  const cleaned = tracking.trim().toUpperCase();
  const variants: string[] = [cleaned];
  let primaryStripped = cleaned;
  let wasStripped = false;

  const addVariant = (v: string) => {
    if (v && v.length >= 6 && !variants.includes(v)) variants.push(v);
  };

  addVariant(cleaned.toLowerCase());

  const allNumbers = cleaned.replace(/[^0-9]/g, '');
  if (allNumbers.length >= 6) addVariant(allNumbers);

  if (/^\d{10,15}$/.test(cleaned)) {
    addVariant('92' + cleaned);
    addVariant('94' + cleaned);
    addVariant('00' + cleaned);
    if (cleaned.length >= 12) {
      addVariant(cleaned.slice(2));
      addVariant(cleaned.slice(3));
    }
    addVariant(cleaned.slice(-12));
    addVariant(cleaned.slice(-10));
    addVariant(cleaned.slice(-8));
    addVariant(cleaned.slice(-6));
  }

  if (cleaned.includes('[)>') || cleaned.includes('12Z') || cleaned.includes('31Z')) {
    const match12Z = cleaned.match(/12Z(\d{12,15})/);
    if (match12Z) { addVariant(match12Z[1]); primaryStripped = match12Z[1]; wasStripped = true; }
    const match31Z = cleaned.match(/31Z(\d{20,40})/);
    if (match31Z) {
      const routing = match31Z[1];
      addVariant(routing);
      const uspsMatch = routing.match(/(9\d{15,21})/);
      if (uspsMatch) addVariant(uspsMatch[1]);
      if (routing.length > 20) {
        addVariant(routing.slice(-22));
        addVariant(routing.slice(-20));
        addVariant(routing.slice(-13));
      }
    }
    const match15Z = cleaned.match(/15Z(\d{8,12})/);
    if (match15Z) addVariant(match15Z[1]);
    const allNums = cleaned.match(/\d{12,22}/g);
    if (allNums) allNums.forEach(seq => addVariant(seq));
  }

  if (/^\d{30,40}$/.test(cleaned)) {
    const usps9 = cleaned.match(/(9\d{15,21})/);
    if (usps9) addVariant(usps9[1]);
    const usps00 = cleaned.match(/(00\d{11,20})/);
    if (usps00) addVariant(usps00[1]);
    for (let start = 0; start <= 22; start++) {
      const seg = cleaned.substring(start);
      if (seg.length >= 12 && seg.length <= 22) addVariant(seg);
    }
    addVariant(cleaned.slice(-22));
    addVariant(cleaned.slice(-20));
    addVariant(cleaned.slice(-18));
    addVariant(cleaned.slice(-15));
    addVariant(cleaned.slice(-13));
    addVariant(cleaned.slice(-12));
  }

  if (!/^\d/.test(cleaned) && !wasStripped) {
    return { original: cleaned, stripped: cleaned, wasStripped: false, variants };
  }

  const uspsTrackingPrefixes = ['9400', '9200', '9300', '9205', '9208', '9270', '9274', '9261', '9407', '9449', '9202', '9302'];
  if (cleaned.length > 22) {
    for (const prefix of uspsTrackingPrefixes) {
      const idx = cleaned.indexOf(prefix);
      if (idx > 0 && idx < 20) {
        const stripped = cleaned.substring(idx);
        if (stripped.length >= 20 && stripped.length <= 34) {
          addVariant(stripped);
          if (!wasStripped) { primaryStripped = stripped; wasStripped = true; }
          break;
        }
      }
    }
  }

  if (!wasStripped && cleaned.startsWith('420') && cleaned.length >= 30) {
    for (const prefixLen of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      if (cleaned.length > prefixLen + 18) {
        const stripped = cleaned.substring(prefixLen);
        if (/^9\d/.test(stripped)) {
          addVariant(stripped);
          if (!wasStripped) { primaryStripped = stripped; wasStripped = true; }
        }
      }
    }
  }

  if ((cleaned.startsWith('96') || cleaned.startsWith('98')) && cleaned.length > 25) {
    const stripped = cleaned.substring(6);
    if (/^\d/.test(stripped) && stripped.length >= 12) {
      addVariant(stripped);
      if (!wasStripped) { primaryStripped = stripped; wasStripped = true; }
    }
  }

  if (cleaned.length > 10) {
    for (let len = 6; len <= Math.min(30, cleaned.length - 1); len++) {
      addVariant(cleaned.slice(-len));
      addVariant(cleaned.slice(-len).toLowerCase());
    }
    for (let remove = 1; remove <= Math.min(20, cleaned.length - 6); remove++) {
      addVariant(cleaned.substring(remove));
    }
  }

  if (primaryStripped.length > 18 && /^9\d{3}/.test(primaryStripped)) {
    addVariant(primaryStripped.substring(4));
    addVariant(primaryStripped.substring(6));
    addVariant(primaryStripped.substring(8));
  }

  const upsMatch = cleaned.match(/1Z[A-Z0-9]{16,18}/i);
  if (upsMatch) { addVariant(upsMatch[0]); addVariant(upsMatch[0].toUpperCase()); }
  const tbaMatch = cleaned.match(/TBA\d{12,14}/i);
  if (tbaMatch) { addVariant(tbaMatch[0]); addVariant(tbaMatch[0].toUpperCase()); }

  return { original: cleaned, stripped: primaryStripped, wasStripped, variants };
}

// ─── Route helpers ────────────────────────────────────────────────────────────
const ROUTE_GRADIENT_MAP: Record<string, string> = {
  'San Jose Centro':   'bg-gradient-to-r from-purple-600 to-purple-800',
  'San Jose Escazu':   'bg-gradient-to-r from-fuchsia-400 to-fuchsia-600',
  'Escazu':            'bg-gradient-to-r from-fuchsia-400 to-fuchsia-600',
  'San Jose Coronado': 'bg-gradient-to-r from-pink-300 to-pink-500',
  'Cartago 1':         'bg-gradient-to-r from-cyan-400 to-cyan-600',
  'Cartago 2':         'bg-gradient-to-r from-blue-500 to-blue-700',
  'Alajuela':          'bg-gradient-to-r from-red-500 to-red-700',
  'Heredia':           'bg-gradient-to-r from-yellow-400 to-yellow-600',
  'Retira':            'bg-gradient-to-r from-stone-500 to-stone-800',
  'RETIRA':            'bg-gradient-to-r from-stone-500 to-stone-800',
  'Pickup':            'bg-gradient-to-r from-stone-500 to-stone-800',
};

const getRouteGradient = (routeName?: string): string =>
  (routeName && ROUTE_GRADIENT_MAP[routeName]) || 'bg-gradient-to-r from-emerald-600 to-teal-600';

const STATUS_LABELS: Record<string, string> = {
  received: 'En Bodega', customs: 'En Aduana', route: 'En Ruta',
  delivered: 'Entregado', held: 'Retenido', returned: 'Devuelto',
  pending: 'Pendiente', consolidated: 'Consolidado', 'pre-alerted': 'Pre-Alertado',
  transit: 'En Tránsito', unknown: 'Desconocido',
};

const getStatusLabel = (status: string) => STATUS_LABELS[status] || status;

const ROUTE_ABBREVIATIONS: Record<string, string> = {
  'Heredia': 'H', 'Alajuela': 'A', 'Cartago 1': 'C1', 'Cartago 2': 'C2',
  'San Jose Centro': 'SJ-C', 'San Jose Escazu': 'SJ-E', 'San Jose Coronado': 'SJ-CO',
  'Limon': 'L', 'Puntarenas': 'P', 'Guanacaste': 'G', 'Encomienda': 'ENC',
  'Devolver': 'DEV',
};

const getRouteAbbreviation = (routeName: string): string => {
  if (ROUTE_ABBREVIATIONS[routeName]) return ROUTE_ABBREVIATIONS[routeName];
  const lower = routeName.toLowerCase();
  if (lower.includes('san jose') || lower.includes('sj')) {
    if (lower.includes('escazu')) return 'SJ-E';
    if (lower.includes('centro')) return 'SJ-C';
    if (lower.includes('coronado')) return 'SJ-CO';
    return 'SJ';
  }
  if (lower.includes('cartago')) return routeName.includes('1') ? 'C1' : routeName.includes('2') ? 'C2' : 'CA';
  return routeName.substring(0, 2).toUpperCase();
};

// ─── Firestore helpers ────────────────────────────────────────────────────────
async function findCustomerBySlCode(slCode: string): Promise<CustomerProfile | null> {
  const full = slCode.startsWith('SL') ? slCode : `SL${slCode}`;
  const q = query(collection(db, COLLECTIONS.CUSTOMERS), where('slCode', '==', full));
  const snap = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as CustomerProfile;
  // also try users collection
  const q2 = query(collection(db, COLLECTIONS.USERS), where('slCode', '==', full));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return { id: snap2.docs[0].id, uid: snap2.docs[0].id, ...snap2.docs[0].data() } as CustomerProfile;
  return null;
}

async function findCustomerByDni(dni: string): Promise<CustomerProfile | null> {
  const q = query(collection(db, COLLECTIONS.CUSTOMERS), where('dni', '==', dni));
  const snap = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as CustomerProfile;
  const q2 = query(collection(db, COLLECTIONS.USERS), where('dni', '==', dni));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return { id: snap2.docs[0].id, uid: snap2.docs[0].id, ...snap2.docs[0].data() } as CustomerProfile;
  return null;
}

async function searchUsersByName(name: string): Promise<CustomerProfile[]> {
  const lower = name.toLowerCase();
  const q = query(collection(db, COLLECTIONS.USERS), where('firstName', '>=', lower), where('firstName', '<=', lower + '\uf8ff'));
  const snap = await getDocs(q);
  const results: CustomerProfile[] = snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() } as CustomerProfile));
  if (results.length === 0) {
    const q2 = query(collection(db, COLLECTIONS.CUSTOMERS), where('firstName', '>=', lower), where('firstName', '<=', lower + '\uf8ff'));
    const snap2 = await getDocs(q2);
    return snap2.docs.map(d => ({ id: d.id, ...d.data() } as CustomerProfile));
  }
  return results;
}

async function searchByTrackingAdmin(tracking: string): Promise<SearchResult> {
  const upper = tracking.trim().toUpperCase();
  const pkgRef = collection(db, COLLECTIONS.PACKAGES);

  // Try both tracking and trackingNumber fields
  for (const field of ['tracking', 'trackingNumber']) {
    const q = query(pkgRef, where(field, '==', upper));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const pkgData = snap.docs[0].data();
      const pkgDoc = { id: snap.docs[0].id, ...pkgData } as PackageDoc;
      
      // Build customer profile from package data (already contains all customer info)
      let customer: CustomerProfile | undefined;
      if (pkgData.customerId || pkgData.userId || pkgData.slCode) {
        customer = {
          id: pkgData.customerId || pkgData.userId,
          uid: pkgData.userId,
          slCode: pkgData.slCode,
          firstName: pkgData.customerName?.split(' ')[0] || '',
          lastName: pkgData.customerName?.split(' ').slice(1).join(' ') || '',
          email: pkgData.customerEmail,
          phone: pkgData.customerPhone,
          dni: pkgData.customerDni,
          ruta: pkgData.ruta,
          consolidationEnabled: pkgData.consolidacion || false,
        };
      }
      
      return {
        found: true,
        source: 'packages',
        package: pkgDoc,
        customer,
        isPendingUser: !!pkgDoc.pendingUserAssignment,
        pendingCustomerName: pkgDoc.pendingCustomerName,
        pendingRoute: pkgDoc.pendingRoute,
        pendingZona: pkgDoc.pendingZona,
        pendingSlCode: pkgDoc.pendingSlCode,
        pendingDni: pkgDoc.pendingDni,
      };
    }
  }
  return { found: false, needsCreation: true };
}

// ─── Confirmation Modal ───────────────────────────────────────────────────────
interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  children?: React.ReactNode;
}

function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, isLoading, children }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true">
      <motion.div
        initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
      >
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 mb-4">{message}</p>
        {children}
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1 h-12 text-base" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            className={cn('flex-1 h-12 text-base font-bold', confirmClass || 'bg-emerald-600 hover:bg-emerald-700 text-white')}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ScannerAdminInner: React.FC = () => {
  const [trackingInput, setTrackingInput] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [originalBarcode, setOriginalBarcode] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [liveCustomer, setLiveCustomer] = useState<CustomerProfile | null>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSearchTime, setLastSearchTime] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [manualMode, setManualMode] = useState(false);

  // Smart ID / name search
  const [smartIdInput, setSmartIdInput] = useState('');
  const [customerSearchResult, setCustomerSearchResult] = useState<CustomerProfile | null>(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [nameSearchResults, setNameSearchResults] = useState<CustomerProfile[]>([]);
  const [showNameSearchResults, setShowNameSearchResults] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState('');

  // Actions
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [isAssociating, setIsAssociating] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState<StatusAction | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Ingresar sin usuario
  const [showIngresoSinUsuarioModal, setShowIngresoSinUsuarioModal] = useState(false);
  const [ingresoSinUsuarioCustomerName, setIngresoSinUsuarioCustomerName] = useState('');
  const [ingresoSinUsuarioRoute, setIngresoSinUsuarioRoute] = useState('');
  const [ingresoSinUsuarioTracking, setIngresoSinUsuarioTracking] = useState('');
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);

  const smartIdInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const smartIdSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeystrokeRef = useRef<number>(0);
  const keystrokeCountRef = useRef<number>(0);
  // Stable ref so useScannerInput can call handleSearch before it is defined
  const handleSearchRef = useRef<(tracking: string) => void>(() => {});

  // Inatek / USB HID keyboard-wedge scanner support
  const { inputRef, isScanning: isScannerActive } = useScannerInput({
    onScan: (value) => handleSearchRef.current(value),
    minLength: 6,
    maxKeystrokeDelay: 30,
    debounceMs: 150,
    autoClear: true,
    autoClearDelay: 3000,
  });

  // Online status
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Load routes
  useEffect(() => {
    fetch('/data/routes.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setRoutes(data.routes || []))
      .catch(() => {});
  }, []);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Auto-clear messages
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Real-time customer subscription
  useEffect(() => {
    const customerId = liveCustomer?.uid || liveCustomer?.id || searchResult?.customer?.uid || searchResult?.customer?.id;
    if (!customerId) { setLiveCustomer(null); return; }
    const userRef = doc(db, COLLECTIONS.USERS, customerId);
    const unsub = onSnapshot(userRef, snap => {
      if (snap.exists()) setLiveCustomer({ id: snap.id, uid: snap.id, ...snap.data() } as CustomerProfile);
    });
    return () => unsub();
  }, [searchResult?.customer?.uid, searchResult?.customer?.id]);

  // Auto-focus smartId when editing
  useEffect(() => {
    if (isEditingUser) setTimeout(() => smartIdInputRef.current?.focus(), 100);
  }, [isEditingUser]);

  // Detect scanner vs manual typing
  const detectInputMode = useCallback((inputLength: number) => {
    const now = Date.now();
    const delta = now - lastKeystrokeRef.current;
    lastKeystrokeRef.current = now;
    if (delta > 2000) keystrokeCountRef.current = 0;
    keystrokeCountRef.current++;
    if (delta > 100 && keystrokeCountRef.current >= 3 && inputLength < 20) {
      if (!manualMode) setManualMode(true);
    } else if (delta < 50 && inputLength > 10) {
      if (manualMode) setManualMode(false);
      keystrokeCountRef.current = 0;
    }
  }, [manualMode]);

  const handleSearch = useCallback(async (tracking: string, isRetry = false) => {
    if (!tracking || tracking.length < 6) return;
    if (!isOnline) { setError('Sin conexión a internet.'); return; }

    setIsSearching(true);
    setError(null);
    setIsEditingUser(false);
    setIsEditingRoute(false);
    setCustomerSearchResult(null);
    setNameSearchResults([]);
    setShowNameSearchResults(false);
    if (!isRetry) setRetryCount(0);

    const start = performance.now();
    const { stripped, variants } = stripCarrierPrefix(tracking);
    const allVariants = [...new Set([
      ...variants,
      stripped.toLowerCase(),
      tracking.toLowerCase(),
      tracking.slice(-20), tracking.slice(-18), tracking.slice(-15),
      tracking.slice(-12), tracking.slice(-10),
    ])].filter(v => v && v.length >= 6);

    try {
      let result: SearchResult = { found: false };
      for (const variant of allVariants) {
        if (!variant || variant.length < 6) continue;
        result = await searchByTrackingAdmin(variant);
        if (result.found) break;
      }

      const ms = Math.round(performance.now() - start);
      setLastSearchTime(ms);
      setSearchResult(result);
      setLiveCustomer(result.customer || null);

      if (!result.found) {
        setError('⚠️ Paquete no encontrado en el sistema.');
        setTimeout(() => {
          setTrackingInput(''); setSearchResult(null); setError(null);
          inputRef.current?.focus();
        }, 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (retryCount < 2 && (msg.includes('network') || msg.includes('timeout'))) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => handleSearch(tracking, true), 1000);
        return;
      }
      setError(`❌ Error: ${msg}`);
      setTimeout(() => {
        setTrackingInput(''); setSearchResult(null); setError(null);
        inputRef.current?.focus();
      }, 3000);
    } finally {
      setIsSearching(false);
    }
  }, [isOnline, retryCount]);

  // Keep the stable ref up to date so useScannerInput can call it
  handleSearchRef.current = handleSearch;

  const handleTrackingInputChange = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase();
    setError(null);
    detectInputMode(normalized.length);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (normalized.length >= 25 || normalized.includes('[)>') || normalized.includes('12Z')) {
      const { stripped, wasStripped } = stripCarrierPrefix(normalized);
      if (wasStripped && stripped !== normalized) {
        setOriginalBarcode(normalized);
        setTrackingInput(stripped);
        if (stripped.length >= 8) {
          searchTimeoutRef.current = setTimeout(() => handleSearch(normalized), 250);
        }
        return;
      }
    }

    setOriginalBarcode(null);
    setTrackingInput(normalized);

    if (normalized.length >= 8 && !manualMode) {
      searchTimeoutRef.current = setTimeout(() => handleSearch(normalized), 250);
    } else if (normalized.length < 6) {
      setSearchResult(null);
    }
  }, [detectInputMode, manualMode, handleSearch]);

  // SmartID / name auto-search
  const handleSmartIdChange = (value: string) => {
    setSmartIdInput(value);
    setCustomerSearchResult(null);
    setNameSearchResults([]);
    setShowNameSearchResults(false);
    if (smartIdSearchTimeoutRef.current) clearTimeout(smartIdSearchTimeoutRef.current);
    const isNumeric = /^\d+$/.test(value.trim());
    if (value.trim().length >= 2) {
      smartIdSearchTimeoutRef.current = setTimeout(async () => {
        if (isNumeric) await autoSearchCustomer(value.trim());
        else await autoSearchCustomerByName(value.trim());
      }, 1500);
    }
  };

  const autoSearchCustomer = async (inputValue: string) => {
    setIsSearchingCustomer(true);
    setError(null);
    try {
      let customer: CustomerProfile | null = null;
      if (inputValue.length <= 6) customer = await findCustomerBySlCode(inputValue);
      if (!customer) customer = await findCustomerByDni(inputValue);
      if (!customer && inputValue.length <= 6) customer = await findCustomerBySlCode(`SL${inputValue}`);
      if (customer) {
        setCustomerSearchResult(customer);
        if (searchResult) setSearchResult({ ...searchResult, customer });
      } else {
        setError(`No se encontró cliente con: ${inputValue}`);
      }
    } catch (err) {
      setError('Error buscando cliente');
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const autoSearchCustomerByName = async (searchTerm: string) => {
    setIsSearchingCustomer(true);
    setError(null);
    try {
      const results = await searchUsersByName(searchTerm);
      if (results.length > 0) {
        setNameSearchResults(results);
        setShowNameSearchResults(true);
        if (results.length === 1) handleSelectUserFromList(results[0]);
      } else {
        setError(`No se encontraron clientes con el nombre: ${searchTerm}`);
      }
    } catch (err) {
      setError('Error buscando cliente');
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const handleSelectUserFromList = (user: CustomerProfile) => {
    setCustomerSearchResult(user);
    setShowNameSearchResults(false);
    setSmartIdInput(`${user.firstName} ${user.lastName}`);
    if (searchResult) setSearchResult({ ...searchResult, customer: user });
  };

  // Confirm association
  const handleConfirmAssociation = async () => {
    const customer = customerSearchResult || searchResult?.customer;
    if (!customer || !searchResult?.package?.id) return;
    setIsAssociating(true);
    try {
      const slCode = customer.slCode || `SL${smartIdInput}`;
      const userId = customer.id || customer.uid || '';
      const routeToSave = selectedRoute || customer.ruta || '';

      if (selectedRoute && selectedRoute !== customer.ruta && userId) {
        await updateDoc(doc(db, COLLECTIONS.USERS, userId), { ruta: selectedRoute, updatedAt: serverTimestamp() });
      }

      await firestoreApi.packages.update(searchResult.package.id, {
        slCode,
        userId,
        pendingUserAssignment: false,
        pendingCustomerName: null,
        ...(routeToSave ? { pendingRoute: routeToSave, pendingZona: routeToSave } : {}),
        updatedAt: new Date().toISOString(),
      });

      setSuccessMessage(`✅ Paquete asociado a ${slCode} - ${customer.firstName} ${customer.lastName}`);
      setSmartIdInput('');
      await handleSearch(trackingInput.trim());
    } catch (err) {
      setError('Error al asociar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsAssociating(false);
      setShowAssociateModal(false);
    }
  };

  // Update status
  const handleUpdateStatus = async (newStatus: StatusAction) => {
    if (!searchResult?.package?.id) return;
    setIsUpdatingStatus(true);
    try {
      const statusLabel = {
        route: 'route', delivered: 'delivered', held: 'held',
        returned: 'returned', consolidated: 'consolidated', pickup: 'pickup',
      }[newStatus];

      await firestoreApi.packages.update(searchResult.package.id, {
        status: statusLabel,
        updatedAt: new Date().toISOString(),
      });

      setSuccessMessage(`✅ Estado actualizado: ${getStatusLabel(newStatus)}`);
      await handleSearch(trackingInput.trim());
    } catch (err) {
      setError('Error al actualizar estado');
    } finally {
      setIsUpdatingStatus(false);
      setShowStatusModal(null);
    }
  };

  // Reassign to different user
  const handleReassignUser = async () => {
    if (!customerSearchResult || !searchResult?.package?.id) return;
    setIsAssociating(true);
    setError(null);
    try {
      const newSlCode = customerSearchResult.slCode || '';
      const newUserId = customerSearchResult.uid || customerSearchResult.id || '';
      await firestoreApi.packages.update(searchResult.package.id, {
        slCode: newSlCode,
        userId: newUserId,
        updatedAt: new Date().toISOString(),
      });
      setSuccessMessage(`✅ Paquete reasignado a ${newSlCode} - ${customerSearchResult.firstName} ${customerSearchResult.lastName}`);
      setIsEditingUser(false);
      setSmartIdInput('');
      setCustomerSearchResult(null);
      await handleSearch(trackingInput.trim());
    } catch (err) {
      setError('Error al reasignar usuario');
    } finally {
      setIsAssociating(false);
    }
  };

  // Reassign without user
  const handleReassignWithoutUser = async () => {
    if (!smartIdInput || !searchResult?.package?.id) return;
    setIsAssociating(true);
    setError(null);
    try {
      const currentRoute = liveCustomer?.ruta || searchResult?.customer?.ruta || selectedRoute || '';
      await firestoreApi.packages.update(searchResult.package.id, {
        slCode: '',
        userId: '',
        pendingUserAssignment: true,
        pendingCustomerName: smartIdInput.trim(),
        pendingRoute: currentRoute,
        pendingZona: currentRoute,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      });
      setSuccessMessage(`✅ Paquete asignado a "${smartIdInput}" (sin usuario registrado)`);
      setIsEditingUser(false);
      setSmartIdInput('');
      setCustomerSearchResult(null);
      await handleSearch(trackingInput.trim());
    } catch (err) {
      setError('Error al reasignar');
    } finally {
      setIsAssociating(false);
    }
  };

  // Create package without user
  const handleCreatePackageWithoutUser = async () => {
    const trackingToUse = ingresoSinUsuarioTracking || trackingInput.trim();
    if (!trackingToUse) { setError('No hay tracking para crear el paquete'); return; }
    setIsCreatingPackage(true);
    setError(null);
    try {
      const tracking = trackingToUse.toUpperCase();
      const customerName = ingresoSinUsuarioCustomerName.trim().toUpperCase();
      const route = ingresoSinUsuarioRoute.trim();
      const existingResult = await searchByTrackingAdmin(tracking);
      if (existingResult.found && existingResult.package?.id) {
        await firestoreApi.packages.update(existingResult.package.id, {
          slCode: '',
          userId: '',
          pendingUserAssignment: true,
          ...(customerName ? { pendingCustomerName: customerName } : {}),
          ...(route ? { pendingZona: route, pendingRoute: route } : {}),
          updatedAt: new Date().toISOString(),
        });
        setSuccessMessage(`✅ Paquete ${tracking} actualizado. Cliente: ${customerName || 'Sin definir'}. Ruta: ${route || 'Sin asignar'}`);
      } else {
        await firestoreApi.packages.create({
          tracking,
          trackingId: tracking,
          originalTracking: originalBarcode || tracking,
          status: 'received',
          pendingUserAssignment: true,
          ...(customerName ? { pendingCustomerName: customerName } : {}),
          ...(route ? { pendingZona: route, pendingRoute: route } : {}),
          carrier: 'UNKNOWN',
          description: '',
          weight: 0,
          pieces: 1,
          receivedAt: new Date().toISOString(),
          paymentStatus: 'pending',
        });
        setSuccessMessage(`✅ Paquete ${tracking} ingresado. Cliente: ${customerName || 'Sin definir'}. Ruta: ${route || 'Sin asignar'}`);
      }
      setShowIngresoSinUsuarioModal(false);
      setIngresoSinUsuarioCustomerName('');
      setIngresoSinUsuarioRoute('');
      await handleSearch(tracking);
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    } finally {
      setIsCreatingPackage(false);
    }
  };

  const handleClear = () => {
    setTrackingInput(''); setSearchResult(null); setLiveCustomer(null);
    setError(null); setSuccessMessage(null); setSmartIdInput('');
    setCustomerSearchResult(null); setIsEditingUser(false); setIsEditingRoute(false);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (smartIdSearchTimeoutRef.current) clearTimeout(smartIdSearchTimeoutRef.current);
    inputRef.current?.focus();
  };

  const handleOpenIngresoSinUsuario = () => {
    setError(null);
    setIngresoSinUsuarioCustomerName(searchResult?.pendingCustomerName || '');
    setIngresoSinUsuarioRoute(searchResult?.pendingRoute || searchResult?.pendingZona || '');
    setIngresoSinUsuarioTracking(searchResult?.package?.tracking || trackingInput.trim());
    setShowIngresoSinUsuarioModal(true);
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* ignore */ }
  };

  // Derived values
  const customer = liveCustomer || searchResult?.customer;
  const customerRuta = customer?.ruta || null;
  const effectiveRouteName = customerRuta ||
    (searchResult?.isPendingUser ? (searchResult.pendingRoute || searchResult.pendingZona) : null) || null;
  const routeAbbreviation = effectiveRouteName ? getRouteAbbreviation(effectiveRouteName) : null;

  const getHeaderStyle = (): { bg: string } => {
    if (!searchResult?.found) return { bg: 'bg-slate-900' };
    const status = searchResult.package?.status || 'pending';
    if (status === 'delivered') return { bg: 'bg-gradient-to-r from-emerald-600 to-emerald-700' };
    if (status === 'held') return { bg: 'bg-gradient-to-r from-red-600 to-red-700' };
    if (searchResult.needsCreation) return { bg: 'bg-gradient-to-r from-amber-500 to-orange-600' };
    if (customerRuta) return { bg: getRouteGradient(customerRuta) };
    if (searchResult.isPendingUser && effectiveRouteName) return { bg: getRouteGradient(effectiveRouteName) };
    return { bg: 'bg-gradient-to-r from-emerald-600 to-teal-600' };
  };
  const headerStyle = getHeaderStyle();

  const trackingDisplay = searchResult?.package?.tracking || searchResult?.package?.trackingId || trackingInput;

  return (
    <div className="min-h-screen bg-white p-3 md:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Dynamic Header */}
        <div className={cn('rounded-2xl p-4 md:p-6 mb-4 shadow-xl transition-all duration-300', headerStyle.bg)}>
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 shrink-0">
              {searchResult?.found
                ? <Package className="w-7 h-7 text-white" />
                : <ScanLine className="w-7 h-7 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              {searchResult?.found ? (
                <>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl md:text-2xl font-bold text-white break-all">{trackingDisplay}</h1>
                    <button onClick={() => copyToClipboard(trackingDisplay, 'tracking')} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0" aria-label="Copiar tracking">
                      {copiedField === 'tracking' ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4 text-white/70" />}
                    </button>
                  </div>
                  <p className="text-white text-xs md:text-sm">
                    <span className="font-normal">{searchResult.package?.carrier || ''}</span>
                    {searchResult.package?.carrier && searchResult.package?.description && ' • '}
                    <span className="font-bold">{searchResult.package?.description || ''}</span>
                  </p>

                  {/* Customer display (not editing) */}
                  {customer && !isEditingUser && (
                    <div className="mt-3 pt-3 border-t border-white/20">
                      <button
                        onClick={() => { setIsEditingUser(true); setSmartIdInput(''); setCustomerSearchResult(null); setError(null); }}
                        className="flex items-start gap-2 text-left w-full hover:opacity-80 transition-opacity"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-1.5 text-white text-xl md:text-2xl font-semibold flex-1">
                          <span className="font-extrabold text-yellow-300 whitespace-nowrap">{customer.slCode}</span>
                          <span className="text-white/60">•</span>
                          <span className="font-bold text-left">{customer.firstName} {customer.lastName}</span>
                        </div>
                        <Pencil className="w-5 h-5 text-white/60 shrink-0 mt-1" />
                      </button>
                      {customer.dni && <p className="text-white/70 text-sm font-medium">Cédula: {customer.dni}</p>}
                      {customer.email && <p className="text-white/60 text-xs font-medium">{customer.email}</p>}

                      {/* Route (inline edit) */}
                      {!isEditingRoute ? (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <button onClick={() => { setIsEditingRoute(true); setSelectedRoute(customer.ruta || ''); }} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <p className="text-2xl md:text-3xl font-black text-white">{customer.ruta || 'Sin ruta'}</p>
                            <Pencil className="w-5 h-5 text-white/60" />
                          </button>
                          {(customer as any).consolidationEnabled && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-white/70 font-black text-white/90 text-sm">⬡ Consolida</span>
                          )}
                          {searchResult.package?.requiresPermit && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-white/70 font-black text-white/90 text-sm">⚠ Permiso</span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1">
                          <select
                            value={selectedRoute}
                            onChange={async e => {
                              const newRoute = e.target.value;
                              setSelectedRoute(newRoute);
                              setIsEditingRoute(false);
                              if (searchResult?.customer) {
                                setSearchResult(prev => prev ? { ...prev, customer: prev.customer ? { ...prev.customer, ruta: newRoute } : prev.customer } : prev);
                              }
                              if (newRoute && (customer.uid || customer.id)) {
                                try {
                                  const userId = customer.uid || customer.id || '';
                                  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { ruta: newRoute, updatedAt: serverTimestamp() });
                                  setSuccessMessage('✅ Ruta asignada correctamente');
                                } catch { setError('Error al asignar ruta'); }
                              }
                            }}
                            onBlur={() => setIsEditingRoute(false)}
                            autoFocus
                            className="w-full md:w-auto h-12 px-4 text-lg font-bold rounded-lg border-2 border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 bg-white/20 text-white"
                          >
                            <option value="" className="text-slate-900">Sin ruta</option>
                            {routes.map((r: any) => (
                              <option key={r.id || r.name} value={r.name} className="text-slate-900">{r.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User edit mode */}
                  {isEditingUser && customer && (
                    <div className="mt-3 pt-3 border-t border-white/20">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-white">
                          <UserPlus className="w-5 h-5" />
                          <span className="font-bold text-sm">Reasignar Usuario</span>
                        </div>
                        <button onClick={() => { setIsEditingUser(false); setSmartIdInput(''); setCustomerSearchResult(null); setShowNameSearchResults(false); }} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-white/60 text-xs mb-2">
                        Usuario actual: <span className="text-yellow-300 font-bold">{customer.slCode}</span> - {customer.firstName} {customer.lastName}
                      </p>
                      <div className="relative">
                        <input
                          ref={smartIdInputRef}
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          value={smartIdInput}
                          onChange={e => handleSmartIdChange(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && customerSearchResult && handleReassignUser()}
                          placeholder="Buscar nuevo usuario por SL Code, DNI o Nombre..."
                          className={cn(
                            'w-full h-12 text-base font-bold pl-4 pr-24 border-2 focus:outline-none rounded-xl bg-white touch-manipulation',
                            customerSearchResult ? 'border-emerald-400 focus:border-emerald-500' : 'border-white/30 focus:border-white/50'
                          )}
                          autoFocus
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {smartIdInput && (
                            <button onClick={() => { setSmartIdInput(''); setCustomerSearchResult(null); setShowNameSearchResults(false); setNameSearchResults([]); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          {customerSearchResult && (
                            <button onClick={handleReassignUser} className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white">
                              <Check className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {showNameSearchResults && nameSearchResults.length > 0 && (
                        <div className="mt-2 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                          {nameSearchResults.map(u => (
                            <button key={u.uid || u.id} onClick={() => handleSelectUserFromList(u)} className="w-full p-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-left">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-slate-900 text-sm">{u.firstName} {u.lastName}</div>
                                  <div className="text-xs text-slate-500">{u.email || u.phone || ''}</div>
                                </div>
                                <span className="px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold text-slate-700">{u.slCode}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {smartIdInput.length >= 2 && !customerSearchResult && !isSearchingCustomer && (
                        <div className="mt-2 p-3 bg-amber-500/20 border border-amber-400/50 rounded-xl">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-amber-200 text-xs font-bold uppercase">Usuario no encontrado</p>
                              <p className="text-white font-bold text-sm">Asignar como: "{smartIdInput}"</p>
                              <p className="text-white/60 text-xs">Sin usuario registrado en el sistema</p>
                            </div>
                            <button onClick={handleReassignWithoutUser} disabled={isAssociating} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-lg disabled:opacity-50">
                              {isAssociating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Asignar'}
                            </button>
                          </div>
                        </div>
                      )}
                      {customerSearchResult && (
                        <div className="mt-2 p-3 bg-emerald-500/20 border border-emerald-400/50 rounded-xl">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-emerald-200 text-xs font-bold uppercase">Nuevo Usuario</p>
                              <p className="text-white font-bold">{customerSearchResult.slCode} - {customerSearchResult.firstName} {customerSearchResult.lastName}</p>
                              <p className="text-white/60 text-xs">{customerSearchResult.dni || ''} • {customerSearchResult.email || ''}</p>
                            </div>
                            <button onClick={handleReassignUser} disabled={isAssociating} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-lg disabled:opacity-50">
                              {isAssociating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reasignar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending user info */}
                  {searchResult.isPendingUser && !customer && (
                    <div className="mt-2 p-3 rounded-lg bg-amber-500/20 border border-amber-400/50">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-300" />
                        <span className="text-amber-200 font-bold text-sm">Sin Cliente Asociado</span>
                      </div>
                      {searchResult.pendingCustomerName && (
                        <p className="text-white text-lg md:text-xl font-semibold">
                          <span className="text-amber-200 text-sm mr-2">Manifiesto:</span>
                          <span className="font-bold">{searchResult.pendingCustomerName}</span>
                        </p>
                      )}
                      {(searchResult.pendingRoute || searchResult.pendingZona) && (
                        <p className="text-white text-lg md:text-xl font-semibold mt-1">
                          <span className="text-amber-200 text-sm mr-2">Ruta:</span>
                          <span className="font-bold">{searchResult.pendingRoute || searchResult.pendingZona}</span>
                        </p>
                      )}
                      {(searchResult.pendingSlCode || searchResult.pendingDni) && (
                        <div className="flex gap-3 mt-2 text-sm text-white/70">
                          {searchResult.pendingSlCode && <span>SL: <strong className="text-white">{searchResult.pendingSlCode}</strong></span>}
                          {searchResult.pendingDni && <span>DNI: <strong className="text-white">{searchResult.pendingDni}</strong></span>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h1 className="text-xl md:text-2xl font-bold text-white">Scanner de Bodega</h1>
                  <p className="text-slate-400 text-xs md:text-sm">Escanea • Asocia • Actualiza</p>
                </>
              )}
            </div>

            {/* Large abbreviation (desktop) */}
            {searchResult?.found && routeAbbreviation && (
              <div className="hidden md:flex flex-col items-center justify-center shrink-0 ml-4 min-w-[80px] lg:min-w-[120px] gap-2">
                <span className={cn(
                  'font-black text-white/80 leading-none whitespace-nowrap',
                  routeAbbreviation.length <= 2 ? 'text-7xl lg:text-8xl xl:text-9xl'
                    : routeAbbreviation.length <= 4 ? 'text-5xl lg:text-6xl xl:text-7xl'
                    : 'text-4xl lg:text-5xl xl:text-6xl'
                )}>
                  {routeAbbreviation}
                </span>
                {(customer as any)?.consolidationEnabled && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-white/70 font-black text-white/90 text-xl lg:text-2xl whitespace-nowrap">⬡ Consolida</span>
                )}
                {searchResult.package?.requiresPermit && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-white/70 font-black text-white/90 text-xl lg:text-2xl whitespace-nowrap">⚠ Permiso</span>
                )}
              </div>
            )}

            {/* Status badges + connection (no result) */}
            {!searchResult?.found && (
              <div className="flex items-center gap-2 shrink-0">
                <div className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium', isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                  {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isOnline ? 'Conectado' : 'Sin conexión'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Status badge row */}
          {searchResult?.found && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
              <span className="px-2.5 py-1 bg-white rounded text-[10px] lg:text-xs font-bold text-slate-700 uppercase">En Sistema</span>
              <span className="px-3 py-1 bg-white rounded-lg text-xs font-bold text-slate-700 uppercase">
                ✓ {getStatusLabel(searchResult.package?.status || 'pending')}
              </span>
            </div>
          )}
        </div>

        {/* Scanner Input */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tracking ID</span>
            </div>
            {lastSearchTime !== null && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" />
                <span>{lastSearchTime}ms</span>
              </div>
            )}
          </div>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              value={trackingInput}
              onChange={e => handleTrackingInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch(trackingInput.trim())}
              placeholder="Escanea o escribe tracking..."
              data-scanner-input="true"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              aria-label="Tracking input"
              className={cn(
                'w-full h-16 text-xl font-mono font-bold pl-4 pr-16 border-2 rounded-xl bg-slate-50 transition-all',
                'focus:outline-none focus:bg-white',
                isSearching || isScannerActive ? 'border-primary/50 bg-primary/5'
                  : searchResult?.found ? 'border-emerald-500/50 bg-emerald-50/30'
                  : 'border-slate-300 hover:border-slate-400'
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearching ? (
                <button onClick={handleClear} className="flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                  <span className="text-xs font-bold text-red-700">Cancelar</span>
                </button>
              ) : manualMode && trackingInput.trim() ? (
                <>
                  <button onClick={() => handleSearch(trackingInput.trim())} className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground" aria-label="Buscar">
                    <Search className="w-6 h-6" />
                  </button>
                  <button onClick={handleClear} className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300" aria-label="Limpiar">
                    <X className="w-5 h-5 text-slate-600" />
                  </button>
                </>
              ) : trackingInput && (
                <button onClick={handleClear} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Limpiar">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400">{manualMode ? 'Modo manual • Presiona buscar o Enter' : 'Búsqueda automática'}</p>
            {manualMode && (
              <button onClick={() => { setManualMode(false); keystrokeCountRef.current = 0; }} className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg">
                <Undo2 className="w-3.5 h-3.5" />
                <span>Modo Escáner</span>
              </button>
            )}
          </div>
        </div>

        {/* Success */}
        <AnimatePresence>
          {successMessage && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 mb-4 flex items-start gap-3" role="status">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-emerald-700 flex-1">{successMessage}</p>
              <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded"><X className="w-4 h-4 text-emerald-500" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3" role="alert">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-700 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded"><X className="w-4 h-4 text-red-500" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action panel (when package found) */}
        <AnimatePresence mode="wait">
          {searchResult?.found && (
            <motion.div key="actions" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-3">

              {/* Association panel (when no customer) */}
              {!customer && (
                <div className="bg-white rounded-xl shadow-md border-2 border-amber-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span className="font-bold text-amber-900 text-sm">Sin cliente asociado</span>
                  </div>
                  <div className="relative mb-3">
                    <input
                      ref={smartIdInputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={smartIdInput}
                      onChange={e => handleSmartIdChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && customerSearchResult && setShowAssociateModal(true)}
                      placeholder="SL Code, Cédula o Nombre del cliente..."
                      className={cn(
                        'w-full h-14 text-base font-bold pl-4 pr-16 border-2 rounded-xl bg-slate-50 focus:outline-none',
                        customerSearchResult ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-300 focus:border-slate-500'
                      )}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {isSearchingCustomer && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
                      {customerSearchResult && (
                        <button onClick={() => setShowAssociateModal(true)} className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white">
                          <Check className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {showNameSearchResults && nameSearchResults.length > 0 && (
                    <div className="mb-3 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {nameSearchResults.map(u => (
                        <button key={u.uid || u.id} onClick={() => handleSelectUserFromList(u)} className="w-full p-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-left">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">{u.firstName} {u.lastName}</div>
                              <div className="text-xs text-slate-500">{u.email || u.phone || ''}</div>
                            </div>
                            <span className="px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold text-slate-700">{u.slCode}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {customerSearchResult && (
                    <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <p className="text-xs font-bold text-emerald-700 uppercase mb-1">Cliente encontrado</p>
                      <p className="font-bold text-slate-900">{customerSearchResult.slCode} — {customerSearchResult.firstName} {customerSearchResult.lastName}</p>
                      <p className="text-xs text-slate-500">{customerSearchResult.dni || ''} • {customerSearchResult.email || ''}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="h-12 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => customerSearchResult && setShowAssociateModal(true)}
                      disabled={!customerSearchResult || isAssociating}
                    >
                      {isAssociating ? <Loader2 className="w-5 h-5 animate-spin" /> : '✓ Asociar'}
                    </Button>
                    <Button variant="outline" className="h-12 font-bold border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleOpenIngresoSinUsuario}>
                      Sin Usuario
                    </Button>
                  </div>
                </div>
              )}

              {/* Status actions */}
              <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Actualizar Estado</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { action: 'route' as StatusAction, label: 'En Ruta', icon: <Truck className="w-4 h-4" />, cls: 'bg-purple-600 hover:bg-purple-700 text-white' },
                    { action: 'delivered' as StatusAction, label: 'Entregado', icon: <PackageCheck className="w-4 h-4" />, cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
                    { action: 'held' as StatusAction, label: 'Retenido', icon: <AlertCircle className="w-4 h-4" />, cls: 'bg-red-600 hover:bg-red-700 text-white' },
                    { action: 'returned' as StatusAction, label: 'Devuelto', icon: <RotateCcw className="w-4 h-4" />, cls: 'bg-slate-600 hover:bg-slate-700 text-white' },
                    { action: 'consolidated' as StatusAction, label: 'Consolidado', icon: <Package className="w-4 h-4" />, cls: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
                    { action: 'pickup' as StatusAction, label: 'Pickup', icon: <CheckCircle2 className="w-4 h-4" />, cls: 'bg-teal-600 hover:bg-teal-700 text-white' },
                  ].map(({ action, label, icon, cls }) => (
                    <button
                      key={action}
                      onClick={() => setShowStatusModal(action)}
                      disabled={isUpdatingStatus || searchResult.package?.status === action}
                      className={cn(
                        'flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm transition-all disabled:opacity-40',
                        searchResult.package?.status === action ? 'ring-2 ring-offset-1 ring-current opacity-60' : '',
                        cls
                      )}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear button */}
              <button onClick={handleClear} className="w-full h-12 flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors">
                <X className="w-4 h-4" />
                Nueva búsqueda
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Associate Modal */}
      <AnimatePresence>
        {showAssociateModal && (
          <ConfirmModal
            title="Confirmar Asociación"
            message={`¿Asociar paquete ${trackingDisplay} a ${customerSearchResult?.slCode} — ${customerSearchResult?.firstName} ${customerSearchResult?.lastName}?`}
            confirmLabel="Asociar"
            onConfirm={handleConfirmAssociation}
            onCancel={() => setShowAssociateModal(false)}
            isLoading={isAssociating}
          />
        )}
      </AnimatePresence>

      {/* Status Modal */}
      <AnimatePresence>
        {showStatusModal && (
          <ConfirmModal
            title="Actualizar Estado"
            message={`¿Cambiar estado del paquete a "${getStatusLabel(showStatusModal)}"?`}
            confirmLabel="Confirmar"
            onConfirm={() => handleUpdateStatus(showStatusModal)}
            onCancel={() => setShowStatusModal(null)}
            isLoading={isUpdatingStatus}
          />
        )}
      </AnimatePresence>

      {/* Ingresar Sin Usuario Modal */}
      <AnimatePresence>
        {showIngresoSinUsuarioModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
              className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-slate-900">Ingresar Sin Usuario</h3>
                <button onClick={() => setShowIngresoSinUsuarioModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">Ingresa el paquete sin asignarlo a un usuario registrado.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tracking</label>
                  <input
                    type="text"
                    value={ingresoSinUsuarioTracking}
                    onChange={e => setIngresoSinUsuarioTracking(e.target.value.toUpperCase())}
                    className="w-full h-12 px-4 border-2 border-slate-300 rounded-xl font-mono font-bold text-sm focus:outline-none focus:border-slate-500"
                    placeholder="Número de tracking"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del cliente</label>
                  <input
                    type="text"
                    value={ingresoSinUsuarioCustomerName}
                    onChange={e => setIngresoSinUsuarioCustomerName(e.target.value.toUpperCase())}
                    className="w-full h-12 px-4 border-2 border-slate-300 rounded-xl font-bold text-sm focus:outline-none focus:border-slate-500"
                    placeholder="Nombre del destinatario"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ruta</label>
                  <select
                    value={ingresoSinUsuarioRoute}
                    onChange={e => setIngresoSinUsuarioRoute(e.target.value)}
                    className="w-full h-12 px-4 border-2 border-slate-300 rounded-xl font-bold text-sm focus:outline-none focus:border-slate-500"
                  >
                    <option value="">Sin ruta</option>
                    {routes.map((r: any) => (
                      <option key={r.id || r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setShowIngresoSinUsuarioModal(false)} disabled={isCreatingPackage}>Cancelar</Button>
                <Button className="flex-1 h-12 font-bold bg-amber-600 hover:bg-amber-700 text-white" onClick={handleCreatePackageWithoutUser} disabled={isCreatingPackage || !ingresoSinUsuarioTracking}>
                  {isCreatingPackage ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ingresar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function ScannerAdmin() {
  return (
    <DashboardLayout>
      <ScannerAdminInner />
    </DashboardLayout>
  );
}
