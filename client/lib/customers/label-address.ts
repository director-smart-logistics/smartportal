/**
 * F11 (docs/F11_LABEL_ADDRESS_AUDIT.md) — ONE rule for the address every shipping label, the Nova
 * label, the bulk encomienda labels and the encomienda dispatch/manifest print. Before, five copies
 * picked the address differently (an inactive default, addresses[0] even when inactive…) and a
 * hand-typed admin address won forever, even after the customer changed their address in SP2.
 *
 *   principalLabelAddress(c)  the customer's principal address — the one SP2 holds (F12): the active
 *                             defaultAddress, else the active one marked principal, else the first active.
 *   activeAdminOverride(c)    the address the admin typed on a label (adminAddressOverride) — only
 *                             while it is newer than the customer's address (savedAt). Once the
 *                             customer changes their address in SP2, the customer's address wins.
 *                             Overrides saved before F11 (no savedAt) keep today's behavior.
 *   areStringsRedundant / deduplicateAddressLines  the line de-duplication all screens shared as copies.
 *
 * Each screen keeps its own format. Pure; tested in __tests__/label-address.spec.ts.
 */

export interface LabelAddress {
  id?: string;
  streetAddress?: string | null;
  details?: string | null;
  district?: string | null;
  canton?: string | null;
  province?: string | null;
  deliveryInstructions?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  encomienda?: unknown;
  isDefault?: boolean;
  isPrimary?: boolean;
  isActive?: boolean;
  status?: string;
  updatedAt?: unknown;
  [key: string]: unknown;
}

export interface AdminAddressOverride {
  deliveryAddress: string;
  courierService?: string;
  encomiendaService?: string;
  savedAt?: string;
}

const isActive = (a: LabelAddress | null | undefined): a is LabelAddress =>
  !!a && a.isActive !== false && a.status !== "inactive";
const hasText = (a: LabelAddress) => !!(String(a.streetAddress || "").trim() || String(a.province || "").trim());
const toMs = (v: unknown): number => {
  if (!v) return 0;
  if (typeof (v as any).toMillis === "function") return (v as any).toMillis();
  if (typeof (v as any).seconds === "number") return (v as any).seconds * 1000;
  const ms = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(ms) ? ms : 0;
};

/** The customer's principal address (the one SP2 holds), or null. */
export function principalLabelAddress(c: { defaultAddress?: LabelAddress | null; addresses?: LabelAddress[] | null } | null | undefined): LabelAddress | null {
  if (!c) return null;
  if (isActive(c.defaultAddress) && hasText(c.defaultAddress)) return c.defaultAddress;
  const list = (c.addresses || []).filter((a) => isActive(a) && hasText(a));
  return list.find((a) => a.isDefault || a.isPrimary) || list[0] || null;
}

/** The admin's hand-typed label address, only while it is newer than the customer's address. */
export function activeAdminOverride(c: { adminAddressOverride?: AdminAddressOverride | null; defaultAddress?: LabelAddress | null; addresses?: LabelAddress[] | null } | null | undefined): AdminAddressOverride | null {
  const o = c?.adminAddressOverride;
  if (!o || !String(o.deliveryAddress || "").trim()) return null;
  if (!o.savedAt) return o; // saved before F11: unchanged behavior (reviewed by data, not by code)
  const principal = principalLabelAddress(c);
  return toMs(o.savedAt) >= toMs(principal?.updatedAt) ? o : null;
}

/**
 * Label modal (2026-10-07, owner): when a hand-typed admin address exists, the admin sees BOTH addresses with
 * their dates. This tells which one is newer — it does NOT change which one the label uses by default
 * (activeAdminOverride keeps deciding). 'unknown' = the admin address has no date (saved before F11).
 */
export function compareLabelAddresses(c: { adminAddressOverride?: AdminAddressOverride | null; defaultAddress?: LabelAddress | null; addresses?: LabelAddress[] | null } | null | undefined): {
  clientUpdatedAt: number; adminSavedAt: number; newer: "client" | "admin" | "unknown"; clientChangedAfter: boolean;
} {
  const clientUpdatedAt = toMs(principalLabelAddress(c)?.updatedAt);
  const adminSavedAt = toMs(c?.adminAddressOverride?.savedAt);
  if (!adminSavedAt) return { clientUpdatedAt, adminSavedAt, newer: "unknown", clientChangedAfter: false };
  const newer = adminSavedAt >= clientUpdatedAt ? "admin" : "client";
  return { clientUpdatedAt, adminSavedAt, newer, clientChangedAfter: newer === "client" };
}

// ── Line de-duplication (was copied in ShippingLabels, NovaShippingLabelModal and the dispatch) ──

function cleanStringForComparison(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, "") // keep only alphanumeric and spaces
    .trim();
}

/** True when str2 adds no significant word to str1 (e.g. "Instrucciones: portón negro" vs "Portón negro"). */
export function areStringsRedundant(str1: string, str2: string): boolean {
  const c1 = cleanStringForComparison(str1);
  const c2 = cleanStringForComparison(str2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;

  const stopWords = ["en", "el", "la", "de", "del", "un", "una", "los", "las", "y", "a", "con", "por", "para", "o", "u", "mini", "super", "instrucciones", "detalles", "señas", "entregar"];
  const words1 = c1.split(/\s+/).filter(Boolean);
  const words2 = c2.split(/\s+/).filter(Boolean);
  // Keep significant words of str2 that are not present in str1
  const uniqueTo2 = words2.filter((w) => !words1.includes(w) && !stopWords.includes(w));
  return uniqueTo2.length === 0;
}

/** Removes lines that repeat an earlier line (ignoring "Instrucciones:/Detalles:/Señas:" prefixes). */
export function deduplicateAddressLines(addressStr: string): string {
  if (!addressStr) return "";
  const lines = addressStr.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const cleanLine = line.replace(/^(instrucciones|detalles|señas):\s*/i, "");
    const isRedundant = uniqueLines.some((existing) =>
      areStringsRedundant(existing.replace(/^(instrucciones|detalles|señas):\s*/i, ""), cleanLine),
    );
    if (!isRedundant) uniqueLines.push(line);
  }
  return uniqueLines.join("\n");
}

// ── The full address text every shipping label prints (2026-09-27) ─────────────────────────────────
// Before, the Nova label, the bulk encomienda labels and the history reprint printed only street +
// details + instructions of the principal address: district, canton and province were missing, and the
// reprint/edit printed the text saved when the label was created (stale after an address change).

const present = (v: unknown) => String(v ?? "").trim();

/** "Distrito, Cantón, Provincia" of an address (only the parts it has, without repeats). */
export function locationLine(a: { district?: unknown; canton?: unknown; province?: unknown; distrito?: unknown; provincia?: unknown } | null | undefined): string {
  if (!a) return "";
  const parts: string[] = [];
  for (const p of [present(a.district || a.distrito), present(a.canton), present(a.province || a.provincia)]) {
    if (p && !parts.some((x) => cleanStringForComparison(x) === cleanStringForComparison(p))) parts.push(p);
  }
  return parts.join(", ");
}

/** The principal address as label lines: street, details, "Distrito, Cantón, Provincia", instructions. */
export function principalAddressText(a: LabelAddress | null | undefined): string {
  if (!a) return "";
  const street = present(a.streetAddress);
  const details = present(a.details);
  const instructions = present(a.deliveryInstructions);
  const lines: string[] = [];
  if (street) lines.push(street);
  if (details && !areStringsRedundant(street, details)) lines.push(details);
  const loc = locationLine(a);
  // The location line is skipped only when the street text already names all of it.
  if (loc && !areStringsRedundant(lines.join(" "), loc)) lines.push(loc);
  if (instructions && !areStringsRedundant(details, instructions) && !areStringsRedundant(street, instructions)) lines.push(`Instrucciones: ${instructions}`);
  return lines.join("\n");
}

/**
 * The address text a label prints for a customer, always from the customer's CURRENT data:
 * the admin's hand-typed address while it is newer (F11), else the principal address with its
 * district/canton/province, else the legacy location fields, else the route.
 */
export function customerLabelAddressText(c: Record<string, any> | null | undefined): string {
  if (!c) return "";
  const override = activeAdminOverride(c as any);
  if (override?.deliveryAddress) return deduplicateAddressLines(override.deliveryAddress);
  return customerAddressText(c);
}

/** The customer's own address text (no admin override): principal with location, else legacy fields, else route. */
export function customerAddressText(c: Record<string, any> | null | undefined): string {
  if (!c) return "";
  const principal = principalAddressText(principalLabelAddress(c as any));
  if (principal) return principal;
  const loc = c.location || c.direccion || c.address;
  if (loc && typeof loc === "object") {
    const detail = present(loc.addressDetail || loc.direccionExacta || loc.detail || loc.streetAddress || c.direccionExacta);
    const parts = [detail, locationLine(loc)].filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  if (present(c.direccionExacta)) return [present(c.direccionExacta), locationLine(c)].filter(Boolean).join("\n");
  const legacy = c.encomiendaAddress || c.address;
  if (present(legacy?.streetAddress)) return present(legacy.streetAddress);
  if (present(legacy?.deliveryInstructions)) return present(legacy.deliveryInstructions);
  return c.ruta ? `Ruta: ${c.ruta}` : "";
}

/**
 * Reprint / edit of a label saved earlier: its saved text may be outdated or incomplete.
 *   - the customer's address (or the admin's override) changed AFTER the label was saved → the current full text;
 *   - otherwise the saved text is kept (it may be a hand edit of that label), completed with the
 *     "Distrito, Cantón, Provincia" line when it lacks it (labels saved before 2026-09-27 had no location).
 */
export function reprintLabelAddressText(c: Record<string, any> | null | undefined, saved: string | null | undefined, savedAt: unknown): string {
  const savedText = String(saved ?? "").trim();
  const current = customerLabelAddressText(c);
  if (!current) return savedText;
  if (!savedText) return current;
  const principal = principalLabelAddress(c as any);
  const override = activeAdminOverride(c as any);
  const changedAt = Math.max(toMs(principal?.updatedAt), toMs(override?.savedAt));
  if (changedAt > toMs(savedAt)) return current;
  const loc = override?.deliveryAddress ? "" : locationLine(principal);
  return loc && !areStringsRedundant(savedText.replace(/\n/g, " "), loc) ? `${savedText}\n${loc}` : savedText;
}
