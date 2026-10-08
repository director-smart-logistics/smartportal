/**
 * "Día 1" of consolidation — ONE rule for the SP1 Consolidation page (per-package badge, "Consolida desde", grace period,
 * "Más de 90 días", customer counter) AND the SP2 "En Consolidación" list (consolidation_items.since). The same pure
 * logic lives in functions/src/consolidation/consolidation-start.ts (functions cannot import client code); a parity test
 * (__tests__/consolidation-start.spec.ts) keeps both equal.
 *
 * User decision 2026-09-28 (it replaced F10's "last invoice", which restarted the count on every re-invoice):
 * Día 1 = the date of the FIRST invoice the package was ever invoiced in — the EARLIEST invoice date among all the
 * invoices it appears in (current one, annulled / deleted ones, and every invoice named in its history), whether or not
 * that first invoice was annulled.
 *   S0  never invoiced                         → the day it entered consolidation (firstConsolidatedAt,
 *                                                else its first consolidation event, else created)
 *   S1  invoice #1 annulled or deleted          → date of invoice #1
 *   S2  #1 → #2 → #3 (annul / delete / re-invoice cycles, incl. "anulada → otro bloque" and
 *       "consolidación transitoria")            → date of invoice #1 (the FIRST), never a later one
 *   S3  currently inside an invoice (draft/sent/paid, incl. a restored "de-anulada" one)
 *                                              → the earliest of that invoice and any earlier one
 *   S4  moved between blocks / manifests / carry-on without an invoice → unchanged (moves are not invoices)
 * The customer counter uses the OLDEST "Día 1" among the customer's packages.
 *
 * Sources, in order:
 *   1. the package's own stored attribute firstInvoiceNumber / firstInvoiceDate (set ONCE by the SP1 server when the
 *      package is first linked to an invoice — functions/src/packages/first-invoice.ts — or by the documented backfill);
 *   2. otherwise the EARLIEST of: SP1 `invoices` of the customer whose items contain the tracking (any status, incl.
 *      annulled — the reliable source: the package doc keeps only the LAST annulled invoice), attached to the package
 *      by the page as `invoiceHistoryFirst`; annulledInvoiceDate / annulledInvoiceNumber / invoicedAt; every
 *      "Factura <número>" in statusHistory notes; and the current invoiceNumber / invoiceDate.
 * An invoice's exact date beats the "noon" date read from the same invoice's number.
 * Pure; tested in __tests__/day-one.spec.ts.
 */
import { extractDateIsoFromInvoiceNumber, extractInvoiceEmissionDate } from '@/lib/utils/date-utils';

export type DayOneScenario = 'primera-factura' | 'sin-factura' | 'sin-datos';
export interface DayOne { date: string | null; scenario: DayOneScenario; invoiceNumber?: string }

const INVOICE_IN_NOTE = /(?:Factura|invoice)\s+([A-Z0-9-]{6,}\d{6,}(?:-C)?)/gi;
const TRANSITORIA = 'consolidacion_transitoria';
const toMs = (iso: string | null | undefined) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : 0; };
const asIso = (v: any): string | null => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
};

/** Every invoice date the package carries (current and past), with its number when known. */
export function invoiceDatesOf(pkg: any): Array<{ iso: string; invoiceNumber?: string }> {
  if (!pkg) return [];
  const out: Array<{ iso: string; invoiceNumber?: string; fromNumber?: boolean }> = [];
  const add = (iso: string | null | undefined, invoiceNumber?: string, fromNumber = false) => { if (iso && toMs(iso)) out.push({ iso, invoiceNumber, fromNumber }); };

  // The customer's earliest SP1 invoice listing this tracking (attached by the page / trigger from the invoices).
  if (pkg.invoiceHistoryFirst?.date) add(asIso(pkg.invoiceHistoryFirst.date), pkg.invoiceHistoryFirst.invoiceNumber || undefined);

  // The last annulled / deleted invoice (all annul and delete flows write these three).
  add(asIso(pkg.annulledInvoiceDate), pkg.annulledInvoiceNumber);
  add(extractDateIsoFromInvoiceNumber(pkg.annulledInvoiceNumber), pkg.annulledInvoiceNumber, true);
  // invoicedAt: the invoice date (the annul flows set it to the annulled invoice's emission date).
  add(asIso(pkg.invoicedAt), pkg.annulledInvoiceNumber || pkg.invoiceNumber);

  // The invoice it is in now (not the transitory block).
  const current = pkg.invoiceNumber && !pkg.isTransitoria && pkg.invoiceNumber !== TRANSITORIA ? String(pkg.invoiceNumber) : '';
  if (current) {
    // Only an explicit invoiceDate is an exact date; without it the date comes from the number ("noon") and must
    // not beat the exact date of the same invoice found elsewhere (its invoice doc, the annul fields).
    if (pkg.invoiceDate) add(extractInvoiceEmissionDate({ invoiceDate: pkg.invoiceDate, invoiceNumber: current }), current);
    add(extractDateIsoFromInvoiceNumber(current), current, true);
  }

  // Every invoice mentioned in its history ("Factura SL…-C anulada", "…movidos a…").
  for (const h of Array.isArray(pkg.statusHistory) ? pkg.statusHistory : []) {
    const note = String(h?.note || h?.notes || '');
    for (const m of note.matchAll(INVOICE_IN_NOTE)) add(extractDateIsoFromInvoiceNumber(m[1]), m[1], true);
  }
  // The date read from an invoice NUMBER carries only the day (normalised to noon). When the same invoice
  // also has its exact date, the exact one is the truth: otherwise "noon" beat it as "newest" and the
  // "Días" counter showed one day less every morning (caught by sp1-consolidation-day-one before noon).
  const exact = new Set(out.filter((x) => !x.fromNumber && x.invoiceNumber).map((x) => x.invoiceNumber));
  return out.filter((x) => !(x.fromNumber && exact.has(x.invoiceNumber))).map(({ iso, invoiceNumber }) => ({ iso, invoiceNumber }));
}

const normTrk = (t: unknown) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The EARLIEST invoice (any status, incl. annulled / cancelled) among `invoices` whose items contain `tracking`.
 * `invoices` are SP1 invoice docs of the package's customer ({ invoiceNumber, invoiceDate, createdAt, date,
 * invoiceItems | items: [{ trackingNumber | tracking }] }). Soft-deleted (isDeleted) invoices are ignored.
 */
export function firstInvoiceFromInvoices(tracking: string, invoices: any[]): { invoiceNumber: string; date: string } | null {
  const tn = normTrk(tracking);
  if (!tn) return null;
  let best: { invoiceNumber: string; date: string } | null = null;
  for (const inv of invoices || []) {
    if (!inv || inv.isDeleted) continue;
    const items = Array.isArray(inv.invoiceItems) && inv.invoiceItems.length ? inv.invoiceItems : (Array.isArray(inv.items) ? inv.items : []);
    if (!items.some((it: any) => normTrk(it?.trackingNumber || it?.tracking) === tn)) continue;
    const iso = extractInvoiceEmissionDate({ invoiceDate: inv.invoiceDate, createdAt: inv.createdAt, date: inv.date, invoiceNumber: inv.invoiceNumber });
    if (!iso || !toMs(iso)) continue;
    if (!best || toMs(iso) < toMs(best.date)) best = { invoiceNumber: String(inv.invoiceNumber || inv.id || ''), date: iso };
  }
  return best;
}

/** "Día 1" of one package. */
export function packageDayOne(pkg: any): DayOne {
  if (!pkg) return { date: null, scenario: 'sin-datos' };
  // 1. The stored attribute (set once by the SP1 server) is the truth.
  const stored = asIso(pkg.firstInvoiceDate);
  if (stored && toMs(stored)) return { date: stored, scenario: 'primera-factura', invoiceNumber: pkg.firstInvoiceNumber || undefined };
  const invoices = invoiceDatesOf(pkg);
  if (invoices.length) {
    const first = invoices.reduce((a, b) => (toMs(b.iso) < toMs(a.iso) ? b : a));
    return { date: first.iso, scenario: 'primera-factura', invoiceNumber: first.invoiceNumber };
  }
  // Never invoiced: the day it entered consolidation.
  if (pkg.firstConsolidatedAt) return { date: asIso(pkg.firstConsolidatedAt), scenario: 'sin-factura' };
  const firstEvent = (Array.isArray(pkg.statusHistory) ? pkg.statusHistory : [])
    .filter((h: any) => String(h?.status || '').toLowerCase() === 'consolidated')
    .map((h: any) => asIso(h.changedAt || h.timestamp))
    .filter((d: string | null) => toMs(d))
    .sort((a: string, b: string) => toMs(a) - toMs(b))[0];
  if (firstEvent) return { date: firstEvent, scenario: 'sin-factura' };
  const fallback = asIso(pkg.manifestUpdatedAt) || asIso(pkg.createdAt) || asIso(pkg.savedAt);
  return fallback ? { date: fallback, scenario: 'sin-factura' } : { date: null, scenario: 'sin-datos' };
}

/** The customer counter: the OLDEST "Día 1" among the customer's packages. */
export function customerDayOne(pkgs: any[]): { date: string | null; packageId?: string } {
  let best: { date: string | null; packageId?: string } = { date: null };
  for (const p of pkgs || []) {
    const d = packageDayOne(p).date;
    if (d && toMs(d) && (!best.date || toMs(d) < toMs(best.date))) best = { date: d, packageId: p.id };
  }
  return best;
}

/**
 * Order of the packages inside a customer's block on the SP1 Consolidation page (user 2026-09-28): by "Día 1"
 * ascending by FULL timestamp — the OLDEST first — ties by tracking; packages without a date go last. New array.
 */
export function sortByDayOne<T extends { trackingNumber?: string }>(pkgs: T[]): T[] {
  const key = (p: T) => { const d = packageDayOne(p).date; const ms = d ? toMs(d) : 0; return ms || Number.MAX_SAFE_INTEGER; };
  return [...(pkgs || [])]
    .map((p) => ({ p, k: key(p) }))
    .sort((a, b) => a.k - b.k || String(a.p.trackingNumber || '').localeCompare(String(b.p.trackingNumber || '')))
    .map((x) => x.p);
}
