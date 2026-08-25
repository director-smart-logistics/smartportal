import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detects if a package/invoice or its associated customer is configured for consolidation.
 * Uses a three-tier check:
 * 1. Checks if the customer profile in the provided map has consolidationEnabled === true.
 * 2. Checks if the item itself has explicit consolidation flags (e.g., consolidaFlag, isConsolidation, consolidacion, etc.).
 * 3. Checks if the invoice number suggests consolidation (e.g. ends with '-C' or contains '-CONSOLIDACION').
 */
export function isCustomerConsolidating(
  item: any,
  customerMap?: Map<string, any> | Record<string, any> | null
): boolean {
  if (!item) return false;

  // 1. Resolve client/customer code from package or invoice
  const slCode = item.slCode || item.clientSlCode || item.customer?.slCode || (item.invoiceNumber ? null : (item.customerId || item.clientId));

  // 2. Try lookup in customerMap
  if (slCode && customerMap) {
    let customerProfile: any = null;
    if (customerMap instanceof Map) {
      customerProfile = customerMap.get(slCode);
    } else {
      customerProfile = customerMap[slCode];
    }
    if (customerProfile && typeof customerProfile.consolidationEnabled === 'boolean') {
      if (customerProfile.consolidationEnabled) {
        return true;
      }
    }
  }

  // 3. Check inline customer profile if embedded
  const embeddedCustomer = item.customer;
  if (embeddedCustomer && typeof embeddedCustomer.consolidationEnabled === 'boolean') {
    if (embeddedCustomer.consolidationEnabled) {
      return true;
    }
  }

  // 4. Check explicit flags on the item itself (for packages or invoices)
  const isCons =
    item.isConsolidation === true ||
    item.consolidacion === true ||
    item.consolidaFlag === true ||
    item.consolida === true ||
    item.tipo === 'consolidacion';

  if (isCons) return true;

  // 5. Check invoice number suffix format
  if (item.invoiceNumber && typeof item.invoiceNumber === 'string') {
    const num = item.invoiceNumber;
    if (num.endsWith('-C') || num.includes('-CONSOLIDACION')) {
      return true;
    }
  }

  return false;
}

/**
 * Safely formats employee dates (e.g. hireDate) without timezone boundary shifts.
 * Prevents UTC midnight rollback (e.g. May 13 becoming May 12 in UTC-6).
 */
export function safeFormatEmployeeDate(dateVal?: string | null): string {
  if (!dateVal) return "—";
  const str = String(dateVal).trim();
  if (!str) return "—";

  let cleanStr = str;
  if (cleanStr.includes("T")) {
    cleanStr = cleanStr.split("T")[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
    const [y, m, d] = cleanStr.split("-").map(Number);
    return `${d}/${m}/${y}`;
  }

  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(str)) {
    return str;
  }

  try {
    const d = new Date(str.includes("T") ? str : str + "T12:00:00");
    if (!isNaN(d.getTime())) {
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }
  } catch {}

  return str;
}

export {
  COSTA_RICA_TIMEZONE,
  getCostaRicaDateParts,
  formatCostaRicaDate,
  formatCostaRicaDateTime,
  getCostaRicaTodayISO,
  parseDateSafe,
  extractDateFromInvoiceNumber,
} from "./utils/date-utils";

