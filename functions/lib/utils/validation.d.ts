import { z } from "zod";
export declare const CreateUserSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    fullName: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]>>;
    phone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    fullName: string;
    password: string;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "DELIVERY" | "VIEWER" | undefined;
}, {
    email: string;
    fullName: string;
    password: string;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "DELIVERY" | "VIEWER" | undefined;
}>;
export declare const UpdateUserSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["SUPER_ADMIN", "ADMIN", "AGENT", "DELIVERY", "VIEWER"]>>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive", "suspended"]>>;
}, "strip", z.ZodTypeAny, {
    fullName?: string | undefined;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "DELIVERY" | "VIEWER" | undefined;
    status?: "active" | "inactive" | "suspended" | undefined;
}, {
    fullName?: string | undefined;
    phone?: string | undefined;
    role?: "SUPER_ADMIN" | "ADMIN" | "AGENT" | "DELIVERY" | "VIEWER" | undefined;
    status?: "active" | "inactive" | "suspended" | undefined;
}>;
export declare const CreateCustomerSchema: z.ZodObject<{
    fullName: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    dni: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
    zipCode: z.ZodOptional<z.ZodString>;
    slCode: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    fullName: string;
    phone?: string | undefined;
    dni?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    zipCode?: string | undefined;
    slCode?: string | undefined;
    notes?: string | undefined;
}, {
    email: string;
    fullName: string;
    phone?: string | undefined;
    dni?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    zipCode?: string | undefined;
    slCode?: string | undefined;
    notes?: string | undefined;
}>;
export declare const UpdateCustomerSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dni: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    country: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    zipCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    slCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    fullName?: string | undefined;
    phone?: string | undefined;
    dni?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    zipCode?: string | undefined;
    slCode?: string | undefined;
    notes?: string | undefined;
}, {
    email?: string | undefined;
    fullName?: string | undefined;
    phone?: string | undefined;
    dni?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    zipCode?: string | undefined;
    slCode?: string | undefined;
    notes?: string | undefined;
}>;
export declare const CreatePackageSchema: z.ZodObject<{
    trackingNumber: z.ZodString;
    customerId: z.ZodOptional<z.ZodString>;
    customerName: z.ZodString;
    weight: z.ZodNumber;
    description: z.ZodString;
    origin: z.ZodOptional<z.ZodString>;
    destination: z.ZodOptional<z.ZodString>;
    type: z.ZodDefault<z.ZodEnum<["air", "sea"]>>;
    category: z.ZodOptional<z.ZodString>;
    branch: z.ZodOptional<z.ZodString>;
    slCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "air" | "sea";
    trackingNumber: string;
    customerName: string;
    weight: number;
    description: string;
    slCode?: string | undefined;
    customerId?: string | undefined;
    origin?: string | undefined;
    destination?: string | undefined;
    category?: string | undefined;
    branch?: string | undefined;
}, {
    trackingNumber: string;
    customerName: string;
    weight: number;
    description: string;
    type?: "air" | "sea" | undefined;
    slCode?: string | undefined;
    customerId?: string | undefined;
    origin?: string | undefined;
    destination?: string | undefined;
    category?: string | undefined;
    branch?: string | undefined;
}>;
export declare const UpdatePackageSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["pending", "in_transit", "in_warehouse", "ready_for_delivery", "out_for_delivery", "delivered", "returned", "cancelled"]>>;
    weight: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
    routeId: z.ZodOptional<z.ZodString>;
    calculatedCost: z.ZodOptional<z.ZodNumber>;
    invoiceId: z.ZodOptional<z.ZodString>;
    invoiceReady: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "in_transit" | "in_warehouse" | "ready_for_delivery" | "out_for_delivery" | "delivered" | "returned" | "cancelled" | undefined;
    weight?: number | undefined;
    routeId?: string | undefined;
    description?: string | undefined;
    calculatedCost?: number | undefined;
    invoiceId?: string | undefined;
    invoiceReady?: boolean | undefined;
}, {
    status?: "pending" | "in_transit" | "in_warehouse" | "ready_for_delivery" | "out_for_delivery" | "delivered" | "returned" | "cancelled" | undefined;
    weight?: number | undefined;
    routeId?: string | undefined;
    description?: string | undefined;
    calculatedCost?: number | undefined;
    invoiceId?: string | undefined;
    invoiceReady?: boolean | undefined;
}>;
export declare const CreateInvoiceSchema: z.ZodObject<{
    customerId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        packageId: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
        unitPrice: z.ZodNumber;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        unitPrice: number;
        weight?: number | undefined;
        description?: string | undefined;
        packageId?: string | undefined;
    }, {
        unitPrice: number;
        weight?: number | undefined;
        description?: string | undefined;
        packageId?: string | undefined;
        quantity?: number | undefined;
    }>, "many">;
    currency: z.ZodDefault<z.ZodEnum<["USD", "CRC"]>>;
    taxRate: z.ZodDefault<z.ZodNumber>;
    discountPercentage: z.ZodOptional<z.ZodNumber>;
    notes: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    taxRate: number;
    currency: "USD" | "CRC";
    items: {
        quantity: number;
        unitPrice: number;
        weight?: number | undefined;
        description?: string | undefined;
        packageId?: string | undefined;
    }[];
    notes?: string | undefined;
    discountPercentage?: number | undefined;
    dueDate?: string | undefined;
}, {
    customerId: string;
    items: {
        unitPrice: number;
        weight?: number | undefined;
        description?: string | undefined;
        packageId?: string | undefined;
        quantity?: number | undefined;
    }[];
    notes?: string | undefined;
    taxRate?: number | undefined;
    discountPercentage?: number | undefined;
    currency?: "USD" | "CRC" | undefined;
    dueDate?: string | undefined;
}>;
export declare const UpdateInvoiceSchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["draft", "sent", "paid", "overdue", "cancelled"]>>;
    notes: z.ZodOptional<z.ZodString>;
    internalNotes: z.ZodOptional<z.ZodString>;
    paymentMethod: z.ZodOptional<z.ZodString>;
    paymentReference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "draft" | "sent" | "paid" | "overdue" | undefined;
    notes?: string | undefined;
    internalNotes?: string | undefined;
    paymentMethod?: string | undefined;
    paymentReference?: string | undefined;
}, {
    status?: "cancelled" | "draft" | "sent" | "paid" | "overdue" | undefined;
    notes?: string | undefined;
    internalNotes?: string | undefined;
    paymentMethod?: string | undefined;
    paymentReference?: string | undefined;
}>;
export declare const CreateQuoteSchema: z.ZodObject<{
    customerId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        quantity: z.ZodDefault<z.ZodNumber>;
        unitPrice: z.ZodNumber;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        quantity: number;
        unitPrice: number;
        weight?: number | undefined;
    }, {
        description: string;
        unitPrice: number;
        weight?: number | undefined;
        quantity?: number | undefined;
    }>, "many">;
    validUntil: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    items: {
        description: string;
        quantity: number;
        unitPrice: number;
        weight?: number | undefined;
    }[];
    notes?: string | undefined;
    validUntil?: string | undefined;
}, {
    customerId: string;
    items: {
        description: string;
        unitPrice: number;
        weight?: number | undefined;
        quantity?: number | undefined;
    }[];
    notes?: string | undefined;
    validUntil?: string | undefined;
}>;
export declare const CreateRouteSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    originLocation: z.ZodString;
    destinationLocation: z.ZodString;
    estimatedDistance: z.ZodOptional<z.ZodNumber>;
    estimatedDuration: z.ZodOptional<z.ZodString>;
    vehiclePlate: z.ZodOptional<z.ZodString>;
    vehicleType: z.ZodOptional<z.ZodString>;
    assignedAgentId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    originLocation: string;
    destinationLocation: string;
    description?: string | undefined;
    estimatedDistance?: number | undefined;
    estimatedDuration?: string | undefined;
    vehiclePlate?: string | undefined;
    vehicleType?: string | undefined;
    assignedAgentId?: string | undefined;
}, {
    name: string;
    originLocation: string;
    destinationLocation: string;
    description?: string | undefined;
    estimatedDistance?: number | undefined;
    estimatedDuration?: string | undefined;
    vehiclePlate?: string | undefined;
    vehicleType?: string | undefined;
    assignedAgentId?: string | undefined;
}>;
export declare const UpdateRouteSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    originLocation: z.ZodOptional<z.ZodString>;
    destinationLocation: z.ZodOptional<z.ZodString>;
    estimatedDistance: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    estimatedDuration: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    vehiclePlate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    vehicleType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    assignedAgentId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["active", "inactive", "completed"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "inactive" | "completed" | undefined;
    description?: string | undefined;
    name?: string | undefined;
    originLocation?: string | undefined;
    destinationLocation?: string | undefined;
    estimatedDistance?: number | undefined;
    estimatedDuration?: string | undefined;
    vehiclePlate?: string | undefined;
    vehicleType?: string | undefined;
    assignedAgentId?: string | undefined;
}, {
    status?: "active" | "inactive" | "completed" | undefined;
    description?: string | undefined;
    name?: string | undefined;
    originLocation?: string | undefined;
    destinationLocation?: string | undefined;
    estimatedDistance?: number | undefined;
    estimatedDuration?: string | undefined;
    vehiclePlate?: string | undefined;
    vehicleType?: string | undefined;
    assignedAgentId?: string | undefined;
}>;
export declare const CreateDeliverySchema: z.ZodObject<{
    trackingNumber: z.ZodString;
    customerName: z.ZodString;
    address: z.ZodString;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
    routeId: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodString>;
    packageCount: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    address: string;
    trackingNumber: string;
    customerName: string;
    packageCount: number;
    routeId?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    assignedTo?: string | undefined;
}, {
    address: string;
    trackingNumber: string;
    customerName: string;
    routeId?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    assignedTo?: string | undefined;
    packageCount?: number | undefined;
}>;
export declare const UpdateDeliverySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["pending", "in_progress", "completed", "failed"]>>;
    deliveryNotes: z.ZodOptional<z.ZodString>;
    latitude: z.ZodOptional<z.ZodNumber>;
    longitude: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "completed" | "in_progress" | "failed" | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    deliveryNotes?: string | undefined;
}, {
    status?: "pending" | "completed" | "in_progress" | "failed" | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    deliveryNotes?: string | undefined;
}>;
export declare const PaginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    sortBy: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    sortOrder: "asc" | "desc";
    sortBy?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    sortOrder?: "asc" | "desc" | undefined;
    sortBy?: string | undefined;
}>;
export declare const SearchSchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    q?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    status?: string | undefined;
    q?: string | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export declare function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T;
//# sourceMappingURL=validation.d.ts.map