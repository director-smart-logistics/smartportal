/**
 * SP2 "En Consolidación" tab (2026-09-28) — pure rules shared by the SP1 trigger (consolidation-to-sp2.ts) and the
 * backfill script. No Firebase imports: tested from client/lib/consolidation/__tests__/consolidation-start.spec.ts.
 *
 *  - isInConsolidation: EXACTLY what SP1's Consolidation Manifest page lists (useConsolidationData +
 *    isPackageTransitoria): a non-terminal package parked in CONSOLIDACION_TRANSITORIA. packages.status alone is not
 *    used — it is stale on packages that already left consolidation.
 *  - consolidationStart: "Día 1" — reads the package's stored firstInvoiceNumber/firstInvoiceDate first; otherwise
 *    `invoiceHistoryFirst` (earliest SP1 invoice listing the tracking, attached by the caller from the customer's
 *    invoices) and the package fields/history. "Día 1" = the date of the FIRST invoice the package was ever invoiced in — the EARLIEST
 *    invoice date among all its invoices (current, annulled / deleted, and every invoice named in its history), whether
 *    or not that first one was annulled (user decision 2026-09-28). Moves between manifests / blocks do not change it.
 *    SP2 stores it once per customer + tracking and never overwrites it (a package that re-enters keeps its date).
 *    Never invoiced → firstConsolidatedAt, else the first 'consolidated' history event, else created.
 *  It is the SAME rule as client/lib/consolidation/day-one.ts (SP1 Consolidation page): a parity test runs both on
 *  the same fixtures (client/lib/consolidation/__tests__/consolidation-start.spec.ts). Change both together.
 */

export const TRANSITORIA = "consolidacion_transitoria";
const TERMINAL = new Set(["delivered", "processed", "returned", "pickup"]);
const INVOICE_IN_NOTE = /(?:Factura|invoice)\s+([A-Z0-9-]{6,}\d{6,}(?:-C)?)/gi;

export const normTracking = (t: unknown): string => String(t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const normSl = (s: unknown): string => String(s ?? "").trim().toUpperCase();

/** Same predicate as client/pages/consolidation/components/normalize-manifest.ts isPackageTransitoria. */
export function isPackageTransitoria(pkg: any): boolean {
  if (!pkg) return false;
  const low = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const u = low(pkg.updatedManifest), i = low(pkg.manifestId), n = low(pkg.manifestNumber), m = low(pkg.manifiesto);
  if (u) return u === TRANSITORIA;
  if (i) return i === TRANSITORIA;
  if (n) return n === TRANSITORIA;
  return m === TRANSITORIA;
}

/** In the customer's "En Consolidación" list (and on SP1's consolidation page). */
export function isInConsolidation(pkg: any): boolean {
  return !!pkg && isPackageTransitoria(pkg) && !TERMINAL.has(String(pkg.status ?? "").toLowerCase());
}

/** Key of a list entry: customer + tracking. null when the package has no customer or tracking. */
export function membershipKey(pkg: any): { slCode: string; tracking: string } | null {
  const slCode = normSl(pkg?.slCode || pkg?.clientSlCode);
  const tracking = normTracking(pkg?.trackingNumber || pkg?.tracking);
  return slCode && tracking ? { slCode, tracking } : null;
}

const toMs = (iso: string | null | undefined) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? t : 0; };
export function asIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === "number") return new Date(v._seconds * 1000).toISOString();
  return null;
}

/** Date carried by an invoice number (SLxxx-YYYYMMDDhhmmss…): the day, at noon Costa Rica. */
export function dateFromInvoiceNumber(num?: string | null): string | null {
  if (!num) return null;
  const m = String(num).match(/(?:-|^|\b)(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const y = +m[1], mon = +m[2], d = +m[3];
  if (y < 2020 || y > 2050 || mon < 1 || mon > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00-06:00`;
}

export interface ConsolidationStart { date: string | null; invoiceNumber: string | null; scenario: "primera-factura" | "sin-factura" | "sin-datos" }

/** Mirror of the client's parseDateSafe (date-utils.ts). */
function parseDateSafe(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "object") {
    if (typeof v.toDate === "function") { const d = v.toDate(); return isNaN(d.getTime()) ? null : d; }
    if (typeof v._seconds === "number") { const d = new Date(v._seconds * 1000 + (v._nanoseconds ? Math.floor(v._nanoseconds / 1e6) : 0)); return isNaN(d.getTime()) ? null : d; }
    if (typeof v.seconds === "number") { const d = new Date(v.seconds * 1000 + (v.nanoseconds ? Math.floor(v.nanoseconds / 1e6) : 0)); return isNaN(d.getTime()) ? null : d; }
  }
  if (typeof v === "number") { const d = new Date(v < 10000000000 ? v * 1000 : v); return isNaN(d.getTime()) ? null : d; }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (/^\d{10,13}$/.test(t)) { const num = Number(t); const d = new Date(num < 10000000000 ? num * 1000 : num); return isNaN(d.getTime()) ? null : d; }
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Mirror of the client's extractInvoiceEmissionDate (date-utils.ts): invoiceDate → createdAt → date → invoicedAt → number. */
export function invoiceEmissionDate(inv: any): string | null {
  if (!inv) return null;
  const dayOrParse = (x: any): string | null => {
    if (!x) return null;
    if (typeof x?.toDate === "function") return x.toDate().toISOString();
    if (typeof x === "string" && x.trim()) {
      const t = x.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00-06:00`;
      const d = parseDateSafe(t); return d ? d.toISOString() : null;
    }
    return null;
  };
  const a = dayOrParse(inv.invoiceDate); if (a) return a;
  if (inv.createdAt) {
    if (typeof inv.createdAt?.toDate === "function") return inv.createdAt.toDate().toISOString();
    if (typeof inv.createdAt === "string" && inv.createdAt.trim()) { const d = parseDateSafe(inv.createdAt); if (d) return d.toISOString(); }
  }
  const c = dayOrParse(inv.date); if (c) return c;
  if (inv.invoicedAt) { const d = parseDateSafe(inv.invoicedAt); if (d) return d.toISOString(); }
  return dateFromInvoiceNumber(inv.invoiceNumber || inv.annulledInvoiceNumber || null);
}

/** Mirror of the client's firstInvoiceFromInvoices (day-one.ts): the EARLIEST invoice (any status) listing the tracking. */
export function firstInvoiceFromInvoices(tracking: string, invoices: any[]): { invoiceNumber: string; date: string } | null {
  const tn = normTracking(tracking);
  if (!tn) return null;
  let best: { invoiceNumber: string; date: string } | null = null;
  for (const inv of invoices || []) {
    if (!inv || inv.isDeleted) continue;
    const items = Array.isArray(inv.invoiceItems) && inv.invoiceItems.length ? inv.invoiceItems : (Array.isArray(inv.items) ? inv.items : []);
    if (!items.some((it: any) => normTracking(it?.trackingNumber || it?.tracking) === tn)) continue;
    const iso = invoiceEmissionDate({ invoiceDate: inv.invoiceDate, createdAt: inv.createdAt, date: inv.date, invoiceNumber: inv.invoiceNumber });
    if (!iso || !toMs(iso)) continue;
    if (!best || toMs(iso) < toMs(best.date)) best = { invoiceNumber: String(inv.invoiceNumber || inv.id || ""), date: iso };
  }
  return best;
}

/** Emission date of the invoice the package is in now (mirror of the client's extractInvoiceEmissionDate for it). */
function currentInvoiceDate(pkg: any, num: string): string | null {
  return invoiceEmissionDate({ invoiceDate: pkg.invoiceDate, invoiceNumber: num });
}

/** Every invoice date the package carries (mirror of the client's invoiceDatesOf). */
function invoiceDatesOf(pkg: any): Array<{ iso: string; invoiceNumber: string | null }> {
  const out: Array<{ iso: string; invoiceNumber: string | null; fromNumber: boolean }> = [];
  const add = (iso: string | null, invoiceNumber: string | null, fromNumber = false) => { if (iso && toMs(iso)) out.push({ iso, invoiceNumber, fromNumber }); };
  if (pkg.invoiceHistoryFirst?.date) add(asIso(pkg.invoiceHistoryFirst.date), pkg.invoiceHistoryFirst.invoiceNumber || null);
  add(asIso(pkg.annulledInvoiceDate), pkg.annulledInvoiceNumber ?? null);
  add(dateFromInvoiceNumber(pkg.annulledInvoiceNumber), pkg.annulledInvoiceNumber ?? null, true);
  add(asIso(pkg.invoicedAt), pkg.annulledInvoiceNumber || pkg.invoiceNumber || null);
  const current = pkg.invoiceNumber && !pkg.isTransitoria && pkg.invoiceNumber !== TRANSITORIA ? String(pkg.invoiceNumber) : "";
  if (current) {
    // Only an explicit invoiceDate is exact; otherwise the number's "noon" (never beats the same invoice's exact date).
    if (pkg.invoiceDate) add(currentInvoiceDate(pkg, current), current);
    add(dateFromInvoiceNumber(current), current, true);
  }
  for (const h of Array.isArray(pkg.statusHistory) ? pkg.statusHistory : []) {
    const note = String(h?.note || h?.notes || "");
    for (const m of note.matchAll(INVOICE_IN_NOTE)) add(dateFromInvoiceNumber(m[1]), m[1], true);
  }
  // An invoice's exact date beats the "noon" date read from the same invoice's number.
  const exact = new Set(out.filter((x) => !x.fromNumber && x.invoiceNumber).map((x) => x.invoiceNumber));
  return out.filter((x) => !(x.fromNumber && exact.has(x.invoiceNumber))).map(({ iso, invoiceNumber }) => ({ iso, invoiceNumber }));
}

/** "Día 1" of the package (see header). */
export function consolidationStart(pkg: any): ConsolidationStart {
  if (!pkg) return { date: null, invoiceNumber: null, scenario: "sin-datos" };
  // 1. The stored attribute (set once by first-invoice.ts / the backfill) is the truth.
  const stored = asIso(pkg.firstInvoiceDate);
  if (stored && toMs(stored)) return { date: stored, invoiceNumber: pkg.firstInvoiceNumber || null, scenario: "primera-factura" };
  const invoices = invoiceDatesOf(pkg);
  if (invoices.length) {
    const first = invoices.reduce((a, b) => (toMs(b.iso) < toMs(a.iso) ? b : a));
    return { date: first.iso, invoiceNumber: first.invoiceNumber, scenario: "primera-factura" };
  }
  const fc = asIso(pkg.firstConsolidatedAt);
  if (fc) return { date: fc, invoiceNumber: null, scenario: "sin-factura" };
  const firstEvent = (Array.isArray(pkg.statusHistory) ? pkg.statusHistory : [])
    .filter((h: any) => String(h?.status || "").toLowerCase() === "consolidated")
    .map((h: any) => asIso(h.changedAt || h.timestamp))
    .filter((d: string | null): d is string => !!d)
    .sort((a: string, b: string) => toMs(a) - toMs(b))[0];
  if (firstEvent) return { date: firstEvent, invoiceNumber: null, scenario: "sin-factura" };
  const fallback = asIso(pkg.manifestUpdatedAt) || asIso(pkg.createdAt) || asIso(pkg.savedAt);
  return fallback ? { date: fallback, invoiceNumber: null, scenario: "sin-factura" } : { date: null, invoiceNumber: null, scenario: "sin-datos" };
}

export type ConsolidationOp = { op: "add" | "remove" | "repair_since"; slCode: string; tracking: string; sp1PackageId: string; since?: string | null; sourceInvoiceNumber?: string | null; reason: string; eventId?: string; eventAt?: string };

/** The list operations one package write implies (enter → add, leave → remove, customer/tracking change → remove + add). */
export function consolidationOps(pkgId: string, before: any, after: any): ConsolidationOp[] {
  const wasIn = isInConsolidation(before), isIn = isInConsolidation(after);
  const kb = wasIn ? membershipKey(before) : null, ka = isIn ? membershipKey(after) : null;
  const same = !!kb && !!ka && kb.slCode === ka.slCode && kb.tracking === ka.tracking;
  if (same) return [];
  const ops: ConsolidationOp[] = [];
  if (kb) {
    const reason = !after ? "paquete eliminado en SP1"
      : isIn ? "cambió el cliente o el tracking en SP1"
      : TERMINAL.has(String(after.status ?? "").toLowerCase()) ? `estado ${after.status} en SP1`
      : "movido de consolidación a un manifiesto";
    ops.push({ op: "remove", ...kb, sp1PackageId: pkgId, reason });
  }
  if (ka) {
    const s = consolidationStart(after);
    ops.push({ op: "add", ...ka, sp1PackageId: pkgId, since: s.date, sourceInvoiceNumber: s.invoiceNumber, reason: wasIn ? "cambió el cliente o el tracking en SP1" : "entró a consolidación en SP1" });
  }
  return ops;
}
