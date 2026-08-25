/**
 * encomienda-suggestions.ts
 *
 * Learning-based third-party service suggestion engine for encomienda manifests.
 *
 * Flow:
 *  1. Fetch last N invoices for a customer (by slCode)
 *  2. Extract all manual (isManual) invoice items
 *  3. Build a frequency/amount map from history
 *  4. If there's a clear pattern (≥2 occurrences) use it directly
 *  5. Otherwise send the history to Gemini AI for a normalized suggestion
 *
 * The suggestion is returned as a ServiceSuggestion; callers decide how to apply it.
 */

import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  suggestEncomiendaService,
  EncomiendaServiceSuggestion,
} from './gemini-client';

export interface ServiceSuggestion {
  description: string;
  amount: number;
  /** 0–1 confidence in this suggestion */
  confidence: number;
  /** How many past invoices contained this pattern */
  occurrences: number;
  /** Whether Gemini AI was used to produce or enhance this suggestion */
  aiEnhanced: boolean;
  /** Human-readable reasoning from AI (if applicable) */
  reasoning?: string;
}

interface ParsedItem {
  /** Base description stripped of tracking numbers and CRC suffix, uppercased */
  baseDesc: string;
  /** CRC amount extracted from "(₡2,000 TC:475)" or "— ₡2,000 TC:475" */
  crcAmount?: number;
  /** Exchange rate extracted from suffix */
  tcRate?: number;
  /** Full formatted CRC suffix, e.g. "(₡2,000 TC:475)" */
  crcSuffix?: string;
  /** USD amount stored in invoice (already converted) */
  usdAmount: number;
}

/**
 * Parse a manual invoice item description into its components.
 *
 * Supported formats:
 *  - "SERVICIO DE TERCERO (₡2,000 TC:475)"     → global service item
 *  - "CARGO FEDEX (TBA123456) — ₡2,000 TC:475" → per-row item
 */
function parseManualItem(raw: string, usdAmount: number): ParsedItem {
  // Pattern 1: (₡2,000 TC:475) — global service item format
  const p1 = raw.match(/\(₡([\d,]+)\s+TC:([\d.]+)\)/);
  // Pattern 2: — ₡2,000 TC:475 — per-row item format
  const p2 = !p1 ? raw.match(/—\s*₡([\d,]+)\s+TC:([\d.]+)/) : null;

  let crcAmount: number | undefined;
  let tcRate: number | undefined;
  let crcSuffix: string | undefined;

  if (p1) {
    crcAmount = parseInt(p1[1].replace(/,/g, ''), 10);
    tcRate    = parseFloat(p2?.[2] ?? p1[2]);
    crcSuffix = p1[0];
  } else if (p2) {
    crcAmount = parseInt(p2[1].replace(/,/g, ''), 10);
    tcRate    = parseFloat(p2[2]);
    // Normalise to the parens format for display consistency
    crcSuffix = `(₡${Number(crcAmount).toLocaleString('es-CR')} TC:${tcRate})`;
  }

  const baseDesc = raw
    .replace(/\(₡[\d,]+\s+TC:[\d.]+\)/g, '')   // remove (₡X TC:Y)
    .replace(/—\s*₡[\d,]+\s+TC:[\d.]+/g, '')    // remove — ₡X TC:Y
    .replace(/\([A-Z0-9]{8,}\)/gi, '')           // remove tracking numbers
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase();

  return { baseDesc, crcAmount, tcRate, crcSuffix, usdAmount };
}

interface FrequencyEntry {
  count: number;
  totalUSD: number;
  /** CRC amount → occurrence count */
  crcAmounts: Map<number, { count: number; tc: number }>;
}

/**
 * Build a frequency map keyed by base description.
 * CRC amounts are tracked separately so the most common one can be selected.
 */
function buildFrequencyMap(items: ParsedItem[]): Map<string, FrequencyEntry> {
  const map = new Map<string, FrequencyEntry>();
  for (const item of items) {
    const key = item.baseDesc;
    if (!key) continue;
    if (!map.has(key)) map.set(key, { count: 0, totalUSD: 0, crcAmounts: new Map() });
    const entry = map.get(key)!;
    entry.count++;
    entry.totalUSD += item.usdAmount;
    if (item.crcAmount && item.tcRate) {
      const existing = entry.crcAmounts.get(item.crcAmount);
      if (existing) {
        existing.count++;
      } else {
        entry.crcAmounts.set(item.crcAmount, { count: 1, tc: item.tcRate });
      }
    }
  }
  return map;
}

/** Format a CRC integer as "₡2,000" (Costa Rican locale) */
function fmtCRC(n: number): string {
  return `₡${n.toLocaleString('es-CR')}`;
}

/**
 * Derive a deterministic suggestion from frequency map alone (no AI).
 * Returns the most common base description + the most common CRC amount (if any).
 */
function deriveFromHistory(
  map: Map<string, FrequencyEntry>,
): ServiceSuggestion | null {
  if (map.size === 0) return null;

  // Sort by count desc, then by total USD desc
  const sorted = Array.from(map.entries()).sort(([, a], [, b]) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.totalUSD - a.totalUSD;
  });

  const [baseDesc, entry] = sorted[0];
  const confidence = Math.min(0.95, 0.5 + entry.count * 0.1);

  // Find the most common CRC amount for this description
  let description = baseDesc;
  let amount = Math.round((entry.totalUSD / entry.count) * 100) / 100;

  if (entry.crcAmounts.size > 0) {
    const [topCRC, crcData] = Array.from(entry.crcAmounts.entries())
      .sort(([, a], [, b]) => b.count - a.count)[0];
    // Recompute USD from the most common CRC amount + its TC rate
    const usdFromCRC = Math.round((topCRC / crcData.tc) * 100) / 100;
    description = `${baseDesc} (${fmtCRC(topCRC)} TC:${crcData.tc})`;
    amount = usdFromCRC;
  }

  return {
    description,
    amount,
    confidence,
    occurrences: entry.count,
    aiEnhanced: false,
  };
}

/**
 * Fetch manual invoice line items for a customer from their last `maxInvoices`
 * invoices in Firestore.
 */
async function fetchHistoricalManualItems(
  slCode: string,
  maxInvoices = 20,
): Promise<ParsedItem[]> {
  const items: ParsedItem[] = [];
  if (!slCode || slCode.startsWith('__')) return items;

  let docs: any[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'invoices'), where('customerId', '==', slCode), orderBy('createdAt', 'desc'), limit(maxInvoices)),
    );
    docs = snap.docs;
    if (docs.length === 0) {
      const snap2 = await getDocs(
        query(collection(db, 'invoices'), where('slCode', '==', slCode), orderBy('createdAt', 'desc'), limit(maxInvoices)),
      );
      docs = snap2.docs;
    }
  } catch {
    try {
      const snapFb = await getDocs(
        query(collection(db, 'invoices'), where('customerId', '==', slCode), limit(maxInvoices)),
      );
      docs = snapFb.docs;
    } catch {
      return items;
    }
  }

  for (const d of docs) {
    const data = d.data();
    const invoiceItems: any[] = data.invoiceItems ?? data.items ?? [];
    for (const item of invoiceItems) {
      if (!item.isManual) continue;
      const usdAmount = Number(item.totalPrice ?? item.unitPrice ?? 0);
      if (usdAmount <= 0) continue;
      items.push(parseManualItem(String(item.description ?? ''), usdAmount));
    }
  }
  return items;
}

/**
 * Get a service suggestion for a single customer.
 * Combines Firestore history with optional Gemini AI refinement.
 */
export async function getCustomerServiceSuggestion(
  slCode: string,
  customerName: string,
): Promise<ServiceSuggestion | null> {
  const history = await fetchHistoricalManualItems(slCode);
  if (history.length === 0) return null;

  const freqMap = buildFrequencyMap(history);
  const historyBased = deriveFromHistory(freqMap);

  // If we have a clear, high-frequency pattern — use it directly without AI
  if (historyBased && historyBased.occurrences >= 3 && historyBased.confidence >= 0.75) {
    return historyBased;
  }

  // Build the shape expected by suggestEncomiendaService: { description, amount }
  // Use the full description (baseDesc + CRC suffix if present) so Gemini sees the format
  const geminiHistory = history.slice(0, 15).map(p => ({
    description: p.crcSuffix ? `${p.baseDesc} ${p.crcSuffix}` : p.baseDesc,
    amount: p.usdAmount,
  }));

  // Otherwise, use Gemini to normalize and enhance the suggestion
  const aiResult: EncomiendaServiceSuggestion | null = await suggestEncomiendaService(
    customerName,
    geminiHistory,
  ).catch(() => null);

  if (aiResult) {
    return {
      description: aiResult.description,
      amount: aiResult.amount,
      confidence: aiResult.confidence,
      occurrences: historyBased?.occurrences ?? history.length,
      aiEnhanced: true,
      reasoning: aiResult.reasoning,
    };
  }

  // Fall back to history-based even if confidence is low
  return historyBased;
}

/**
 * Get suggestions for multiple customers in parallel.
 * Returns a Map keyed by slCode.
 */
export async function getBulkServiceSuggestions(
  customers: Array<{ slCode: string; customerName: string }>,
): Promise<Map<string, ServiceSuggestion | null>> {
  const results = await Promise.allSettled(
    customers.map(async ({ slCode, customerName }) => ({
      slCode,
      suggestion: await getCustomerServiceSuggestion(slCode, customerName),
    })),
  );

  const map = new Map<string, ServiceSuggestion | null>();
  for (const result of results) {
    if (result.status === 'fulfilled') {
      map.set(result.value.slCode, result.value.suggestion);
    }
  }
  return map;
}
