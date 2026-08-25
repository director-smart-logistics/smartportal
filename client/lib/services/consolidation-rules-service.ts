/**
 * Consolidation Rules Service
 *
 * Single source of truth for all consolidation business logic.
 * Loads active rules from Firestore `consolidationRules` collection,
 * exposes a compliance engine for Nova and invoice processing,
 * and provides an invoice-merge helper.
 *
 * Design goals:
 *  - In-memory TTL cache (5 min) — zero Firestore reads on repeated calls
 *  - Strongly-typed rule schema aligned with the official policy JSON
 *  - Pure, side-effect-free compliance engine (easy to unit-test)
 *  - Efficient: O(rules) per compliance check, O(invoices) for merge
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  doc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// ── Collection name ──────────────────────────────────────────────────────────
const COL = 'consolidationRules';

// ── Origin normalization for rule checks ─────────────────────────────────────

/**
 * US state abbreviations — used to recognize "CITY, STATE" origins as USA.
 * E.g., "MIAMI, FL" → USA, "LOS ANGELES, CA" → USA
 */
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC','PR',
]);

const US_CITIES = new Set([
  'MIAMI','NEW YORK','LOS ANGELES','HOUSTON','CHICAGO','ORLANDO',
  'TAMPA','JACKSONVILLE','ATLANTA','DALLAS','FORT LAUDERDALE','DORAL','MEDLEY',
]);

/**
 * Normalize raw origin strings to canonical country code for rule evaluation.
 * "MIAMI, FL" → "USA", "Bogotá, Colombia" → "CO", etc.
 */
function normalizeOriginForRule(origin: string): string {
  const t = origin.trim().toUpperCase();
  if (t === 'US' || t === 'USA' || t === 'UNITED STATES') return 'USA';
  if (t === 'CO') return 'CO';
  if (t === 'CN') return 'CN';
  if (t === 'MX') return 'MX';

  // "CITY, STATE_ABBREV" pattern
  const commaIdx = t.lastIndexOf(',');
  if (commaIdx > 0) {
    const state = t.slice(commaIdx + 1).trim();
    if (US_STATES.has(state)) return 'USA';
  }

  // Known US cities
  for (const city of US_CITIES) {
    if (t.includes(city)) return 'USA';
  }

  // Non-US patterns
  if (/\b(COLOMBIA|BOGOT[AÁ]|MEDELL[IÍ]N|CALI)\b/.test(t)) return 'CO';
  if (/\b(CHINA|GUANGZHOU|SHENZHEN|SHANGHAI)\b/.test(t)) return 'CN';
  if (/\b(M[EÉ]XICO|CDMX|GUADALAJARA|MONTERREY)\b/.test(t)) return 'MX';

  return t;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type RuleCategory =
  | 'limit'       // Hard limits: max packages, weight, dimensions, value
  | 'exclusion'   // Cargo types excluded from consolidation
  | 'timing'      // Grace periods, storage deadlines, abandonment
  | 'billing'     // Weight rounding, storage charges, non-compliance fees
  | 'operational' // Carrier, origin, compatibility requirements

export type RuleType = 'boolean' | 'number' | 'text' | 'list';

export interface ConsolidationRule {
  id: string;
  ruleKey: string;
  ruleName: string;
  description?: string;
  category: RuleCategory;
  ruleType: RuleType;
  valueBoolean?: boolean;
  valueNumber?: number;
  valueText?: string;
  valueList?: string[];
  unit?: string;        // 'packages' | 'kg' | 'cm' | 'USD' | 'días' | '%'
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Compliance types ─────────────────────────────────────────────────────────

export interface ComplianceViolation {
  ruleKey: string;
  ruleName: string;
  category: RuleCategory;
  detail: string;
  severity: 'error' | 'warning';
}

export interface ComplianceInput {
  slCode: string;
  packageCount: number;
  totalWeightKg?: number;
  totalDimensionsCm?: number;
  totalValueUSD?: number;
  originCountry?: string;  // 'US' | 'CO' | 'CN' | 'MX'
  mixedOrigins?: boolean;  // true when packages span multiple different countries
  hasElectronics?: boolean;
  hasSpecialPermit?: boolean;
  shippingType?: 'air' | 'sea';
  isUrgent?: boolean;
  categories?: string[];   // item categories in this consolidation
}

export interface ComplianceResult {
  slCode: string;
  compliant: boolean;
  violations: ComplianceViolation[];
  warnings: ComplianceViolation[];
  summary: string;
  rulesChecked: number;
  appliedRules: string[];
}

// ── In-memory real-time cache & subscriptions ─────────────────────────────────

let _rulesCache: ConsolidationRule[] | null = null;
let _rulesPromise: Promise<ConsolidationRule[]> | null = null;
let _unsub: (() => void) | null = null;
const _subscribers = new Set<(rules: ConsolidationRule[]) => void>();

export function subscribeToConsolidationRules(cb: (rules: ConsolidationRule[]) => void): () => void {
  _subscribers.add(cb);
  if (_rulesCache) cb(_rulesCache);
  loadActiveConsolidationRules();
  return () => _subscribers.delete(cb);
}

function invalidateCache(): void {
  if (_unsub) {
    _unsub();
    _unsub = null;
  }
  _rulesCache = null;
  _rulesPromise = null;
}

// ── Public: load active rules ─────────────────────────────────────────────────

/**
 * Returns all active consolidation rules, kept updated in real-time.
 * Sorted by category then ruleKey for deterministic iteration.
 */
export async function loadActiveConsolidationRules(): Promise<ConsolidationRule[]> {
  if (_rulesCache) {
    return _rulesCache;
  }
  if (_rulesPromise) {
    return _rulesPromise;
  }

  _rulesPromise = new Promise((resolve, reject) => {
    const q = query(
      collection(db, COL),
      where('isActive', '==', true),
      orderBy('category'),
      orderBy('ruleKey')
    );

    _unsub = onSnapshot(
      q,
      (snap) => {
        _rulesCache = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ruleKey: data.ruleKey ?? d.id,
            ruleName: data.ruleName ?? '',
            description: data.description,
            category: (data.category as RuleCategory) ?? 'operational',
            ruleType: (data.ruleType as RuleType) ?? 'boolean',
            valueBoolean: data.valueBoolean,
            valueNumber: data.valueNumber,
            valueText: data.valueText,
            valueList: data.valueList,
            unit: data.unit,
            isActive: true,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? '',
          } satisfies ConsolidationRule;
        });
        _subscribers.forEach(cb => cb(_rulesCache!));
        resolve(_rulesCache);
      },
      (err) => {
        console.error('Error listening to consolidation rules:', err);
        // Fallback to empty array to avoid breaking the app completely
        _rulesCache = [];
        _subscribers.forEach(cb => cb(_rulesCache!));
        resolve(_rulesCache);
      }
    );
  });

  return _rulesPromise;
}

// ── Public: force cache refresh ───────────────────────────────────────────────

export function invalidateConsolidationCache(): void {
  invalidateCache();
  // If there are components actively listening, restart the listener immediately
  // so their state updates reactively.
  if (_subscribers.size > 0) {
    loadActiveConsolidationRules();
  }
}

// ── Public: compliance engine ─────────────────────────────────────────────────

/**
 * Checks a consolidation request against all active rules.
 * Returns a structured compliance result with violations and warnings.
 *
 * @param input   — shape of the shipment/consolidation to evaluate
 * @param rules   — active rules (optional: pass if already loaded to avoid double-fetch)
 */
export async function checkConsolidationCompliance(
  input: ComplianceInput,
  rules?: ConsolidationRule[]
): Promise<ComplianceResult> {
  const activeRules = rules ?? await loadActiveConsolidationRules();

  const violations: ComplianceViolation[] = [];
  const warnings: ComplianceViolation[] = [];
  const appliedRules: string[] = [];

  const ruleMap = new Map<string, ConsolidationRule>(activeRules.map(r => [r.ruleKey, r]));

  // Helper
  const addViolation = (r: ConsolidationRule, detail: string, severity: 'error' | 'warning' = 'error') => {
    const v: ComplianceViolation = { ruleKey: r.ruleKey, ruleName: r.ruleName, category: r.category, detail, severity };
    if (severity === 'error') violations.push(v); else warnings.push(v);
  };

  for (const rule of activeRules) {
    appliedRules.push(rule.ruleKey);

    switch (rule.ruleKey) {

      // ── Limit rules ───────────────────────────────────────────────────────

      case 'max_packages':
        if (rule.valueNumber !== undefined && input.packageCount > rule.valueNumber) {
          addViolation(rule, `${input.packageCount} paquetes supera el máximo de ${rule.valueNumber} ${rule.unit ?? 'paquetes'}.`);
        }
        break;

      case 'min_packages':
        if (rule.valueNumber !== undefined && input.packageCount < rule.valueNumber) {
          addViolation(rule,
            `${input.packageCount} paquete(s) — se requieren al menos ${rule.valueNumber} para consolidar.`,
            'warning'
          );
        }
        break;

      case 'max_weight':
        if (rule.valueNumber !== undefined && input.totalWeightKg !== undefined && input.totalWeightKg > rule.valueNumber) {
          addViolation(rule, `Peso total ${input.totalWeightKg.toFixed(2)} kg supera el límite de ${rule.valueNumber} kg.`);
        }
        break;

      case 'max_dimensions':
        if (rule.valueNumber !== undefined && input.totalDimensionsCm !== undefined && input.totalDimensionsCm > rule.valueNumber) {
          addViolation(rule, `Dimensiones combinadas ${input.totalDimensionsCm} cm superan el límite de ${rule.valueNumber} cm.`);
        }
        break;

      case 'max_value':
        if (rule.valueNumber !== undefined && input.totalValueUSD !== undefined && input.totalValueUSD > rule.valueNumber) {
          addViolation(rule, `Valor declarado $${input.totalValueUSD.toFixed(2)} USD supera el máximo de $${rule.valueNumber} USD.`);
        }
        break;

      // ── Exclusion rules ───────────────────────────────────────────────────

      case 'excluded_categories': {
        const excluded = rule.valueList ?? [];
        if (input.categories) {
          const hits = input.categories.filter(c => excluded.includes(c.toLowerCase()));
          if (hits.length) {
            addViolation(rule, `Categorías excluidas detectadas: ${hits.join(', ')}. Solo se consolida carga regular de USA.`);
          }
        }
        break;
      }

      case 'no_special_permits':
        if (rule.valueBoolean === true && input.hasSpecialPermit) {
          addViolation(rule, 'Paquetes con permiso especial no pueden incluirse en consolidación.');
        }
        break;

      case 'no_electronics':
        if (rule.valueBoolean === true && input.hasElectronics) {
          addViolation(rule, 'Artículos electrónicos no se consolidan (política vigente).', 'warning');
        }
        break;

      case 'no_sea_freight':
        if (rule.valueBoolean === true && input.shippingType === 'sea') {
          addViolation(rule, 'Carga marítima no se puede consolidar. Solo aplica envío aéreo USA.');
        }
        break;

      case 'no_mixed_warehouse': {
        if (rule.valueBoolean === true && input.originCountry) {
          const normalized = normalizeOriginForRule(input.originCountry);
          if (normalized !== 'USA') {
            addViolation(rule, `Paquetes de origen ${input.originCountry} (${normalized}) no se consolidan. Solo USA.`);
          }
        }
        break;
      }

      // ── Operational rules ─────────────────────────────────────────────────

      case 'same_origin_required':
        if (rule.valueBoolean === true && input.mixedOrigins) {
          addViolation(rule, 'Los paquetes provienen de diferentes países de origen y no pueden consolidarse juntos.');
        }
        break;

      case 'no_urgent':
        if (rule.valueBoolean === true && input.isUrgent) {
          addViolation(rule, 'Paquetes marcados como urgentes no se consolidan — se envían individualmente.', 'warning');
        }
        break;

      default:
        break;
    }
  }

  const compliant = violations.length === 0;

  let summary: string;
  if (compliant && warnings.length === 0) {
    summary = `✅ Cliente ${input.slCode} cumple todas las reglas de consolidación (${activeRules.length} reglas verificadas).`;
  } else if (compliant && warnings.length > 0) {
    summary = `⚠️ Cliente ${input.slCode} cumple reglas obligatorias pero tiene ${warnings.length} advertencia(s).`;
  } else {
    summary = `❌ Cliente ${input.slCode} tiene ${violations.length} violación(es) de consolidación. No puede consolidarse hasta resolverlas.`;
  }

  return {
    slCode: input.slCode,
    compliant,
    violations,
    warnings,
    summary,
    rulesChecked: appliedRules.length,
    appliedRules,
  };
}

// ── Public: seed default rules ────────────────────────────────────────────────

/**
 * Seeds the Firestore `consolidationRules` collection with the canonical
 * rules derived from the official policy JSON. Idempotent: uses `setDoc`
 * with merge:false only for missing docs (checked via getDoc).
 *
 * Should only be called once from the Settings UI via the seed button.
 */
export async function seedDefaultConsolidationRules(): Promise<{ created: number; skipped: number }> {
  const defaults = getDefaultRules();
  const existingSnap = await getDocs(collection(db, COL));
  const existingKeys = new Set(existingSnap.docs.map(d => d.data().ruleKey as string));

  const batch = writeBatch(db);
  let created = 0;
  let skipped = 0;
  const now = serverTimestamp();

  for (const rule of defaults) {
    if (existingKeys.has(rule.ruleKey)) {
      skipped++;
      continue;
    }
    const ref = doc(collection(db, COL));
    batch.set(ref, { ...rule, createdAt: now, updatedAt: now });
    created++;
  }

  if (created > 0) {
    await batch.commit();
    invalidateCache();
  }

  return { created, skipped };
}

// ── Default rules (derived from official policy JSON) ────────────────────────
// Covers: chapters 1-7, generalRules, costOptimizationRules, operationalRules,
//         edgeCases, and commonRules from consolidation-rules.json

function getDefaultRules(): Omit<ConsolidationRule, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    // ── LIMITS (Art. 1.1 + generalRules) ─────────────────────────────────────
    {
      ruleKey: 'max_packages',
      ruleName: 'Máximo de paquetes por consolidación',
      description: 'Límite máximo de paquetes que pueden ser consolidados en un solo envío. (Art. 1.1a)',
      category: 'limit',
      ruleType: 'number',
      valueNumber: 10,
      unit: 'paquetes',
      isActive: true,
    },
    {
      ruleKey: 'min_packages',
      ruleName: 'Mínimo de paquetes para consolidar',
      description: 'Se requieren al menos 2 paquetes para activar el servicio de consolidación.',
      category: 'limit',
      ruleType: 'number',
      valueNumber: 2,
      unit: 'paquetes',
      isActive: true,
    },
    {
      ruleKey: 'max_weight',
      ruleName: 'Peso máximo total consolidado',
      description: 'Peso máximo combinado de todos los paquetes consolidados. (Art. 1.1b)',
      category: 'limit',
      ruleType: 'number',
      valueNumber: 50,
      unit: 'kg',
      isActive: true,
    },
    {
      ruleKey: 'max_dimensions',
      ruleName: 'Dimensiones máximas combinadas',
      description: 'Suma máxima de dimensiones (largo + ancho + alto) de todos los paquetes. (Art. 1.1c)',
      category: 'limit',
      ruleType: 'number',
      valueNumber: 300,
      unit: 'cm',
      isActive: true,
    },
    {
      ruleKey: 'max_value',
      ruleName: 'Valor máximo total declarado',
      description: 'Valor máximo combinado de todos los paquetes consolidados. (Art. 1.1d)',
      category: 'limit',
      ruleType: 'number',
      valueNumber: 5000,
      unit: 'USD',
      isActive: true,
    },

    // ── TIMING (Arts. 1.2, 1.3, 1.5, 2.1, 4.1) ───────────────────────────────
    {
      ruleKey: 'grace_period_consolidation',
      ruleName: 'Plazo de gracia para consolidación',
      description: 'Días sin cargos adicionales para consolidar paquetes tras la primera facturación. (Art. 1.2)',
      category: 'timing',
      ruleType: 'number',
      valueNumber: 14,
      unit: 'días',
      isActive: true,
    },
    {
      ruleKey: 'storage_paid_period',
      ruleName: 'Período de bodegaje pagado',
      description: 'Días de bodegaje con cargo diario luego del plazo de gracia, antes del abandono. (Art. 1.3, 1.5)',
      category: 'timing',
      ruleType: 'number',
      valueNumber: 15,
      unit: 'días',
      isActive: true,
    },
    {
      ruleKey: 'grace_period_no_consolidation',
      ruleName: 'Plazo de gracia sin consolidación',
      description: 'Días de gracia para paquetes individuales (sin consolidación) tras primera facturación. (Art. 2.1)',
      category: 'timing',
      ruleType: 'number',
      valueNumber: 7,
      unit: 'días',
      isActive: true,
    },
    {
      ruleKey: 'abandon_days',
      ruleName: 'Días para declaración de abandono',
      description: 'Días desde la facturación sin retiro para declarar abandono oficial y proceder al desecho. (Art. 4.1)',
      category: 'timing',
      ruleType: 'number',
      valueNumber: 30,
      unit: 'días',
      isActive: true,
    },
    {
      ruleKey: 'policy_change_notice_days',
      ruleName: 'Plazo mínimo para cambios de política',
      description: 'Días de aviso previo antes de aplicar cambios en las políticas de consolidación. (Art. 7.2b)',
      category: 'timing',
      ruleType: 'number',
      valueNumber: 3,
      unit: 'días',
      isActive: true,
    },

    // ── BILLING (Arts. 1.3, 1.4, 1.8 + edgeCases expired-storage) ────────────
    {
      ruleKey: 'storage_charge_daily',
      ruleName: 'Cargo diario de bodegaje',
      description: 'Cargo diario por paquete tras vencer el plazo de gracia de consolidación. (Art. 1.3a)',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 1.00,
      unit: 'USD/día',
      isActive: true,
    },
    {
      ruleKey: 'noncompliance_charge',
      ruleName: 'Cargo por incumplimiento de requisitos',
      description: 'Cobro fijo cuando paquetes no llegan o no cumplen requisitos dentro del plazo de gracia. (Art. 1.4)',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 8.00,
      unit: 'USD',
      isActive: true,
    },
    {
      ruleKey: 'weight_ceiling_billing',
      ruleName: 'Cobro por kilogramo completo (techo de kg)',
      description: 'En consolidaciones el peso se redondea SIEMPRE hacia arriba al kg inmediato superior. 0.40→1kg, 1.10→2kg. (Art. 1.8)',
      category: 'billing',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'expired_storage_extra_charge',
      ruleName: 'Cargo extra por almacenamiento expirado',
      description: 'Cargo adicional diario cuando se supera el período máximo de almacenamiento (día 30+).',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 2.00,
      unit: 'USD/día',
      isActive: true,
    },
    {
      ruleKey: 'weight_tier_discount_5_15',
      ruleName: 'Descuento por peso consolidado 5–15 kg',
      description: 'Descuento del 10% cuando el peso total consolidado está entre 5 y 15 kg.',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 10,
      unit: '%',
      isActive: false,
    },
    {
      ruleKey: 'weight_tier_discount_15_30',
      ruleName: 'Descuento por peso consolidado 15–30 kg',
      description: 'Descuento del 20% cuando el peso total consolidado está entre 15 y 30 kg.',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 20,
      unit: '%',
      isActive: false,
    },
    {
      ruleKey: 'weight_tier_discount_30_50',
      ruleName: 'Descuento por peso consolidado 30–50 kg',
      description: 'Descuento del 30% cuando el peso total consolidado está entre 30 y 50 kg.',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 30,
      unit: '%',
      isActive: false,
    },
    {
      ruleKey: 'volume_discount_large_packages',
      ruleName: 'Descuento por volumen — paquetes grandes',
      description: 'Descuento adicional del 5% cuando se consolidan 3 o más paquetes de más de 10 kg cada uno.',
      category: 'billing',
      ruleType: 'number',
      valueNumber: 5,
      unit: '%',
      isActive: false,
    },

    // ── EXCLUSIONS (Art. 1.7) ─────────────────────────────────────────────────
    {
      ruleKey: 'excluded_categories',
      ruleName: 'Categorías excluidas de consolidación',
      description: 'Tipos de carga que NO se pueden consolidar bajo ningún concepto. Solo carga regular USA. (Art. 1.7)',
      category: 'exclusion',
      ruleType: 'list',
      valueList: ['permisos_especiales', 'electronicos_alto_valor', 'maritimo', 'bodegas_mixtas', 'colombia', 'china', 'mexico'],
      isActive: true,
    },
    {
      ruleKey: 'no_special_permits',
      ruleName: 'Sin permisos especiales de aduana',
      description: 'Paquetes que requieren permiso especial aduanal no pueden consolidarse. (Art. 1.7a)',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_electronics',
      ruleName: 'Sin artículos electrónicos de alto valor',
      description: 'Artículos electrónicos de alto valor no se consolidan por riesgo de seguro y manejo especial requerido.',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: false,
    },
    {
      ruleKey: 'no_sea_freight',
      ruleName: 'Sin carga marítima',
      description: 'Solo se consolida carga aérea desde USA. Carga marítima se envía por separado. (Art. 1.7c)',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_mixed_warehouse',
      ruleName: 'Sin bodegas mixtas (Colombia, China, México)',
      description: 'Solo se consolida carga regular de USA. Paquetes de otras bodegas van separados. (Art. 1.7d–e)',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_prohibited_items',
      ruleName: 'Sin artículos prohibidos o restringidos',
      description: 'Paquetes con artículos prohibidos no se consolidan; se retienen para inspección o devolución.',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_customs_hold',
      ruleName: 'Sin retención aduanal pendiente',
      description: 'Paquetes retenidos en aduana o con documentación pendiente no se consolidan hasta resolverse.',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_incomplete_address',
      ruleName: 'Sin dirección incompleta',
      description: 'Paquetes con dirección de entrega incompleta o sin verificar no se incluyen en consolidaciones.',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_payment_pending',
      ruleName: 'Sin pagos pendientes',
      description: 'Paquetes con pagos pendientes o métodos de pago no configurados no se consolidan.',
      category: 'exclusion',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },

    // ── OPERATIONAL (operationalRules + edgeCases + Art. 1.6) ─────────────────
    {
      ruleKey: 'same_origin_required',
      ruleName: 'Mismo país de origen requerido',
      description: 'Todos los paquetes en una consolidación deben provenir del mismo país. Solo USA. (Art. 1.7e)',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'same_carrier_required',
      ruleName: 'Mismo transportista requerido',
      description: 'Solo se consolidan paquetes del mismo transportista. Simplifica tracking y reduce errores.',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_urgent',
      ruleName: 'Sin paquetes urgentes o con fecha límite',
      description: 'Paquetes urgentes se envían inmediatamente de forma individual, no se consolidan.',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'no_client_override',
      ruleName: 'Sin sobrescritura por cliente (consolidación obligatoria)',
      description: 'El cliente NO puede solicitar que un paquete no se consolide. No hay excepciones por preferencia. (Art. edgeCases)',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'compatible_items_required',
      ruleName: 'Artículos compatibles requeridos',
      description: 'No se consolidan artículos incompatibles: electrónicos con líquidos, alimentos con químicos, baterías de litio sin certificación.',
      category: 'operational',
      ruleType: 'list',
      valueList: [
        'electronicos_con_liquidos',
        'alimentos_con_quimicos',
        'ropa_con_fragiles_sin_proteccion',
        'baterias_litio_sin_certificacion',
      ],
      isActive: true,
    },
    {
      ruleKey: 'client_pre_alert_required',
      ruleName: 'Pre-alerta obligatoria del cliente',
      description: 'El cliente debe reportar o pre-alertar en su perfil los paquetes a consolidar. (Art. 1.6b)',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'auto_consolidation_enabled',
      ruleName: 'Consolidación automática habilitada',
      description: 'Los paquetes se consolidan automáticamente cuando cumplen todas las condiciones requeridas.',
      category: 'operational',
      ruleType: 'boolean',
      valueBoolean: true,
      isActive: true,
    },
    {
      ruleKey: 'delivery_max_attempts',
      ruleName: 'Máximo intentos de entrega',
      description: 'Posterior a la facturación se realizan hasta 3 intentos de entrega. Solo el primero es garantizado. (Art. 5.1)',
      category: 'operational',
      ruleType: 'number',
      valueNumber: 3,
      unit: 'intentos',
      isActive: true,
    },
  ];
}

// ── Invoice merge helper ──────────────────────────────────────────────────────

export interface InvoiceMergeRow {
  slCode: string;
  nombre?: string;
  peso?: number;
  pesoRedondeo?: number;
  tracking?: string;
  ruta?: string;
  consolidacion?: boolean;
  [key: string]: unknown;
}

export interface MergeResult {
  slCode: string;
  mergedRows: InvoiceMergeRow[];
  totalWeight: number;
  totalRoundedWeight: number;
  trackings: string[];
  packageCount: number;
}

/**
 * Groups invoice rows by slCode, merging multiple entries for the same
 * customer into a single merged record. Used before `createInvoicesFromRows`
 * when `consolidacion=true` to avoid one-invoice-per-row duplication.
 *
 * Rules applied:
 *  - Rows without slCode are left untouched (individual)
 *  - Rows with the same slCode are merged: weights summed, trackings collected
 *  - If `weightCeilingBilling` rule is active, pesoRedondeo = ceil(totalWeight)
 */
export async function mergeInvoiceRowsBySlCode(
  rows: InvoiceMergeRow[]
): Promise<Map<string, MergeResult>> {
  const rules = await loadActiveConsolidationRules();
  const ceilingRule = rules.find(r => r.ruleKey === 'weight_ceiling_billing');
  const applyCeiling = ceilingRule?.valueBoolean === true;

  const bySlCode = new Map<string, InvoiceMergeRow[]>();

  for (const row of rows) {
    if (!row.slCode) continue;
    const key = row.slCode.toUpperCase();
    const group = bySlCode.get(key) ?? [];
    group.push(row);
    bySlCode.set(key, group);
  }

  const result = new Map<string, MergeResult>();

  for (const [slCode, group] of bySlCode) {
    const totalWeight = group.reduce((s, r) => s + (r.peso ?? 0), 0);
    const totalRoundedWeight = applyCeiling ? Math.ceil(totalWeight) : totalWeight;
    const trackings = group.map(r => r.tracking).filter(Boolean) as string[];

    const firstRow = group[0];
    const mergedRow: InvoiceMergeRow = {
      ...firstRow,
      slCode,
      peso: totalWeight,
      pesoRedondeo: totalRoundedWeight,
      tracking: trackings.join(', '),
      consolidacion: true,
    };

    result.set(slCode, {
      slCode,
      mergedRows: [mergedRow],
      totalWeight,
      totalRoundedWeight,
      trackings,
      packageCount: group.length,
    });
  }

  return result;
}
