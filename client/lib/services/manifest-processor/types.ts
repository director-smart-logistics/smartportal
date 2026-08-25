import { type Country, type ShippingType, type ItemCategory } from '@/lib/pricing';
import { type ManifestMoveEvent } from '../audit-service';

export interface AjustePrecio {
  precioAjustado: number;
  precioCalculado: number;
  breakdownCalculo: string;
  justificacion: string;
  ajustadoPor: string;
  ajustadoPorEmail: string;
  fechaAjuste: string;
  tipo: 'superior' | 'inferior' | 'igual';
}

export interface ManifestRow {
  tracking: string;
  nombre: string;
  guia: string;
  manifiesto: string;
  peso: number;
  precio: number;
  slCode: string;
  nombreCliente: string;
  ruta: string;
  consolidacion: boolean;
  descripcion: string;
  permisos: boolean;
  /** Peso redondeado hacia arriba al kg entero (siempre calculado, 0 si no aplica) */
  pesoRedondeo: number;
  /** Diferencia de redondeo: pesoRedondeo − peso real (lo que se suma al peso) */
  diferenciaRedondeo: number;
  /** Para clientes con consolidación: peso redondeado al kg entero para facturación */
  pesoConsolidacion: number;
  /** Precio calculado SIN cargo de permiso ($3) — siempre presente */
  precioSinPermiso: number;
  /** Precio calculado CON cargo de permiso ($3) — siempre presente */
  precioConPermiso: number;
  /** Customer match score 0-1: >=0.90 confident, >=0.65 uncertain, 0 = no match */
  matchScore: number;
  /** Origin of the customer assignment: 'pre_alert' = tracking pre-registered by customer; 'name' = algorithmic/AI name match */
  matchSource?: 'pre_alert' | 'name';
  /** True when the row matched via customer pre-alert */
  hasPreAlert?: boolean;
  /** Pre-alerted customer SL code */
  preAlertSlCode?: string;
  /** Timestamp when the customer created the pre-alert in SP2 */
  preAlertCreatedAt?: string;
  /** Composite natural key tracking_slCode in SP2 */
  preAlertKey?: string;
  /** Underlying SP2 pre_alert document ID */
  preAlertId?: string;
  /** Complete pre-alert metadata object persisted for zero-cost instant hydration */
  preAlert?: any;
  status?: string;
  originalData: Record<string, unknown>;
  ajustePrecio?: AjustePrecio;
  originalIndex?: number;
}

export type ReviewReason = 'user_choice' | 'low_score' | 'por_definir';

export interface MultiMatchRow {
  rowIndex: number;
  tracking: string;
  nombre: string;
  needsReview?: ReviewReason;
  matchedSlCode?: string;
  matchedName?: string;
  matchScore?: number;
  candidates: Array<{
    slCode: string;
    fullName: string;
    ruta: string;
    consolidation: boolean;
    score: number;
  }>;
}

export interface ProcessingResult {
  rows: ManifestRow[];
  summary: {
    totalRows: number;
    processedRows: number;
    errors: number;
    totalPrice: number;
    customersMatched: number;
    namesCorrections: number;
    weightCorrections: number;
  };
  manifestNumber: string;
  manifestType: ManifestType;
  corrections: Array<{
    field: string;
    original: string;
    corrected: string;
    row: number;
    confidence?: number;
  }>;
  validation: {
    isValid: boolean;
    issues: Array<{ field: string; type: string; message: string }>;
    suggestions: string[];
  };
  multiMatchRows: MultiMatchRow[];
  requiresUserChoice: boolean;
  exchangeRate?: number;
  aiSuggestions?: {
    unmatchedNames: string[];
    suggestions: string[];
    patterns: string[];
  };
  isMegaMan?: boolean;
  ghostTrackings?: string[];
  loadedFromFirestore?: boolean;
}

export type ManifestType = 'usa_air' | 'usa_sea' | 'mexico_air' | 'mexico_sea' | 'china_air' | 'china_sea' | 'colombia_air' | 'colombia_sea';

export interface ManifestConfig {
  country: Country;
  shippingType: ShippingType;
  category: ItemCategory;
  requiresPermit: boolean;
}

export interface ProcessingStep {
  id: string;
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message?: string;
  timestamp: string;
}

export type StepCallback = (steps: ProcessingStep[], currentStep: string, message?: string) => void;

export interface IngestResult {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface ManifestProcessedStatus {
  totalPackages: number;
  processedAt: string;
  /** Portal ID of the MEGA manifest this manifest was merged into (fusion) */
  mergedInto?: string;
}

export interface MegaManRecord {
  id: string;
  totalPackages: number;
  totalPrice: number;
  exchangeRate: number;
  routes: string[];
  processedAt: string;
  fusedFrom?: string[];
  fusedManifests?: string[];
}

export interface ManifestRecord {
  id: string;
  manifestType: string;
  totalPackages: number;
  /** Number of packages moved from manifest_consolidation to this MEGA-MAN (not in packages collection) */
  consolidationCount?: number;
  /** Per-source manifest package counts for MEGA-MAN fusion display */
  fusedFromCounts?: Record<string, number>;
  totalPrice: number;
  totalWeight?: number;
  exchangeRate?: number;
  routes: string[];
  processedAt: string;
  isMegaMan?: boolean;
  isEncomienda?: boolean;
  isFirestoreFusion?: boolean;
  fusedFrom?: string[];
  moveHistory?: ManifestMoveEvent[];
  originalPackageCount?: number;
  /** Embedded packages array — only populated for MEGA-MAN docs to compute live sidebar count */
  packages?: Array<{ tracking: string; [key: string]: unknown }>;
  mergedInto?: string;
}

export interface EncomiendaManifestRow {
  tracking: string;
  manifestNumber: string;
  slCode: string;
  customerName: string;
  ruta: string;
  weight: number;
  price: number;
  description: string;
  permisos: boolean;
  consolidacion: boolean;
  savedAt: string;
  updatedAt: string;
  status?: string;
  statusLabel?: string;
  thirdPartyCost?: number;
  thirdPartyCostDescription?: string;
  thirdPartyCostSavedAt?: string;
  invoiceUpdated?: boolean;
  invoiceNumber?: string;
}

export interface ConsolidationManifestRow {
  tracking: string;
  manifestNumber: string;
  updatedManifest?: string;
  slCode: string;
  customerName: string;
  ruta: string;
  weight: number;
  price: number;
  description: string;
  permisos: boolean;
  consolidacion: boolean;
  origin: string;
  savedAt: string;
  updatedAt: string;
}

export interface TempCustomerRecord {
  slCode: string;
  name: string;
  nameFolded: string;
  originalSlCode: string;
  createdAt: string;
  source: string;
  isTemp: boolean;
  ruta?: string;
  email?: string;
  phone?: string;
  consolidationEnabled?: boolean;
  deliveryAddress?: string;
  courierService?: string;
}
