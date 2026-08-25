export const calculateTotalWeight = (items: any[]): number => {
  return items.reduce((sum, item) => sum + (item.weight ?? 0), 0);
};

export const calculateTotalAmount = (invoices: any[]): number => {
  return Math.round(invoices.reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0) * 100) / 100;
};

export const calculateSubtotalAmount = (invoices: any[]): number => {
  return Math.round(invoices.reduce((sum, inv) => sum + (inv.subtotalAmount ?? inv.totalAmount ?? 0), 0) * 100) / 100;
};

export const calculateTaxAmount = (invoices: any[]): number => {
  return Math.round(invoices.reduce((sum, inv) => sum + (inv.taxAmount ?? 0), 0) * 100) / 100;
};

export const calculateFieldSum = (items: any[], field: string): number => {
  return items.reduce((sum, item) => sum + (item[field] ?? 0), 0);
};

export const toUSD = (price: number, currency?: string, exchangeRate: number = 500): number => {
  if (!price) return 0;
  if (currency === 'CRC') {
    return price / exchangeRate;
  }
  return price;
};

export const calculateItemsSubtotal = (
  items: any[],
  useToUSD: boolean = false,
  exchangeRate: number = 500
): number => {
  if (useToUSD) {
    return items.reduce((sum, i) => sum + toUSD(i.unitPrice, i.currency, exchangeRate) * (i.quantity ?? 1), 0);
  }
  return items.reduce((sum, i) => sum + (i.totalPrice ?? (i.unitPrice * (i.quantity ?? 1))), 0);
};
