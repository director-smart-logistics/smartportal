interface CreateLabelRequest {
    customerId: string;
    customerName: string;
    customerSlCode: string;
    recipientName: string;
    recipientAddress: string;
    recipientCity: string;
    recipientCountry?: string;
    recipientPhone?: string;
    packageIds: string[];
    deliveryMethod: "home_delivery" | "pickup" | "route";
    routeId?: string;
    routeName?: string;
    notes?: string;
    deliveryInstructions?: string;
}
interface ListLabelsRequest {
    page?: number;
    limit?: number;
    status?: string;
    customerId?: string;
    customerSlCode?: string;
    routeId?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
}
interface UpdateLabelStatusRequest {
    labelId: string;
    status: "pending" | "printed" | "in_transit" | "delivered" | "cancelled";
    notes?: string;
}
interface CancelLabelRequest {
    labelId: string;
    reason: string;
}
export declare const slCreateShippingLabel: import("firebase-functions/v2/https").CallableFunction<CreateLabelRequest, Promise<{
    success: boolean;
    data: {
        createdAt: string;
        updatedAt: string;
        labelNumber: string;
        customerId: string;
        customerName: string;
        customerSlCode: string;
        recipientName: string;
        recipientAddress: string;
        recipientCity: string;
        recipientCountry: string;
        recipientPhone: string | null;
        packageIds: string[];
        packageCount: number;
        totalWeight: number;
        totalValue: number;
        packages: {
            id: string;
            trackingNumber: any;
            description: any;
            weight: any;
            value: any;
        }[];
        deliveryMethod: "route" | "pickup" | "home_delivery";
        routeId: string | null;
        routeName: string | null;
        labelFormat: string;
        barcodeData: string;
        status: string;
        notes: string | null;
        deliveryInstructions: string | null;
        createdBy: string;
        searchTokens: string[];
        id: string;
    };
}>, unknown>;
export declare const slListShippingLabels: import("firebase-functions/v2/https").CallableFunction<ListLabelsRequest, Promise<{
    success: boolean;
    data: {
        createdAt: any;
        updatedAt: any;
        printedAt: any;
        deliveredAt: any;
        cancelledAt: any;
        id: string;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>, unknown>;
export declare const slUpdateLabelStatus: import("firebase-functions/v2/https").CallableFunction<UpdateLabelStatusRequest, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export declare const slCancelShippingLabel: import("firebase-functions/v2/https").CallableFunction<CancelLabelRequest, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export {};
//# sourceMappingURL=callable.d.ts.map