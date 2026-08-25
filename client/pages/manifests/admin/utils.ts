/**
 * Utility functions for the Manifest Administration module.
 */

/**
 * Formats an ISO date string into a relative, user-friendly Costa Rica time representation.
 * Returns fallback string if date is missing or invalid.
 * 
 * @param iso ISO datetime string (e.g. 2026-05-22T08:36:54-06:00)
 * @returns Formatted relative or locale-specific date string
 */
export function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60_000);
  
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min}m`;
  
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours}h`;
  
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  
  return date.toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' });
}
