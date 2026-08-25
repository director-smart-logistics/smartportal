import { z } from "zod";

export const UserRoles = ["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"] as const;
export type UserRole = (typeof UserRoles)[number];

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(UserRoles).default("AGENT"),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
  createdAt: z.any(),
  updatedAt: z.any(),
  lastLogin: z.any().nullable().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  dni: z.string().nullable().optional(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  preferredRouteId: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  slCode: z.string().nullable().optional(),
  tier: z.string().default("basic"),
  membershipTier: z.string().default("basic"),
  membershipExpires: z.any().nullable().optional(),
  acceptMarketing: z.boolean().default(false),
  consolidationEnabled: z.boolean().default(false),
  deliveryAddress1: z.string().nullable().optional(),
  deliveryAddress2: z.string().nullable().optional(),
  deliveryAddress3: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  memberSince: z.any().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  createdBy: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const PackageStatuses = [
  "pending",
  "in_transit",
  "in_warehouse",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type PackageStatus = (typeof PackageStatuses)[number];

export const PackageSchema = z.object({
  id: z.string(),
  trackingNumber: z.string(),
  customerId: z.string().nullable().optional(),
  customerName: z.string(),
  status: z.enum(PackageStatuses).default("pending"),
  weight: z.number(),
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  routeId: z.string().nullable().optional(),
  description: z.string(),
  guideId: z.string().nullable().optional(),
  consolidatedId: z.string().nullable().optional(),
  isConsolidated: z.boolean().default(false),
  calculatedCost: z.number().nullable().optional(),
  costCalculationDate: z.any().nullable().optional(),
  type: z.enum(["air", "sea"]).default("air"),
  category: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  flagStatus: z.string().nullable().optional(),
  daysInSystem: z.number().default(0),
  manifestNumber: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  invoiceReady: z.boolean().default(false),
  invoicePdfUrl: z.string().nullable().optional(),
  slCode: z.string().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  createdBy: z.string().nullable().optional(),
});

export type Package = z.infer<typeof PackageSchema>;

export const InvoiceStatuses = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
export type InvoiceStatus = (typeof InvoiceStatuses)[number];

export const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  invoiceNumber: z.string(),
  status: z.enum(InvoiceStatuses).default("draft"),
  totalAmount: z.number().default(0),
  subtotalAmount: z.number().default(0),
  taxAmount: z.number().nullable().optional(),
  taxRate: z.number().default(0.13),
  discountAmount: z.number().nullable().optional(),
  discountPercentage: z.number().nullable().optional(),
  currency: z.enum(["USD", "CRC"]).default("USD"),
  exchangeRate: z.number().nullable().optional(),
  invoiceDate: z.any(),
  dueDate: z.any().nullable().optional(),
  sentAt: z.any().nullable().optional(),
  paidAt: z.any().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  pdfPath: z.string().nullable().optional(),
  clientSlCode: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  clientDni: z.string().nullable().optional(),
  clientPhone: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  createdBy: z.string().nullable().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  packageId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().default(1),
  unitPrice: z.number(),
  totalPrice: z.number(),
  weight: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  origin: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  createdAt: z.any(),
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  originLocation: z.string(),
  destinationLocation: z.string(),
  estimatedDistance: z.number().nullable().optional(),
  estimatedDuration: z.string().nullable().optional(),
  vehiclePlate: z.string().nullable().optional(),
  vehicleType: z.string().nullable().optional(),
  assignedAgentId: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "completed"]).default("active"),
  totalPackages: z.number().default(0),
  completedPackages: z.number().default(0),
  startTime: z.any().nullable().optional(),
  endTime: z.any().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  createdBy: z.string().nullable().optional(),
});

export type Route = z.infer<typeof RouteSchema>;

export const DeliverySchema = z.object({
  id: z.string(),
  trackingNumber: z.string(),
  customerName: z.string(),
  address: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]).default("pending"),
  routeId: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  packageCount: z.number().default(0),
  createdAt: z.any(),
  updatedAt: z.any(),
  completedAt: z.any().nullable().optional(),
});

export type Delivery = z.infer<typeof DeliverySchema>;

export const QuoteSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  quoteNumber: z.string(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "converted"]).default("draft"),
  totalAmount: z.number().default(0),
  subtotalAmount: z.number().default(0),
  taxAmount: z.number().nullable().optional(),
  validUntil: z.any().nullable().optional(),
  notes: z.string().nullable().optional(),
  convertedToInvoiceId: z.string().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  createdBy: z.string().nullable().optional(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const PermissionSchema = z.object({
  id: z.string(),
  role: z.string(),
  resource: z.string(),
  action: z.string(),
  allowed: z.boolean().default(true),
  description: z.string().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const SettingsSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  type: z.enum(["string", "number", "boolean", "json"]).default("string"),
  category: z.string().default("general"),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().default(false),
  countryCode: z.string().nullable().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  oldValues: z.record(z.any()).nullable().optional(),
  newValues: z.record(z.any()).nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  status: z.enum(["success", "failure"]).default("success"),
  errorMessage: z.string().nullable().optional(),
  affectedRows: z.number().nullable().optional(),
  createdAt: z.any(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuthenticatedRequest {
  uid: string;
  email?: string;
  role?: UserRole;
}
