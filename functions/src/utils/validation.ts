import { z } from "zod";

export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]).optional(),
  phone: z.string().optional(),
});

export const UpdateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]).optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
});

export const CreateCustomerSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().optional(),
  dni: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
  slCode: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

export const CreatePackageSchema = z.object({
  trackingNumber: z.string().min(1, "Tracking number is required"),
  customerId: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  weight: z.number().positive("Weight must be positive"),
  description: z.string().min(1, "Description is required"),
  origin: z.string().optional(),
  destination: z.string().optional(),
  type: z.enum(["air", "sea"]).default("air"),
  category: z.string().optional(),
  branch: z.string().optional(),
  slCode: z.string().optional(),
});

export const UpdatePackageSchema = z.object({
  status: z.enum([
    "pending",
    "in_transit",
    "in_warehouse",
    "ready_for_delivery",
    "out_for_delivery",
    "delivered",
    "returned",
    "cancelled",
  ]).optional(),
  weight: z.number().positive().optional(),
  description: z.string().optional(),
  routeId: z.string().optional(),
  calculatedCost: z.number().optional(),
  invoiceId: z.string().optional(),
  invoiceReady: z.boolean().optional(),
});

export const CreateInvoiceSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(z.object({
    packageId: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().nonnegative(),
    weight: z.number().optional(),
  })).min(1, "At least one item is required"),
  currency: z.enum(["USD", "CRC"]).default("USD"),
  taxRate: z.number().min(0).max(1).default(0.13),
  discountPercentage: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
});

export const UpdateInvoiceSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  paymentMethod: z.string().optional(),
  paymentReference: z.string().optional(),
});

export const CreateQuoteSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().nonnegative(),
    weight: z.number().optional(),
  })).min(1, "At least one item is required"),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateRouteSchema = z.object({
  name: z.string().min(1, "Route name is required"),
  description: z.string().optional(),
  originLocation: z.string().min(1, "Origin location is required"),
  destinationLocation: z.string().min(1, "Destination location is required"),
  estimatedDistance: z.number().optional(),
  estimatedDuration: z.string().optional(),
  vehiclePlate: z.string().optional(),
  vehicleType: z.string().optional(),
  assignedAgentId: z.string().optional(),
});

export const UpdateRouteSchema = CreateRouteSchema.partial().extend({
  status: z.enum(["active", "inactive", "completed"]).optional(),
});

export const CreateDeliverySchema = z.object({
  trackingNumber: z.string().min(1, "Tracking number is required"),
  customerName: z.string().min(1, "Customer name is required"),
  address: z.string().min(1, "Address is required"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  routeId: z.string().optional(),
  assignedTo: z.string().optional(),
  packageCount: z.number().int().nonnegative().default(0),
});

export const UpdateDeliverySchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
  deliveryNotes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const SearchSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join(", ")}`);
  }
  return result.data;
}
