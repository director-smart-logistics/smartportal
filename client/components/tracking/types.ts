import { Timestamp } from "firebase/firestore";

// ── Pre-Alert shape from Firestore ────────────────────────────────────────────

export interface PreAlertDoc {
  id: string;
  tracking: string;
  canonicalTracking?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dni?: string | null;
  slCode?: string | null;
  userId?: string | null;
  weight?: number | null;
  origin?: string | null;
  destinationCountry?: string | null;
  requiresPermit?: boolean;
  manifestId?: string | null;
  status?: string;
  statusLabel?: string;
  description?: string | null;
  preAlertCreatedAt?: Timestamp | string | null;
}

// ── Discrepancy detection ─────────────────────────────────────────────────────

export type DiscKey =
  | "customerName"
  | "weight"
  | "manifestId"
  | "description"
  | "slCode";
export type DiscSet = Set<DiscKey>;

export interface SistemaDiscrepancySource {
  customerName?: string | null;
  weight?: number | null;
  manifestId?: string | null;
  description?: string | null;
}

export interface ExternalDiscrepancySource {
  customerName?: string;
  weight?: number | null;
  manifestId?: string | null;
  description?: string;
}

export function computeDiscrepancies(
  sistema: SistemaDiscrepancySource,
  external: ExternalDiscrepancySource,
): DiscSet {
  const d: DiscSet = new Set();
  const n = (s?: string | null) =>
    (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  if (
    n(sistema.customerName) &&
    n(external.customerName) &&
    n(sistema.customerName) !== n(external.customerName)
  ) {
    d.add("customerName");
  }
  if (
    sistema.weight != null &&
    external.weight != null &&
    Math.abs(sistema.weight - external.weight) > 0.05
  ) {
    d.add("weight");
  }
  if (
    n(sistema.manifestId) &&
    n(external.manifestId) &&
    n(sistema.manifestId) !== n(external.manifestId)
  ) {
    d.add("manifestId");
  }
  if (
    n(sistema.description) &&
    n(external.description) &&
    n(sistema.description) !== n(external.description)
  ) {
    d.add("description");
  }
  return d;
}

export function discClass(flag: boolean): string {
  return flag ? "text-red-600 font-semibold" : "";
}

export function formatPreAlertTs(
  ts: Timestamp | string | null | undefined,
): string {
  if (!ts) return "—";
  const date = ts instanceof Timestamp ? ts.toDate() : new Date(String(ts));
  return isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("es-CR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
