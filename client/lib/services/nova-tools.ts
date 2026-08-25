/**
 * Nova Agent Tools
 *
 * Firestore query tools that give Nova access to all live business data:
 * - Packages (by status, route, customer, manifest, date range)
 * - Customers (lookup, stats, top performers)
 * - Invoices (revenue, pending, totals)
 * - Routes (active, delivery stats)
 * - Pricing (current rates by country/type)
 * - Manifest history (trends, volume, revenue)
 *
 * Each tool returns a typed, serialisable result so Gemini can reason over it.
 */

import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  Timestamp,
  updateDoc,
  serverTimestamp,
  getCountFromServer,
  setDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db, dbSP2 } from '@/lib/firebase/config';
import { canonicalizeTracking } from '@/lib/utils/tracking-canonicalizer';
import {
  resolvePreAlert,
  batchResolvePreAlerts,
  watchPreAlerts,
  type PreAlertInfo,
} from './pre-alert-resolver';
import { calculatePrice } from '@/lib/pricing';
import type { Country, ShippingType, ItemCategory } from '@/lib/pricing';
import { searchCustomersLocal } from './customer-matcher';
import { getRecentManifests, getManifestsThisMonth } from './ai-manifest-service';
import {
  trackPackage as mlTrackPackage,
  listManifests as mlListManifests,
  getManifestDetail as mlGetManifestDetail,
  downloadManifestExcel as mlDownloadManifestExcel,
  triggerExcelDownload,
} from './mlocker-service';
import { getManifestProcessedStatus, type ManifestProcessedStatus } from './manifest-processor';
import {
  loadActiveConsolidationRules,
  checkConsolidationCompliance,
  type ComplianceInput,
} from './consolidation-rules-service';
import { firebaseApi } from '@/lib/firebase/callable';

// ── In-memory TTL cache for expensive read-heavy queries ──────────────────────
// Avoids redundant full-collection scans when the same question is asked twice
// within a session. Cache entries expire after CACHE_TTL_MS.

const CACHE_TTL_MS = 60_000; // 60 s
interface CacheEntry { data: unknown; expiresAt: number }
const _cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return undefined; }
  return entry.data as T;
}

function cacheSet(key: string, data: unknown, ttlMs?: number): void {
  // Cap cache size at 50 entries to bound memory
  if (_cache.size >= 50) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
  _cache.set(key, { data, expiresAt: Date.now() + (ttlMs ?? CACHE_TTL_MS) });
}

export function invalidateNovaCache(): void {
  _cache.clear();
}

// ── Tool definitions (Gemini function-calling format) ─────────────────────────

export interface NovaTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const NOVA_TOOLS: NovaTool[] = [
  // ── Packages ────────────────────────────────────────────────────────────────
  {
    name: 'query_packages',
    description:
      'Query packages from the database. Supports filtering by status, customer slCode, delivery route (ruta), manifest number, and date range. Returns package count and summary. EXACT status → label mapping: received="Recibido en Miami", transit="En Tránsito a Costa Rica", pre-alerted="Pre-Alertado", consolidated="Consolidado", customs="Procesando en Costa Rica", held="Retenido en Aduana", processed="Facturado", route="En Ruta de Entrega", pickup="Retira en SmartLogistics", delivered="Entregado", returned="Devuelto". Semantic: "pendientes de entrega"→route or pickup; "en aduana"→customs; "en ruta"→route; "en miami"→received; "en tránsito"→transit.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by exact package status value. Use the exact system status: received, transit, pre-alerted, consolidated, customs, held, processed, route, pickup, delivered, returned.',
          enum: ['received', 'transit', 'pre-alerted', 'consolidated', 'customs', 'held', 'processed', 'route', 'pickup', 'delivered', 'returned'],
        },
        route: { type: 'string', description: 'Filter by delivery route name (ruta), e.g. "Encomiendas", "San José", "Cartago"' },
        slCode: { type: 'string', description: 'Filter by customer SL code (e.g. SL1234)' },
        manifestNumber: { type: 'string', description: 'Filter by manifest number' },
        dateFrom: { type: 'string', description: 'ISO date string — start of date range (createdAt >= dateFrom)' },
        dateTo: { type: 'string', description: 'ISO date string — end of date range (createdAt <= dateTo)' },
        maxResults: { type: 'number', description: 'Max results to return (default 50)' },
      },
      required: [],
    },
  },
  // ── Packages stats ───────────────────────────────────────────────────────────
  {
    name: 'get_packages_stats',
    description:
      'Get aggregate statistics for ALL packages grouped by status. Returns byStatus object with keys: received, transit, pre-alerted, consolidated, customs, held, processed, route, pickup, delivered, returned — and their real Firestore counts. Use for: "cuántos paquetes hay en total", "resumen operativo", "cuántos pendientes de entrega" (sum route+pickup), "cuántos en aduana" (customs), "cuántos por llegar" (received+transit+consolidated). ALWAYS use this before making assumptions about package counts.',
    parameters: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', description: 'Optional ISO date — limit stats to packages created after this date' },
      },
      required: [],
    },
  },
  // ── Customer lookup ──────────────────────────────────────────────────────────
  {
    name: 'lookup_customer_detail',
    description:
      'Look up a customer by name, SL code, email, or phone number. Returns full profile including route, consolidation setting, contact info. Use when asked about a specific customer.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Customer name, SL code (e.g. SL1234), email, or phone number' },
      },
      required: ['query'],
    },
  },
  // ── Top customers ────────────────────────────────────────────────────────────
  {
    name: 'get_top_customers',
    description:
      'Get the top customers ranked by BILLING REVENUE (from invoices) or package volume. IMPORTANT: when the user asks about "facturación", "ingresos", "revenue", "clientes que más pagan" — use sortBy="revenue" (default). When they ask about "volumen", "paquetes", "envíos" — use sortBy="volume". Revenue data comes from the invoices collection (totalBilled = sum of invoice totals). Package count comes from the packages collection. Both are joined per customer.',
    parameters: {
      type: 'object',
      properties: {
        dateFrom: { type: 'string', description: 'ISO date string for start of period' },
        dateTo: { type: 'string', description: 'ISO date string for end of period' },
        topN: { type: 'number', description: 'Number of top customers to return (default 10)' },
        sortBy: {
          type: 'string',
          description: 'Ranking dimension: "revenue" = sort by total invoiced amount (facturación) — USE THIS when asked about top clients by billing; "volume" = sort by package count',
          enum: ['revenue', 'volume'],
        },
      },
      required: [],
    },
  },
  // ── Customer analytics report ─────────────────────────────────────────────────
  {
    name: 'get_customer_report',
    description:
      'Generate a comprehensive analytics report for a specific customer: package history (total, by status: delivered/in-transit/pending/returned), invoice summary (totalBilled, totalPaid, totalPending, collectionRate, count by status), and a breakdown suitable for a client report. Use when asked to "analiza el cliente X", "dame un reporte de SLxxxx", "cuánto ha facturado [nombre]", "historial de paquetes de [cliente]", or any per-customer deep analysis.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'Customer SL code (e.g. SL1234). Required.' },
        dateFrom: { type: 'string', description: 'ISO date string — start of analysis period (optional, defaults to all time)' },
        dateTo: { type: 'string', description: 'ISO date string — end of analysis period (optional)' },
      },
      required: ['slCode'],
    },
  },
  // ── Account statement (estado de cuenta) ─────────────────────────────────────
  {
    name: 'get_account_statement',
    description:
      'Generate a full account statement (estado de cuenta) for a specific customer. Returns the complete invoice list with invoice numbers, dates, amounts, statuses and line items (trackings), plus the full package list by status, and a financial summary (totalBilled, totalPaid, totalPending, totalOverdue, balance). This is the equivalent of opening the Estado de Cuenta page for that customer. Use when the user asks: "genera el estado de cuenta de SLxxxx", "dame la cuenta de [nombre]", "estado de cuenta de [cliente]", "facturas de SLxxxx", "cuánto debe [cliente]", or any request that implies a full billing+package statement.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'Customer SL code (e.g. SL1234). Required.' },
        dateFrom: { type: 'string', description: 'ISO date — start of period to include (optional, defaults to all time)' },
        dateTo: { type: 'string', description: 'ISO date — end of period to include (optional)' },
        maxInvoices: { type: 'number', description: 'Max invoices to return (default 50, max 200)' },
      },
      required: ['slCode'],
    },
  },
  // ── Operational analytics dashboard ─────────────────────────────────────────
  {
    name: 'get_operational_analytics',
    description:
      'Generate a full operational analytics overview for the company: revenue KPIs (paid/pending/overdue), package volume (by status, by route), invoice status breakdown, top customers by revenue and volume, month-over-month trends, delivery rate, active customers. This is the equivalent of the Analytics dashboard page. Use when asked: "dame un resumen analítico", "analíticas de la empresa", "dashboard operativo", "cómo vamos este mes", "rendimiento operacional", "analítica de datos", or any request for a business-wide performance overview.',
    parameters: {
      type: 'object',
      properties: {
        timeRange: {
          type: 'string',
          description: 'Time window for analysis. "7d"=últimos 7 días, "1m"=último mes, "3m"=3 meses, "6m"=6 meses (default), "1y"=último año',
          enum: ['7d', '1m', '3m', '6m', '1y'],
        },
      },
      required: [],
    },
  },
  // ── Invoices ─────────────────────────────────────────────────────────────────
  {
    name: 'query_invoices',
    description:
      'Query invoices from the database. Supports filtering by status, customer slCode, and date range. Returns invoice list with totals. Use for financial questions. Status "sent" = enviada (factura enviada al cliente).',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Invoice status filter. "sent"=enviada, "paid"=pagada, "pending"=pendiente, "overdue"=vencida, "draft"=borrador, "cancelled"=cancelada',
          enum: ['draft', 'sent', 'paid', 'pending', 'overdue', 'cancelled'],
        },
        slCode: { type: 'string', description: 'Filter by customer SL code' },
        dateFrom: { type: 'string', description: 'ISO date — start of billing period' },
        dateTo: { type: 'string', description: 'ISO date — end of billing period' },
        maxResults: { type: 'number', description: 'Max invoices to return (default 50)' },
      },
      required: [],
    },
  },
  // ── Revenue summary ──────────────────────────────────────────────────────────
  {
    name: 'get_revenue_summary',
    description:
      'Get a financial revenue summary: total billed, total collected, total pending, total overdue, count of invoices. Optionally filtered by month or date range. Use for financial reporting questions.',
    parameters: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Month in YYYY-MM format (e.g. "2026-03") for monthly summary' },
        dateFrom: { type: 'string', description: 'ISO date string — start of period' },
        dateTo: { type: 'string', description: 'ISO date string — end of period' },
      },
      required: [],
    },
  },
  // ── Routes ───────────────────────────────────────────────────────────────────
  {
    name: 'query_routes',
    description:
      'Query delivery routes: list active routes, route names, assigned drivers, delivery zones. Use when asked about delivery routes or logistics coverage.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by route status', enum: ['active', 'inactive', 'all'] },
      },
      required: [],
    },
  },
  // ── Pricing ──────────────────────────────────────────────────────────────────
  {
    name: 'get_current_pricing',
    description:
      'Get current shipping pricing rates for a country and shipping type. Returns rate tiers and rules. Use when asked about prices, rates, or cost calculations.',
    parameters: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Country code',
          enum: ['usa', 'mexico', 'china', 'colombia'],
        },
        shippingType: {
          type: 'string',
          description: 'Shipping method',
          enum: ['air', 'sea'],
        },
      },
      required: ['country'],
    },
  },
  // ── Calculate price ──────────────────────────────────────────────────────────
  {
    name: 'calculate_package_price',
    description:
      'Calculate the exact shipping price for a package. ALWAYS use this tool for price calculations — never guess. Returns price, breakdown, and currency.',
    parameters: {
      type: 'object',
      properties: {
        weightKg: { type: 'number', description: 'Package weight in kilograms' },
        country: { type: 'string', description: 'Origin country', enum: ['usa', 'mexico', 'china', 'colombia'] },
        shippingType: { type: 'string', description: 'Air or sea', enum: ['air', 'sea'] },
        category: { type: 'string', description: 'Item category', enum: ['regular', 'restricted', 'electronics'] },
        requiresPermit: { type: 'string', description: 'Whether item requires a permit (adds $3)', enum: ['true', 'false'] },
      },
      required: ['weightKg'],
    },
  },
  // ── Manifest history ─────────────────────────────────────────────────────────
  {
    name: 'get_manifest_history',
    description:
      'Get historical manifest processing data for the current user: recent manifests, volume trends, revenue by manifest, top customers per manifest. Use for trend analysis and operational history questions.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          description: 'Period to query',
          enum: ['last_5', 'this_month', 'last_10'],
        },
      },
      required: [],
    },
  },
  // ── ML Cargo / MLocker — package tracking ──────────────────────────────────
  {
    name: 'track_package',
    description:
      'Track a package — auto-detects carrier from the tracking number format. Colombia packages use format 3 uppercase letters + 7 digits (e.g. ALA2500185, BOG1980256, CAL1234567) and route to the Ticabox provider. All other formats (USPS 20-30 digit, UPS 1Z, Amazon TBA, FedEx 12/15 digit) route to ML Cargo / MiLocker. Returns current status, event history, customer info, weight, and manifest data.',
    parameters: {
      type: 'object',
      properties: {
        trackingNumber: {
          type: 'string',
          description: 'The tracking number to look up. Can be full (30-digit) or partial (22-digit USPS, short suffix, Amazon TBA, UPS 1Z, etc.)',
        },
      },
      required: ['trackingNumber'],
    },
  },
  // ── MLocker — list manifests ──────────────────────────────────────────────
  {
    name: 'list_mlocker_manifests',
    description:
      'Query the MLocker portal to list manifests from the historic manifest list. Returns manifest number, description, reception date and status. Use when the user asks to see the list of manifests, recent manifests, or wants to search for a specific manifest number or date range.',
    parameters: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Number of manifests to return (default 10, max 100)' },
        manifestNumber: { type: 'string', description: 'Filter by exact manifest number' },
        description: { type: 'string', description: 'Filter by manifest description keyword' },
        startDate: { type: 'string', description: 'Filter start date in MM/DD/YYYY format' },
        endDate: { type: 'string', description: 'Filter end date in MM/DD/YYYY format' },
        status: { type: 'number', description: 'Filter by status: -1 = all, 1 = open, 2 = closed' },
      },
      required: [],
    },
  },
  // ── MLocker — manifest detail ─────────────────────────────────────────────
  {
    name: 'get_mlocker_manifest_detail',
    description:
      'Retrieve the full package list for a specific MLocker manifest by its ID. Returns all packages with tracking numbers, customer names, destinations, weights, shippers, and statuses. Use when the user wants to see what\'s inside a manifest or wants to process a manifest for matching and pricing.',
    parameters: {
      type: 'object',
      properties: {
        manifestId: { type: 'string', description: 'The manifest ID/number (e.g. "28-02-2026" or "28-02-2026DANP")' },
        offerProcessing: { type: 'string', description: 'Whether to offer the user to process the manifest data for matching/pricing. Pass "true" after fetching detail.', enum: ['true', 'false'] },
      },
      required: ['manifestId'],
    },
  },
  // ── MLocker — download Excel ──────────────────────────────────────────────
  {
    name: 'download_mlocker_manifest_excel',
    description:
      'Download the Excel file for a specific MLocker manifest. Triggers a file download in the user\'s browser. Use when the user explicitly asks to download or export a manifest as Excel/XLSX.',
    parameters: {
      type: 'object',
      properties: {
        manifestId: { type: 'string', description: 'The manifest ID/number to download' },
        excelType: { type: 'string', description: 'Type of Excel: "summary" (one row per package) or "detail" (full detail)', enum: ['summary', 'detail'] },
      },
      required: ['manifestId'],
    },
  },
  // ── Customer query (bulk filtering) ──────────────────────────────────────────
  {
    name: 'query_customers',
    description:
      'Query customers from the database with flexible filters. Use this when asked about groups of customers — e.g. customers on a specific route, by tier, by status, or searching by name/email/dni. Returns list with count. Examples: "clientes de encomienda" → ruta contains "encomienda"; "clientes premium" → tier=premium; "clientes inactivos" → status=inactive.',
    parameters: {
      type: 'object',
      properties: {
        ruta: { type: 'string', description: 'Filter by delivery route name (partial match, case-insensitive). E.g. "encomienda", "San Jose", "Cartago"' },
        status: { type: 'string', description: 'Filter by customer status', enum: ['active', 'inactive', 'suspended'] },
        tier: { type: 'string', description: 'Filter by membership tier', enum: ['basic', 'smart', 'premium', 'business'] },
        searchText: { type: 'string', description: 'Free-text search across fullName, email, dni, slCode' },
        maxResults: { type: 'number', description: 'Max customers to return (default 100)' },
      },
      required: [],
    },
  },
  // ── Update customer ──────────────────────────────────────────────────────────
  {
    name: 'update_customer',
    description:
      'Update one or more fields on a customer record. ALWAYS call first with confirm=false to show the user exactly what will change and get their approval. Only call with confirm=true after the user explicitly says yes/confirma/sí. Fields that can be updated: fullName, email, phone, dni, ruta, status, tier, notes, consolidationEnabled.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'The SL code of the customer to update (e.g. SL1234). Required.' },
        updates: {
          type: 'string',
          description: 'JSON object with the fields to update. E.g. {"ruta":"Encomienda","phone":"88887777"}. Only include fields that should change.',
        },
        confirm: {
          type: 'string',
          description: 'Pass "false" first to preview the change and ask for user confirmation. Pass "true" only after the user explicitly confirms.',
          enum: ['true', 'false'],
        },
      },
      required: ['slCode', 'updates', 'confirm'],
    },
  },
  // ── Update package ───────────────────────────────────────────────────────────
  {
    name: 'update_package',
    description:
      'Update one or more fields on a package record. ALWAYS call first with confirm=false to show the user what will change and get approval. Only call with confirm=true after the user explicitly says yes. Fields that can be updated: status, description, weight, notes, manifestNumber.',
    parameters: {
      type: 'object',
      properties: {
        trackingNumber: { type: 'string', description: 'The tracking number of the package to update. Required.' },
        updates: {
          type: 'string',
          description: 'JSON object with the fields to update. E.g. {"status":"delivered","notes":"Entregado el lunes"}. Only include fields that should change.',
        },
        confirm: {
          type: 'string',
          description: 'Pass "false" first to preview the change and ask for user confirmation. Pass "true" only after the user explicitly confirms.',
          enum: ['true', 'false'],
        },
      },
      required: ['trackingNumber', 'updates', 'confirm'],
    },
  },
  // ── Flexible collection query ─────────────────────────────────────────────────
  {
    name: 'query_collection',
    description:
      'Execute a flexible Firestore query on any allowlisted collection with AI-constructed filters. Use this as a last resort when none of the specialized tools cover the question. Supports equality, comparison, and contains-text filters. Available collections: customers, packages, invoices, routes, manifests.',
    parameters: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Firestore collection name to query',
          enum: ['customers', 'packages', 'invoices', 'routes', 'manifests'],
        },
        filters: {
          type: 'string',
          description: 'JSON array of filter objects. Each filter: { field: string, op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains", value: any }. "contains" does client-side case-insensitive substring match. Example: [{"field":"ruta","op":"contains","value":"encomienda"},{"field":"status","op":"==","value":"active"}]',
        },
        orderByField: { type: 'string', description: 'Field to order results by (optional)' },
        orderDirection: { type: 'string', description: 'Order direction', enum: ['asc', 'desc'] },
        maxResults: { type: 'number', description: 'Max results to return (default 100, max 500)' },
        returnFields: {
          type: 'string',
          description: 'Comma-separated list of fields to include in results (projection). Leave empty to return all fields.',
        },
      },
      required: ['collection'],
    },
  },
  // ── Generate chart ────────────────────────────────────────────────────────────
  {
    name: 'generate_chart',
    description:
      'Generate a chart from live Firestore data to visualize trends, distributions, and patterns. IMPORTANT: revenue_by_month, revenue_by_day, revenue_by_route, and top_customers_by_revenue metrics read from the INVOICES collection (accurate billing totals). Package volume metrics (packages_by_month, packages_by_day, etc.) read from the PACKAGES collection. Use this for strategic questions like revenue trends, package volume by period, top customers, status distribution, route performance, etc. The chart is rendered in the chat UI automatically. Chart types: line (trends over time), bar (comparisons), area (cumulative trends), pie (distribution/proportions). ALWAYS prefer this tool over text summaries for time-series or ranking data.',
    parameters: {
      type: 'object',
      properties: {
        chartType: {
          type: 'string',
          description: 'Type of chart to generate',
          enum: ['line', 'bar', 'area', 'pie'],
        },
        metric: {
          type: 'string',
          description: 'What to measure',
          enum: [
            'revenue_by_month',
            'packages_by_month',
            'packages_by_status',
            'revenue_by_route',
            'packages_by_route',
            'top_customers_by_volume',
            'top_customers_by_revenue',
            'packages_by_day',
            'revenue_by_day',
          ],
        },
        dateFrom: { type: 'string', description: 'ISO date string — start of analysis period' },
        dateTo: { type: 'string', description: 'ISO date string — end of analysis period' },
        topN: { type: 'number', description: 'For top-N charts: how many entries to show (default 10)' },
        title: { type: 'string', description: 'Custom chart title (optional, auto-generated if omitted)' },
      },
      required: ['chartType', 'metric'],
    },
  },
  // ── Match intelligence ─────────────────────────────────────────────────────
  {
    name: 'query_match_intelligence',
    description:
      'Query matching intelligence data from the learning system. Shows match success rates, most common unmatched names, frequently confirmed name pairs, AI-auto learned matches, and failure patterns. Use when asked about matching quality, why names fail to match, which customers are hard to find, or how the system is learning.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of intelligence to query: "recent_failures" = top unmatched names + avg match rate from recent manifests; "confirmed_matches" = most confirmed name pairs ordered by hit count; "match_rate_trend" = match rate over time per manifest; "top_patterns" = aggregate stats per manifest type.',
          enum: ['recent_failures', 'confirmed_matches', 'match_rate_trend', 'top_patterns'],
        },
      },
      required: [],
    },
  },
  // ── Full package detail (Firestore) ────────────────────────────────────────
  {
    name: 'get_package_detail',
    description:
      'Get complete detail for a single package from Firestore by tracking ID: status, customer, manifest, weight, price, ruta, flags (requiresPermit, manuallyUpdated), and timestamps. Use when the user asks for all info on a specific tracking number or wants to audit a package record.',
    parameters: {
      type: 'object',
      properties: {
        trackingId: { type: 'string', description: 'The package tracking ID (exact, used as Firestore doc ID)' },
      },
      required: ['trackingId'],
    },
  },
  // ── Invoice detail & update ─────────────────────────────────────────────
  {
    name: 'get_invoice_detail',
    description:
      'Get the full details of a specific invoice (factura): total, status, notes, line items, and dates. Look up by invoice document ID or by customer SL code (returns their most recent invoice). Use when the user asks to preview, review, or audit an invoice.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Exact Firestore invoice document ID' },
        slCode: { type: 'string', description: 'Customer SL code — returns their most recent invoice if no invoiceId given' },
      },
      required: [],
    },
  },
  {
    name: 'update_invoice',
    description:
      'Update an invoice status or notes. ALWAYS call first with confirm=false to show the diff to the user. Only call with confirm=true after explicit user confirmation ("sí", "confirmo", "procede"). Never modify invoice totals or IDs.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Firestore invoice document ID to update' },
        status: { type: 'string', description: 'New invoice status (e.g. "paid", "pending", "cancelled")' },
        notes: { type: 'string', description: 'Notes or observations to add/update on the invoice' },
        confirm: { type: 'boolean', description: 'false = preview diff only; true = apply the change (requires prior user confirmation)' },
      },
      required: ['invoiceId', 'confirm'],
    },
  },
  // ── Route detail ────────────────────────────────────────────────────────
  {
    name: 'get_route_detail',
    description:
      'Get the list of packages assigned to a delivery route (ruta) with status breakdown, total weight, revenue, and per-package data. Use when the user asks what packages are in a route, wants a pre-dispatch summary, or needs to audit route assignments.',
    parameters: {
      type: 'object',
      properties: {
        routeName: { type: 'string', description: 'Route name exactly as stored (e.g. "Desamparados", "Cartago", "Encomienda")' },
        statusFilter: { type: 'string', description: 'Optional: filter by package status (e.g. "route", "customs", "held", "transit")' },
        maxResults: { type: 'number', description: 'Max packages to return (default 50, max 200)' },
      },
      required: ['routeName'],
    },
  },
  // ── Cross-collection: packages × invoices ────────────────────────────────
  {
    name: 'query_packages_with_invoice_status',
    description:
      'Cross-collection compound query: find packages filtered by delivery route AND cross-reference their invoice status. Use this when the user asks compound questions like "paquetes de encomiendas con facturas enviadas", "qué trackings de ruta X ya tienen factura pagada", or "encomiendas con factura pendiente". Returns each package enriched with its invoice data (invoiceId, invoiceStatus, invoiceTotal). ALWAYS prefer this tool over calling query_packages + query_invoices separately when both a route and an invoice status are mentioned.',
    parameters: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Delivery route name (ruta) to filter packages by, e.g. "Encomiendas", "San José"' },
        invoiceStatus: {
          type: 'string',
          description: 'Invoice status to cross-reference. "sent"=enviada, "paid"=pagada, "pending"=pendiente, "overdue"=vencida, "draft"=borrador',
          enum: ['draft', 'sent', 'paid', 'pending', 'overdue', 'cancelled'],
        },
        packageStatus: {
          type: 'string',
          description: 'Optional: also filter by package delivery status',
          enum: ['received', 'transit', 'pre-alerted', 'consolidated', 'customs', 'held', 'route', 'pickup', 'delivered', 'returned'],
        },
        dateFrom: { type: 'string', description: 'ISO date — limit invoices created after this date' },
        dateTo: { type: 'string', description: 'ISO date — limit invoices created before this date' },
        maxResults: { type: 'number', description: 'Max packages to return (default 100, max 300)' },
      },
      required: [],
    },
  },
  // ── Shipping labels ─────────────────────────────────────────────────────
  {
    name: 'generate_shipping_label',
    description:
      'Retrieve all data needed to generate a shipping label (etiqueta de envío) for a customer: profile (name, phone, DNI, address, ruta), active non-delivered packages with weights, total weight. Returns a direct link to the /shipping-labels page pre-filled for this customer. Use when the user asks to create, prepare, or print a label for a customer.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'Customer SL code (e.g. SL1234)' },
      },
      required: ['slCode'],
    },
  },
  {
    name: 'get_shipping_label_history',
    description:
      'Get the history of shipping labels (encomiendas) generated for a customer: label status, trackings included, courier service, delivery address, creation date. Use when the user asks about past encomiendas or label history for a customer.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'Customer SL code' },
        maxResults: { type: 'number', description: 'Max labels to return (default 10)' },
      },
      required: ['slCode'],
    },
  },
  // ── Detect cross-manifest duplicate trackings ──────────────────────────────
  {
    name: 'detect_duplicate_trackings',
    description:
      'Scan a MLocker manifest for tracking numbers that already exist in Firestore packages under a DIFFERENT manifest number. These are cross-manifest duplicates caused by human error (e.g. same tracking re-entered in a new manifest). Returns a full list of conflicts with their existing manifest, customer, and processed date. Use this BEFORE processing a manifest or when the user asks about data quality / duplicates.',
    parameters: {
      type: 'object',
      properties: {
        manifestId: { type: 'string', description: 'The manifest ID/number to scan for duplicate trackings' },
      },
      required: ['manifestId'],
    },
  },
  // ── Pre-alert check ─────────────────────────────────────────────────────────
  {
    name: 'check_pre_alert',
    description:
      'Check whether a tracking number has a pre-alert registered by a customer in smart-portal-2. Returns pre-alert status, customer SL code, and creation date.',
    parameters: {
      type: 'object',
      properties: {
        trackingNumber: {
          type: 'string',
          description: 'Tracking number to check. Normalised automatically (uppercase, trimmed).',
        },
      },
      required: ['trackingNumber'],
    },
  },
  // ── Manifest data analysis ───────────────────────────────────────────────────
  {
    name: 'analyze_current_manifest',
    description:
      'Analyze the manifest data currently loaded in the session (just processed). Returns per-row breakdown, customer distribution, weight stats, price stats, corrections made, and validation issues. Use when the user asks questions about the file they just uploaded.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Specific question about the manifest data to focus the analysis on' },
      },
      required: [],
    },
  },
  // ── Consolidation compliance ──────────────────────────────────────────────────
  {
    name: 'check_consolidation_compliance',
    description:
      'Check whether a customer with consolidation enabled is in compliance with the active consolidation rules (loaded live from Firestore). Returns compliant/non-compliant status, a list of violations (errors) and warnings, and a plain-language summary. Use when asked whether a customer can consolidate, if their shipment meets the requirements, or to audit a consolidation request before creating an invoice.',
    parameters: {
      type: 'object',
      properties: {
        slCode: { type: 'string', description: 'Customer SL code to evaluate (e.g. SL1234)' },
        packageCount: { type: 'number', description: 'Number of packages in the consolidation (required)' },
        totalWeightKg: { type: 'number', description: 'Combined weight of all packages in kilograms' },
        totalDimensionsCm: { type: 'number', description: 'Sum of all package dimensions (largo+ancho+alto) in centimeters' },
        totalValueUSD: { type: 'number', description: 'Total declared value in USD' },
        originCountry: { type: 'string', description: 'Origin country code — US/USA passes; CO/CN/MX fails no_mixed_warehouse rule', enum: ['US', 'USA', 'CO', 'CN', 'MX'] },
        shippingType: { type: 'string', description: 'Air or sea shipping method', enum: ['air', 'sea'] },
        hasElectronics: { type: 'string', description: 'Whether any package contains electronics', enum: ['true', 'false'] },
        hasSpecialPermit: { type: 'string', description: 'Whether any package requires a special customs permit', enum: ['true', 'false'] },
        isUrgent: { type: 'string', description: 'Whether any package is marked urgent/priority', enum: ['true', 'false'] },
        categories: { type: 'string', description: 'Comma-separated item categories (e.g. "electronicos,ropa") to check against exclusion rules' },
      },
      required: ['slCode', 'packageCount'],
    },
  },
];

// ── Pre-alert check — Delegated to PreAlertResolver SSOT Module ───────────────
export type { PreAlertInfo };
export {
  batchResolvePreAlerts as batchCheckTrackingPreAlerts,
  resolvePreAlert as checkTrackingPreAlert,
  watchPreAlerts as watchTrackingPreAlerts,
};


// ── Tool executor ─────────────────────────────────────────────────────────────

export interface NovaToolResult {
  tool: string;
  data: unknown;
  error?: string;
}

export type CurrentManifestData = {
  rows: Array<Record<string, unknown>>;
  summary: {
    totalRows: number;
    processedRows: number;
    totalPrice: number;
    customersMatched: number;
    namesCorrections: number;
    weightCorrections: number;
  };
  manifestNumber?: string;
  manifestType?: string;
} | null;

export async function executeNovaTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; currentManifest: CurrentManifestData }
): Promise<NovaToolResult> {
  try {
    switch (toolName) {

      case 'query_packages': {
        const constraints: ReturnType<typeof where>[] = [];
        if (args.status) constraints.push(where('status', '==', args.status));
        if (args.route) constraints.push(where('ruta', '==', String(args.route).trim()));
        if (args.slCode) constraints.push(where('slCode', '==', String(args.slCode).toUpperCase()));
        if (args.manifestNumber) constraints.push(where('manifestNumber', '==', args.manifestNumber));
        if (args.dateFrom) constraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo) constraints.push(where('createdAt', '<=', new Date(args.dateTo as string)));

        const max = Number(args.maxResults) || 50;
        const q = query(collection(db, 'packages'), ...constraints, orderBy('createdAt', 'desc'), fsLimit(max));
        const snap = await getDocs(q);
        const packages = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            tracking: data.tracking || data.trackingNumber || '',
            status: data.status || '',
            slCode: data.slCode || data.customerSlCode || '',
            customerName: data.customerName || data.nombre || '',
            weight: data.weight || data.peso || 0,
            price: data.price || data.precio || 0,
            manifestNumber: data.manifestNumber || '',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt || '',
          };
        });

        const totalRevenue = packages.reduce((s, p) => s + (p.price || 0), 0);
        return {
          tool: toolName,
          data: {
            count: packages.length,
            packages,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
          },
        };
      }

      case 'get_packages_stats': {
        const cacheKey = `pkg_stats:${args.dateFrom || 'all'}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return { tool: toolName, data: cached };

        const baseConstraints: ReturnType<typeof where>[] = [];
        if (args.dateFrom) baseConstraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));

        const packagesRef = collection(db, 'packages');
        // Parallel aggregate count queries — zero doc downloads (O(1) per status)
        const KNOWN_STATUSES = [
          'received', 'pre-alerted', 'transit', 'consolidated',
          'customs', 'held', 'route', 'pickup', 'delivered', 'returned', 'processed',
        ];
        const [totalSnap, ...statusSnaps] = await Promise.all([
          getCountFromServer(query(packagesRef, ...baseConstraints)),
          ...KNOWN_STATUSES.map(st =>
            getCountFromServer(query(packagesRef, ...baseConstraints, where('status', '==', st)))
          ),
        ]);

        const byStatus: Record<string, number> = {};
        KNOWN_STATUSES.forEach((st, i) => {
          const count = statusSnaps[i].data().count;
          if (count > 0) byStatus[st] = count;
        });

        const result = {
          total: totalSnap.data().count,
          byStatus,
          statusLabels: {
            received: 'Recibido en Miami',
            transit: 'En Tránsito a Costa Rica',
            'pre-alerted': 'Pre-Alertado',
            consolidated: 'Consolidado',
            customs: 'En Aduanas',
            held: 'Retenido en Aduana',
            route: 'En Ruta de Entrega',
            pickup: 'Retira en SmartLogistics',
            delivered: 'Entregado',
            returned: 'Devuelto',
            processed: 'Facturado',
          },
        };
        cacheSet(cacheKey, result, 120_000); // 2 min TTL — stats are less volatile
        return { tool: toolName, data: result };
      }

      case 'lookup_customer_detail': {
        const searchQuery = String(args.query || '');
        // searchCustomersLocal already returns enriched customer data from the
        // in-memory customer cache — no second Firestore round-trip needed.
        const hits = await searchCustomersLocal(searchQuery, { limit: 5 });
        if (hits.length === 0) {
          return { tool: toolName, data: { found: false, message: `No se encontró ningún cliente con "${searchQuery}"` } };
        }
        const top = hits[0];
        return {
          tool: toolName,
          data: {
            found: true,
            customer: {
              slCode: top.slCode,
              fullName: top.fullName,
              email: (top as unknown as Record<string, unknown>).email || '',
              phone: (top as unknown as Record<string, unknown>).phone || '',
              dni: (top as unknown as Record<string, unknown>).dni || '',
              ruta: top.ruta || '',
              status: (top as unknown as Record<string, unknown>).status || 'active',
              tier: (top as unknown as Record<string, unknown>).tier || 'basic',
              consolidationEnabled: top.consolidationEnabled ?? false,
              address: (top as unknown as Record<string, unknown>).address || '',
              city: (top as unknown as Record<string, unknown>).city || '',
              country: (top as unknown as Record<string, unknown>).country || '',
              notes: (top as unknown as Record<string, unknown>).notes || '',
              matchScore: top.score,
            },
            alternatives: hits.slice(1, 4).map(h => ({
              slCode: h.slCode,
              fullName: h.fullName,
              email: (h as unknown as Record<string, unknown>).email || '',
              ruta: h.ruta || '',
              matchScore: h.score,
            })),
          },
        };
      }

      case 'get_top_customers': {
        const topN    = Number(args.topN) || 10;
        const sortBy  = String(args.sortBy || 'revenue'); // 'revenue' | 'volume'
        const cacheKey = `top_cust:${args.dateFrom || ''}:${args.dateTo || ''}:${topN}:${sortBy}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return { tool: toolName, data: cached };

        const dateConstraints: ReturnType<typeof where>[] = [];
        if (args.dateFrom) dateConstraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo)   dateConstraints.push(where('createdAt', '<=', new Date(args.dateTo   as string)));

        type CustomerEntry = { slCode: string; name: string; packages: number; totalBilled: number; totalPaid: number };
        const customerMap = new Map<string, CustomerEntry>();

        // ── Step 1: query invoices for accurate billing totals ──────────────
        const invSnap = await getDocs(query(collection(db, 'invoices'), ...dateConstraints, fsLimit(3000)));
        for (const d of invSnap.docs) {
          const data = d.data();
          const slCode = (data.clientSlCode || data.slCode || data.clientId || '').toUpperCase().trim();
          if (!slCode) continue;
          const name   = String(data.clientName || data.customerName || slCode);
          const amount = Number(data.total || data.amount || data.totalAmount || 0);
          const status = String(data.status || '');
          const entry  = customerMap.get(slCode) || { slCode, name, packages: 0, totalBilled: 0, totalPaid: 0 };
          entry.totalBilled += amount;
          if (status === 'paid') entry.totalPaid += amount;
          if (!entry.name || entry.name === slCode) entry.name = name;
          customerMap.set(slCode, entry);
        }

        // ── Step 2: query packages for volume count ─────────────────────────
        const pkgSnap = await getDocs(query(collection(db, 'packages'), ...dateConstraints, fsLimit(3000)));
        for (const d of pkgSnap.docs) {
          const data   = d.data();
          const slCode = (data.slCode || data.customerSlCode || '').toUpperCase().trim();
          if (!slCode) continue;
          const existing = customerMap.get(slCode);
          if (existing) {
            existing.packages++;
          } else {
            const name = String(data.customerName || data.nombre || slCode);
            customerMap.set(slCode, { slCode, name, packages: 1, totalBilled: 0, totalPaid: 0 });
          }
        }

        // ── Step 3: sort by requested dimension ────────────────────────────
        const sorted = Array.from(customerMap.values())
          .filter(c => c.totalBilled > 0 || c.packages > 0)
          .sort((a, b) => sortBy === 'volume' ? b.packages - a.packages : b.totalBilled - a.totalBilled)
          .slice(0, topN)
          .map(c => ({
            slCode:       c.slCode,
            name:         c.name,
            packages:     c.packages,
            totalBilled:  Math.round(c.totalBilled  * 100) / 100,
            totalPaid:    Math.round(c.totalPaid     * 100) / 100,
            totalPending: Math.round((c.totalBilled - c.totalPaid) * 100) / 100,
            revenue:      Math.round(c.totalBilled  * 100) / 100, // backward-compat alias
          }));

        const result = { topN, sortBy, customers: sorted };
        cacheSet(cacheKey, result);
        return { tool: toolName, data: result };
      }

      case 'get_customer_report': {
        const slCodeRaw = String(args.slCode || '').trim().toUpperCase();
        if (!slCodeRaw) return { tool: toolName, data: { error: 'slCode is required' } };

        const dateConstraints: ReturnType<typeof where>[] = [];
        if (args.dateFrom) dateConstraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo)   dateConstraints.push(where('createdAt', '<=', new Date(args.dateTo   as string)));

        // ── Packages for this customer ──────────────────────────────────────
        const pkgSnap = await getDocs(
          query(collection(db, 'packages'), where('slCode', '==', slCodeRaw), ...dateConstraints, fsLimit(500))
        );
        const pkgByStatus: Record<string, number> = {};
        let customerName = '';
        for (const d of pkgSnap.docs) {
          const data = d.data();
          const st = String(data.status || 'unknown');
          pkgByStatus[st] = (pkgByStatus[st] || 0) + 1;
          if (!customerName) customerName = String(data.customerName || data.nombre || '');
        }

        // ── Invoices for this customer (try both field names in parallel) ───
        const [invSnap1, invSnap2] = await Promise.all([
          getDocs(query(collection(db, 'invoices'), where('clientSlCode', '==', slCodeRaw), ...dateConstraints, fsLimit(200))),
          getDocs(query(collection(db, 'invoices'), where('slCode',       '==', slCodeRaw), ...dateConstraints, fsLimit(200))),
        ]);
        const seenInv = new Set<string>();
        const allInvDocs = [...invSnap1.docs, ...invSnap2.docs].filter(d => {
          if (seenInv.has(d.id)) return false;
          seenInv.add(d.id);
          return true;
        });

        let totalBilled = 0, totalPaid = 0, totalPending = 0;
        const invByStatus: Record<string, number> = {};
        for (const d of allInvDocs) {
          const data   = d.data();
          const amount = Number(data.total || data.amount || data.totalAmount || 0);
          const st     = String(data.status || 'unknown');
          totalBilled += amount;
          if (st === 'paid')   totalPaid    += amount;
          if (st === 'sent' || st === 'pending' || st === 'draft') totalPending += amount;
          invByStatus[st] = (invByStatus[st] || 0) + 1;
          if (!customerName) customerName = String(data.clientName || data.customerName || '');
        }

        const totalPackages = pkgSnap.docs.length;
        return {
          tool: toolName,
          data: {
            slCode:       slCodeRaw,
            customerName: customerName || slCodeRaw,
            packages: {
              total:     totalPackages,
              byStatus:  pkgByStatus,
              delivered: pkgByStatus['delivered'] || 0,
              inTransit: (pkgByStatus['transit'] || 0) + (pkgByStatus['route'] || 0),
              pending:   (pkgByStatus['received'] || 0) + (pkgByStatus['consolidated'] || 0) + (pkgByStatus['customs'] || 0),
              returned:  pkgByStatus['returned'] || 0,
            },
            invoices: {
              total:          allInvDocs.length,
              byStatus:       invByStatus,
              totalBilled:    Math.round(totalBilled  * 100) / 100,
              totalPaid:      Math.round(totalPaid    * 100) / 100,
              totalPending:   Math.round(totalPending * 100) / 100,
              collectionRate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 1000) / 10 : 0,
            },
          },
        };
      }

      case 'get_account_statement': {
        const slCodeRaw = String(args.slCode || '').trim().toUpperCase();
        if (!slCodeRaw) return { tool: toolName, data: { error: 'slCode is required' } };

        const maxInv = Math.min(Number(args.maxInvoices) || 100, 200);
        const dateConstraints: ReturnType<typeof where>[] = [];
        if (args.dateFrom) dateConstraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo)   dateConstraints.push(where('createdAt', '<=', new Date(args.dateTo as string)));

        // Step 1: Resolve the customer's Firestore doc ID (may differ from slCode).
        // ClientLedger uses getClientKey = c.slCode || c.id — invoices can be linked
        // by either the SL code string OR the Firebase UID / Firestore doc ID.
        const [usersBySlSnap, custBySlSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'),     where('slCode', '==', slCodeRaw), fsLimit(1))),
          getDocs(query(collection(db, 'customers'), where('slCode', '==', slCodeRaw), fsLimit(1))),
        ]);
        const customerDocId =
          usersBySlSnap.docs[0]?.id || custBySlSnap.docs[0]?.id || '';
        const profileData =
          usersBySlSnap.docs[0]?.data() || custBySlSnap.docs[0]?.data() || {};

        console.debug('[get_account_statement] slCode:', slCodeRaw, '| docId:', customerDocId);

        // Step 2: Build all unique lookup keys (slCode + Firebase UID)
        const lookupKeys = [slCodeRaw];
        if (customerDocId && customerDocId !== slCodeRaw) lookupKeys.push(customerDocId);

        // Step 3: Fan-out invoice queries across all keys and all relevant fields
        const invQueryPromises = lookupKeys.flatMap(key => [
          getDocs(query(collection(db, 'invoices'), where('slCode',       '==', key), ...dateConstraints, fsLimit(maxInv))),
          getDocs(query(collection(db, 'invoices'), where('clientSlCode', '==', key), ...dateConstraints, fsLimit(maxInv))),
          getDocs(query(collection(db, 'invoices'), where('customerId',   '==', key), ...dateConstraints, fsLimit(maxInv))),
          getDocs(query(collection(db, 'invoices'), where('userId',       '==', key), ...dateConstraints, fsLimit(maxInv))),
        ]);

        // Step 4: Fan-out package queries across all keys and all relevant fields
        const pkgQueryPromises = lookupKeys.flatMap(key => [
          getDocs(query(collection(db, 'packages'), where('slCode',         '==', key), ...dateConstraints, fsLimit(500))),
          getDocs(query(collection(db, 'packages'), where('customerId',     '==', key), ...dateConstraints, fsLimit(500))),
          getDocs(query(collection(db, 'packages'), where('customerSlCode', '==', key), ...dateConstraints, fsLimit(500))),
        ]);

        const allSnaps = await Promise.all([...invQueryPromises, ...pkgQueryPromises]);
        const invSnaps = allSnaps.slice(0, invQueryPromises.length);
        const pkgSnaps = allSnaps.slice(invQueryPromises.length);

        console.debug('[get_account_statement] inv snaps counts:', invSnaps.map(s => s.docs.length));
        console.debug('[get_account_statement] pkg snaps counts:', pkgSnaps.map(s => s.docs.length));

        // Step 5: Deduplicate invoices
        const invMap = new Map<string, Record<string, unknown>>();
        for (const snap of invSnaps) {
          for (const d of snap.docs) {
            if (!invMap.has(d.id)) invMap.set(d.id, { id: d.id, ...d.data() });
          }
        }

        // Step 6: Deduplicate packages
        const pkgMap = new Map<string, Record<string, unknown>>();
        for (const snap of pkgSnaps) {
          for (const d of snap.docs) {
            if (!pkgMap.has(d.id)) pkgMap.set(d.id, { id: d.id, ...d.data() });
          }
        }

        console.debug('[get_account_statement] unique invoices:', invMap.size, '| unique packages:', pkgMap.size);

        const toDate = (v: unknown): string => {
          if (!v) return '';
          if (typeof v === 'object' && v !== null && 'seconds' in v) return new Date((v as { seconds: number }).seconds * 1000).toISOString();
          const d = new Date(v as string);
          return isNaN(d.getTime()) ? '' : d.toISOString();
        };

        // Step 7: Build invoice list sorted newest first
        const invoiceList = Array.from(invMap.values())
          .sort((a, b) => {
            const da = new Date(toDate(a.createdAt) || toDate(a.invoiceDate) || '').getTime();
            const db2 = new Date(toDate(b.createdAt) || toDate(b.invoiceDate) || '').getTime();
            return db2 - da;
          })
          .map(d => {
            const items = ((d.invoiceItems as unknown[]) || (d.items as unknown[]) || []) as Record<string, unknown>[];
            return {
              id: d.id as string,
              invoiceNumber: String(d.invoiceNumber || d.id || ''),
              status: String(d.status || 'draft'),
              date: toDate(d.createdAt) || toDate(d.invoiceDate),
              dueDate: toDate(d.dueDate),
              paidAt: toDate(d.paidAt),
              amount: Number(d.total || d.amount || d.totalAmount || 0),
              amountCRC: Number(d.amountCRC || 0),
              currency: String(d.currency || 'USD'),
              manifestNumber: String(d.manifestNumber || ''),
              packageCount: Number(d.packageCount || items.length || 0),
              items: items.map(i => ({
                tracking: String(i.trackingNumber || i.tracking || ''),
                description: String(i.description || i.trackingNumber || i.tracking || ''),
                weight: Number(i.weight || 0),
                amount: Number(i.totalPrice || i.unitPrice || i.amount || 0),
              })),
            };
          });

        // Step 8: Build package list
        let customerName = String(
          profileData.displayName ||
          ((profileData.firstName || '') + ' ' + (profileData.lastName || '')).trim() ||
          profileData.name || ''
        );
        const pkgByStatus: Record<string, number> = {};
        const packageList = Array.from(pkgMap.values()).map(data => {
          if (!customerName) customerName = String(data.customerName || data.nombre || '');
          const st = String(data.status || 'unknown');
          pkgByStatus[st] = (pkgByStatus[st] || 0) + 1;
          return {
            tracking: String(data.tracking || data.trackingNumber || ''),
            status: st,
            statusLabel: String(data.statusLabel || ''),
            createdAt: toDate(data.createdAt),
            manifestNumber: String(data.manifestNumber || ''),
          };
        });

        // Step 9: Financial summary from REAL invoice data only
        let totalBilled = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;
        for (const inv of invoiceList) {
          totalBilled += inv.amount;
          if (inv.status === 'paid')                              totalPaid    += inv.amount;
          if (['sent','draft','pending'].includes(inv.status))   totalPending += inv.amount;
          if (inv.status === 'overdue')                          totalOverdue += inv.amount;
        }

        if (!customerName && invoiceList.length > 0) {
          const firstInv = invMap.get(invoiceList[0].id) as Record<string, unknown> | undefined;
          customerName = String(firstInv?.clientName || firstInv?.customerName || '');
        }

        return {
          tool: toolName,
          data: {
            slCode:       slCodeRaw,
            customerName: customerName || slCodeRaw,
            period: { from: args.dateFrom || null, to: args.dateTo || null },
            financialSummary: {
              totalBilled:    Math.round(totalBilled  * 100) / 100,
              totalPaid:      Math.round(totalPaid    * 100) / 100,
              totalPending:   Math.round(totalPending * 100) / 100,
              totalOverdue:   Math.round(totalOverdue * 100) / 100,
              balance:        Math.round((totalBilled - totalPaid) * 100) / 100,
              collectionRate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 1000) / 10 : 0,
            },
            invoices: { total: invoiceList.length, list: invoiceList },
            packages: { total: pkgMap.size, byStatus: pkgByStatus, list: packageList },
          },
        };
      }

      case 'get_operational_analytics': {
        const timeRange = String(args.timeRange || '6m');
        const days = timeRange === '7d' ? 7 : timeRange === '1m' ? 30 : timeRange === '3m' ? 90 : timeRange === '6m' ? 180 : 365;
        const numMonths = timeRange === '7d' ? 1 : timeRange === '1m' ? 1 : timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
        const now = new Date();
        const dateFrom = new Date(Date.now() - days * 86400000);
        const prevFrom = new Date(dateFrom.getTime() - days * 86400000);
        const fromTs = Timestamp.fromDate(dateFrom);
        const prevFromTs = Timestamp.fromDate(prevFrom);

        // Parallel fetches for current + previous period
        const [pkgSnap, invSnap, prevPkgSnap, prevInvSnap] = await Promise.all([
          getDocs(query(collection(db, 'packages'), where('createdAt', '>=', fromTs),     fsLimit(2000))),
          getDocs(query(collection(db, 'invoices'), where('createdAt', '>=', fromTs),     fsLimit(2000))),
          getDocs(query(collection(db, 'packages'), where('createdAt', '>=', prevFromTs), where('createdAt', '<', fromTs), fsLimit(2000))),
          getDocs(query(collection(db, 'invoices'), where('createdAt', '>=', prevFromTs), where('createdAt', '<', fromTs), fsLimit(2000))),
        ]);

        const packages  = pkgSnap.docs.map(d => d.data());
        const invoices  = invSnap.docs.map(d => d.data());
        const prevPkgs  = prevPkgSnap.docs.map(d => d.data());
        const prevInvs  = prevInvSnap.docs.map(d => d.data());

        // Revenue
        const getAmt = (i: Record<string, unknown>) => Number(i.total || i.totalAmount || i.amount || 0);
        const paidInvs    = invoices.filter(i => i.status === 'paid');
        const pendingInvs = invoices.filter(i => ['sent', 'draft', 'pending'].includes(String(i.status)));
        const overdueInvs = invoices.filter(i => i.status === 'overdue');
        const paidRev     = paidInvs.reduce((s, i) => s + getAmt(i), 0);
        const pendingRev  = pendingInvs.reduce((s, i) => s + getAmt(i), 0);
        const overdueRev  = overdueInvs.reduce((s, i) => s + getAmt(i), 0);
        const prevPaidRev = prevInvs.filter(i => i.status === 'paid').reduce((s, i) => s + getAmt(i), 0);
        const revMoM = prevPaidRev > 0 ? Math.round(((paidRev - prevPaidRev) / prevPaidRev) * 1000) / 10 : null;
        const pkgMoM = prevPkgs.length > 0 ? Math.round(((packages.length - prevPkgs.length) / prevPkgs.length) * 1000) / 10 : null;

        // Delivery rate
        const deliveredPkgs = packages.filter(p => p.status === 'delivered').length;
        const deliveryRate  = packages.length > 0 ? Math.round((deliveredPkgs / packages.length) * 1000) / 10 : 0;

        // Active customers
        const custSet = new Set<string>();
        packages.forEach(p => { const id = String(p.slCode || p.customerId || '').toUpperCase().trim(); if (id) custSet.add(id); });
        invoices.forEach(i => { const id = String(i.clientSlCode || i.slCode || i.customerId || '').toUpperCase().trim(); if (id) custSet.add(id); });

        // Revenue trend (monthly)
        const monthlyMap = new Map<string, { revenue: number; packages: number }>();
        for (let m = numMonths - 1; m >= 0; m--) {
          const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
          monthlyMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, { revenue: 0, packages: 0 });
        }
        paidInvs.forEach(i => {
          const ts = i.invoiceDate instanceof Timestamp ? i.invoiceDate.toDate() : new Date((i.invoiceDate || i.createdAt || '').toString() || 0);
          const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyMap.has(key)) monthlyMap.get(key)!.revenue += getAmt(i);
        });
        packages.forEach(p => {
          const ts = p.createdAt instanceof Timestamp ? p.createdAt.toDate() : new Date((p.createdAt || '').toString() || 0);
          const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyMap.has(key)) monthlyMap.get(key)!.packages += 1;
        });
        const revenueTrend = Array.from(monthlyMap.entries()).map(([period, d]) => ({
          period, revenue: Math.round(d.revenue * 100) / 100, packages: d.packages,
        }));

        // Packages by status
        const stMap = new Map<string, number>();
        packages.forEach(p => { const s = String(p.status || 'unknown'); stMap.set(s, (stMap.get(s) || 0) + 1); });
        const packagesByStatus = Array.from(stMap.entries())
          .map(([status, count]) => ({ status, count, pct: packages.length > 0 ? Math.round((count / packages.length) * 100) : 0 }))
          .sort((a, b) => b.count - a.count);

        // Packages by route
        const routeMap = new Map<string, number>();
        packages.forEach(p => { const r = String(p.ruta || 'Sin ruta'); routeMap.set(r, (routeMap.get(r) || 0) + 1); });
        const packagesByRoute = Array.from(routeMap.entries())
          .map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 10);

        // Invoices by status
        const invStMap = new Map<string, { count: number; amount: number }>();
        invoices.forEach(i => {
          const s = String(i.status || 'unknown');
          const cur = invStMap.get(s) || { count: 0, amount: 0 };
          invStMap.set(s, { count: cur.count + 1, amount: cur.amount + getAmt(i) });
        });
        const invoicesByStatus = Array.from(invStMap.entries())
          .map(([status, d]) => ({ status, count: d.count, amount: Math.round(d.amount * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount);

        // Top customers by revenue
        const custRevMap = new Map<string, { name: string; revenue: number; invoices: number }>();
        paidInvs.forEach(i => {
          const code = String(i.clientSlCode || i.slCode || i.customerId || 'Unknown').toUpperCase().trim();
          const name = String(i.clientName || i.customerName || code);
          const cur = custRevMap.get(code) || { name, revenue: 0, invoices: 0 };
          custRevMap.set(code, { name: cur.name || name, revenue: cur.revenue + getAmt(i), invoices: cur.invoices + 1 });
        });
        const topByRevenue = Array.from(custRevMap.entries())
          .map(([slCode, d]) => ({ slCode, name: d.name, revenue: Math.round(d.revenue * 100) / 100, invoices: d.invoices }))
          .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

        // Top customers by volume
        const custVolMap = new Map<string, { name: string; count: number }>();
        packages.forEach(p => {
          const code = String(p.slCode || p.customerId || 'Unknown').toUpperCase().trim();
          const name = String(p.customerName || p.nombre || code);
          const cur = custVolMap.get(code) || { name, count: 0 };
          custVolMap.set(code, { name: cur.name || name, count: cur.count + 1 });
        });
        const topByVolume = Array.from(custVolMap.entries())
          .map(([slCode, d]) => ({ slCode, name: d.name, count: d.count }))
          .sort((a, b) => b.count - a.count).slice(0, 10);

        return {
          tool: toolName,
          data: {
            timeRange,
            generatedAt: new Date().toISOString(),
            kpis: {
              totalRevenue:     Math.round((paidRev + pendingRev + overdueRev) * 100) / 100,
              paidRevenue:      Math.round(paidRev     * 100) / 100,
              pendingRevenue:   Math.round(pendingRev  * 100) / 100,
              overdueRevenue:   Math.round(overdueRev  * 100) / 100,
              collectionRate:   (paidRev + pendingRev + overdueRev) > 0
                ? Math.round((paidRev / (paidRev + pendingRev + overdueRev)) * 1000) / 10 : 0,
              revenueMoM:       revMoM,
              totalPackages:    packages.length,
              deliveredPackages: deliveredPkgs,
              deliveryRate,
              packagesMoM:      pkgMoM,
              totalInvoices:    invoices.length,
              paidInvoices:     paidInvs.length,
              pendingInvoices:  pendingInvs.length,
              overdueInvoices:  overdueInvs.length,
              activeCustomers:  custSet.size,
              avgInvoiceValue:  paidInvs.length > 0 ? Math.round(paidRev / paidInvs.length * 100) / 100 : 0,
            },
            revenueTrend,
            packagesByStatus,
            packagesByRoute,
            invoicesByStatus,
            topByRevenue,
            topByVolume,
          },
        };
      }

      case 'query_invoices': {
        const constraints: ReturnType<typeof where>[] = [];
        if (args.status) constraints.push(where('status', '==', args.status));
        if (args.slCode) constraints.push(where('slCode', '==', String(args.slCode).toUpperCase()));
        if (args.dateFrom) constraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo) constraints.push(where('createdAt', '<=', new Date(args.dateTo as string)));

        const max = Number(args.maxResults) || 50;
        const q = query(collection(db, 'invoices'), ...constraints, orderBy('createdAt', 'desc'), fsLimit(max));
        const snap = await getDocs(q);
        const invoices = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            slCode: data.slCode || '',
            customerName: data.customerName || '',
            total: data.total || data.amount || 0,
            status: data.status || '',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt || '',
          };
        });

        const totalAmount = invoices.reduce((s, i) => s + i.total, 0);
        return { tool: toolName, data: { count: invoices.length, invoices, totalAmount: Math.round(totalAmount * 100) / 100 } };
      }

      case 'get_revenue_summary': {
        const cacheKey = `revenue:${args.month || ''}:${args.dateFrom || ''}:${args.dateTo || ''}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return { tool: toolName, data: cached };

        const constraints: ReturnType<typeof where>[] = [];
        if (args.month) {
          const [yr, mo] = (args.month as string).split('-').map(Number);
          const from = new Date(yr, mo - 1, 1);
          const to = new Date(yr, mo, 0, 23, 59, 59);
          constraints.push(where('createdAt', '>=', from), where('createdAt', '<=', to));
        } else if (args.dateFrom || args.dateTo) {
          if (args.dateFrom) constraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
          if (args.dateTo) constraints.push(where('createdAt', '<=', new Date(args.dateTo as string)));
        }

        const q = query(collection(db, 'invoices'), ...constraints, fsLimit(2000));
        const snap = await getDocs(q);

        let totalBilled = 0, totalPaid = 0, totalPending = 0, totalOverdue = 0;
        const byStatus: Record<string, { count: number; total: number }> = {};

        for (const d of snap.docs) {
          const data = d.data();
          const amount = data.total || data.amount || 0;
          const st = data.status || 'pending';
          totalBilled += amount;
          if (st === 'paid') totalPaid += amount;
          if (st === 'pending') totalPending += amount;
          if (st === 'overdue') totalOverdue += amount;
          if (!byStatus[st]) byStatus[st] = { count: 0, total: 0 };
          byStatus[st].count++;
          byStatus[st].total += amount;
        }

        const result = {
          totalInvoices: snap.size,
          totalBilled: Math.round(totalBilled * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          totalPending: Math.round(totalPending * 100) / 100,
          totalOverdue: Math.round(totalOverdue * 100) / 100,
          collectionRate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 1000) / 10 : 0,
          byStatus,
        };
        cacheSet(cacheKey, result);
        return { tool: toolName, data: result };
      }

      case 'query_routes': {
        const statusFilter = String(args.status || 'all');
        const q = statusFilter === 'all'
          ? query(collection(db, 'routes'), fsLimit(100))
          : query(collection(db, 'routes'), where('status', '==', statusFilter), fsLimit(100));
        const snap = await getDocs(q);
        const routes = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || data.routeName || d.id,
            status: data.status || 'active',
            zone: data.zone || data.zona || '',
            driver: data.driver || data.driverName || '',
            customersCount: data.customersCount || 0,
          };
        });
        return { tool: toolName, data: { count: routes.length, routes } };
      }

      case 'get_current_pricing': {
        const country = String(args.country || 'usa') as Country;
        const shippingType = args.shippingType as ShippingType | undefined;

        // Sample weights to show rate tiers
        const sampleWeights = [0.2, 0.5, 1, 2, 5, 10];
        const tiers = sampleWeights.map(w => {
          const r = calculatePrice(w, country, shippingType || 'air', 'regular', false);
          return { weightKg: w, price: r.price, breakdown: r.breakdown };
        });

        return {
          tool: toolName,
          data: {
            country,
            shippingType: shippingType || 'air',
            currency: 'USD',
            rateTiers: tiers,
            permitSurcharge: 3,
            note: 'Prices calculated using deterministic pricing engine — not AI-estimated.',
          },
        };
      }

      case 'calculate_package_price': {
        const weightKg = Number(args.weightKg) || 0;
        const country = String(args.country || 'usa') as Country;
        const shippingType = String(args.shippingType || 'air') as ShippingType;
        const category = String(args.category || 'regular') as ItemCategory;
        const requiresPermit = String(args.requiresPermit) === 'true';

        const result = calculatePrice(weightKg, country, shippingType, category, requiresPermit);
        return {
          tool: toolName,
          data: {
            weightKg,
            country,
            shippingType,
            category,
            requiresPermit,
            price: result.price,
            currency: result.currency,
            breakdown: result.breakdown,
          },
        };
      }

      case 'get_manifest_history': {
        const period = String(args.period || 'last_5');
        const manifests = period === 'this_month'
          ? await getManifestsThisMonth(context.userId)
          : await getRecentManifests(context.userId, period === 'last_10' ? 10 : 5);

        const totalRows = manifests.reduce((s, m) => s + m.totalRows, 0);
        const totalRevenue = manifests.reduce((s, m) => s + m.totalPrice, 0);
        const avgRows = manifests.length > 0 ? Math.round(totalRows / manifests.length) : 0;

        // Build trend
        const trend = manifests.map((m, i) => ({
          index: i + 1,
          manifestNumber: m.manifestNumber,
          totalRows: m.totalRows,
          totalPrice: Math.round(m.totalPrice * 100) / 100,
          processedAt: m.processedAt,
          topCustomer: m.topCustomers?.[0] || null,
        }));

        // Volume trend direction
        let trendDir = 'stable';
        if (manifests.length >= 2) {
          const latest = manifests[0].totalRows;
          const prev = manifests[1].totalRows;
          const change = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
          if (Math.abs(change) >= 5) trendDir = change > 0 ? 'increasing' : 'decreasing';
        }

        return {
          tool: toolName,
          data: {
            period,
            count: manifests.length,
            totalRows,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            avgRowsPerManifest: avgRows,
            trendDirection: trendDir,
            manifests: trend,
          },
        };
      }

      case 'analyze_current_manifest': {
        const manifest = context.currentManifest;
        if (!manifest || !manifest.rows || manifest.rows.length === 0) {
          return {
            tool: toolName,
            data: {
              available: false,
              message: 'No hay un manifiesto cargado en la sesión actual. Por favor sube un archivo primero.',
            },
          };
        }

        const rows = manifest.rows;
        // Weight stats — avoid Math.max/min spread which overflows the stack for large arrays
        let minWeight = Infinity, maxWeight = -Infinity, weightSum = 0, weightCount = 0;
        const weights: number[] = [];
        for (const r of rows) {
          const w = Number(r.peso || r.weight || r.Weight || 0);
          if (w > 0) {
            weights.push(w);
            weightSum += w;
            weightCount++;
            if (w > maxWeight) maxWeight = w;
            if (w < minWeight) minWeight = w;
          }
        }
        if (weightCount === 0) { minWeight = 0; maxWeight = 0; }
        const avgWeight = weightCount > 0 ? weightSum / weightCount : 0;

        // Customer distribution
        const custMap = new Map<string, number>();
        for (const r of rows) {
          const sl = String(r.slCode || r.sl_code || '');
          if (sl) custMap.set(sl, (custMap.get(sl) || 0) + 1);
        }
        const topCustomers = Array.from(custMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([slCode, count]) => ({ slCode, count }));

        // Price stats
        const prices = rows.map(r => Number(r.price || r.precio || 0)).filter(p => p > 0);
        const totalPrice = prices.reduce((a, b) => a + b, 0);

        return {
          tool: toolName,
          data: {
            available: true,
            manifestNumber: manifest.manifestNumber,
            manifestType: manifest.manifestType,
            totalRows: manifest.summary.totalRows,
            processedRows: manifest.summary.processedRows,
            totalPrice: Math.round(totalPrice * 100) / 100,
            customersMatched: manifest.summary.customersMatched,
            unmatched: manifest.summary.totalRows - manifest.summary.customersMatched,
            namesCorrections: manifest.summary.namesCorrections,
            weightCorrections: manifest.summary.weightCorrections,
            weightStats: {
              avg: Math.round(avgWeight * 1000) / 1000,
              max: maxWeight,
              min: minWeight,
              count: weights.length,
            },
            topCustomers,
            priceStats: {
              total: Math.round(totalPrice * 100) / 100,
              avg: prices.length > 0 ? Math.round((totalPrice / prices.length) * 100) / 100 : 0,
              count: prices.length,
            },
          },
        };
      }

      case 'track_package': {
        const tn = String(args.trackingNumber || '').trim();
        if (!tn) {
          return { tool: toolName, data: { found: false, message: 'Tracking number is required.' } };
        }

        // Auto-detect Colombia format: exactly 3 uppercase letters + 7 digits (ALA2500185, BOG1980256)
        if (/^[A-Z]{3}\d{7}$/i.test(tn)) {
          const raw = await firebaseApi.colombia.track(tn.toUpperCase());
          if (!raw.success) {
            return { tool: toolName, data: { found: false, provider: 'colombia', error: raw.error || 'Colombia tracking no disponible' } };
          }
          const r = raw.data as Record<string, unknown>;
          return {
            tool: toolName,
            data: {
              found: r.found ?? false,
              provider: 'colombia',
              providerName: 'Colombia (Ticabox)',
              trackingNumber: r.trackingNumber ?? tn,
              statusCode: r.statusCode ?? '',
              statusMessage: r.statusMessage ?? '',
              manifestId: r.manifestId ?? null,
              lastUpdate: r.lastUpdate ?? '',
              events: ((r.events as unknown[]) ?? []).slice(-10),
              mensaje: r.mensaje ?? '',
            },
          };
        }

        const result = await mlTrackPackage(tn);
        if (!result.found) {
          return { tool: toolName, data: result };
        }
        // Proxy now returns a flat response — no nested packageInfo
        const r = result as unknown as Record<string, unknown>;
        const events = (r.events as unknown[]) || result.events || [];
        return {
          tool: toolName,
          data: {
            found: true,
            trackingNumber: r.trackingNumber ?? result.trackingNumber,
            destination: r.destination ?? '',
            destinationFull: r.destinationFull ?? '',
            shipper: r.shipper ?? '',
            shipperDescription: r.shipperDescription ?? '',
            weight: r.weight ?? 0,
            pieces: r.pieces ?? 0,
            customerCode: r.customerCode ?? '',
            customerName: r.customerName ?? '',
            manifestId: r.manifestId ?? '',
            description: r.description ?? '',
            invoice: r.invoice ?? '',
            requiresPermit: r.requiresPermit ?? false,
            missingDestination: r.missingDestination ?? false,
            eventCount: (events as unknown[]).length,
            latestEvent: r.latestEvent ?? null,
            events: (events as unknown[]).slice(-10),
          },
        };
      }

      case 'list_mlocker_manifests': {
        const result = await mlListManifests({
          length: Number(args.length) || 10,
          manifestNumber: args.manifestNumber ? String(args.manifestNumber) : undefined,
          description: args.description ? String(args.description) : undefined,
          startDate: args.startDate ? String(args.startDate) : undefined,
          endDate: args.endDate ? String(args.endDate) : undefined,
          status: args.status !== undefined ? Number(args.status) : undefined,
        });
        // Enrich each manifest with Firestore processed status (parallel, non-blocking)
        let processedStatus: Record<string, ManifestProcessedStatus> = {};
        if (result.manifests?.length) {
          const ids = result.manifests.map(m => m.id).filter(Boolean);
          processedStatus = await getManifestProcessedStatus(ids).catch(() => ({}));
        }
        // Tier 4: For fused manifests where Tier 3 failed (no manifestNumber pointer in
        // Firestore stub), use the MLocker portal API as the authoritative source.
        // Fire-and-forget — does NOT block the manifest list response.
        // Self-heals Firestore so the realtime subscription in ManifestCards picks
        // up the correct count and future reads skip this lookup entirely.
        const fusedZero = result.manifests?.filter(m =>
          processedStatus[m.id]?.mergedInto && !processedStatus[m.id]?.totalPackages
        ) ?? [];
        if (fusedZero.length > 0) {
          Promise.allSettled(
            fusedZero.map(async m => {
              try {
                const detail = await mlGetManifestDetail(m.id);
                const count = detail.totalPackages || detail.packageCount || detail.packages?.length || 0;
                if (count > 0) {
                  setDoc(doc(collection(db, 'manifests'), m.id), { totalPackages: count }, { merge: true }).catch(() => {});
                }
              } catch { /* non-fatal: portal may be unavailable */ }
            })
          ).catch(() => {});
        }
        const enrichedManifests = result.manifests?.map((m) => ({
          ...m,
          processed: !!processedStatus[m.id],
          totalPackages: processedStatus[m.id]?.totalPackages,
          processedAt: processedStatus[m.id]?.processedAt,
          mergedInto: processedStatus[m.id]?.mergedInto,
        }));
        return {
          tool: toolName,
          data: {
            total: result.total,
            count: result.count,
            manifests: enrichedManifests,
          },
        };
      }

      case 'get_mlocker_manifest_detail': {
        const manifestId = String(args.manifestId || '').trim();
        if (!manifestId) {
          return { tool: toolName, data: { error: 'manifestId is required' } };
        }
        const detail = await mlGetManifestDetail(manifestId);
        const offerProcessing = String(args.offerProcessing || 'true') === 'true';
        return {
          tool: toolName,
          data: {
            manifestId: detail.manifestId,
            packageCount: detail.packageCount,
            totalWeight: detail.totalWeight,
            totalPackages: detail.totalPackages,
            // Send first 20 rows as preview to Gemini; full list is large
            packagePreview: detail.packages.slice(0, 20),
            hasMore: detail.packages.length > 20,
            offerProcessing,
            processingNote: offerProcessing
              ? '¿Deseas procesar este manifiesto para calcular precios, emparejar clientes y hacer match? Puedo iniciar el procesamiento ahora.'
              : undefined,
            // Include full packages for the client to act on
            _fullPackages: detail.packages,
          },
        };
      }

      case 'download_mlocker_manifest_excel': {
        const manifestId = String(args.manifestId || '').trim();
        if (!manifestId) {
          return { tool: toolName, data: { error: 'manifestId is required' } };
        }
        const excelType = (String(args.excelType || 'summary') === 'detail' ? 'detail' : 'summary') as 'summary' | 'detail';
        const excelResult = await mlDownloadManifestExcel(manifestId, excelType);
        // Trigger download in browser (client-side side effect)
        if (excelResult.success) {
          triggerExcelDownload(excelResult);
        }
        return {
          tool: toolName,
          data: {
            success: excelResult.success,
            manifestId,
            excelType,
            filename: excelResult.filename || `manifiesto_${manifestId}.xlsx`,
            message: excelResult.success
              ? `Descarga iniciada: ${excelResult.filename || `manifiesto_${manifestId}.xlsx`}`
              : 'No se pudo generar el archivo Excel.',
          },
        };
      }

      case 'query_customers': {
        const max = Math.min(Number(args.maxResults) || 100, 500);
        const hasFilters = !!(args.ruta || args.status || args.tier || args.searchText);
        const cacheKey = `qcust:${args.ruta || ''}:${args.status || ''}:${args.tier || ''}:${args.searchText || ''}:${max}`;
        const cached = cacheGet<unknown>(cacheKey);
        if (cached) return { tool: toolName, data: cached };

        // Build Firestore constraints for indexable fields
        const fsConstraints: ReturnType<typeof where>[] = [];
        if (args.status) fsConstraints.push(where('status', '==', args.status));
        if (args.tier) fsConstraints.push(where('tier', '==', args.tier));

        // Run document fetch + server-side aggregate count in parallel.
        // getCountFromServer() is a single aggregation read (does NOT read documents)
        // so it's extremely cheap — perfect for accurate totals on large collections.
        const baseQuery = query(collection(db, 'customers'), ...fsConstraints);
        const [snap, countSnap] = await Promise.all([
          getDocs(query(baseQuery, fsLimit(max))),
          getCountFromServer(baseQuery),
        ]);
        const totalInCollection = countSnap.data().count;

        let customers = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            slCode: data.slCode || '',
            fullName: data.fullName || '',
            email: data.email || '',
            phone: data.phone || '',
            dni: data.dni || '',
            ruta: data.ruta || data.preferredRouteId || '',
            status: data.status || 'active',
            tier: data.tier || 'basic',
            consolidationEnabled: data.consolidationEnabled || false,
          };
        });

        // Client-side filters for non-indexable fields
        if (args.ruta) {
          const rutaLower = String(args.ruta).toLowerCase();
          customers = customers.filter(c => c.ruta?.toLowerCase().includes(rutaLower));
        }
        if (args.searchText) {
          const q2 = String(args.searchText).toLowerCase();
          customers = customers.filter(c =>
            c.fullName?.toLowerCase().includes(q2) ||
            c.email?.toLowerCase().includes(q2) ||
            c.dni?.toLowerCase().includes(q2) ||
            c.slCode?.toLowerCase().includes(q2)
          );
        }

        const result = {
          // totalInCollection = EXACT total from Firestore aggregation (no document reads)
          // count = number returned in this sample (limited by maxResults)
          totalInCollection,
          count: customers.length,
          sampleLimited: !hasFilters && customers.length >= max,
          customers: customers.slice(0, 200),
        };
        cacheSet(cacheKey, result);
        return { tool: toolName, data: result };
      }

      case 'update_customer': {
        const slCode = String(args.slCode || '').toUpperCase().trim();
        if (!slCode) return { tool: toolName, error: 'slCode es requerido', data: null };

        let updatesObj: Record<string, unknown> = {};
        try {
          updatesObj = JSON.parse(String(args.updates || '{}')) as Record<string, unknown>;
        } catch {
          return { tool: toolName, error: 'updates debe ser un JSON válido', data: null };
        }

        // Field allowlist — never allow sensitive auth/system fields
        const ALLOWED_CUSTOMER_FIELDS = new Set([
          'fullName', 'firstName', 'lastName', 'email', 'phone', 'dni',
          'ruta', 'status', 'tier', 'membershipTier', 'notes',
          'consolidationEnabled', 'address', 'city', 'country', 'zipCode',
        ]);
        const rejected = Object.keys(updatesObj).filter(k => !ALLOWED_CUSTOMER_FIELDS.has(k));
        if (rejected.length > 0) {
          return { tool: toolName, error: `Campos no permitidos: ${rejected.join(', ')}`, data: null };
        }

        // Find the customer doc
        const snap = await getDocs(query(collection(db, 'customers'), where('slCode', '==', slCode)));
        if (snap.empty) {
          return { tool: toolName, data: { found: false, message: `No se encontró cliente con slCode ${slCode}` } };
        }
        const docRef = snap.docs[0].ref;
        const currentData = snap.docs[0].data();

        // Build diff for preview
        const diff: Record<string, { from: unknown; to: unknown }> = {};
        for (const [k, v] of Object.entries(updatesObj)) {
          if (currentData[k] !== v) diff[k] = { from: currentData[k] ?? null, to: v };
        }

        const isConfirmed = String(args.confirm) === 'true';

        if (!isConfirmed) {
          // Preview mode — return diff without writing
          return {
            tool: toolName,
            data: {
              action: 'preview',
              slCode,
              docId: snap.docs[0].id,
              customerName: currentData.fullName || '',
              changes: diff,
              changesCount: Object.keys(diff).length,
              message: Object.keys(diff).length === 0
                ? 'No hay cambios — los valores ya son iguales.'
                : `Se modificarán ${Object.keys(diff).length} campo(s). ¿Confirmas los cambios?`,
              requiresConfirmation: true,
            },
          };
        }

        // Confirmed — write to Firestore
        if (Object.keys(updatesObj).length === 0) {
          return { tool: toolName, data: { action: 'noop', message: 'No hay campos para actualizar.' } };
        }
        // If docId was passed from the preview step, use direct reference (0 reads).
        // Otherwise fall back to the already-fetched docRef.
        const writeRef = args.docId
          ? doc(db, 'customers', String(args.docId))
          : docRef;
        await updateDoc(writeRef, { ...updatesObj, updatedAt: serverTimestamp() });
        return {
          tool: toolName,
          data: {
            action: 'updated',
            slCode,
            customerName: currentData.fullName || '',
            updatedFields: Object.keys(updatesObj),
            diff,
            message: `Cliente ${slCode} actualizado correctamente.`,
          },
        };
      }

      case 'update_package': {
        const trackingNumber = String(args.trackingNumber || '').trim();
        if (!trackingNumber) return { tool: toolName, error: 'trackingNumber es requerido', data: null };

        let updatesObj: Record<string, unknown> = {};
        try {
          updatesObj = JSON.parse(String(args.updates || '{}')) as Record<string, unknown>;
        } catch {
          return { tool: toolName, error: 'updates debe ser un JSON válido', data: null };
        }

        // Field allowlist
        const ALLOWED_PACKAGE_FIELDS = new Set([
          'status', 'description', 'descripcion', 'weight', 'peso',
          'notes', 'manifestNumber', 'customerName', 'ruta',
        ]);
        const rejected = Object.keys(updatesObj).filter(k => !ALLOWED_PACKAGE_FIELDS.has(k));
        if (rejected.length > 0) {
          return { tool: toolName, error: `Campos no permitidos: ${rejected.join(', ')}`, data: null };
        }

        // Find package by tracking number — try both field names in parallel (1 round-trip)
        const isConfirmedEarly = String(args.confirm) === 'true' && !!args.docId;
        let pkgRef = isConfirmedEarly ? doc(db, 'packages', String(args.docId)) : null;
        let currentData: Record<string, unknown> = {};
        if (!isConfirmedEarly) {
          const [snap1, snap2] = await Promise.all([
            getDocs(query(collection(db, 'packages'), where('tracking', '==', trackingNumber))),
            getDocs(query(collection(db, 'packages'), where('trackingNumber', '==', trackingNumber))),
          ]);
          const docSnap = !snap1.empty ? snap1 : snap2;
          if (docSnap.empty) {
            return { tool: toolName, data: { found: false, message: `No se encontró paquete con tracking ${trackingNumber}` } };
          }
          pkgRef = docSnap.docs[0].ref;
          currentData = docSnap.docs[0].data() as Record<string, unknown>;
        }

        // Build diff (only when we have currentData from a full lookup)
        const diff: Record<string, { from: unknown; to: unknown }> = {};
        if (!isConfirmedEarly) {
          for (const [k, v] of Object.entries(updatesObj)) {
            if (currentData[k] !== v) diff[k] = { from: currentData[k] ?? null, to: v };
          }
        }

        const isConfirmed = isConfirmedEarly || String(args.confirm) === 'true';

        if (!isConfirmed) {
          return {
            tool: toolName,
            data: {
              action: 'preview',
              trackingNumber,
              docId: pkgRef!.id,
              customerName: currentData.customerName || currentData.nombre || '',
              slCode: currentData.slCode || '',
              currentStatus: currentData.status || '',
              changes: diff,
              changesCount: Object.keys(diff).length,
              message: Object.keys(diff).length === 0
                ? 'No hay cambios — los valores ya son iguales.'
                : `Se modificarán ${Object.keys(diff).length} campo(s). ¿Confirmas los cambios?`,
              requiresConfirmation: true,
            },
          };
        }

        if (Object.keys(updatesObj).length === 0) {
          return { tool: toolName, data: { action: 'noop', message: 'No hay campos para actualizar.' } };
        }
        await updateDoc(pkgRef!, { ...updatesObj, updatedAt: serverTimestamp() });
        return {
          tool: toolName,
          data: {
            action: 'updated',
            trackingNumber,
            customerName: currentData.customerName || currentData.nombre || '',
            updatedFields: Object.keys(updatesObj),
            diff,
            message: `Paquete ${trackingNumber} actualizado correctamente.`,
          },
        };
      }

      case 'query_collection': {
        // Allowlist to prevent access to sensitive collections
        const ALLOWED: Record<string, string> = {
          customers: 'customers',
          packages: 'packages',
          invoices: 'invoices',
          routes: 'routes',
          manifests: 'manifests',
        };
        const collName = String(args.collection || '');
        if (!ALLOWED[collName]) {
          return { tool: toolName, error: `Collection "${collName}" is not allowed. Use: ${Object.keys(ALLOWED).join(', ')}`, data: null };
        }

        // Parse filters JSON
        type FilterDef = { field: string; op: string; value: unknown };
        let filterDefs: FilterDef[] = [];
        if (args.filters) {
          try {
            filterDefs = JSON.parse(String(args.filters)) as FilterDef[];
          } catch {
            return { tool: toolName, error: 'Invalid filters JSON. Must be an array of {field, op, value} objects.', data: null };
          }
        }

        const max = Math.min(Number(args.maxResults) || 100, 500);
        const returnFieldSet = args.returnFields
          ? new Set(String(args.returnFields).split(',').map(s => s.trim()).filter(Boolean))
          : null;

        // Separate Firestore-compatible filters from client-side "contains" filters
        const fsFilters: FilterDef[] = filterDefs.filter(f => f.op !== 'contains');
        const clientFilters: FilterDef[] = filterDefs.filter(f => f.op === 'contains');

        const fsConstraints: ReturnType<typeof where>[] = fsFilters.map(f =>
          where(f.field, f.op as '==' | '!=' | '>' | '>=' | '<' | '<=', f.value)
        );

        const orderField = args.orderByField ? String(args.orderByField) : null;
        const orderDir = String(args.orderDirection || 'asc') as 'asc' | 'desc';
        const qParts: Parameters<typeof query>[1][] = [...fsConstraints];
        if (orderField) qParts.push(orderBy(orderField, orderDir));
        qParts.push(fsLimit(max));

        const q = query(collection(db, collName), ...qParts);
        const snap = await getDocs(q);

        let docs = snap.docs.map(d => {
          const raw = d.data();
          // Convert Timestamps to ISO strings
          const data: Record<string, unknown> = { id: d.id };
          for (const [k, v] of Object.entries(raw)) {
            data[k] = v instanceof Timestamp ? v.toDate().toISOString() : v;
          }
          if (returnFieldSet) {
            const projected: Record<string, unknown> = { id: d.id };
            for (const f of returnFieldSet) { if (f in data) projected[f] = data[f]; }
            return projected;
          }
          return data;
        });

        // Client-side "contains" filters
        for (const f of clientFilters) {
          const valLower = String(f.value).toLowerCase();
          docs = docs.filter(d => String((d as Record<string,unknown>)[f.field] ?? '').toLowerCase().includes(valLower));
        }

        return {
          tool: toolName,
          data: {
            collection: collName,
            count: docs.length,
            records: docs,
            filtersApplied: filterDefs,
          },
        };
      }

      case 'generate_chart': {
        const chartType = String(args.chartType || 'bar') as 'line' | 'bar' | 'area' | 'pie';
        const metric = String(args.metric || '');
        const topN = Math.min(Number(args.topN) || 10, 20);
        const customTitle = args.title ? String(args.title) : '';

        // ── Date range helpers ───────────────────────────────────────────────
        const dateFrom = args.dateFrom ? new Date(args.dateFrom as string) : (() => {
          const d = new Date(); d.setMonth(d.getMonth() - 6); d.setDate(1); return d;
        })();
        const dateTo = args.dateTo ? new Date(args.dateTo as string) : new Date();

        // ── Helpers: group docs by month / day (accepts price OR amount) ──────
        const groupByMonth = (docs: { price?: number; amount?: number; createdAt: Date }[]) => {
          const map = new Map<string, { revenue: number; count: number }>();
          for (const d of docs) {
            const key = `${d.createdAt.getFullYear()}-${String(d.createdAt.getMonth() + 1).padStart(2, '0')}`;
            const e = map.get(key) || { revenue: 0, count: 0 };
            e.revenue += d.amount ?? d.price ?? 0;
            e.count++;
            map.set(key, e);
          }
          return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
        };

        const groupByDay = (docs: { price?: number; amount?: number; createdAt: Date }[]) => {
          const map = new Map<string, { revenue: number; count: number }>();
          for (const d of docs) {
            const key = d.createdAt.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' });
            const e = map.get(key) || { revenue: 0, count: 0 };
            e.revenue += d.amount ?? d.price ?? 0;
            e.count++;
            map.set(key, e);
          }
          return Array.from(map.entries());
        };

        // ── Fetch packages in range ───────────────────────────────────────────
        const fetchPackages = async () => {
          const q = query(
            collection(db, 'packages'),
            where('createdAt', '>=', Timestamp.fromDate(dateFrom)),
            where('createdAt', '<=', Timestamp.fromDate(dateTo)),
            fsLimit(2000)
          );
          const snap = await getDocs(q);
          return snap.docs.map(d => {
            const data = d.data();
            const ts = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || 0);
            return {
              price: Number(data.price || data.precio || 0),
              status: String(data.status || 'unknown'),
              slCode: String(data.slCode || data.customerSlCode || ''),
              customerName: String(data.customerName || data.nombre || ''),
              ruta: String(data.ruta || ''),
              createdAt: ts,
            };
          });
        };

        // ── Fetch invoices in range ───────────────────────────────────────────
        const fetchInvoices = async () => {
          const q = query(
            collection(db, 'invoices'),
            where('createdAt', '>=', Timestamp.fromDate(dateFrom)),
            where('createdAt', '<=', Timestamp.fromDate(dateTo)),
            fsLimit(2000)
          );
          const snap = await getDocs(q);
          return snap.docs.map(d => {
            const data = d.data();
            const ts = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || 0);
            return {
              amount: Number(data.total || data.amount || data.totalAmount || 0),
              slCode: String(data.clientSlCode || data.slCode || data.clientId || '').toUpperCase().trim(),
              customerName: String(data.clientName || data.customerName || ''),
              createdAt: ts,
            };
          });
        };

        // ── Build chart data per metric ───────────────────────────────────────
        type ChartPoint = { label: string; [k: string]: string | number };
        let chartData: { type: 'line' | 'bar' | 'area' | 'pie'; title: string; subtitle?: string; series: { key: string; label: string; color?: string }[]; data: ChartPoint[]; xAxisLabel?: string; yAxisLabel?: string; insight?: string } | null = null;

        switch (metric) {
          case 'revenue_by_month': {
            const invs = await fetchInvoices();
            const grouped = groupByMonth(invs);
            if (grouped.length < 1) break;
            const total = grouped.reduce((s, [, v]) => s + v.revenue, 0);
            const last = grouped[grouped.length - 1][1].revenue;
            const prev = grouped.length >= 2 ? grouped[grouped.length - 2][1].revenue : 0;
            const trend = prev > 0 ? ((last - prev) / prev * 100).toFixed(1) : null;
            chartData = {
              type: chartType,
              title: customTitle || 'Ingresos por Mes',
              subtitle: `${grouped.length} ${grouped.length === 1 ? 'mes' : 'meses'} · Total $${total.toFixed(2)}`,
              series: [{ key: 'revenue', label: 'Ingresos USD', color: '#6366f1' }],
              data: grouped.map(([label, v]) => ({ label, revenue: Math.round(v.revenue * 100) / 100 })),
              xAxisLabel: 'Mes', yAxisLabel: 'USD',
              insight: trend ? `Último mes ${parseFloat(trend) >= 0 ? '+' : ''}${trend}% vs mes anterior` : undefined,
            };
            break;
          }
          case 'packages_by_month': {
            const pkgs = await fetchPackages();
            const grouped = groupByMonth(pkgs);
            if (grouped.length < 1) break;
            chartData = {
              type: chartType,
              title: customTitle || 'Volumen de Paquetes por Mes',
              series: [{ key: 'count', label: 'Paquetes', color: '#10b981' }],
              data: grouped.map(([label, v]) => ({ label, count: v.count })),
              xAxisLabel: 'Mes', yAxisLabel: 'Paquetes',
            };
            break;
          }
          case 'packages_by_day': {
            const pkgs = await fetchPackages();
            const grouped = groupByDay(pkgs);
            chartData = {
              type: chartType,
              title: customTitle || 'Paquetes por Día',
              series: [{ key: 'count', label: 'Paquetes', color: '#10b981' }],
              data: grouped.map(([label, v]) => ({ label, count: v.count })),
            };
            break;
          }
          case 'revenue_by_day': {
            const invs = await fetchInvoices();
            const grouped = groupByDay(invs);
            if (grouped.length < 1) break;
            const total = grouped.reduce((s, [, v]) => s + v.revenue, 0);
            chartData = {
              type: chartType,
              title: customTitle || 'Ingresos por Día',
              subtitle: `${grouped.length} días · Total $${total.toFixed(2)}`,
              series: [{ key: 'revenue', label: 'Ingresos USD', color: '#6366f1' }],
              data: grouped.map(([label, v]) => ({ label, revenue: Math.round(v.revenue * 100) / 100 })),
              yAxisLabel: 'USD',
            };
            break;
          }
          case 'packages_by_status': {
            const pkgs = await fetchPackages();
            const map = new Map<string, number>();
            for (const p of pkgs) map.set(p.status, (map.get(p.status) || 0) + 1);
            const entries = Array.from(map.entries()).sort(([, a], [, b]) => b - a);
            chartData = {
              type: 'pie',
              title: customTitle || 'Distribución de Paquetes por Estado',
              series: [{ key: 'value', label: 'Paquetes', color: '#6366f1' }],
              data: entries.map(([label, value]) => ({ label, value })),
            };
            break;
          }
          case 'packages_by_route': {
            const pkgs = await fetchPackages();
            const map = new Map<string, number>();
            for (const p of pkgs) if (p.ruta) map.set(p.ruta, (map.get(p.ruta) || 0) + 1);
            const entries = Array.from(map.entries()).sort(([, a], [, b]) => b - a).slice(0, topN);
            chartData = {
              type: chartType,
              title: customTitle || `Top ${topN} Rutas por Volumen`,
              series: [{ key: 'count', label: 'Paquetes', color: '#f59e0b' }],
              data: entries.map(([label, count]) => ({ label, count })),
            };
            break;
          }
          case 'revenue_by_route': {
            // Join packages (for ruta) with invoices (for real billing amount) by slCode
            const [pkgs, invs] = await Promise.all([fetchPackages(), fetchInvoices()]);
            const slToRuta = new Map<string, string>();
            for (const p of pkgs) if (p.slCode && p.ruta) slToRuta.set(p.slCode, p.ruta);
            const routeRevMap = new Map<string, number>();
            for (const inv of invs) {
              const ruta = slToRuta.get(inv.slCode) || '';
              if (!ruta) continue;
              routeRevMap.set(ruta, (routeRevMap.get(ruta) || 0) + inv.amount);
            }
            // Fall back to package price when no invoice matches a route
            if (routeRevMap.size === 0) {
              for (const p of pkgs) if (p.ruta) routeRevMap.set(p.ruta, (routeRevMap.get(p.ruta) || 0) + (p.price || 0));
            }
            const entries = Array.from(routeRevMap.entries()).sort(([, a], [, b]) => b - a).slice(0, topN);
            if (entries.length < 1) break;
            chartData = {
              type: chartType,
              title: customTitle || `Top ${topN} Rutas por Ingreso`,
              series: [{ key: 'revenue', label: 'Ingresos USD', color: '#f59e0b' }],
              data: entries.map(([label, revenue]) => ({ label, revenue: Math.round(revenue * 100) / 100 })),
              yAxisLabel: 'USD',
            };
            break;
          }
          case 'top_customers_by_volume': {
            const pkgs = await fetchPackages();
            const map = new Map<string, { name: string; count: number }>();
            for (const p of pkgs) {
              if (!p.slCode) continue;
              const e = map.get(p.slCode) || { name: p.customerName || p.slCode, count: 0 };
              e.count++;
              map.set(p.slCode, e);
            }
            const entries = Array.from(map.entries()).sort(([, a], [, b]) => b.count - a.count).slice(0, topN);
            chartData = {
              type: chartType,
              title: customTitle || `Top ${topN} Clientes por Volumen`,
              series: [{ key: 'count', label: 'Paquetes', color: '#8b5cf6' }],
              data: entries.map(([slCode, v]) => ({ label: v.name || slCode, count: v.count })),
            };
            break;
          }
          case 'top_customers_by_revenue': {
            const invs = await fetchInvoices();
            const map = new Map<string, { name: string; revenue: number }>();
            for (const inv of invs) {
              if (!inv.slCode) continue;
              const e = map.get(inv.slCode) || { name: inv.customerName || inv.slCode, revenue: 0 };
              e.revenue += inv.amount;
              map.set(inv.slCode, e);
            }
            const entries = Array.from(map.entries()).sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, topN);
            chartData = {
              type: chartType,
              title: customTitle || `Top ${topN} Clientes por Ingreso`,
              series: [{ key: 'revenue', label: 'Ingresos USD', color: '#8b5cf6' }],
              data: entries.map(([slCode, v]) => ({ label: v.name || slCode, revenue: Math.round(v.revenue * 100) / 100 })),
              yAxisLabel: 'USD',
            };
            break;
          }
        }

        if (!chartData || chartData.data.length === 0) {
          return {
            tool: toolName,
            data: { chartData: null, message: 'No hay suficientes datos para generar el gráfico en el período seleccionado.' },
          };
        }

        return { tool: toolName, data: { chartData } };
      }

      case 'query_match_intelligence': {
        const qmiType = String(args.type || 'recent_failures');

        if (qmiType === 'confirmed_matches') {
          const cached = cacheGet<unknown>('match_intelligence_confirmed');
          if (cached) return { tool: toolName, data: cached };
          const q = query(
            collection(db, 'match_feedback'),
            orderBy('hitCount', 'desc'),
            fsLimit(30)
          );
          const snap = await getDocs(q);
          const matches = snap.docs.map(d => {
            const data = d.data();
            return {
              manifestName: data.manifestName as string,
              canonicalName: data.fullName as string,
              slCode: data.slCode as string,
              hitCount: (data.hitCount as number) || 0,
              source: data.source as string,
              aiConfidence: data.aiConfidence as number | undefined,
            };
          });
          const result = { type: qmiType, matches, total: matches.length };
          cacheSet('match_intelligence_confirmed', result);
          return { tool: toolName, data: result };
        }

        if (qmiType === 'match_rate_trend') {
          const cached = cacheGet<unknown>('match_intelligence_trend');
          if (cached) return { tool: toolName, data: cached };
          const q = query(
            collection(db, 'manifest_learning'),
            orderBy('processedAt', 'desc'),
            fsLimit(20)
          );
          const snap = await getDocs(q);
          const trend = snap.docs.map(d => {
            const data = d.data();
            const ts = data.processedAt;
            const date = ts instanceof Timestamp ? ts.toDate().toISOString().split('T')[0] : '';
            const total = (data.totalRows as number) || 0;
            const unmatched = (data.unmatchedRows as number) || (data.unmatchedNames as string[] || []).length;
            return {
              date,
              matchRate: total > 0 ? Math.round(((total - unmatched) / total) * 1000) / 10 : 0,
              totalRows: total,
              unmatchedRows: unmatched,
              manifestType: (data.manifestType as string) || 'unknown',
            };
          }).reverse();
          const result = { type: qmiType, trend };
          cacheSet('match_intelligence_trend', result);
          return { tool: toolName, data: result };
        }

        if (qmiType === 'top_patterns') {
          const cached = cacheGet<unknown>('match_intelligence_patterns');
          if (cached) return { tool: toolName, data: cached };
          const q = query(collection(db, 'manifest_learning_patterns'), fsLimit(15));
          const snap = await getDocs(q);
          const patterns = snap.docs.map(d => {
            const data = d.data();
            const total = (data.totalRows as number) || 0;
            const unmatched = (data.totalUnmatched as number) || 0;
            return {
              manifestType: (data.manifestType as string) || d.id,
              totalManifests: (data.totalManifests as number) || 0,
              totalRows: total,
              totalUnmatched: unmatched,
              avgMatchRate: total > 0 ? `${Math.round(((total - unmatched) / total) * 1000) / 10}%` : 'N/A',
            };
          });
          const result = { type: qmiType, patterns };
          cacheSet('match_intelligence_patterns', result);
          return { tool: toolName, data: result };
        }

        // Default: recent_failures
        {
          const cached = cacheGet<unknown>('match_intelligence_failures');
          if (cached) return { tool: toolName, data: cached };
          const q = query(
            collection(db, 'manifest_learning'),
            orderBy('processedAt', 'desc'),
            fsLimit(10)
          );
          const snap = await getDocs(q);
          const allUnmatched: string[] = [];
          const allLowScore: string[] = [];
          let totalMatchRate = 0;
          let rateCount = 0;
          snap.docs.forEach(d => {
            const data = d.data();
            allUnmatched.push(...((data.unmatchedNames as string[]) || []));
            allLowScore.push(...((data.lowScoreNames as string[]) || []));
            const total = (data.totalRows as number) || 0;
            const unmatched = (data.unmatchedRows as number) || (data.unmatchedNames as string[] || []).length;
            if (total > 0) { totalMatchRate += (total - unmatched) / total * 100; rateCount++; }
          });
          const freq = new Map<string, number>();
          allUnmatched.forEach(n => freq.set(n, (freq.get(n) || 0) + 1));
          const topFailed = Array.from(freq.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 15)
            .map(([name, occurrences]) => ({ name, occurrences }));
          const result = {
            type: qmiType,
            avgMatchRate: rateCount > 0 ? `${(totalMatchRate / rateCount).toFixed(1)}%` : null,
            topUnmatchedNames: topFailed,
            recentLowScoreNames: [...new Set(allLowScore)].slice(0, 10),
            manifestsAnalyzed: snap.docs.length,
          };
          cacheSet('match_intelligence_failures', result);
          return { tool: toolName, data: result };
        }
      }

      case 'get_package_detail': {
        const trackingId = String(args.trackingId || '').trim().toUpperCase();
        if (!trackingId) return { tool: toolName, data: { error: 'trackingId is required' } };

        const snap = await getDoc(doc(collection(db, 'packages'), trackingId));
        if (!snap.exists()) {
          return { tool: toolName, data: { found: false, trackingId, message: `No se encontró el paquete ${trackingId} en el sistema.` } };
        }
        const pd = snap.data();
        return {
          tool: toolName,
          data: {
            found: true,
            trackingId,
            status: pd.status || '',
            slCode: pd.slCode || '',
            customerName: pd.customerName || pd.nombre || '',
            manifestNumber: pd.manifestNumber || '',
            manifestType: pd.manifestType || '',
            weight: pd.weight || pd.peso || 0,
            price: pd.price || pd.precio || 0,
            description: pd.description || pd.descripcion || '',
            ruta: pd.ruta || '',
            requiresPermit: pd.requiresPermit || false,
            isConsolidated: pd.isConsolidated || false,
            manuallyUpdated: pd.manuallyUpdated || false,
            statusLockedAt: pd.statusLockedAt || null,
            createdAt: pd.createdAt instanceof Timestamp ? pd.createdAt.toDate().toISOString() : pd.createdAt || '',
            updatedAt: pd.updatedAt instanceof Timestamp ? pd.updatedAt.toDate().toISOString() : pd.updatedAt || '',
          },
        };
      }

      case 'get_invoice_detail': {
        const invoiceId = String(args.invoiceId || '').trim();
        const slCode = String(args.slCode || '').trim().toUpperCase();
        if (!invoiceId && !slCode) return { tool: toolName, data: { error: 'invoiceId or slCode is required' } };

        const invoicesRef = collection(db, 'invoices');
        let invData: Record<string, unknown> | null = null;
        let invId = '';

        if (invoiceId) {
          const s = await getDoc(doc(invoicesRef, invoiceId));
          if (s.exists()) { invData = s.data() as Record<string, unknown>; invId = s.id; }
        }
        if (!invData && slCode) {
          const q = query(invoicesRef, where('slCode', '==', slCode), orderBy('createdAt', 'desc'), fsLimit(1));
          const listSnap = await getDocs(q);
          if (!listSnap.empty) { invData = listSnap.docs[0].data() as Record<string, unknown>; invId = listSnap.docs[0].id; }
        }

        if (!invData) {
          return { tool: toolName, data: { found: false, message: invoiceId ? `Factura ${invoiceId} no encontrada.` : `Sin facturas para ${slCode}.` } };
        }
        return {
          tool: toolName,
          data: {
            found: true,
            id: invId,
            slCode: invData.slCode || '',
            customerName: invData.customerName || '',
            total: invData.total || invData.amount || 0,
            status: invData.status || '',
            notes: invData.notes || '',
            items: invData.items || invData.packages || [],
            manifestNumber: invData.manifestNumber || '',
            createdAt: invData.createdAt instanceof Timestamp ? (invData.createdAt as Timestamp).toDate().toISOString() : invData.createdAt || '',
            dueDate: invData.dueDate || null,
            paidAt: invData.paidAt instanceof Timestamp ? (invData.paidAt as Timestamp).toDate().toISOString() : invData.paidAt || null,
          },
        };
      }

      case 'update_invoice': {
        const invoiceId = String(args.invoiceId || '').trim();
        const confirm = args.confirm === true || args.confirm === 'true';
        if (!invoiceId) return { tool: toolName, data: { error: 'invoiceId is required' } };

        const invRef = doc(collection(db, 'invoices'), invoiceId);
        const snap = await getDoc(invRef);
        if (!snap.exists()) return { tool: toolName, data: { error: `Factura ${invoiceId} no encontrada.` } };

        const cur = snap.data() as Record<string, unknown>;
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const updates: Record<string, unknown> = {};

        if (args.status !== undefined && args.status !== cur.status) {
          changes.status = { from: cur.status, to: args.status };
          updates.status = args.status;
        }
        if (args.notes !== undefined && args.notes !== cur.notes) {
          changes.notes = { from: cur.notes || '', to: args.notes };
          updates.notes = args.notes;
        }

        if (Object.keys(changes).length === 0) {
          return { tool: toolName, data: { message: 'No hay cambios que aplicar.', noChanges: true } };
        }
        if (!confirm) {
          return {
            tool: toolName,
            data: {
              preview: true,
              invoiceId,
              customerName: cur.customerName || '',
              changes,
              confirmationNeeded: `¿Confirmas los cambios en la factura ${invoiceId} de ${cur.customerName || ''}?`,
            },
          };
        }
        updates.updatedAt = serverTimestamp();
        await updateDoc(invRef, updates);
        return { tool: toolName, data: { success: true, invoiceId, applied: changes } };
      }

      case 'get_route_detail': {
        const routeName = String(args.routeName || '').trim();
        const statusFilter = args.statusFilter ? String(args.statusFilter) : undefined;
        const max = Math.min(Number(args.maxResults) || 50, 200);
        if (!routeName) return { tool: toolName, data: { error: 'routeName is required' } };

        const pkgsRef = collection(db, 'packages');
        const constraints: ReturnType<typeof where>[] = [where('ruta', '==', routeName)];
        if (statusFilter) constraints.push(where('status', '==', statusFilter));

        const [snap, totalSnap] = await Promise.all([
          getDocs(query(pkgsRef, ...constraints, orderBy('createdAt', 'desc'), fsLimit(max))),
          getCountFromServer(query(pkgsRef, ...constraints)),
        ]);

        const byStatus: Record<string, number> = {};
        const packages = snap.docs.map(d => {
          const rd = d.data();
          const st = rd.status || 'unknown';
          byStatus[st] = (byStatus[st] || 0) + 1;
          return {
            trackingId: d.id,
            slCode: rd.slCode || '',
            customerName: rd.customerName || rd.nombre || '',
            status: st,
            weight: rd.weight || rd.peso || 0,
            price: rd.price || rd.precio || 0,
            description: rd.description || '',
            requiresPermit: rd.requiresPermit || false,
            createdAt: rd.createdAt instanceof Timestamp ? rd.createdAt.toDate().toISOString() : rd.createdAt || '',
          };
        });
        const totalWeight = packages.reduce((s, p) => s + p.weight, 0);
        const totalRevenue = packages.reduce((s, p) => s + p.price, 0);

        return {
          tool: toolName,
          data: {
            routeName,
            statusFilter: statusFilter || 'all',
            totalPackages: totalSnap.data().count,
            returnedPackages: packages.length,
            byStatus,
            totalWeight: Math.round(totalWeight * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            packages,
          },
        };
      }

      case 'generate_shipping_label': {
        const slCode = String(args.slCode || '').trim().toUpperCase();
        if (!slCode) return { tool: toolName, data: { error: 'slCode is required' } };

        const hits = await searchCustomersLocal(slCode, { limit: 1 });
        if (!hits.length) return { tool: toolName, data: { found: false, message: `No se encontró cliente con código ${slCode}.` } };
        const cust = hits[0] as unknown as Record<string, unknown>;

        const q = query(
          collection(db, 'packages'),
          where('slCode', '==', slCode),
          where('status', 'in', ['received', 'transit', 'customs', 'held', 'consolidated', 'pre-alerted']),
          orderBy('createdAt', 'desc'),
          fsLimit(50)
        );
        const snap = await getDocs(q);
        const labelPackages = snap.docs.map(d => {
          const ld = d.data();
          return {
            trackingId: d.id,
            status: ld.status || '',
            weight: ld.weight || ld.peso || 0,
            description: ld.description || ld.descripcion || '',
            requiresPermit: ld.requiresPermit || false,
          };
        });
        const totalWeight = labelPackages.reduce((s, p) => s + p.weight, 0);

        return {
          tool: toolName,
          data: {
            found: true,
            customer: {
              slCode,
              fullName: hits[0].fullName,
              phone: cust.phone || '',
              dni: cust.dni || '',
              email: cust.email || '',
              address: cust.address || '',
              city: cust.city || '',
              ruta: hits[0].ruta || '',
            },
            packages: labelPackages,
            totalPackages: labelPackages.length,
            totalWeight: Math.round(totalWeight * 100) / 100,
            shippingLabelsUrl: `/shipping-labels`,
            message: labelPackages.length === 0
              ? `${hits[0].fullName} (${slCode}) no tiene paquetes activos pendientes de entrega.`
              : `${hits[0].fullName} (${slCode}) tiene ${labelPackages.length} paquete(s) activo(s) — peso total ${(Math.round(totalWeight * 100) / 100).toFixed(2)} lbs. Ve a /shipping-labels para imprimir la etiqueta completa.`,
          },
        };
      }

      case 'get_shipping_label_history': {
        const slCode = String(args.slCode || '').trim().toUpperCase();
        const max = Number(args.maxResults) || 10;
        if (!slCode) return { tool: toolName, data: { error: 'slCode is required' } };

        const q = query(
          collection(db, 'shipping_labels'),
          where('customerSlCode', '==', slCode),
          orderBy('createdAt', 'desc'),
          fsLimit(max)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
          return { tool: toolName, data: { slCode, labels: [], message: `No se encontraron etiquetas de envío para ${slCode}.` } };
        }
        const labels = snap.docs.map(d => {
          const ld = d.data();
          return {
            id: d.id,
            status: ld.status || '',
            trackings: ld.trackings || [],
            packageCount: (ld.trackings || []).length,
            courierService: ld.courierService || '',
            deliveryAddress: ld.deliveryAddress || '',
            weight: ld.weight || 0,
            createdAt: ld.createdAt instanceof Timestamp ? ld.createdAt.toDate().toISOString() : ld.createdAt || '',
          };
        });
        return { tool: toolName, data: { slCode, total: labels.length, labels } };
      }

      case 'detect_duplicate_trackings': {
        const manifestId = String(args.manifestId || '').trim();
        if (!manifestId) {
          return { tool: toolName, data: { error: 'manifestId is required' } };
        }
        // Fetch manifest detail from MLocker to get the tracking list
        const detail = await mlGetManifestDetail(manifestId);
        const trackingIds = detail.packages
          .map((p) => (p.tracking || '').toUpperCase())
          .filter(Boolean);

        if (!trackingIds.length) {
          return {
            tool: toolName,
            data: { manifestId, duplicates: [], totalChecked: 0, message: 'No tracking numbers found in manifest.' },
          };
        }

        // Doc-ID lookup for each tracking (doc ID = tracking number, O(1) per read)
        const packagesRef = collection(db, 'packages');
        const snapshots = await Promise.all(
          trackingIds.map((tid: string) =>
            getDoc(doc(packagesRef, tid)).catch(() => null)
          )
        );

        const duplicates: Array<{
          tracking: string;
          existingManifest: string;
          customerName: string;
          status: string;
          processedAt: string;
        }> = [];

        snapshots.forEach((snap, i) => {
          if (!snap?.exists()) return;
          const data = snap.data();
          const existingManifest = String(data.manifestNumber || data.manifestId || '');
          if (existingManifest && existingManifest !== manifestId) {
            duplicates.push({
              tracking: trackingIds[i],
              existingManifest,
              customerName: String(data.customerName || data.nombre || ''),
              status: String(data.status || ''),
              processedAt: data.createdAt instanceof Timestamp
                ? data.createdAt.toDate().toISOString()
                : String(data.createdAt || ''),
            });
          }
        });

        return {
          tool: toolName,
          data: {
            manifestId,
            totalChecked: trackingIds.length,
            duplicatesFound: duplicates.length,
            duplicates,
            message: duplicates.length === 0
              ? `✅ Sin duplicados — los ${trackingIds.length} trackings del manifiesto ${manifestId} son únicos en el sistema.`
              : `⚠️ ${duplicates.length} tracking(s) ya existen en otros manifiestos. Revisa antes de procesar.`,
          },
        };
      }

      case 'check_pre_alert': {
        const tn = String(args.trackingNumber || '').toUpperCase().trim();
        if (!tn) return { tool: toolName, error: 'trackingNumber is required', data: null };
        const info = await resolvePreAlert(tn);
        return {
          tool: toolName,
          data: info.found
            ? {
                found: true,
                tracking: info.tracking,
                slCode: info.slCode ?? null,
                status: info.status ?? null,
                preAlertCreatedAt: info.preAlertCreatedAt ?? null,
                syncedAt: info.syncedAt ?? null,
                message: `✅ Tracking ${tn} tiene pre-alerta registrada${info.slCode ? ` por cliente ${info.slCode}` : ''} con estado "${info.status ?? 'desconocido'}".`,
              }
            : {
                found: false,
                tracking: tn,
                message: `ℹ️ Tracking ${tn} no tiene pre-alerta registrada en el sistema.`,
              },
        };
      }

      case 'check_consolidation_compliance': {
        const slCode = String(args.slCode || '').trim();
        const packageCount = Number(args.packageCount) || 0;
        if (!slCode) return { tool: toolName, data: { error: 'slCode is required' } };
        if (packageCount <= 0) return { tool: toolName, data: { error: 'packageCount must be > 0' } };

        const catStr = String(args.categories || '');
        const input: ComplianceInput = {
          slCode,
          packageCount,
          totalWeightKg: args.totalWeightKg ? Number(args.totalWeightKg) : undefined,
          totalDimensionsCm: args.totalDimensionsCm ? Number(args.totalDimensionsCm) : undefined,
          totalValueUSD: args.totalValueUSD ? Number(args.totalValueUSD) : undefined,
          originCountry: args.originCountry ? String(args.originCountry) : undefined,
          shippingType: args.shippingType === 'sea' ? 'sea' : args.shippingType === 'air' ? 'air' : undefined,
          hasElectronics: args.hasElectronics === 'true',
          hasSpecialPermit: args.hasSpecialPermit === 'true',
          isUrgent: args.isUrgent === 'true',
          categories: catStr ? catStr.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        };

        const rules = await loadActiveConsolidationRules();
        const result = await checkConsolidationCompliance(input, rules);

        return {
          tool: toolName,
          data: {
            slCode: result.slCode,
            compliant: result.compliant,
            rulesChecked: result.rulesChecked,
            violationsCount: result.violations.length,
            warningsCount: result.warnings.length,
            violations: result.violations.map(v => ({
              rule: v.ruleName,
              category: v.category,
              severity: v.severity,
              detail: v.detail,
            })),
            warnings: result.warnings.map(w => ({
              rule: w.ruleName,
              category: w.category,
              detail: w.detail,
            })),
            summary: result.summary,
            activeRules: rules.map(r => `${r.ruleKey} (${r.category}): ${r.ruleType === 'number' ? `${r.valueNumber} ${r.unit ?? ''}` : r.ruleType === 'boolean' ? String(r.valueBoolean) : r.ruleType === 'list' ? (r.valueList ?? []).join(', ') : r.valueText ?? ''}`),
          },
        };
      }

      // ── Cross-collection: packages × invoices join ──────────────────────────
      case 'query_packages_with_invoice_status': {
        const route     = args.route          ? String(args.route).trim()          : '';
        const invStatus = args.invoiceStatus  ? String(args.invoiceStatus)         : '';
        const pkgStatus = args.packageStatus  ? String(args.packageStatus)         : '';
        const max       = Math.min(Number(args.maxResults) || 100, 300);

        // Step 1 — load packages by route (uses the existing 'ruta' index)
        const pkgConstraints: ReturnType<typeof where>[] = [];
        if (route)     pkgConstraints.push(where('ruta',   '==', route));
        if (pkgStatus) pkgConstraints.push(where('status', '==', pkgStatus));
        const pkgSnap = await getDocs(
          query(collection(db, 'packages'), ...pkgConstraints, orderBy('createdAt', 'desc'), fsLimit(max))
        );

        const pkgRows = pkgSnap.docs.map(d => {
          const rd = d.data();
          return {
            trackingId:     d.id,
            slCode:         (rd.slCode || rd.customerSlCode || '').toUpperCase() as string,
            customerName:   (rd.customerName || rd.nombre || '') as string,
            status:         (rd.status || '') as string,
            ruta:           (rd.ruta || '') as string,
            manifestNumber: (rd.manifestNumber || '') as string,
            weight:         (rd.weight || rd.peso || 0) as number,
            price:          (rd.price  || rd.precio || 0) as number,
            createdAt:      rd.createdAt instanceof Timestamp
              ? rd.createdAt.toDate().toISOString()
              : (rd.createdAt || '') as string,
          };
        });

        // Step 2 — load invoices by status (uses 'status' index)
        const invConstraints: ReturnType<typeof where>[] = [];
        if (invStatus)    invConstraints.push(where('status',    '==', invStatus));
        if (args.dateFrom) invConstraints.push(where('createdAt', '>=', new Date(args.dateFrom as string)));
        if (args.dateTo)   invConstraints.push(where('createdAt', '<=', new Date(args.dateTo   as string)));
        const invSnap = await getDocs(
          query(collection(db, 'invoices'), ...invConstraints, orderBy('createdAt', 'desc'), fsLimit(1000))
        );

        // Build slCode → most-recent invoice map
        const invoiceMap = new Map<string, {
          invoiceId: string; invoiceStatus: string; invoiceTotal: number; invoiceCreatedAt: string;
        }>();
        invSnap.docs.forEach(d => {
          const iv = d.data();
          const slCode = (iv.clientSlCode || iv.slCode || '').toUpperCase();
          if (slCode && !invoiceMap.has(slCode)) {
            invoiceMap.set(slCode, {
              invoiceId:        d.id,
              invoiceStatus:    iv.status    || '',
              invoiceTotal:     iv.total     || iv.amount || iv.totalAmount || 0,
              invoiceCreatedAt: iv.createdAt instanceof Timestamp
                ? iv.createdAt.toDate().toISOString()
                : (iv.createdAt || '') as string,
            });
          }
        });

        // Step 3 — in-memory join: only packages whose slCode appears in the invoice set
        const joined = pkgRows
          .filter(p => invoiceMap.has(p.slCode))
          .map(p => ({ ...p, invoice: invoiceMap.get(p.slCode)! }));

        const byStatus: Record<string, number> = {};
        joined.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
        const totalRevenue = joined.reduce((s, p) => s + p.price, 0);

        return {
          tool: toolName,
          data: {
            count:          joined.length,
            route:          route     || 'all',
            invoiceStatus:  invStatus || 'all',
            packageStatus:  pkgStatus || 'all',
            byStatus,
            totalRevenue:   Math.round(totalRevenue * 100) / 100,
            packages:       joined,
          },
        };
      }

      default:
        return { tool: toolName, error: `Unknown tool: ${toolName}`, data: null };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[NovaTool:${toolName}] Error:`, msg);
    return { tool: toolName, error: msg, data: null };
  }
}

// ── Tool declarations (built once, frozen) ───────────────────────────────────
const _toolDeclarations = Object.freeze(
  NOVA_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
);

/**
 * Returns frozen singleton of Gemini function declarations.
 * No allocation on repeated calls.
 */
export function getNovaToolDeclarations() {
  return _toolDeclarations;
}

/**
 * Returns the schema for all available tools as a human-readable string.
 * Used by Nova to help users understand what queries are possible.
 */
export function getNovaToolsSchemaSummary(): string {
  return NOVA_TOOLS.map(t => {
    const fields = Object.entries(t.parameters.properties)
      .map(([k, v]) => `  - ${k} (${v.type})${(v as { enum?: string[] }).enum ? ` [${(v as { enum?: string[] }).enum!.join('|')}]` : ''}: ${v.description}`)
      .join('\n');
    return `### ${t.name}\n${t.description}\nParams:\n${fields}`;
  }).join('\n\n');
}
