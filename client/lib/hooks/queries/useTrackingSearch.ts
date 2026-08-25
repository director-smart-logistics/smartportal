import { useQuery } from '@tanstack/react-query';
import { firebaseApi } from '@/lib/firebase/callable';
import { searchPackages } from '@/lib/firebase/firestore-client';

/** Matches Colombia tracking numbers: 3 uppercase letters + 7 digits, e.g. ALA2500185 */
export function isColombiaTracking(t: string): boolean {
  return /^[A-Z]{3}\d{7}$/.test(t.trim().toUpperCase());
}

export interface TrackingSearchResult {
  id: string;
  trackingNumber: string;
  customerName: string | null;
  customerId: string | null;
  slCode: string | null;
  status: string;
  origin: string;
  destination: string;
  weight: number;
  description: string | null;
  createdAt: string;
  source: 'package' | 'manifest';
  isMatched: boolean;
  matchedPackageId: string | null;
  manifestId?: string;
  manifestFileName?: string;
  calculatedCost?: number | null;
  costCRC?: number | null;
  exchangeRate?: number | null;
  manifestNumber?: string | null;
  ruta?: string | null;
}

export interface CustomerSearchResult {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  slCode: string | null;
  address: string | null;
  city: string | null;
  createdAt: string;
}

/** MLCargo tracking event */
export interface MLCargoEvent {
  trackingNumber: string;
  ciudad: string;
  detalle: string;
  fecha: string;
}

/** Normalized result from MLCargo proxy */
export interface MLCargoResult {
  found: boolean;
  trackingNumber?: string;
  originalInput?: string;
  destination?: string;
  destinationFull?: string;
  shipper?: string;
  shipperDescription?: string;
  weight?: number;
  pieces?: number;
  customerCode?: string;
  customerName?: string;
  manifestId?: string;
  description?: string;
  invoice?: string;
  notes?: string;
  requiresPermit?: boolean;
  missingDestination?: boolean;
  eventCount?: number;
  latestEvent?: MLCargoEvent | null;
  events?: MLCargoEvent[];
  error?: string;
}

/** Normalized result from Colombia (Ticabox) provider */
export interface ColombiaResult {
  found: boolean;
  trackingNumber?: string;
  originalTracking?: string;
  providerId: 'colombia';
  providerName: string;
  statusCode?: string;
  statusMessage?: string;
  manifestId?: string | null;
  lastUpdate?: string;
  events?: Array<{ timestamp: string; description: string; statusCode: string }>;
  mensaje?: string;
  error?: string;
}

export interface TrackingSearchResponse {
  data: TrackingSearchResult[];
  customers: CustomerSearchResult[];
  mlcargo: MLCargoResult | null;
  colombia: ColombiaResult | null;
  meta: {
    total: number;
    packages: number;
    manifestRows: number;
    customers: number;
  };
}

export interface TrackingSearchFilters {
  query?: string;
  trackingNumber?: string;
  customerName?: string;
  slCode?: string;
}

export function useTrackingSearch(filters?: TrackingSearchFilters | string) {
  const searchFilters: TrackingSearchFilters = typeof filters === 'string'
    ? { query: filters }
    : (filters || {});

  const { query, trackingNumber, customerName, slCode } = searchFilters;
  const queryKey = ['tracking-search', { query, trackingNumber, customerName, slCode }];

  const searchQuery = trackingNumber || query || customerName || slCode || '';
  const isTrackingLookup = !!(trackingNumber || query);

  return useQuery<TrackingSearchResponse>({
    queryKey,
    queryFn: async (): Promise<TrackingSearchResponse> => {
      // Run Firestore packages query, MLCargo and Colombia lookups in PARALLEL.
      // Both providers are always queried for tracking lookups — the middleware
      // (mayorista / Ticabox) decides whether the number belongs to it.
      const [packagesResult, mlcargoResult, colombiaResult] = await Promise.allSettled([
        // Source 1: Direct Firestore search — bypasses Cloud Function overhead
        searchPackages(searchQuery, 50),
        // Source 2: MLCargo / mayorista proxy — resolves canonical ID and returns USA data
        isTrackingLookup
          ? firebaseApi.mlocker.trackPackage(searchQuery)
          : Promise.resolve(null),
        // Source 3: Colombia / Ticabox — queried for all tracking lookups
        isTrackingLookup
          ? firebaseApi.colombia.track(searchQuery)
          : Promise.resolve(null),
      ]);

      // ── Firestore packages ──────────────────────────────────────────────────
      let trackingResults: TrackingSearchResult[] = [];
      if (packagesResult.status === 'fulfilled' && Array.isArray(packagesResult.value)) {
        const packages = packagesResult.value as any[];
        trackingResults = packages.map((pkg: any) => ({
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          customerName: pkg.customerName || null,
          customerId: pkg.customerId || null,
          slCode: pkg.slCode || null,
          status: pkg.status,
          origin: pkg.origin || '',
          destination: pkg.destination || '',
          weight: pkg.weight || 0,
          description: pkg.description || null,
          createdAt: pkg.createdAt,
          source: 'package' as const,
          isMatched: true,
          matchedPackageId: pkg.id,
          calculatedCost: pkg.calculatedCost ?? null,
          costCRC: pkg.costCRC ?? null,
          exchangeRate: pkg.exchangeRate ?? null,
          manifestNumber: pkg.manifestNumber ?? null,
          ruta: pkg.ruta ?? null,
          history: Array.isArray(pkg.statusHistory)
            ? pkg.statusHistory.map((h: any) => ({
                status: h.status,
                note: h.note || h.notes || '',
                description: h.note || h.notes || '',
                date: h.changedAt || h.timestamp || '',
              }))
            : [],
        }));
      }

      // ── MLCargo result ──────────────────────────────────────────────────────
      let mlcargo: MLCargoResult | null = null;
      if (mlcargoResult.status === 'fulfilled' && mlcargoResult.value !== null) {
        const raw = (mlcargoResult.value as any)?.data ?? mlcargoResult.value;
        if (raw && typeof raw === 'object') {
          mlcargo = raw as MLCargoResult;
        }
      } else if (mlcargoResult.status === 'rejected') {
        mlcargo = { found: false, error: 'MLCargo no disponible' };
      }

      // ── Colombia result ─────────────────────────────────────────────────────
      let colombia: ColombiaResult | null = null;
      if (colombiaResult.status === 'fulfilled' && colombiaResult.value !== null) {
        const raw = (colombiaResult.value as any)?.data ?? colombiaResult.value;
        if (raw && typeof raw === 'object') {
          colombia = raw as ColombiaResult;
        }
      } else if (colombiaResult.status === 'rejected') {
        colombia = { found: false, providerId: 'colombia', providerName: 'Colombia (Ticabox)', error: 'Colombia tracking no disponible' };
      }

      return {
        data: trackingResults,
        customers: [],
        mlcargo,
        colombia,
        meta: {
          total: trackingResults.length,
          packages: trackingResults.length,
          manifestRows: 0,
          customers: 0,
        },
      };
    },
    enabled: !!(query || trackingNumber || customerName || slCode),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
