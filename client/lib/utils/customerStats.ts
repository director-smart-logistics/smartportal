import type { Package, CustomerStats } from '@/types';

/**
 * Calculate customer statistics from package data
 * 
 * @param packages - Array of customer packages
 * @param customerCreatedAt - Customer creation date
 * @returns CustomerStats object
 */
export function calculateCustomerStats(
  packages: Package[],
  customerCreatedAt: string
): CustomerStats {
  const now = new Date();
  const createdDate = new Date(customerCreatedAt);
  const daysAsCustomer = Math.max(0, Math.floor(
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
  ));

  const totalPackages = packages.length;
  
  const activeStatuses = ['pending', 'intake', 'in_transit', 'custom_released'];
  const activePackages = packages.filter(pkg => 
    activeStatuses.includes(pkg.status)
  ).length;
  
  const deliveredPackages = packages.filter(pkg => 
    pkg.status === 'delivered'
  ).length;
  
  // Ensure totalWeight is always a number
  const totalWeight = packages.reduce((sum, pkg) => {
    const weight = typeof pkg.weight === 'number' ? pkg.weight : parseFloat(pkg.weight) || 0;
    return sum + weight;
  }, 0);
  
  // Ensure totalValue is always a number
  const totalValue = packages.reduce((sum, pkg) => {
    const cost = typeof pkg.calculatedCost === 'number' 
      ? pkg.calculatedCost 
      : parseFloat(pkg.calculatedCost as any) || 0;
    return sum + cost;
  }, 0);
  
  const averagePackageWeight = totalPackages > 0 
    ? totalWeight / totalPackages 
    : 0;
  
  // Find last activity date (most recent package update or creation)
  const lastActivityDate = packages.length > 0
    ? packages.reduce((latest, pkg) => {
        const pkgDate = new Date(pkg.updatedAt || pkg.createdAt);
        return pkgDate > latest ? pkgDate : latest;
      }, new Date(packages[0].updatedAt || packages[0].createdAt))
    : null;

  return {
    totalPackages,
    activePackages,
    deliveredPackages,
    totalValue: Number(totalValue) || 0,
    totalWeight: Number(totalWeight) || 0,
    lastActivityDate: lastActivityDate ? lastActivityDate.toISOString() : null,
    daysAsCustomer,
    averagePackageWeight: Number(averagePackageWeight) || 0,
  };
}

/**
 * Format relative time (e.g., "2 days ago", "3 hours ago")
 * 
 * @param date - Date to format
 * @param locale - Locale for formatting (default: 'en')
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: string | Date, locale: string = 'en'): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffYear > 0) {
    return rtf.format(-diffYear, 'year');
  } else if (diffMonth > 0) {
    return rtf.format(-diffMonth, 'month');
  } else if (diffWeek > 0) {
    return rtf.format(-diffWeek, 'week');
  } else if (diffDay > 0) {
    return rtf.format(-diffDay, 'day');
  } else if (diffHour > 0) {
    return rtf.format(-diffHour, 'hour');
  } else if (diffMin > 0) {
    return rtf.format(-diffMin, 'minute');
  } else {
    return rtf.format(-diffSec, 'second');
  }
}

/**
 * Copy text to clipboard
 * 
 * @param text - Text to copy
 * @returns Promise that resolves when text is copied
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
