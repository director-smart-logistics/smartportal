/**
 * Date & Time Utilities for SmartLogistics (Costa Rica Timezone)
 * 
 * Single Source of Truth for all date and time operations across the system.
 * Costa Rica operates on America/Costa_Rica (UTC-6 standard time, no DST).
 * 
 * All invoice numbering, financial timestamps, audit logs, manifest dates,
 * and user-facing date formats MUST use Costa Rica time, regardless of where
 * the operator/admin is located in the world (e.g., Japan UTC+9, Europe, USA).
 */

export const COSTA_RICA_TIMEZONE = 'America/Costa_Rica';

export interface CostaRicaDateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  yearStr: string;
  monthStr: string;
  dayStr: string;
  hourStr: string;
  minuteStr: string;
  secondStr: string;
  millisecondStr: string;
  isoDate: string; // YYYY-MM-DD in Costa Rica
}

/**
 * Safely parse any date value (Date, ISO string, epoch seconds/millis, Firestore Timestamp { seconds, nanoseconds }, { _seconds }, or { toDate() })
 */
export function parseDateSafe(dateVal: any): Date | null {
  if (dateVal == null || dateVal === '') return null;
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  if (typeof dateVal === 'object') {
    if (typeof dateVal.toDate === 'function') {
      const d = dateVal.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal._seconds != null && typeof dateVal._seconds === 'number') {
      const d = new Date(dateVal._seconds * 1000 + (dateVal._nanoseconds ? Math.floor(dateVal._nanoseconds / 1e6) : 0));
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateVal.seconds != null && typeof dateVal.seconds === 'number') {
      const d = new Date(dateVal.seconds * 1000 + (dateVal.nanoseconds ? Math.floor(dateVal.nanoseconds / 1e6) : 0));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal < 10000000000 ? dateVal * 1000 : dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (!trimmed) return null;
    if (/^\d{10,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      const d = new Date(num < 10000000000 ? num * 1000 : num);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Formats a customer detail timestamp (e.g. "11 sept 2026, 02:00 p. m.") in Costa Rica timezone.
 */
export function formatCustomerDetailDate(dateVal: unknown): string {
  if (!dateVal) return '';
  const d = parseDateSafe(dateVal);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('es-CR', {
      timeZone: COSTA_RICA_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Extracts individual date and time components in Costa Rica timezone (America/Costa_Rica, UTC-6).
 * 
 * Guaranteed to produce the exact Costa Rica calendar date and local hour regardless of
 * the client browser's local timezone (e.g. if the admin is traveling in Tokyo JST or London GMT).
 */
export function getCostaRicaDateParts(dateVal: Date | string | number | null = new Date()): CostaRicaDateParts {
  const d = parseDateSafe(dateVal) || new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: COSTA_RICA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getP = (type: string) => parts.find(p => p.type === type)?.value || '00';

  let hourVal = parseInt(getP('hour'), 10);
  if (hourVal === 24) hourVal = 0;

  const year = parseInt(getP('year'), 10);
  const month = parseInt(getP('month'), 10);
  const day = parseInt(getP('day'), 10);
  const hours = hourVal;
  const minutes = parseInt(getP('minute'), 10);
  const seconds = parseInt(getP('second'), 10);
  const milliseconds = d.getUTCMilliseconds();

  const yearStr = String(year).padStart(4, '0');
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const hourStr = String(hours).padStart(2, '0');
  const minuteStr = String(minutes).padStart(2, '0');
  const secondStr = String(seconds).padStart(2, '0');
  const millisecondStr = String(milliseconds).padStart(3, '0');

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
    yearStr,
    monthStr,
    dayStr,
    hourStr,
    minuteStr,
    secondStr,
    millisecondStr,
    isoDate: `${yearStr}-${monthStr}-${dayStr}`,
  };
}

/**
 * Returns today's date in Costa Rica as an ISO string YYYY-MM-DD (e.g. "2026-08-17").
 */
export function getCostaRicaTodayISO(): string {
  return getCostaRicaDateParts().isoDate;
}

/**
 * Format a date in Costa Rica locale and timezone (DD/MM/YYYY by default).
 * Preserves pre-formatted strings like "15/08/2026".
 */
export function formatCostaRicaDate(dateVal: any, options?: Intl.DateTimeFormatOptions): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'string' && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(dateVal)) {
    return dateVal;
  }
  const d = parseDateSafe(dateVal);
  if (!d) return String(dateVal || '');

  try {
    return d.toLocaleDateString('es-CR', {
      timeZone: COSTA_RICA_TIMEZONE,
      ...options,
    });
  } catch {
    return String(dateVal);
  }
}

/**
 * Format a date and time in Costa Rica locale and timezone (e.g. "17/8/2026, 21:07:12").
 */
export function formatCostaRicaDateTime(dateVal: any, options?: Intl.DateTimeFormatOptions): string {
  if (!dateVal) return '';
  const d = parseDateSafe(dateVal);
  if (!d) return String(dateVal || '');

  try {
    return d.toLocaleString('es-CR', {
      timeZone: COSTA_RICA_TIMEZONE,
      ...options,
    });
  } catch {
    return String(dateVal);
  }
}

/**
 * Extracts embedded date from invoice numbers (e.g. SL4859-20260416154146-C)
 * and formats it in Costa Rica timezone.
 */
export function extractDateFromInvoiceNumber(num?: string, options?: Intl.DateTimeFormatOptions): string {
  if (!num) return "-";
  const iso = extractDateIsoFromInvoiceNumber(num);
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: COSTA_RICA_TIMEZONE,
    ...options,
  });
}

/**
 * Extracts embedded date from invoice numbers (e.g. SL4859-20260416154146-C, SL2565-20260821191605309, INV-20260918)
 * and returns Costa Rica ISO string YYYY-MM-DDTHH:mm:ss-06:00.
 */
export function extractDateIsoFromInvoiceNumber(num?: string): string | null {
  if (!num) return null;
  const m = num.match(/(?:-|^|\b)(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 2020 || y > 2050 || mon < 1 || mon > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00-06:00`;
}

/**
 * Extracts the authoritative invoice emission date from any invoice object or raw data.
 * Checks in order: invoiceDate, createdAt, date, invoicedAt, or encoded date in invoiceNumber.
 * Guaranteed to return an ISO string or null.
 */
export function extractInvoiceEmissionDate(inv: any): string | null {
  if (!inv) return null;

  // 1. Explicit invoiceDate field
  if (inv.invoiceDate) {
    if (typeof (inv.invoiceDate as any).toDate === 'function') {
      return (inv.invoiceDate as any).toDate().toISOString();
    }
    if (typeof inv.invoiceDate === 'string' && inv.invoiceDate.trim()) {
      const trimmed = inv.invoiceDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return `${trimmed}T12:00:00-06:00`;
      }
      const parsed = parseDateSafe(trimmed);
      if (parsed) return parsed.toISOString();
    }
  }

  // 2. createdAt field (Timestamp or ISO string)
  if (inv.createdAt) {
    if (typeof (inv.createdAt as any).toDate === 'function') {
      return (inv.createdAt as any).toDate().toISOString();
    }
    if (typeof inv.createdAt === 'string' && inv.createdAt.trim()) {
      const parsed = parseDateSafe(inv.createdAt);
      if (parsed) return parsed.toISOString();
    }
  }

  // 3. date field
  if (inv.date) {
    if (typeof (inv.date as any).toDate === 'function') {
      return (inv.date as any).toDate().toISOString();
    }
    if (typeof inv.date === 'string' && inv.date.trim()) {
      const trimmed = inv.date.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return `${trimmed}T12:00:00-06:00`;
      }
      const parsed = parseDateSafe(trimmed);
      if (parsed) return parsed.toISOString();
    }
  }

  // 4. invoicedAt field
  if (inv.invoicedAt) {
    const parsed = parseDateSafe(inv.invoicedAt);
    if (parsed) return parsed.toISOString();
  }

  // 5. Date encoded in invoiceNumber or annulledInvoiceNumber
  const numToParse = inv.invoiceNumber || inv.annulledInvoiceNumber || (typeof inv === 'string' ? inv : null);
  if (numToParse && typeof numToParse === 'string') {
    const fromNum = extractDateIsoFromInvoiceNumber(numToParse);
    if (fromNum) return fromNum;
  }

  return null;
}
