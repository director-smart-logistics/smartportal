"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchSchema = exports.PaginationSchema = exports.UpdateDeliverySchema = exports.CreateDeliverySchema = exports.UpdateRouteSchema = exports.CreateRouteSchema = exports.CreateQuoteSchema = exports.UpdateInvoiceSchema = exports.CreateInvoiceSchema = exports.UpdatePackageSchema = exports.CreatePackageSchema = exports.UpdateCustomerSchema = exports.CreateCustomerSchema = exports.UpdateUserSchema = exports.CreateUserSchema = void 0;
exports.validateRequest = validateRequest;
const zod_1 = require("zod");
exports.CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email format"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    fullName: zod_1.z.string().min(1, "Full name is required"),
    role: zod_1.z.enum(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]).optional(),
    phone: zod_1.z.string().optional(),
});
exports.UpdateUserSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().optional(),
    role: zod_1.z.enum(["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]).optional(),
    status: zod_1.z.enum(["active", "inactive", "suspended"]).optional(),
});
exports.CreateCustomerSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(1, "Full name is required"),
    email: zod_1.z.string().email("Invalid email format"),
    phone: zod_1.z.string().optional(),
    dni: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    zipCode: zod_1.z.string().optional(),
    slCode: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.UpdateCustomerSchema = exports.CreateCustomerSchema.partial();
exports.CreatePackageSchema = zod_1.z.object({
    trackingNumber: zod_1.z.string().min(1, "Tracking number is required"),
    customerId: zod_1.z.string().optional(),
    customerName: zod_1.z.string().min(1, "Customer name is required"),
    weight: zod_1.z.number().positive("Weight must be positive"),
    description: zod_1.z.string().min(1, "Description is required"),
    origin: zod_1.z.string().optional(),
    destination: zod_1.z.string().optional(),
    type: zod_1.z.enum(["air", "sea"]).default("air"),
    category: zod_1.z.string().optional(),
    branch: zod_1.z.string().optional(),
    slCode: zod_1.z.string().optional(),
});
exports.UpdatePackageSchema = zod_1.z.object({
    status: zod_1.z.enum([
        "pending",
        "in_transit",
        "in_warehouse",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
        "returned",
        "cancelled",
    ]).optional(),
    weight: zod_1.z.number().positive().optional(),
    description: zod_1.z.string().optional(),
    routeId: zod_1.z.string().optional(),
    calculatedCost: zod_1.z.number().optional(),
    invoiceId: zod_1.z.string().optional(),
    invoiceReady: zod_1.z.boolean().optional(),
});
exports.CreateInvoiceSchema = zod_1.z.object({
    customerId: zod_1.z.string().min(1, "Customer ID is required"),
    items: zod_1.z.array(zod_1.z.object({
        packageId: zod_1.z.string().optional(),
        description: zod_1.z.string().optional(),
        quantity: zod_1.z.number().positive().default(1),
        unitPrice: zod_1.z.number().nonnegative(),
        weight: zod_1.z.number().optional(),
    })).min(1, "At least one item is required"),
    currency: zod_1.z.enum(["USD", "CRC"]).default("USD"),
    taxRate: zod_1.z.number().min(0).max(1).default(0.13),
    discountPercentage: zod_1.z.number().min(0).max(100).optional(),
    notes: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().optional(),
});
exports.UpdateInvoiceSchema = zod_1.z.object({
    status: zod_1.z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
    notes: zod_1.z.string().optional(),
    internalNotes: zod_1.z.string().optional(),
    paymentMethod: zod_1.z.string().optional(),
    paymentReference: zod_1.z.string().optional(),
});
exports.CreateQuoteSchema = zod_1.z.object({
    customerId: zod_1.z.string().min(1, "Customer ID is required"),
    items: zod_1.z.array(zod_1.z.object({
        description: zod_1.z.string().min(1),
        quantity: zod_1.z.number().positive().default(1),
        unitPrice: zod_1.z.number().nonnegative(),
        weight: zod_1.z.number().optional(),
    })).min(1, "At least one item is required"),
    validUntil: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
exports.CreateRouteSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Route name is required"),
    description: zod_1.z.string().optional(),
    originLocation: zod_1.z.string().min(1, "Origin location is required"),
    destinationLocation: zod_1.z.string().min(1, "Destination location is required"),
    estimatedDistance: zod_1.z.number().optional(),
    estimatedDuration: zod_1.z.string().optional(),
    vehiclePlate: zod_1.z.string().optional(),
    vehicleType: zod_1.z.string().optional(),
    assignedAgentId: zod_1.z.string().optional(),
});
exports.UpdateRouteSchema = exports.CreateRouteSchema.partial().extend({
    status: zod_1.z.enum(["active", "inactive", "completed"]).optional(),
});
exports.CreateDeliverySchema = zod_1.z.object({
    trackingNumber: zod_1.z.string().min(1, "Tracking number is required"),
    customerName: zod_1.z.string().min(1, "Customer name is required"),
    address: zod_1.z.string().min(1, "Address is required"),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    routeId: zod_1.z.string().optional(),
    assignedTo: zod_1.z.string().optional(),
    packageCount: zod_1.z.number().int().nonnegative().default(0),
});
exports.UpdateDeliverySchema = zod_1.z.object({
    status: zod_1.z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
    deliveryNotes: zod_1.z.string().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
});
exports.PaginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    sortBy: zod_1.z.string().optional(),
    sortOrder: zod_1.z.enum(["asc", "desc"]).default("desc"),
});
exports.SearchSchema = zod_1.z.object({
    q: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
function validateRequest(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
        throw new Error(`Validation failed: ${errors.join(", ")}`);
    }
    return result.data;
}
//# sourceMappingURL=validation.js.map