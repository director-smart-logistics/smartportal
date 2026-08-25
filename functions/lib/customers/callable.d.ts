import { admin } from "../config/firebase";
interface ListCustomersRequest {
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
    q?: string;
    status?: string;
}
interface CreateCustomerRequest {
    fullName: string;
    email: string;
    phone?: string;
    dni?: string;
    address?: string;
    city?: string;
    country?: string;
    zipCode?: string;
    slCode?: string;
    notes?: string;
}
interface UpdateCustomerRequest {
    customerId: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dni?: string;
    address?: string;
    city?: string;
    country?: string;
    zipCode?: string;
    ruta?: string | null;
    route?: string | null;
    zona?: string | null;
    timezone?: string | null;
    location?: {
        province?: string;
        canton?: string;
        district?: string;
        city?: string;
        country?: string;
    } | null;
    preferredRouteId?: string | null;
    status?: string;
    tier?: string;
    membershipTier?: string;
    preferredLanguage?: string;
    acceptMarketing?: boolean;
    consolidationEnabled?: boolean;
    electronicInvoiceRequired?: boolean;
    isVerified?: boolean;
    verifiedDni?: string | null;
    verifiedEmail?: string | null;
    verifiedPhone?: string | null;
    showPromoBanner?: boolean;
    showVerificationModal?: boolean;
    showVisitGuide?: boolean;
    deliveryAddress1?: string | null;
    deliveryAddress2?: string | null;
    deliveryAddress3?: string | null;
    notes?: string | null;
}
export declare const slListCustomers: import("firebase-functions/v2/https").CallableFunction<ListCustomersRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        fullName: any;
        name: any;
        firstName: any;
        lastName: any;
        email: any;
        phone: any;
        dni: any;
        slCode: any;
        address: any;
        city: any;
        country: any;
        status: any;
        tier: any;
        ruta: any;
        consolidationEnabled: boolean;
        electronicInvoiceRequired: boolean;
        createdAt: any;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>, unknown>;
export declare const slGetCustomer: import("firebase-functions/v2/https").CallableFunction<{
    customerId: string;
}, Promise<{
    success: boolean;
    data: {
        createdAt: any;
        updatedAt: any;
        memberSince: any;
        id: string;
    };
}>, unknown>;
export declare const slGetCustomerBySlCode: import("firebase-functions/v2/https").CallableFunction<{
    slCode: string;
}, Promise<{
    success: boolean;
    data: {
        createdAt: any;
        updatedAt: any;
        id: string;
    };
}>, unknown>;
export declare const slCreateCustomer: import("firebase-functions/v2/https").CallableFunction<CreateCustomerRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        createdAt: string;
        updatedAt: string;
        fullName: string;
        firstName: string;
        lastName: string | null;
        email: string;
        phone: string | null;
        dni: string | null;
        address: string | null;
        city: string | null;
        country: string | null;
        zipCode: string | null;
        slCode: string | undefined;
        notes: string | null;
        status: string;
        tier: string;
        membershipTier: string;
        membershipExpires: null;
        acceptMarketing: boolean;
        consolidationEnabled: boolean;
        electronicInvoiceRequired: boolean;
        memberSince: admin.firestore.FieldValue;
        createdBy: string;
    };
}>, unknown>;
export declare const slUpdateCustomer: import("firebase-functions/v2/https").CallableFunction<UpdateCustomerRequest, Promise<{
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dni?: string;
    address?: string;
    city?: string;
    country?: string;
    zipCode?: string;
    ruta?: string | null;
    route?: string | null;
    zona?: string | null;
    timezone?: string | null;
    location?: {
        province?: string;
        canton?: string;
        district?: string;
        city?: string;
        country?: string;
    } | null;
    preferredRouteId?: string | null;
    status?: string;
    tier?: string;
    membershipTier?: string;
    preferredLanguage?: string;
    acceptMarketing?: boolean;
    consolidationEnabled?: boolean;
    electronicInvoiceRequired?: boolean;
    isVerified?: boolean;
    verifiedDni?: string | null;
    verifiedEmail?: string | null;
    verifiedPhone?: string | null;
    showPromoBanner?: boolean;
    showVerificationModal?: boolean;
    showVisitGuide?: boolean;
    deliveryAddress1?: string | null;
    deliveryAddress2?: string | null;
    deliveryAddress3?: string | null;
    notes?: string | null;
    success: boolean;
    id: string;
}>, unknown>;
export declare const slDeleteCustomer: import("firebase-functions/v2/https").CallableFunction<{
    customerId: string;
}, Promise<{
    success: boolean;
    id: string;
    deleted: boolean;
}>, unknown>;
export {};
//# sourceMappingURL=callable.d.ts.map