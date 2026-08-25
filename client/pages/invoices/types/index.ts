export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled" | "annulled" | "deleted";

export type SortOrder = "none" | "name-asc" | "name-desc";


export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  status: InvoiceStatus;
  subtotalAmount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  currency: string;
  invoiceDate: string;
  dueDate?: string;
  notes?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  lastResendMessageId?: string;
  emailResendIds?: string[];
  emailStatus?: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
  emailStatusUpdatedAt?: string;
  emailStatusLogs?: Array<{
    status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
    timestamp: string;
    emailId: string;
    metadata?: Record<string, any>;
  }>;
  emailSendLogs?: Array<{
    resendMessageId: string | null;
    sentTo: string;
    sentAt: string;
    sentBy: string;
    invoiceNumber?: string;
  }>;
  smsSent?: boolean;
  invoiceItems?: Array<{ 
    packageId?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    weight?: number;
    trackingNumber?: string;
    isManual?: boolean;
    requiresPermit?: boolean;
  }>;
  customer?: Customer;
  clientName?: string;
  clientEmail?: string;
  slCode?: string;
  source?: 'nova' | 'manual' | 'maritime';
  manifestNumber?: string;
  clientPhone?: string;
  clientDni?: string;
  origin?: string;
  destination?: string;
  exchangeRate?: number;
  smartwebSynced?: boolean;
  smartwebSyncedAt?: string | null;
  clientSlCode?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  slCode?: string;
  ruta?: string | null;
  dni?: string;
}

export interface Package {
  id: string;
  trackingNumber: string;
  weight: number;
  origin: string;
  destination: string;
  calculatedCost?: number;
}
