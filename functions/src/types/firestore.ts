import { Timestamp } from "firebase-admin/firestore";

// ============================================
// Base Types
// ============================================

export type UserRole = "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
export type PackageStatus = "pending" | "in_transit" | "delivered" | "returned" | "cancelled";
export type PackageType = "air" | "sea" | "ground";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
export type DeliveryStatus = "pending" | "in_progress" | "completed" | "failed";
export type RouteStatus = "active" | "in_progress" | "completed" | "cancelled";

// ============================================
// User Profile (subcollection: users/{uid}/profile)
// ============================================

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: UserRole;
  status: "active" | "inactive" | "suspended";
  photoURL: string | null;
  lastLogin: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Customer
// ============================================

export interface Customer {
  id: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  dni: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  zipCode: string | null;
  slCode: string | null;
  status: "active" | "inactive";
  tier: "basic" | "premium" | "vip";
  membershipExpires: Timestamp | null;
  preferredRouteId: string | null;
  acceptMarketing: boolean;
  consolidationEnabled: boolean;
  electronicInvoiceRequired: boolean;
  deliveryAddress1: string | null;
  deliveryAddress2: string | null;
  deliveryAddress3: string | null;
  notes: string | null;
  memberSince: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string | null;
  updatedBy: string | null;
}

// ============================================
// Package
// ============================================

export interface Package {
  id: string;
  trackingNumber: string;
  /**
   * Searchable variants index — populated on every create/update by the
   * client-side manifest ingester and back-filled by `slBackfillTrackingVariants`.
   * Used by `slScannerLookup` for `array-contains-any` partial-tracking matches.
   */
  trackingVariants?: string[];
  customerId: string | null;
  customerName: string;
  status: PackageStatus;
  weight: number;
  origin: string | null;
  destination: string | null;
  routeId: string | null;
  description: string;
  guideId: string | null;
  type: PackageType;
  category: "regular" | "fragile" | "express" | "hazmat";
  branch: string | null;
  flagStatus: "normal" | "warning" | "urgent";
  daysInSystem: number;
  manifestNumber: string | null;
  invoiceId: string | null;
  invoiceReady: boolean;
  invoicePdfUrl: string | null;
  slCode: string | null;
  calculatedCost: number | null;
  costCalculationDate: Timestamp | null;
  isConsolidated: boolean;
  consolidatedId: string | null;
  consolidatedPackageIds: string[];
  consolidatedIntoId: string | null;
  consolidationFees: number;
  consolidationWarnings: string[];
  consolidationValidated: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string | null;
}

// ============================================
// Tracking History (subcollection: packages/{id}/trackingHistory)
// ============================================

export interface TrackingHistory {
  id: string;
  packageId: string;
  status: string;
  location: string;
  notes: string | null;
  createdAt: Timestamp;
}

// ============================================
// Delivery
// ============================================

export interface Delivery {
  id: string;
  trackingNumber: string;
  customerName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: DeliveryStatus;
  routeId: string | null;
  assignedTo: string | null;
  packageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
}

// ============================================
// Route
// ============================================

export interface Route {
  id: string;
  name: string;
  description: string | null;
  originLocation: string;
  destinationLocation: string;
  estimatedDistance: number | null;
  estimatedDuration: string | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  assignedAgentId: string | null;
  status: RouteStatus;
  totalPackages: number;
  completedPackages: number;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Route Package (subcollection: routes/{id}/packages)
// ============================================

export interface RoutePackage {
  id: string;
  routeId: string;
  packageId: string;
  sequenceOrder: number | null;
  deliveryStatus: "pending" | "in_progress" | "delivered" | "failed";
  deliveryNotes: string | null;
  deliveredAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Invoice
// ============================================

export interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotalAmount: number;
  taxAmount: number;
  taxRate: number;
  discountAmount: number;
  discountPercentage: number;
  totalAmount: number;
  currency: string;
  exchangeRate: number | null;
  invoiceDate: Timestamp;
  dueDate: Timestamp | null;
  sentAt: Timestamp | null;
  paidAt: Timestamp | null;
  notes: string | null;
  internalNotes: string | null;
  emailSent: boolean;
  smsSent: boolean;
  pdfUrl: string | null;
  pdfPath: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  clientSlCode: string | null;
  clientEmail: string | null;
  clientDni: string | null;
  clientPhone: string | null;
  consolidationFees: number;
  consolidationWarnings: string[];
  consolidationValidated: boolean;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Invoice Item (subcollection: invoices/{id}/items)
// ============================================

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  packageId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  origin: string | null;
  destination: string | null;
  createdAt: Timestamp;
}

// ============================================
// Settings
// ============================================

export interface Setting {
  id: string;
  key: string;
  value: string;
  type: "string" | "number" | "boolean" | "json";
  category: string;
  description: string | null;
  isPublic: boolean;
  countryCode: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Permission
// ============================================

export interface Permission {
  id: string;
  role: UserRole;
  resource: string;
  action: "view" | "create" | "update" | "delete" | "manage";
  allowed: boolean;
  description: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Audit Log
// ============================================

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: "success" | "failure";
  errorMessage: string | null;
  affectedRows: number | null;
  createdAt: Timestamp;
}

// ============================================
// Scanner History
// ============================================

export interface ScannerHistory {
  id: string;
  trackingNumber: string;
  carrier: string | null;
  confidence: number | null;
  scanMethod: "manual" | "camera" | "barcode";
  extractionMethod: string | null;
  packageFound: boolean;
  packageId: string | null;
  needsConfirmation: boolean;
  statusBefore: string | null;
  statusAfter: string | null;
  intakeConfirmed: boolean;
  confirmedAt: Timestamp | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  distance: number | null;
  processingTime: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
}

// ============================================
// Quote
// ============================================

export interface Quote {
  id: string;
  customerId: string | null;
  quoteNumber: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";
  subtotalAmount: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  quoteDate: Timestamp;
  validUntil: Timestamp | null;
  notes: string | null;
  customerType: "individual" | "company";
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadCompany: string | null;
  leadAddress: string | null;
  leadTaxId: string | null;
  leadCity: string | null;
  leadCountry: string | null;
  aiSuggestions: Record<string, unknown> | null;
  aiDealScore: number | null;
  convertedToInvoiceId: string | null;
  convertedAt: Timestamp | null;
  createdBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Quote Item (subcollection: quotes/{id}/items)
// ============================================

export interface QuoteItem {
  id: string;
  quoteId: string;
  description: string;
  itemType: "shipping" | "handling" | "insurance" | "customs" | "other";
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number | null;
  dimensions: string | null;
  origin: string | null;
  destination: string | null;
  createdAt: Timestamp;
}

// ============================================
// Manifest
// ============================================

export interface Manifest {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  manifestNumber: string | null;
  originCountry: string | null;
  currency: string;
  weightUnit: string;
  status: "processing" | "completed" | "failed";
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateRows: number;
  unmatchedRows: number;
  processingStartedAt: Timestamp;
  processingCompletedAt: Timestamp | null;
  errorSummary: string | null;
  uploadedBy: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Payroll Types (for HR module)
// ============================================

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: "active" | "inactive";
  countryCode: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Employee {
  id: string;
  userId: string | null;
  idNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  hireDate: Timestamp;
  terminationDate: Timestamp | null;
  baseSalary: number;
  salaryFrequency: "monthly" | "biweekly" | "weekly";
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  countryCode: string;
  status: "active" | "inactive" | "terminated";
  paymentMethod: "bank_transfer" | "check" | "cash";
  bankAccount: string | null;
  bankName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// Collection Names (constants)
// ============================================

export const COLLECTIONS = {
  USERS: "users",
  CUSTOMERS: "customers",
  PACKAGES: "packages",
  DELIVERIES: "deliveries",
  ROUTES: "routes",
  INVOICES: "invoices",
  SETTINGS: "settings",
  PERMISSIONS: "permissions",
  AUDIT_LOGS: "auditLogs",
  AUDIT: "audit_logs",
  SCANNER_HISTORY: "scannerHistory",
  QUOTES: "quotes",
  MANIFESTS: "manifests",
  DEPARTMENTS: "departments",
  EMPLOYEES: "employees",
} as const;

// Subcollections
export const SUBCOLLECTIONS = {
  PROFILE: "profile",
  TRACKING_HISTORY: "trackingHistory",
  ITEMS: "items",
  ROUTE_PACKAGES: "packages",
} as const;
