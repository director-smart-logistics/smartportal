interface ListPackagesRequest {
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
    q?: string;
    status?: string;
}
interface CreatePackageRequest {
    trackingNumber: string;
    customerId?: string;
    customerName: string;
    weight: number;
    origin?: string;
    destination?: string;
    description: string;
    type: string;
    category?: string;
    branch?: string;
    slCode?: string;
}
interface UpdatePackageRequest {
    packageId: string;
    status?: string;
    weight?: number;
    destination?: string;
    description?: string;
    invoiceId?: string;
    invoiceReady?: boolean;
    customerName?: string;
    slCode?: string;
    trackingNumber?: string;
    [key: string]: unknown;
}
export declare const slListPackages: import("firebase-functions/v2/https").CallableFunction<ListPackagesRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        trackingNumber: any;
        customerId: any;
        customerName: any;
        status: any;
        weight: any;
        origin: any;
        destination: any;
        description: any;
        type: any;
        category: any;
        slCode: any;
        invoiceId: any;
        invoiceReady: any;
        calculatedCost: any;
        costCRC: any;
        exchangeRate: any;
        ruta: any;
        isConsolidated: any;
        manifestNumber: any;
        flagStatus: any;
        daysInSystem: any;
        createdAt: any;
        updatedAt: any;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>, unknown>;
export declare const slGetPackage: import("firebase-functions/v2/https").CallableFunction<{
    packageId: string;
}, Promise<{
    success: boolean;
    data: {
        trackingHistory: {
            id: string;
            status: any;
            location: any;
            notes: any;
            createdAt: any;
        }[];
        createdAt: any;
        updatedAt: any;
        id: string;
    };
}>, unknown>;
export declare const slGetPackageByTracking: import("firebase-functions/v2/https").CallableFunction<{
    tracking: string;
}, Promise<{
    success: boolean;
    data: {
        createdAt: any;
        updatedAt: any;
        id: string;
    };
}>, unknown>;
export declare const slCreatePackage: import("firebase-functions/v2/https").CallableFunction<CreatePackageRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        createdAt: string;
        updatedAt: string;
        trackingNumber: string;
        customerId: string | null;
        customerName: string;
        status: string;
        weight: number;
        origin: string | null;
        destination: string | null;
        routeId: null;
        description: string;
        guideId: null;
        consolidatedId: null;
        isConsolidated: boolean;
        calculatedCost: null;
        costCalculationDate: null;
        type: string;
        category: string;
        branch: string;
        flagStatus: string;
        daysInSystem: number;
        manifestNumber: null;
        invoiceId: null;
        invoiceReady: boolean;
        invoicePdfUrl: null;
        slCode: string | null;
        createdBy: string;
    };
}>, unknown>;
export declare const slUpdatePackage: import("firebase-functions/v2/https").CallableFunction<UpdatePackageRequest, Promise<{
    status?: string;
    weight?: number;
    destination?: string;
    description?: string;
    invoiceId?: string;
    invoiceReady?: boolean;
    customerName?: string;
    slCode?: string;
    trackingNumber?: string;
    success: boolean;
    id: string;
}>, unknown>;
export declare const slUpdatePackageStatus: import("firebase-functions/v2/https").CallableFunction<{
    packageId: string;
    status: string;
    location?: string;
    notes?: string;
    deliverySignature?: string;
    paymentCollected?: boolean;
}, Promise<{
    success: boolean;
    packageId: string;
    status: string;
}>, unknown>;
export declare const slDeletePackage: import("firebase-functions/v2/https").CallableFunction<{
    packageId: string;
}, Promise<{
    success: boolean;
    id: string;
}>, unknown>;
export {};
//# sourceMappingURL=callable.d.ts.map