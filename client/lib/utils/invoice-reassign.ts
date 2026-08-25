/**
 * Pure helpers for the invoice reassign flow (/invoices → "Reasignar").
 *
 * The UI handler in `InvoiceGeneration.tsx` delegates two small but
 * error-prone decisions to this module:
 *
 *   1. Rewriting the invoice number when ownership changes.
 *   2. Detecting whether the previous owner was a temp customer so the
 *      placeholder in `temp_customers` can be cleaned up.
 *
 * Keeping both in a pure, dependency-free file makes them unit-testable
 * without mounting the entire invoices page.
 */

/**
 * Prefix regex for invoice numbers. Anchors on "everything before the first
 * `-` followed by 10+ digits (the timestamp)", which covers ALL observed
 * prefix shapes:
 *
 *   - Real customer:            `SL26632-20260428120000000`
 *   - Temp customer:            `SL-NAN-00813-20260428120000000`
 *   - Manifest-prefixed:        `SL-MAN-00813-20260428120000000`
 *   - Route-name placeholder:   any route declared in `ROUTE_COLORS` leaked
 *                               into the invoice number when a customer
 *                               was not matched (`San Jose Centro`,
 *                               `San Jose Escazu`, `San Jose Coronado`,
 *                               `Cartago 1`, `Cartago 2`, `Encomiendas`,
 *                               `Occidente`, `Alajuela`, `Heredia`,
 *                               `Retira`, `Desconocida`).
 *
 * Group 1: the prefix (non-greedy — stops at the first hyphen followed by
 *          a timestamp).
 * Group 2: the hyphen separating prefix from timestamp — preserved via `$2`.
 *
 * The lookahead `(?=\d{10,})` ensures we only match when the timestamp
 * follows; unrelated inputs (e.g. `INV-001`) are returned unchanged.
 */
const INVOICE_PREFIX_RE = /^(.+?)(-)(?=\d{10,})/;

/**
 * Replace the SL code prefix in an invoice number with a new slCode.
 *
 * Examples:
 *   replaceInvoiceNumberPrefix('SL26339-20260428120000000', 'SL26549')
 *   → 'SL26549-20260428120000000'
 *
 *   replaceInvoiceNumberPrefix('SL-NAN-00813-20260428120000000', 'SL26632')
 *   → 'SL26632-20260428120000000'
 *
 *   replaceInvoiceNumberPrefix('SL-MAN-00813-20260428120000000-C', 'SL26632')
 *   → 'SL26632-20260428120000000-C'
 *
 * When the input does not start with a recognized prefix it is returned
 * unchanged. The new slCode is always upper-cased.
 */
export function replaceInvoiceNumberPrefix(invoiceNumber: string, newSlCode: string): string {
  if (!invoiceNumber || !newSlCode) return invoiceNumber;
  return invoiceNumber.replace(INVOICE_PREFIX_RE, `${newSlCode.toUpperCase()}$2`);
}

/**
 * Whether the given slCode identifies a temp customer placeholder
 * (`SL-NAN-NNNNN`). Temp customers live in the `temp_customers`
 * collection and can be safely deleted once no invoice references them.
 *
 * Intentionally does NOT flag `SL-MAN-*` — those come from manifest
 * numbering and do not correspond to a temp_customers document.
 */
export function isTempSlCode(slCode: string | null | undefined): boolean {
  if (!slCode) return false;
  return /^SL-NAN-/i.test(slCode);
}

/**
 * Whether the given invoice number belongs to a temp customer placeholder
 * (prefix `SL-NAN-*`). Narrow check — the UI uses {@link isOrphanInvoiceNumber}
 * for the broader "not a real customer" highlight; this helper is reserved
 * for code paths that are specific to `temp_customers` (e.g. cleanup).
 */
export function isTempInvoiceNumber(invoiceNumber: string | null | undefined): boolean {
  if (!invoiceNumber) return false;
  return /^SL-NAN-/i.test(invoiceNumber);
}

/**
 * Real-customer slCode shape: `SL` followed by one or more digits, with no
 * internal hyphens, spaces, or letters. Everything else is "orphan":
 *   - Temp customers:       `SL-NAN-00813`
 *   - Manifest prefixes:    `SL-MAN-00813`
 *   - Route-name leaks:     `Cartago 1`, `San Jose Centro`, `Encomiendas`
 *   - Empty / null
 *
 * Used by the UI to decide whether to surface a "temp / orphan" warning
 * badge + red button pulse on the invoice row.
 */
export function isOrphanSlCode(slCode: string | null | undefined): boolean {
  if (!slCode) return true;
  return !/^SL\d+$/i.test(slCode.trim());
}

/**
 * Whether an invoice number's leading prefix is NOT a real SL customer code.
 * Extracts the prefix (everything before `-<10+ digit timestamp>`) and
 * applies {@link isOrphanSlCode}. Returns `false` for invoice numbers whose
 * format is unrecognised (we don't want to flag those blindly).
 */
export function isOrphanInvoiceNumber(invoiceNumber: string | null | undefined): boolean {
  if (!invoiceNumber) return false;
  const m = invoiceNumber.match(/^(.+?)-\d{10,}/);
  if (!m) return false;
  return isOrphanSlCode(m[1]);
}

/**
 * Shared tooltip text surfaced wherever an orphan reference is highlighted.
 * Intentionally generic — covers temp customers, route-name leaks, and any
 * other non-canonical slCode.
 */
export const TEMP_WARNING_TITLE =
  'Cliente no vinculado a un registro real de customers — la factura no tiene un código SL válido y puede no sincronizarse con SmartWeb. Reasígnala a un cliente real.';
