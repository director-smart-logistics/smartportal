import React from "react";
import { CheckCircle, Clock, AlertCircle, X } from "lucide-react";
import { type InvoiceStatus } from "../types";

export const getStatusColor = (status: InvoiceStatus) => {
  switch (status) {
    case "draft":     return "bg-muted text-muted-foreground";
    case "sent":      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "paid":      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "overdue":   return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "cancelled": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "annulled":  return "bg-muted text-muted-foreground line-through";
    default:          return "bg-muted text-muted-foreground";
  }
};

export const STATUS_DOT: Record<InvoiceStatus, string> = {
  draft:     "bg-muted-foreground",
  sent:      "bg-blue-500",
  paid:      "bg-emerald-500",
  overdue:   "bg-amber-500",
  cancelled: "bg-red-500",
  annulled:  "bg-muted-foreground",
  deleted:   "bg-destructive/40",
};

export const getStatusIcon = (status: InvoiceStatus) => {
  switch (status) {
    case "draft":
      return <Clock className="h-4 w-4" />;
    case "sent":
      return <CheckCircle className="h-4 w-4" />;
    case "paid":
      return <CheckCircle className="h-4 w-4" />;
    case "overdue":
      return <AlertCircle className="h-4 w-4" />;
    case "cancelled":
      return <AlertCircle className="h-4 w-4" />;
    case "annulled":
      return <X className="h-4 w-4" />;
    default:
      return null;
  }
};

export const formatCurrency = (amount: number, currencyCode: string = "USD") => {
  const currencySymbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CRC: "₡",
    MXN: "$",
    CAD: "C$",
    AUD: "A$",
  };

  const symbol = currencySymbols[currencyCode] || currencyCode;
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `${symbol} ${safeAmount.toFixed(2)} ${currencyCode}`;
};
